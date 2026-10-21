import { createHash } from 'crypto'
import { Client } from 'ldapts'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ensureCertificate } from '@shared/certificate'
import { LdapServer, buildDirectory, checkPassword, matches } from '@modules/ldap/main/server'
import { LdapClient } from '@modules/ldap/main/client'
import { DEFAULT_CLIENT_CONFIG, DEFAULT_LDIF, DEFAULT_SERVER_CONFIG } from '@modules/ldap/shared/constants'
import { normalizeDn, parseLdif } from '@modules/ldap/shared/ldif'
import { errorOf, freePort, tempDir } from './helpers'

const BASE = 'dc=sulfur,dc=local'
const OPERATOR = `uid=operator,ou=people,${BASE}`
/** Serveur en LDAP simple (LDAPS par défaut). */
const PLAIN = { ...DEFAULT_SERVER_CONFIG, security: 'plain' }
const ENGINEER = `uid=engineer,ou=people,${BASE}`

describe('LDIF et annuaire', () => {
  it('lit le LDIF (base64, lignes repliées) et signale les erreurs', () => {
    const { entries, errors } = parseLdif(`dn: cn=a,dc=x
cn: a
description:: w6l0w6k=
note: une ligne
  repliée

dn: cn=a, DC=x
cn: doublon
`)
    expect(entries[0].attributes).toEqual({ cn: ['a'], description: ['été'], note: ['une ligne repliée'] })
    expect(errors).toEqual([{ line: 7, message: 'duplicate' }])
    expect(parseLdif('cn: orphan').errors[0].message).toBe('noDn')
    expect(normalizeDn('UID=Operator, OU=People,dc=sulfur')).toBe('uid=operator,ou=people,dc=sulfur')
  })

  it('déduit memberOf des groupes et vérifie les mots de passe hachés', () => {
    const directory = buildDirectory(DEFAULT_LDIF)
    expect(directory.get(normalizeDn(ENGINEER)).attributes.memberOf).toEqual([
      `cn=operators,ou=groups,${BASE}`,
      `cn=engineers,ou=groups,${BASE}`
    ])
    const salt = Buffer.from('salt')
    const ssha = `{SSHA}${Buffer.concat([createHash('sha1').update('secret').update(salt).digest(), salt]).toString('base64')}`
    expect(checkPassword('secret', ssha)).toBe(true)
    expect(checkPassword('Secret', ssha)).toBe(false)
    expect(checkPassword('secret', `{SHA256}${createHash('sha256').update('secret').digest('base64')}`)).toBe(true)
    expect(checkPassword('secret', 'secret')).toBe(true)
    const entry = { attributes: { cn: ['Pump 12'], level: ['7'] } }
    expect(matches(entry, { type: 'substrings', attribute: 'CN', initial: 'pu', any: [], final: '12' })).toBe(true)
    expect(matches(entry, { type: 'ge', attribute: 'level', value: '10' })).toBe(false)
  })
})

