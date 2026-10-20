/** Accès IPC au module Explorateur réseau du process principal. */
const invoke = (action, ...args) => window.sulfur.invoke(`explorer:${action}`, ...args)

export const explorerApi = {
  checkTargets: (text) => invoke('targets:check', text),
  networks: () => invoke('networks')
}
