/** Accès IPC au module Terminal série du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`serial:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`serial:${event}`, listener)

export const serialApi = {
  ports: () => invoke('ports'),
  status: () => invoke('status'),
  open: (config, rx) => invoke('open', config, rx),
  close: () => invoke('close'),
  send: (payload) => invoke('send', payload),
  startRepeat: (payload, interval) => invoke('repeat:start', payload, interval),
  stopRepeat: () => invoke('repeat:stop'),
  setOutputs: (outputs) => invoke('outputs', outputs),
  sendBreak: () => invoke('break'),
  setRx: (rx) => invoke('rx', rx),
  onStatus: (fn) => on('status', fn),
  log: {
    list: () => invoke('log:list'),
    clear: () => invoke('log:clear'),
    export: () => invoke('log:export'),
    onEntries: (fn) => on('log', fn)
  },
  gateway: {
    status: () => invoke('gateway:status'),
    start: (config) => invoke('gateway:start', config),
    stop: () => invoke('gateway:stop'),
    onStatus: (fn) => on('gateway:status', fn)
  }
}