describe('Serveur LDAP', () => {
  let server, port, tmp

  const client = (url = `ldap://127.0.0.1:${port}`) =>
    new Client({
      url,
      timeout: 2000,
      connectTimeout: 2000,
      // Options TLS seulement en ldaps:// (sinon ldapts chiffre la connexion d'emblée).
      tlsOptions: url.startsWith('ldaps') ? { rejectUnauthorized: false } : undefined
    })

  beforeAll(async () => {
    tmp = await tempDir('ldap')
    port = await freePort()
    server = new LdapServer(() => ensureCertificate(`${tmp.dir}/pki`, 'LDAP@Sulfur'))
    await server.start({ ...PLAIN, port })
  })
  afterEach(() => {
    server.setFaults([])
    server.update({ ...PLAIN, port })
  })
  afterAll(async () => {
    await server.stop()
    await tmp.cleanup()
  })

  it('authentifie un compte et refuse un mauvais mot de passe', async () => {
    const c = client()
    await c.bind(OPERATOR, 'operator')
    const { value } = await c.exop('1.3.6.1.4.1.4203.1.11.3')
    expect(value).toBe(`dn:${OPERATOR}`)
    await c.unbind()
    expect(await errorOf(client().bind(OPERATOR, 'wrong'))).toMatch(/0x31\b/)
    expect(await errorOf(client().bind(`uid=nobody,${BASE}`, 'x'))).toMatch(/0x31\b/)
    expect(server.status().counters.bindFailures).toBe(2)
  })

  it('recherche avec portée et filtre, sans jamais renvoyer les mots de passe', async () => {
    const c = client()
    await c.bind(ENGINEER, 'engineer')
    const { searchEntries } = await c.search(BASE, {
      scope: 'sub',
      filter: '(&(objectClass=inetOrgPerson)(memberOf=cn=engineers,ou=groups,dc=sulfur,dc=local))'
    })
    expect(searchEntries.map((e) => e.dn)).toEqual([ENGINEER])
    expect(searchEntries[0].userPassword).toBeUndefined()
    expect(searchEntries[0].mail).toBe('engineer@sulfur.local')

    const one = await c.search(`ou=people,${BASE}`, { scope: 'one', filter: '(uid=*)', attributes: ['uid'] })
    expect(one.searchEntries.map((e) => e.uid).sort()).toEqual(['engineer', 'operator'])
    const sub = await c.search(BASE, { filter: '(|(cn=Oper*)(cn=*gineer))' })
    // Oper* couvre aussi le groupe « operators ».
    expect(sub.searchEntries.map((e) => e.cn).sort()).toEqual(['Engineer', 'Operator', 'operators'])
    expect(await c.compare(OPERATOR, 'mail', 'OPERATOR@sulfur.local')).toBe(true)
    expect(await errorOf(c.search(`ou=missing,${BASE}`, {}))).toMatch(/0x20\b/)
    await c.unbind()
  })

  it('applique la limite de taille et refuse les écritures', async () => {
    server.update({ ...PLAIN, port, sizeLimit: 2 })
    const c = client()
    expect(await errorOf(c.search(BASE, { filter: '(objectClass=*)' }))).toMatch(/0x4\b/)
    await c.bind(OPERATOR, 'operator')
    expect(await errorOf(c.del(OPERATOR))).toMatch(/0x35\b/)
    await c.unbind()
  })

  it('exige une liaison quand l’accès anonyme est désactivé', async () => {
    server.update({ ...PLAIN, port, allowAnonymous: false })
    expect(await errorOf(client().search(BASE, { filter: '(uid=*)' }))).toMatch(/bind required Code: 0x32/)
    // Le rootDSE reste lisible.
    const root = await client().search('', { scope: 'base', filter: '(objectClass=*)' })
    expect(root.searchEntries[0].namingContexts).toBe(BASE)
  })

  it('passe la connexion en TLS avec StartTLS', async () => {
    const c = client()
    await c.startTLS({ rejectUnauthorized: false })
    await c.bind(OPERATOR, 'operator')
    const { searchEntries } = await c.search(OPERATOR, { scope: 'base' })
    expect(searchEntries[0].cn).toBe('Operator')
    await c.unbind()
  })

  it('injecte une réponse forcée du simulateur', async () => {
    server.setFaults([{ type: 'exception', params: { code: 52 } }])
    expect(await errorOf(client().bind(OPERATOR, 'operator'))).toMatch(/0x34\b/)
  })

  it('sert en LDAPS (par défaut) et alimente le client du module', async () => {
    expect(DEFAULT_SERVER_CONFIG).toMatchObject({ security: 'ldaps', port: 1636 })
    expect(DEFAULT_CLIENT_CONFIG.url).toBe('ldaps://127.0.0.1:1636')
    const ldapsPort = await freePort()
    const secure = new LdapServer(() => ensureCertificate(`${tmp.dir}/pki`, 'LDAP@Sulfur'))
    await secure.start({ ...DEFAULT_SERVER_CONFIG, port: ldapsPort })
    try {
      const module = new LdapClient()
      const url = `ldaps://127.0.0.1:${ldapsPort}`
      const auth = await module.authenticate({ url, bindDn: OPERATOR, password: 'operator' })
      expect(auth.identity).toBe(`dn:${OPERATOR}`)
      const found = await module.search({ url, bindDn: '', base: BASE, filter: '(cn=operators)', attributes: 'member' })
      expect(found.entries[0].attributes.member).toEqual([OPERATOR, ENGINEER])
      expect(await errorOf(module.authenticate({ url, bindDn: OPERATOR, password: 'nope' }))).toMatch(/49/)
      expect(
        await errorOf(module.authenticate({ url, rejectUnauthorized: true, bindDn: OPERATOR, password: 'operator' }))
      ).toMatch(/self[- ]signed|certificate/i)
    } finally {
      await secure.stop()
    }
  })
})
