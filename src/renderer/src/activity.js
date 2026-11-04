import { useMemo, useSyncExternalStore } from 'react'

/**
 * Activité des modules, déduite de leurs canaux d'état (`<id>:server:status`, `<id>:client:status`,
 * `<id>:status`…, listés par le process principal) : lus au chargement puis suivis par les
 * événements du même nom. Sert à la barre latérale, à l'en-tête des modules et à l'accueil.
 * Le canal d'un rôle à instances (voir `defineInstances` du SDK) donne la liste des états de ses
 * instances : chacune compte comme un serveur ou un client.
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

/** Rôle d'un canal d'état (`<module>:<rôle>:status`), null pour `<module>:status`. */
const roleOf = (channel) => channel.split(':').slice(1, -1).join(':') || null

/** Rôles clients : client, radiusClient, sftpClient, device (LwM2M), manager (SNMP)… */
const isClientRole = (role) => !!role && /(client|device|manager)$/i.test(role)

/**
 * Résumé de l'activité d'un module à partir de ses états par canal :
 * - `active` (au moins un serveur, client ou outil en marche), `server`, `client` ;
 * - `servers`, `clients` : nombre de serveurs en marche et de clients actifs ;
 * - premier point d'accès d'un serveur en marche (`endpoint`, `port`), nombre de sessions ou
 *   connexions clientes (`sessions`) ;
 * - `instanced` (le module a des rôles à instances) et `instances` : chaque instance créée
 *   `{ id, name, role, client, active, running, endpoint, sessions }` dans l'ordre des canaux.
 */
export function summarizeActivity(byChannel = {}) {
  const units = Object.entries(byChannel).flatMap(([channel, status]) => {
    const role = roleOf(channel)
    const client = isClientRole(role)
    const unit = (s, instance) => ({
      instance,
      role,
      client,
      status: s,
      active: isActive(s),
      running: !client && !!s?.running
    })
    return Array.isArray(status) ? status.map((s) => unit(s, true)) : status ? [unit(status, false)] : []
  })
  const active = units.filter((u) => u.active)
  const servers = active.filter((u) => !u.client)
  const endpoint = servers.map((u) => endpointOf(u.status)).find(Boolean) ?? null
  return {
    active: active.length > 0,
    server: servers.some((u) => u.running),
    client: active.some((u) => u.client),
    servers: servers.filter((u) => u.running).length,
    clients: active.filter((u) => u.client).length,
    endpoint,
    port: endpoint?.match(/:(\d+)(?:\/|$)/)?.[1] ?? null,
    sessions: servers.reduce((n, u) => n + sessionsOf(u.status), 0),
    instanced: Object.values(byChannel).some(Array.isArray),
    instances: units
      .filter((u) => u.instance)
      .map((u) => ({
        id: u.status.instance,
        name: u.status.name ?? u.status.instance,
        role: u.role,
        client: u.client,
        active: u.active,
        running: u.running,
        endpoint: endpointOf(u.status),
        sessions: u.client ? 0 : sessionsOf(u.status)
      }))
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
