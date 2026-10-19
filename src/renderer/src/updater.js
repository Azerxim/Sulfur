import { useEffect, useState } from 'react'

/** État des mises à jour tenu par le process principal (module `updater`), suivi en direct. */
export function useUpdater() {
  const [state, setState] = useState(null)

  useEffect(() => {
    const api = window.sulfur
    if (!api) return
    let active = true
    api
      .invoke('updater:state')
      .then((s) => active && setState(s))
      .catch(() => {})
    const off = api.on('updater:status', setState)
    return () => {
      active = false
      off()
    }
  }, [])

  const call = (action, ...args) => window.sulfur?.invoke(`updater:${action}`, ...args).catch(() => {})
  return {
    state,
    check: () => call('check'),
    download: () => call('download'),
    install: () => call('install'),
    openReleases: () => call('openReleases'),
    setAutoCheck: (enabled) => call('setAutoCheck', enabled)
  }
}
