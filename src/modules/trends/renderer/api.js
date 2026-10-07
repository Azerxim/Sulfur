/** Accès IPC au module courbes du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`trends:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`trends:${event}`, listener)

export const trendsApi = {
  points: () => invoke('points'),
  status: () => invoke('status'),
  data: () => invoke('data'),
  start: (options) => invoke('start', options),
  stop: () => invoke('stop'),
  clear: () => invoke('clear'),
  setSeries: (series) => invoke('setSeries', series),
  /** Export CSV (null si annulé). */
  exportCsv: (decimal) => invoke('export', decimal),
  onStatus: (fn) => on('status', fn),
  onSamples: (fn) => on('samples', fn)
}
