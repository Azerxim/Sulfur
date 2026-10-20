/** Accès IPC au module Autorité de certification du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`ca:${action}`, ...args)

export const caApi = {
  list: () => invoke('list'),
  createAuthority: (params) => invoke('authority:create', params),
  importAuthority: (params) => invoke('authority:import', params),
  removeAuthority: (id) => invoke('authority:remove', id),
  issue: (id, params) => invoke('issue', id, params),
  sign: (id, params) => invoke('sign', id, params),
  revoke: (id, serial, reason) => invoke('revoke', id, serial, reason),
  remove: (id, serial) => invoke('remove', id, serial),
  updateCrl: (id) => invoke('crl', id),
  details: (id, serial) => invoke('details', id, serial),
  exportFile: (id, serial, format, options) => invoke('export', id, serial, format, options),
  pickFile: (kind) => invoke('pickFile', kind),
  openFolder: (id) => invoke('openFolder', id),
  hostNames: () => invoke('hostNames')
}
