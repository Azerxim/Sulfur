/**
 * Instances d'un module côté interface (serveurs, clients… en nombre libre, voir `defineInstances`
 * de @azerxim/sulfur-sdk/main) : liste et état des instances, page à un onglet par instance.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { faPen, faPlus, faTrashCan } from '@fortawesome/free-solid-svg-icons'
import { Button, CommitInput, ErrorBanner, Icon, Modal, TabbedPage, useStoredState } from './components.jsx'
import { forgetInstanceSections, onModuleConfigsReplaced } from './module-config.js'
import { useExtensions } from './extensions.jsx'
import { t } from '../i18n.js'
import { nextInstanceName } from '../instances.js'

const invoke = (moduleId, action, ...args) => window.sulfur.invoke(`${moduleId}:${action}`, ...args)

/**
 * Instances du module `moduleId` : `{ instances, loaded, create(role, name?), rename(id, name),
 * remove(id) }`, `instances` étant `[{ id, role, name }]` dans l'ordre de création.
 */
export function useInstances(moduleId) {
  const [instances, setInstances] = useState([])
  const [loaded, setLoaded] = useState(false)

  const reload = useCallback(
    () =>
      invoke(moduleId, 'instances:list')
        .then((list) => setInstances(list ?? []))
        .catch(() => setInstances([]))
        .finally(() => setLoaded(true)),
    [moduleId]
  )

  useEffect(() => {
    reload()
    const offs = [
      window.sulfur.on(`${moduleId}:instances`, (list) => setInstances(list ?? [])),
      // Configuration importée ou réinitialisée : la liste a pu changer.
      onModuleConfigsReplaced((modules) => moduleId in modules && reload())
    ]
    return () => offs.forEach((off) => off())
  }, [moduleId, reload])

  return {
    instances,
    loaded,
    create: (role, name) => invoke(moduleId, 'instances:create', role, name),
    rename: (id, name) => invoke(moduleId, 'instances:rename', id, name),
    async remove(id) {
      await invoke(moduleId, 'instances:remove', id)
      forgetInstanceSections(moduleId, id)
    }
  }
}

/** État des instances d'un rôle : `{ [id instance]: état }`, suivi par l'événement `<role>:status`. */
export function useInstanceStatuses(moduleId, role) {
  const [statuses, setStatuses] = useState({})
  useEffect(() => {
    const apply = (list) =>
      setStatuses(Object.fromEntries((Array.isArray(list) ? list : []).map(({ instance, ...s }) => [instance, s])))
    invoke(moduleId, `${role}:status`)
      .then(apply)
      .catch(() => {})
    return window.sulfur.on(`${moduleId}:${role}:status`, apply)
  }, [moduleId, role])
  return statuses
}

/** Champs d'état d'une instance en marche (serveur démarré, client connecté, envoi en cours…). */
const ACTIVE_FIELDS = ['running', 'connected', 'open', 'polling', 'repeating', 'receiving', 'recording']
const isRunning = (status) => ACTIVE_FIELDS.some((field) => status?.[field])

const dot = (on) => <span className={`size-1.5 rounded-full ${on ? 'bg-emerald-400' : 'bg-slate-600'}`} />

/** Barre d'une instance : nom (renommage) et suppression (instance arrêtée uniquement). */
function InstanceBar({ instance, running, onRename, onRemove }) {
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState(null)
  const run = async (fn) => {
    setError(null)
    try {
      await fn()
      return true
    } catch (err) {
      setError(err.message)
      return false
    }
  }
  return (
    <>
      <div className="flex items-center gap-2">
        <Icon icon={faPen} className="size-3 shrink-0 text-slate-500" />
        <CommitInput
          value={instance.name}
          aria-label={t('ui.instances.rename')}
          title={t('ui.instances.rename')}
          maxLength={64}
          className="h-7! w-64! text-sm font-medium"
          onCommit={(name) => name.trim() && name.trim() !== instance.name && run(() => onRename(name))}
        />
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          disabled={running}
          title={running ? t('ui.instances.removeRunning') : undefined}
          onClick={() => setConfirm(true)}
        >
          <Icon icon={faTrashCan} className="size-3.5" /> {t('ui.instances.remove')}
        </Button>
      </div>
      <ErrorBanner error={error} onClose={() => setError(null)} />
      {confirm && (
        <Modal
          title={t('ui.instances.removeTitle', { name: instance.name })}
          className="max-w-md"
          onClose={() => setConfirm(false)}
          actions={
            <Button
              variant="danger"
              size="sm"
              onClick={async () => {
                setConfirm(false)
                await run(onRemove)
              }}
            >
              <Icon icon={faTrashCan} className="size-3.5" /> {t('ui.instances.remove')}
            </Button>
          }
        >
          <p className="text-sm text-slate-300">{t('ui.instances.removeText')}</p>
        </Modal>
      )}
    </>
  )
}

