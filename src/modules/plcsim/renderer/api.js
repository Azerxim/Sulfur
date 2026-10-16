/** Accès IPC au module PLCSim Advanced du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`plcsim:${action}`, ...args)
const on = (event, listener) => window.sulfur.on(`plcsim:${event}`, listener)

export const plcsimApi = {
  status: () => invoke('status'),
  connect: (options) => invoke('connect', options),
  disconnect: () => invoke('disconnect'),
  createInstance: (options) => invoke('createInstance', options),
  operate: (name, operation) => invoke('operate', name, operation),
  setIp: (name, suite) => invoke('setIp', name, suite),
  tags: (name, options) => invoke('tags', name, options),
  addWatch: (item) => invoke('addWatch', item),
  removeWatch: (id) => invoke('removeWatch', id),
  writeWatch: (id, value) => invoke('writeWatch', id, value),
  setPollInterval: (ms) => invoke('setPollInterval', ms),
  onStatus: (fn) => on('status', fn),
  onData: (fn) => on('data', fn)
}
