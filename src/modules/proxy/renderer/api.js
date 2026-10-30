/** Accès IPC au module Proxy TCP / UDP du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`proxy:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`proxy:${event}`, listener)

export const proxyApi = {
  status: () => invoke('status'),
  start: (rule) => invoke('start', rule),
  startAll: (rules) => invoke('startAll', rules),
  stop: (id) => invoke('stop', id),
  stopAll: () => invoke('stopAll'),
  update: (rule) => invoke('update', rule),
  cut: (id) => invoke('cut', id),
  capture: (capture) => invoke('capture', capture),
  onStatus: (fn) => on('status', fn),
  log: {
    list: () => invoke('log:list'),
    clear: () => invoke('log:clear'),
    export: () => invoke('log:export'),
    onEntries: (fn) => on('log', fn)
  }
}