/** État sans instance : invitation à en créer une, un bouton par rôle. */
function EmptyInstances({ roles, emptyHint, error, onError, onAdd }) {
  return (
    <div className="grid min-h-0 flex-1 place-items-center p-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <div className="flex gap-2 text-slate-600">
          {roles.map(({ role, icon }) => (
            <Icon key={role} icon={icon} className="size-6" />
          ))}
        </div>
        <h2 className="text-sm font-semibold text-slate-200">{t('ui.instances.empty')}</h2>
        <p className="text-sm text-slate-400">{emptyHint ?? t('ui.instances.emptyHint')}</p>
        <div className="flex flex-wrap justify-center gap-2">
          {roles.map(({ role, label }) => (
            <Button key={role} variant={role === roles[0].role ? 'primary' : 'secondary'} onClick={() => onAdd(role)}>
              <Icon icon={faPlus} className="size-3.5" /> {label}
            </Button>
          ))}
        </div>
        <ErrorBanner error={error} onClose={() => onError(null)} />
      </div>
    </div>
  )
}

/** Identifiant d'onglet d'un onglet apporté par un autre module (distinct de ceux des instances). */
const extensionTab = (extension) => `ext:${extension.key}`

/**
 * Page d'un module à instances : un onglet par instance (pastille verte si elle est en marche),
 * boutons d'ajout par rôle à droite de la barre, nom modifiable et suppression au-dessus du panneau,
 * puis les onglets apportés par d'autres modules (voir useExtensions). Sans instance, la page
 * propose d'en créer une.
 *  - `moduleId` ; `roles` : `[{ role, label, icon }]` (ordre des boutons d'ajout) ;
 *  - `statuses` : `{ [id instance]: état }` (voir useInstanceStatuses) ;
 *  - `children(instance)` : panneau de l'instance. Les panneaux restent montés (état local conservé).
 */
export function InstancesPage({ moduleId, roles, statuses = {}, emptyHint, children }) {
  const { instances, loaded, create, rename, remove } = useInstances(moduleId)
  const extensions = useExtensions(moduleId)
  const [selected, setSelected] = useStoredState(`sulfur:tab:${moduleId}`, '')
  const [error, setError] = useState(null)
  const roleOf = useMemo(() => Object.fromEntries(roles.map((r) => [r.role, r])), [roles])
  const shown = instances.filter((i) => roleOf[i.role])
  const extension = extensions.find((e) => extensionTab(e) === selected)
  const current = extension ? null : (shown.find((i) => i.id === selected) ?? shown[0])

  const add = async (role) => {
    setError(null)
    // Nom par défaut dans la langue de l'interface (« Serveur 2 ») ; le process principal en
    // choisit un si le libellé du rôle n'est pas un texte.
    const label = roleOf[role].label
    const name =
      typeof label === 'string'
        ? nextInstanceName(
            label,
            instances.filter((i) => i.role === role)
          )
        : undefined
    try {
      const instance = await create(role, name)
      setSelected(instance.id)
    } catch (err) {
      setError(err.message)
    }
  }

  const addButtons = roles.map(({ role, label }) => (
    <Button
      key={role}
      variant="ghost"
      size="sm"
      title={t('ui.instances.addRole', { role: label })}
      onClick={() => add(role)}
    >
      <Icon icon={faPlus} className="size-3" /> {label}
    </Button>
  ))

  if (!loaded) return null

  const empty = <EmptyInstances roles={roles} emptyHint={emptyHint} error={error} onError={setError} onAdd={add} />
  if (!shown.length && !extensions.length) return empty

  return (
    <TabbedPage
      value={extension ? extensionTab(extension) : (current?.id ?? '')}
      onChange={setSelected}
      actions={addButtons}
      tabs={[
        ...shown.map((i) => ({
          id: i.id,
          label: i.name,
          icon: roleOf[i.role].icon,
          badge: dot(isRunning(statuses[i.id]))
        })),
        ...extensions.map((e) => ({
          id: extensionTab(e),
          label: typeof e.label === 'function' ? e.label() : e.label,
          icon: e.icon
        }))
      ]}
    >
      {shown.length > 0 && <ErrorBanner error={error} onClose={() => setError(null)} />}
      {!current && !extension && empty}
      {shown.map((instance) => (
        <div key={instance.id} className={instance.id === current?.id ? 'contents' : 'hidden'}>
          <InstanceBar
            instance={instance}
            running={isRunning(statuses[instance.id])}
            onRename={(name) => rename(instance.id, name)}
            onRemove={() => remove(instance.id)}
          />
          {children(instance)}
        </div>
      ))}
      {extensions.map((e) => (
        <div key={e.key} className={e === extension ? 'contents' : 'hidden'}>
          <e.Component />
        </div>
      ))}
    </TabbedPage>
  )
}
