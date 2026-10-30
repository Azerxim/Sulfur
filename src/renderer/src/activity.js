import { useMemo, useSyncExternalStore } from 'react'

/**
 * Activité des modules, déduite de leurs canaux d'état (`<id>:server:status`, `<id>:client:status`,
 * `<id>:status`…, listés par le process principal) : lus au chargement puis suivis par les
 * événements du même nom. Sert à la barre latérale, à l'en-tête des modules et à l'accueil.
 */
let statuses = {}
const listeners = new Set()
const followed = new Set()

function store(id, channel, status) {
  statuses = { ...statuses, [id]: { ...statuses[id], [channel]: status } }
  listeners.forEach((listener) => listener())
}

/** Lit et suit les canaux d'état des modules actifs (à rappeler quand des modules sont activés). */
export async function loadModuleActivity() {
  let channels
  try {
    channels = (await window.sulfur.invoke('modules:statusChannels')) ?? {}
  } catch {
    return
  }
  for (const [id, list] of Object.entries(channels)) {
    for (const channel of list) {
      if (!followed.has(channel)) {
        followed.add(channel)
        window.sulfur.on(channel, (status) => store(id, channel, status))
      }
      window.sulfur
        .invoke(channel)
        .then((status) => store(id, channel, status))
        .catch(() => {})
    }
  }
}

/** Champs d'état qui signalent un serveur en marche, un client connecté ou un port ouvert. */
const ACTIVE_FIELDS = ['running', 'connected', 'open', 'polling', 'repeating', 'receiving', 'recording']

const isActive = (status) => !!status && (ACTIVE_FIELDS.some((field) => status[field]) || status.faults?.length > 0)

const endpointOf = (status) =>
  status.endpointUrl ?? status.url ?? status.endpoint ?? status.endpoints?.[0] ?? status.receiverEndpoint ?? null

const sessionsOf = (status) =>
  typeof status.sessions === 'number'
    ? status.sessions
    : Array.isArray(status.connections)
      ? status.connections.length
      : 0

const isClientChannel = (channel) => /client:status$/.test(channel)

/**
 * Résumé de l'activité d'un module à partir de ses états par canal : `active` (au moins un serveur,
 * client ou outil en marche), `server`, `client`, premier point d'accès d'un serveur en marche,
 * nombre de sessions ou connexions clientes.
 */
export function summarizeActivity(byChannel = {}) {
  const entries = Object.entries(byChannel).filter(([, status]) => isActive(status))
  const clients = entries.filter(([channel]) => isClientChannel(channel))
  const others = entries.filter(([channel]) => !isClientChannel(channel)).map(([, status]) => status)
  const endpoint = others.map(endpointOf).find(Boolean) ?? null
  return {
    active: entries.length > 0,
    server: others.some((status) => status.running),
    client: clients.length > 0,
    endpoint,
    port: endpoint?.match(/:(\d+)(?:\/|$)/)?.[1] ?? null,
    sessions: others.reduce((n, status) => n + sessionsOf(status), 0)
  }
}

const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Activité des modules : `activity(id)` retourne le résumé de `summarizeActivity`. */
export function useModuleActivity() {
  const all = useSyncExternalStore(subscribe, () => statuses)
  return useMemo(() => {
    const cache = new Map()
    return (id) => {
      if (!cache.has(id)) cache.set(id, summarizeActivity(all[id]))
      return cache.get(id)
    }
  }, [all])
}
