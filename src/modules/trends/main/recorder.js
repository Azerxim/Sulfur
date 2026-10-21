import { parsePointKey, pointKey, toNumber } from '@azerxim/sulfur-sdk'
import { MAX_ROWS, MIN_INTERVAL } from '../shared/constants'
import { t } from '../shared/i18n'

/** Intervalle d'envoi des nouveaux échantillons à l'interface (ms). */
const FLUSH_INTERVAL = 500

/**
 * Enregistreur de courbes : lit périodiquement les points choisis (clés `<module>/<id>`) dans les
 * modules qui les publient (`peers()`, contrat `points.js` du SDK). Chaque échantillon est une ligne
 * { t (ms), values: { [clé]: nombre | null } } : toutes les courbes partagent les mêmes instants.
 */
export class TrendRecorder {
  rows = []
  pending = []
  series = []
  interval = 0
  startedAt = null
  timer = null
  flushTimer = null

  constructor({ peers, onStatus = () => {}, onSamples = () => {}, maxRows = MAX_ROWS }) {
    this.peers = peers
    this.onStatus = onStatus
    this.onSamples = onSamples
    this.maxRows = maxRows
  }

  status() {
    return {
      recording: !!this.timer,
      interval: this.interval,
      series: this.series,
      startedAt: this.startedAt,
      count: this.rows.length
    }
  }

  changed() {
    this.onStatus(this.status())
    return this.status()
  }

  /** Points numériques publiés par les modules : [{ key, module, moduleName, group, name, dataType }] */
  points() {
    return this.peers().flatMap(({ id, api }) =>
      api
        .points()
        .filter((p) => p.numeric)
        .map((p) => ({
          key: pointKey(id, p.id),
          module: id,
          moduleName: api.name,
          group: p.group,
          name: p.name,
          dataType: p.dataType
        }))
    )
  }

  start({ series, interval }) {
    if (this.timer) throw new Error(t('trends.errors.alreadyRecording'))
    const ms = Number(interval)
    if (!Number.isFinite(ms) || ms < MIN_INTERVAL)
      throw new Error(t('trends.errors.minInterval', { min: MIN_INTERVAL }))
    if (!series?.length) throw new Error(t('trends.errors.noSeries'))
    this.series = [...series]
    this.interval = ms
    this.startedAt = Date.now()
    this.sample()
    this.timer = setInterval(() => this.sample(), ms)
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL)
    return this.changed()
  }

  stop() {
    clearInterval(this.timer)
    clearInterval(this.flushTimer)
    this.timer = this.flushTimer = null
    this.flush()
    return this.changed()
  }

  /** Change les points enregistrés sans interrompre l'enregistrement. */
  setSeries(series) {
    this.series = [...series]
    return this.changed()
  }

  clear() {
    this.rows = []
    this.pending = []
    this.startedAt = this.timer ? Date.now() : null
    return this.changed()
  }

  data() {
    return this.rows
  }

  sample() {
    const values = {}
    const byModule = Map.groupBy(this.series, (key) => parsePointKey(key).moduleId)
    for (const [moduleId, keys] of byModule) {
      const api = this.peers().find((p) => p.id === moduleId)?.api
      let read = {}
      try {
        read = api?.read(keys.map((key) => parsePointKey(key).id)) ?? {}
      } catch {
        // module indisponible : valeurs absentes
      }
      for (const key of keys) values[key] = toNumber(read[parsePointKey(key).id])
    }
    const row = { t: Date.now(), values }
    this.rows.push(row)
    if (this.rows.length > this.maxRows) this.rows.splice(0, this.rows.length - this.maxRows)
    this.pending.push(row)
  }

  flush() {
    if (!this.pending.length) return
    const rows = this.pending
    this.pending = []
    this.onSamples({ rows, count: this.rows.length })
  }

  /**
   * Fichier CSV (séparateur « ; ») : une colonne d'horodatage ISO puis une colonne par point.
   * `labels` : { [clé]: libellé } ; `decimal` : '.' ou ','.
   */
  csv({ labels = {}, decimal = '.' } = {}) {
    const keys = [...new Set(this.rows.flatMap((row) => Object.keys(row.values)))]
    const quote = (text) => (/[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text)
    const number = (v) =>
      v === null || v === undefined ? '' : decimal === ',' ? String(v).replace('.', ',') : String(v)
    const lines = [
      ['Time', ...keys.map((key) => labels[key] ?? key)].map(quote).join(';'),
      ...this.rows.map((row) =>
        [new Date(row.t).toISOString(), ...keys.map((key) => number(row.values[key]))].join(';')
      )
    ]
    return `${lines.join('\r\n')}\r\n`
  }

  dispose() {
    this.stop()
  }
}
