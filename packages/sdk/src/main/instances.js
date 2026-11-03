import { randomBytes } from 'crypto'
import { t } from '../i18n.js'
import { INSTANCES_SECTION, instancesOf, nextInstanceName } from '../instances.js'

/**
 * Instances d'un module (serveurs, clients… en nombre libre), côté process principal.
 *
 * `roles` décrit chaque rôle : `{ server: { label, create, busy, dispose } }`
 *  - `label()` : libellé du rôle, base du nom des nouvelles instances (« Serveur 1 ») ;
 *  - `create(instance, { emit })` : crée l'objet d'une instance (`instance` : `{ id, role, name }`) ;
 *    `emit(event, payload)` diffuse `<moduleId>:<role>:<id>:<event>` ; l'événement `status`
 *    diffuse aussi `<moduleId>:<role>:status` avec l'état de toutes les instances du rôle ;
 *  - `busy(object)` : instance en marche (serveur démarré, client connecté) : ni suppression, ni
 *    import de configuration ;
 *  - `dispose(object)` : arrêt de l'instance (suppression, arrêt du module).
 *
 * La liste est la section `instances` de la configuration du module (voir instances.js) ; elle est
 * relue à chaque accès, si bien qu'un import ou une réinitialisation de la configuration est pris
 * en compte sans autre action.
 *
 * Canaux enregistrés : `instances:list`, `instances:create` (role, name?), `instances:rename` (id,
 * name), `instances:remove` (id), et pour chaque rôle `<role>:status` (id : état de l'instance ;
 * sans id : `[{ instance, name, ...état }]` de toutes ses instances). Événement `instances` (liste)
 * à chaque changement. `handle(role, action, fn)` enregistre `<role>:<action>`, appelé depuis
 * l'interface avec l'identifiant de l'instance en premier argument : `fn(objet, ...args)`.
 */
export function defineInstances(ctx, roles) {
  /** Objets des instances : id → { role, object }. */
  const live = new Map()

  const listed = () => instancesOf(ctx.config()).filter((i) => Object.hasOwn(roles, i.role))
  const save = (list) => ctx.setConfig(INSTANCES_SECTION, list)

  const emitter = (instance) => (event, payload) => {
    ctx.emit(`${instance.role}:${instance.id}:${event}`, payload)
    if (event === 'status') ctx.emit(`${instance.role}:status`, statuses(instance.role))
  }

  /** Objets alignés sur la liste enregistrée : créés pour les nouvelles instances, arrêtés pour les disparues. */
  function sync() {
    const list = listed()
    const wanted = new Map(list.map((i) => [i.id, i]))
    for (const [id, entry] of live) {
      if (wanted.get(id)?.role === entry.role) continue
      live.delete(id)
      Promise.resolve(roles[entry.role].dispose?.(entry.object)).catch(() => {})
    }
    for (const instance of list) {
      if (!live.has(instance.id)) {
        const object = roles[instance.role].create({ ...instance }, { emit: emitter(instance) })
        live.set(instance.id, { role: instance.role, object })
      }
    }
    return list
  }

  function entryOf(id, role) {
    sync()
    const entry = live.get(id)
    if (!entry || (role && entry.role !== role)) throw new Error(t('errors.unknownInstance', { id: String(id) }))
    return entry
  }

  const statusOf = (object) => object.status?.() ?? {}

  function statuses(role) {
    return sync()
      .filter((i) => i.role === role)
      .map((i) => ({ ...statusOf(live.get(i.id).object), instance: i.id, name: i.name }))
  }

  /** Liste diffusée à l'interface, puis l'état des rôles concernés (activité des modules). */
  function changed(...changedRoles) {
    ctx.emit('instances', sync())
    for (const role of new Set(changedRoles)) ctx.emit(`${role}:status`, statuses(role))
  }

  const isBusy = (entry) => !!roles[entry.role].busy?.(entry.object)

  function newId(role) {
    const ids = new Set(listed().map((i) => i.id))
    let id
    do id = `${role}-${randomBytes(3).toString('hex')}`
    while (ids.has(id))
    return id
  }

  const cleanName = (name) => {
    const s = typeof name === 'string' ? name.trim().slice(0, 64) : ''
    if (!s) throw new Error(t('errors.emptyName'))
    return s
  }

  ctx.handle('instances:list', () => sync())

  ctx.handle('instances:create', (role, name) => {
    if (!Object.hasOwn(roles, role)) throw new Error(t('errors.unknownRole', { role: String(role) }))
    const list = listed()
    const instance = {
      id: newId(role),
      role,
      name:
        name === undefined || name === null
          ? nextInstanceName(
              roles[role].label(),
              list.filter((i) => i.role === role)
            )
          : cleanName(name)
    }
    save([...list, instance])
    changed(role)
    return instance
  })

  ctx.handle('instances:rename', (id, name) => {
    const entry = entryOf(id)
    const next = cleanName(name)
    save(listed().map((i) => (i.id === id ? { ...i, name: next } : i)))
    changed(entry.role)
    return next
  })

  ctx.handle('instances:remove', async (id) => {
    const entry = entryOf(id)
    const instance = listed().find((i) => i.id === id)
    if (isBusy(entry)) throw new Error(t('errors.instanceBusy', { name: instance.name }))
    save(listed().filter((i) => i.id !== id))
    // Réglages propres à l'instance (`<section>:<id>`) supprimés avec elle.
    for (const section of Object.keys(ctx.config())) {
      if (section.endsWith(`:${id}`)) ctx.setConfig(section, undefined)
    }
    live.delete(id)
    await Promise.resolve(roles[entry.role].dispose?.(entry.object)).catch(() => {})
    changed(entry.role)
  })

  for (const role of Object.keys(roles)) {
    ctx.handle(`${role}:status`, (id) =>
      id === undefined || id === null ? statuses(role) : statusOf(entryOf(id, role).object)
    )
  }

  return {
    /** Enregistre le canal `<role>:<action>` : `fn(objet de l'instance, ...args)`. */
    handle(role, action, fn) {
      ctx.handle(`${role}:${action}`, (id, ...args) => fn(entryOf(id, role).object, ...args))
    },
    /** Objet d'une instance (erreur traduite si elle n'existe pas ou n'a pas ce rôle). */
    get: (id, role) => entryOf(id, role).object,
    /** Instances (d'un rôle, ou toutes), avec leur objet : [{ instance, object }]. */
    all(role) {
      return sync()
        .filter((i) => !role || i.role === role)
        .map((instance) => ({ instance, object: live.get(instance.id).object }))
    },
    /** Au moins une instance en marche. */
    busy: () => [...live.values()].some(isBusy),
    /** Arrêt de toutes les instances (arrêt du module). */
    async dispose() {
      const entries = [...live.values()]
      live.clear()
      await Promise.all(entries.map((e) => Promise.resolve(roles[e.role].dispose?.(e.object)).catch(() => {})))
    }
  }
}
