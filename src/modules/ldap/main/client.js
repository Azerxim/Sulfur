import { randomUUID } from 'crypto'
import { DEFAULT_CLIENT_CONFIG, SCOPES } from '../shared/constants'
import { t } from '../shared/i18n'

const MAX_HISTORY = 50
const WHO_AM_I = '1.3.6.1.4.1.4203.1.11.3'

let library = null
const ldapts = async () => (library ??= await import('ldapts'))

/** Valeur d'attribut affichable : texte UTF-8, ou hexadécimal si binaire. */
function display(value) {
  if (!Buffer.isBuffer(value)) return String(value)
  const text = value.toString('utf8')
  // Caractère de remplacement : octets qui ne forment pas du texte UTF-8.
  return text.includes('\uFFFD') ? `0x${value.toString('hex')}` : text
}

/** Message d'une erreur LDAP, avec le code de résultat s'il est connu. */
function describe(err) {
  if (err?.code !== undefined && typeof err.code === 'number')
    return t('ldap.errors.result', { code: err.code, message: err.message })
  if (err?.code === 'ECONNREFUSED') return t('ldap.errors.connectionRefused')
  return err?.message ?? String(err)
}

/**
 * Client LDAP (bibliothèque ldapts) : chaque opération ouvre une connexion, passe en TLS si
 * demandé (StartTLS), se lie avec le DN et le mot de passe saisis, puis se déconnecte.
 */
export class LdapClient {
  history = []

  normalize(options) {
    const config = { ...DEFAULT_CLIENT_CONFIG, ...options }
    if (!/^ldaps?:\/\/[^/\s]+\/?$/i.test(String(config.url).trim())) throw new Error(t('ldap.errors.invalidUrl'))
    if (!SCOPES.includes(config.scope)) throw new Error(t('ldap.errors.invalidScope'))
    return { ...config, url: config.url.trim(), timeout: Math.max(500, Number(config.timeout) || 5000) }
  }

  /** Connexion prête (StartTLS et liaison faits) passée à `operation(client)`. */
  async session(config, operation) {
    const { Client } = await ldapts()
    const tlsOptions = { rejectUnauthorized: !!config.rejectUnauthorized }
    // ldapts chiffre la connexion dès que des options TLS sont fournies : seulement pour ldaps://.
    const secure = config.url.toLowerCase().startsWith('ldaps')
    const client = new Client({
      url: config.url,
      timeout: config.timeout,
      connectTimeout: config.timeout,
      tlsOptions: secure ? tlsOptions : undefined
    })
    try {
      if (config.startTls) {
        if (secure) throw new Error(t('ldap.errors.startTlsOnLdaps'))
        await client.startTLS(tlsOptions)
      }
      if (config.bindDn?.trim()) await client.bind(config.bindDn.trim(), config.password ?? '')
      return await operation(client)
    } catch (err) {
      throw new Error(describe(err), { cause: err })
    } finally {
      await client.unbind().catch(() => {})
    }
  }

  record(entry) {
    this.history.unshift(entry)
    if (this.history.length > MAX_HISTORY) this.history.length = MAX_HISTORY
    return entry
  }

  /** Teste l'authentification : liaison puis « Who am I ». */
  async authenticate(options) {
    const config = this.normalize(options)
    const started = performance.now()
    const identity = await this.session(config, async (client) => {
      try {
        const { value } = await client.exop(WHO_AM_I)
        return value ? display(value) : ''
      } catch {
        return null
      }
    })
    return this.record({
      id: randomUUID(),
      time: new Date().toISOString(),
      kind: 'bind',
      url: config.url,
      bindDn: config.bindDn?.trim() || '',
      identity,
      duration: Math.round(performance.now() - started)
    })
  }

  async search(options) {
    const config = this.normalize(options)
    const attributes = String(config.attributes ?? '')
      .split(/[\s,]+/)
      .filter(Boolean)
    const started = performance.now()
    const result = await this.session(config, (client) =>
      client.search(config.base.trim(), {
        scope: config.scope,
        filter: config.filter?.trim() || '(objectClass=*)',
        attributes: attributes.length ? attributes : undefined,
        sizeLimit: Math.max(0, Number(config.sizeLimit) || 0)
      })
    )
    const entries = result.searchEntries.map(({ dn, ...attrs }) => ({
      dn,
      attributes: Object.fromEntries(
        Object.entries(attrs).map(([name, value]) => [name, (Array.isArray(value) ? value : [value]).map(display)])
      )
    }))
    return this.record({
      id: randomUUID(),
      time: new Date().toISOString(),
      kind: 'search',
      url: config.url,
      bindDn: config.bindDn?.trim() || '',
      base: config.base,
      scope: config.scope,
      filter: config.filter,
      entries,
      references: result.searchReferences,
      duration: Math.round(performance.now() - started)
    })
  }

  clear() {
    this.history = []
    return []
  }
}
