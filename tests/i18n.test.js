import fs from 'fs'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_LANGUAGE, LANGUAGES } from '@shared/languages'
import { getLanguage, moduleLanguage, moduleT, registerMessages, setLanguage, t } from '@shared/i18n'
import { t as modbusT } from '@modules/modbus/shared/i18n'
import coreEn from '@shared/locales/en'
import coreFr from '@shared/locales/fr'
import opcuaEn from '@modules/opcua/shared/locales/en'
import opcuaFr from '@modules/opcua/shared/locales/fr'
import modbusEn from '@modules/modbus/shared/locales/en'
import modbusFr from '@modules/modbus/shared/locales/fr'
import httpEn from '@modules/http/shared/locales/en'
import httpFr from '@modules/http/shared/locales/fr'
import ntpEn from '@modules/ntp/shared/locales/en'
import ntpFr from '@modules/ntp/shared/locales/fr'
import s7En from '@modules/s7/shared/locales/en'
import s7Fr from '@modules/s7/shared/locales/fr'
import plcsimEn from '@modules/plcsim/shared/locales/en'
import plcsimFr from '@modules/plcsim/shared/locales/fr'
import mqttEn from '@modules/mqtt/shared/locales/en'
import mqttFr from '@modules/mqtt/shared/locales/fr'
import snmpEn from '@modules/snmp/shared/locales/en'
import snmpFr from '@modules/snmp/shared/locales/fr'
import syslogEn from '@modules/syslog/shared/locales/en'
import syslogFr from '@modules/syslog/shared/locales/fr'
import simulatorEn from '@modules/simulator/shared/locales/en'
import simulatorFr from '@modules/simulator/shared/locales/fr'
import trendsEn from '@modules/trends/shared/locales/en'
import trendsFr from '@modules/trends/shared/locales/fr'
import caEn from '@modules/ca/shared/locales/en'
import caFr from '@modules/ca/shared/locales/fr'
import dnsEn from '@modules/dns/shared/locales/en'
import dnsFr from '@modules/dns/shared/locales/fr'
import explorerEn from '@modules/explorer/shared/locales/en'
import explorerFr from '@modules/explorer/shared/locales/fr'
import ldapEn from '@modules/ldap/shared/locales/en'
import ldapFr from '@modules/ldap/shared/locales/fr'
import sftpEn from '@modules/sftp/shared/locales/en'
import sftpFr from '@modules/sftp/shared/locales/fr'
import tftpEn from '@modules/tftp/shared/locales/en'
import tftpFr from '@modules/tftp/shared/locales/fr'
import ftpEn from '@modules/ftp/shared/locales/en'
import ftpFr from '@modules/ftp/shared/locales/fr'

const dictionaries = {
  en: {
    ...coreEn,
    ...opcuaEn,
    ...modbusEn,
    ...httpEn,
    ...ntpEn,
    ...s7En,
    ...plcsimEn,
    ...mqttEn,
    ...snmpEn,
    ...syslogEn,
    ...simulatorEn,
    ...trendsEn,
    ...caEn,
    ...dnsEn,
    ...explorerEn,
    ...ldapEn,
    ...sftpEn,
    ...tftpEn,
    ...ftpEn
  },
  fr: {
    ...coreFr,
    ...opcuaFr,
    ...modbusFr,
    ...httpFr,
    ...ntpFr,
    ...s7Fr,
    ...plcsimFr,
    ...mqttFr,
    ...snmpFr,
    ...syslogFr,
    ...simulatorFr,
    ...trendsFr,
    ...caFr,
    ...dnsFr,
    ...explorerFr,
    ...ldapFr,
    ...sftpFr,
    ...tftpFr,
    ...ftpFr
  }
}

const flatten = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]
  )
const params = (text) => [...(text.match(/\{\w+\}/g) ?? [])].sort().join()

afterEach(() => {
  setLanguage(DEFAULT_LANGUAGE)
  delete LANGUAGES.de
})

describe('Langue par défaut et repli', () => {
  it('démarre en anglais', () => {
    expect(DEFAULT_LANGUAGE).toBe('en')
    expect(getLanguage()).toBe('en')
    expect(t('ui.start')).toBe('Start')
  })

  it('traduit les modules en français', () => {
    setLanguage('fr')
    expect(t('ui.start')).toBe('Démarrer')
    expect(modbusT('modbus.server.title')).toBe('Configuration du serveur')
  })

  it('affiche entièrement en anglais un module qui ne fournit pas la langue choisie', () => {
    LANGUAGES.de = { label: 'Deutsch', locale: 'de-DE' }
    registerMessages({ de: { ui: { start: 'Starten' } } })
    setLanguage('de')
    expect(t('ui.start')).toBe('Starten') // application en allemand
    expect(t('ui.add')).toBe('Add') // clé absente → anglais
    expect(moduleLanguage('modbus')).toBe('en')
    expect(modbusT('ui.start')).toBe('Start') // pas de mélange dans le module
    registerMessages({ en: { demo: { hello: 'Hello' } }, de: { demo: { hello: 'Hallo' } } }, 'demo')
    expect(moduleT('demo')('demo.hello')).toBe('Hallo')
  })

  it('interpole les paramètres', () => {
    expect(t('ui.monitoring', { count: 3 })).toBe('Monitoring (3)')
  })
})

describe('Dictionnaires', () => {
  const en = new Map(flatten(dictionaries.en))
  const fr = new Map(flatten(dictionaries.fr))

  it('ont les mêmes clés en anglais et en français', () => {
    expect([...fr.keys()].filter((k) => !en.has(k))).toEqual([])
    expect([...en.keys()].filter((k) => !fr.has(k))).toEqual([])
  })

  it('utilisent les mêmes paramètres dans les deux langues', () => {
    const mismatched = [...en].filter(([key, text]) => params(text) !== params(fr.get(key) ?? ''))
    expect(mismatched.map(([key]) => key)).toEqual([])
  })

  it('contiennent toutes les clés utilisées dans le code', () => {
    const files = []
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (entry.name !== 'locales') walk(full)
        } else if (/\.jsx?$/.test(entry.name)) {
          files.push(full)
        }
      }
    }
    walk(path.resolve('src'))
    const used = new Set()
    for (const file of files) {
      for (const match of fs.readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) used.add(match[1])
    }
    expect(used.size).toBeGreaterThan(200)
    expect([...used].filter((key) => !en.has(key) || !fr.has(key))).toEqual([])
  })
})
