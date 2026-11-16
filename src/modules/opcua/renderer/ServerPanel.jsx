import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faChevronLeft,
  faChevronRight,
  faCopy,
  faPlay,
  faPlus,
  faStop,
  faTrashCan
} from '@fortawesome/free-solid-svg-icons'
import {
  Button,
  Card,
  CommitInput,
  ErrorBanner,
  Field,
  Input,
  Select,
  StatusDot,
  usePersistentState
} from '@azerxim/sulfur-sdk/ui'
import { getLocale, instanceSection } from '@azerxim/sulfur-sdk'
import { DATA_TYPES, DEFAULT_SERVER_CONFIG, HISTORY_MAX_VALUES, SIMULATIONS } from '../shared/constants'
import { opcuaApi } from './api'
import ServerSecurity, { isSecurityValid } from './ServerSecurity'
import ServerStructures, { structureProblem } from './ServerStructures'
import ServerMethods from './ServerMethods'
import ServerAlarms, { canHaveAlarm } from './ServerAlarms'
import ServerNodesets from './ServerNodesets'
import { t } from '../shared/i18n'

/** Délai avant d'envoyer au serveur les paramètres modifiés pendant qu'il tourne. */
const LIVE_DEBOUNCE = 300

/** Variables affichées par page : un serveur peut en compter des milliers. */
const PAGE_SIZE = 100

/** Variables, méthodes et alarmes partagent le dossier racine : un nom libre parmi tous. */
function uniqueName(config, prefix) {
  const names = new Set([...config.variables, ...config.methods, ...config.alarms].map((v) => v.name))
  let i = 1
  while (names.has(`${prefix}${i}`)) i++
  return `${prefix}${i}`
}

const newVariable = (config) => ({
  id: crypto.randomUUID(),
  name: uniqueName(config, 'Variable'),
  dataType: 'Double',
  arrayLength: 0,
  initialValue: 0,
  simulation: 'none',
  period: 1000,
  min: 0,
  max: 100,
  writable: true,
  historizing: false
})

const newMethod = (config) => ({
  id: crypto.randomUUID(),
  name: uniqueName(config, 'Method'),
  inputs: [{ name: 'Value', dataType: 'Double', array: false }],
  outputs: [{ name: 'Value', dataType: 'Double', array: false }],
  behavior: 'echo',
  statusCode: 'BadInvalidArgument'
})

const newAlarm = (config) => ({
  id: crypto.randomUUID(),
  name: uniqueName(config, 'Alarm'),
  variable: config.variables.find(canHaveAlarm)?.id ?? '',
  highHigh: '',
  high: 80,
  low: '',
  lowLow: ''
})

/** Points d'entrée du serveur pour chaque liste modifiable à chaud : [ajout/mise à jour, suppression]. */
const LIVE_LISTS = {
  variables: ['upsertVariable', 'removeVariable'],
  methods: ['upsertMethod', 'removeMethod'],
  alarms: ['upsertAlarm', 'removeAlarm']
}

const formatScalar = (v) => (typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(3) : String(v))

const formatValue = (v) => {
  if (v === null || v === undefined) return '—'
  if (Array.isArray(v)) return v.map(formatScalar).join(', ')
  if (typeof v === 'object') return JSON.stringify(v)
  return formatScalar(v)
}

/** Exemple de saisie pour un type structuré : {"X": 0, "Y": 0}. */
const structExample = (structure) =>
  JSON.stringify(
    Object.fromEntries(
      (structure?.fields ?? []).map((f) => [
        f.name,
        f.array ? [] : f.dataType === 'Boolean' ? false : f.dataType === 'String' ? '' : 0
      ])
    )
  )

/** Valeur courante d'une variable, affichée en direct et modifiable pendant que le serveur tourne. */
function LiveValue({ variable, value, onSet }) {
  if (variable.dataType === 'Boolean' && !(Number(variable.arrayLength) > 0)) {
    return (
      <button
        onClick={() => onSet(!value)}
        title={t('ui.toggle')}
        className={`h-9 w-full rounded-md border font-mono text-sm transition-colors ${
          value
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
            : 'border-ink-700 bg-ink-950 text-slate-400'
        }`}
      >
        {formatValue(value)}
      </button>
    )
  }
  return <CommitInput className="font-mono text-sulfur-300" value={formatValue(value)} onCommit={onSet} />
}

/**
 * Ligne d'une variable. Mémoïsée : une valeur reçue du serveur ne redessine que les lignes dont la
 * valeur a changé (`actions` est stable, voir ServerPanel).
 */
const VariableRow = memo(function VariableRow({
  v,
  structure,
  structureNames,
  duplicate,
  value,
  running,
  busy,
  actions
}) {
  const isArray = !structure && Number(v.arrayLength) > 0
  const valueHint = structure
    ? t('opcua.server.structValueHint', { example: structExample(structure) })
    : isArray
      ? t('opcua.server.arrayValueHint')
      : undefined
  return (
    <tr key={v.id} className="align-middle">
      <td className="p-1.5">
        <CommitInput
          value={v.name}
          disabled={busy}
          title={running ? t('ui.renameRecreates') : undefined}
          className={duplicate || !v.name.trim() ? 'border-red-500/60' : ''}
          onCommit={(name) => actions.update(v.id, { name: name.trim() }, { immediate: true })}
        />
      </td>
      <td className="p-1.5">
        <Select
          value={v.dataType}
          disabled={busy}
          title={running ? t('ui.typeRecreates') : undefined}
          className={
            !DATA_TYPES.includes(v.dataType) && !structureNames.includes(v.dataType) ? 'border-red-500/60' : ''
          }
          onChange={(e) => actions.update(v.id, { dataType: e.target.value }, { immediate: true })}
        >
          {DATA_TYPES.map((type) => (
            <option key={type}>{type}</option>
          ))}
          {structureNames.length > 0 && (
            <optgroup label={t('opcua.structures.title', { count: structureNames.length })}>
              {structureNames.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </optgroup>
          )}
          {!DATA_TYPES.includes(v.dataType) && !structureNames.includes(v.dataType) && <option>{v.dataType}</option>}
        </Select>
      </td>
      <td className="w-20 p-1.5">
        <CommitInput
          type="number"
          min={0}
          value={structure ? 0 : (v.arrayLength ?? 0)}
          disabled={busy || !!structure}
          title={t('opcua.server.arrayLengthHint')}
          onCommit={(raw) =>
            actions.update(v.id, { arrayLength: Math.max(0, Math.floor(Number(raw) || 0)) }, { immediate: true })
          }
        />
      </td>
      <td className="w-44 p-1.5">
        {running ? (
          <LiveValue variable={v} value={value} onSet={(raw) => actions.setValue(v.id, raw)} />
        ) : (
          <Input
            className={structure || isArray ? 'font-mono' : ''}
            value={typeof v.initialValue === 'object' ? JSON.stringify(v.initialValue) : String(v.initialValue)}
            disabled={busy}
            title={valueHint}
            placeholder={structure ? structExample(structure) : undefined}
            onChange={(e) => actions.update(v.id, { initialValue: e.target.value })}
          />
        )}
      </td>
      <td className="p-1.5">
        <Select
          value={structure ? 'none' : v.simulation}
          disabled={busy || !!structure}
          onChange={(e) => actions.update(v.id, { simulation: e.target.value }, { immediate: true })}
        >
          {SIMULATIONS.map((k) => (
            <option key={k} value={k}>
              {t(`simulations.${k}`)}
            </option>
          ))}
        </Select>
      </td>
      {['period', 'min', 'max'].map((key) => (
        <td key={key} className="w-24 p-1.5">
          <Input
            type="number"
            value={v[key]}
            disabled={busy || v.simulation === 'none' || !!structure}
            onChange={(e) => actions.update(v.id, { [key]: Number(e.target.value) })}
          />
        </td>
      ))}
      {['writable', 'historizing'].map((key) => (
        <td key={key} className="p-1.5 text-center">
          <input
            type="checkbox"
            className="size-4 accent-sulfur-400"
            checked={!!v[key]}
            disabled={busy}
            onChange={(e) => actions.update(v.id, { [key]: e.target.checked }, { immediate: true })}
          />
        </td>
      ))}
      <td className="p-1.5">
        <Button variant="ghost" size="icon" disabled={busy} onClick={() => actions.remove(v.id)} title={t('ui.remove')}>
          <FontAwesomeIcon icon={faTrashCan} className="size-3.5" />
        </Button>
      </td>
    </tr>
  )
})

export default function ServerPanel({ instance, status }) {
  const api = useMemo(() => opcuaApi.server(instance.id), [instance.id])
  const [config, setConfig] = usePersistentState(
    'opcua',
    instanceSection('server', instance.id),
    status.config ?? DEFAULT_SERVER_CONFIG
  )
  const [nodesets, setNodesets] = usePersistentState('opcua', instanceSection('nodesets', instance.id), [])
  const [values, setValues] = useState({})
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const timers = useRef({})
  const running = status.running

  // Le serveur est la source de vérité quand il tourne : on reprend sa configuration au démarrage.
  useEffect(() => {
    if (running && status.config) setConfig(status.config)
    if (!running) setValues({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  useEffect(() => {
    api.values().then(setValues)
    return api.onValues(setValues)
  }, [api])

  async function run(action) {
    setBusy(true)
    setError(null)
    try {
      return await action()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const live = (action) => action().catch((err) => setError(err.message))

  /** Modification structurelle : en cas de refus, on se recale sur l'état réel du serveur. */
  const liveSync = (action) =>
    action().catch(async (err) => {
      setError(err.message)
      const current = await api.status()
      if (current.config) setConfig(current.config)
    })

  /** Envoie un élément au serveur (immédiatement ou après un court délai). */
  function push(list, item, immediate) {
    clearTimeout(timers.current[item.id])
    const send = () => liveSync(() => api[LIVE_LISTS[list][0]](item))
    if (immediate) send()
    else timers.current[item.id] = setTimeout(send, LIVE_DEBOUNCE)
  }

  const update = (patch) => setConfig((c) => ({ ...c, ...patch }))

  function updateItem(list, id, patch, { immediate = false } = {}) {
    const next = { ...config[list].find((v) => v.id === id), ...patch }
    setConfig((c) => ({ ...c, [list]: c[list].map((v) => (v.id === id ? next : v)) }))
    if (running) push(list, next, immediate)
  }

  function addItem(list, item) {
    setConfig((c) => ({ ...c, [list]: [...c[list], item] }))
    if (running) push(list, item, true)
  }

  function removeItem(list, id) {
    clearTimeout(timers.current[id])
    setConfig((c) => ({ ...c, [list]: c[list].filter((v) => v.id !== id) }))
    if (running) liveSync(() => api[LIVE_LISTS[list][1]](id))
  }

  const updateVar = (id, patch, options) => updateItem('variables', id, patch, options)

  /** Types structurés (serveur arrêté) : un type renommé l'est aussi dans les variables qui l'utilisent. */
  function changeStructures(structures) {
    const renamed = Object.fromEntries(
      config.structures
        .map((old) => [old.name, structures.find((s) => s.id === old.id)?.name])
        .filter(([before, after]) => after && after !== before)
    )
    update({
      structures,
      variables: config.variables.map((v) => (renamed[v.dataType] ? { ...v, dataType: renamed[v.dataType] } : v))
    })
  }
  const setValue = (id, raw) => live(() => api.setValue(id, raw))

  // Actions des lignes : identité stable (lignes mémoïsées), appel des versions à jour.
  const latest = useRef(null)
  latest.current = { updateVar, setValue, removeItem }
  const rowActions = useMemo(
    () => ({
      update: (id, patch, options) => latest.current.updateVar(id, patch, options),
      setValue: (id, raw) => latest.current.setValue(id, raw),
      remove: (id) => latest.current.removeItem('variables', id)
    }),
    []
  )

  const structureNames = useMemo(() => config.structures.map((s) => s.name), [config.structures])
  const structureByName = useMemo(() => new Map(config.structures.map((s) => [s.name, s])), [config.structures])
  const named = [...config.variables, ...config.methods, ...config.alarms]
  // Noms en double : un seul passage (des milliers de variables).
  const duplicates = useMemo(() => {
    const seen = new Set()
    const twice = new Set()
    for (const { name } of [...config.variables, ...config.methods, ...config.alarms]) {
      if (seen.has(name)) twice.add(name)
      seen.add(name)
    }
    return twice
  }, [config.variables, config.methods, config.alarms])
  const invalid =
    duplicates.size > 0 ||
    named.some((v) => !v.name.trim()) ||
    config.structures.some((s) => structureProblem(s, config.structures)) ||
    config.variables.some((v) => !DATA_TYPES.includes(v.dataType) && !structureNames.includes(v.dataType)) ||
    !isSecurityValid(config.security)

  const query = filter.trim().toLowerCase()
  const filtered = useMemo(
    () => (query ? config.variables.filter((v) => v.name.toLowerCase().includes(query)) : config.variables),
    [config.variables, query]
  )
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const pageVariables = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)

  /** Nouvelle variable : filtre retiré et dernière page affichée, pour la voir aussitôt. */
  function addVariable() {
    setFilter('')
    setPage(Math.floor(config.variables.length / PAGE_SIZE))
    addItem('variables', newVariable(config))
  }

  const headers = [
    [t('ui.name')],
    [t('ui.type')],
    [t('opcua.server.arrayLength'), t('opcua.server.arrayLengthHint')],
    [running ? t('ui.currentValue') : t('ui.initialValue')],
    [t('ui.simulation')],
    [t('ui.periodMs')],
    [t('ui.min')],
    [t('ui.max')],
    [t('ui.write')],
    [
      t('opcua.server.history'),
      t('opcua.server.historyHint', { count: HISTORY_MAX_VALUES.toLocaleString(getLocale()) })
    ],
    ['']
  ]

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <Card
        id="opcua.server.config"
        title={t('opcua.server.title')}
        className="shrink-0"
        actions={
          <>
            <StatusDot
              on={running}
              label={running ? t('opcua.server.running', { count: status.sessions ?? 0 }) : t('ui.stopped')}
            />
            {running ? (
              <Button variant="danger" size="sm" disabled={busy} onClick={() => run(api.stop)}>
                <FontAwesomeIcon icon={faStop} className="size-3.5" /> {t('ui.stop')}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                disabled={busy || invalid}
                onClick={() => run(() => api.start({ ...config, nodesets }))}
              >
                <FontAwesomeIcon icon={faPlay} className="size-3.5" /> {busy ? t('ui.starting') : t('ui.start')}
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-4 gap-4">
            <Field label={t('opcua.server.port')}>
              <Input
                type="number"
                value={config.port}
                disabled={running || busy}
                onChange={(e) => update({ port: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('opcua.server.resourcePath')}>
              <Input
                value={config.resourcePath}
                disabled={running || busy}
                onChange={(e) => update({ resourcePath: e.target.value })}
              />
            </Field>
            <Field label={t('opcua.server.rootFolder')}>
              <Input
                value={config.rootFolder}
                disabled={running || busy}
                onChange={(e) => update({ rootFolder: e.target.value })}
              />
            </Field>
            <Field label={t('ui.simulationRate')}>
              <CommitInput
                type="number"
                min={10}
                value={config.updateRate}
                disabled={busy}
                onCommit={(raw) => {
                  update({ updateRate: Number(raw) })
                  if (running) live(() => api.setUpdateRate(Number(raw)))
                }}
              />
            </Field>
          </div>

          {status.endpointUrl && (
            <div className="flex items-center gap-2 rounded-md bg-ink-950 px-3 py-2 font-mono text-sm text-sulfur-300">
              {status.endpointUrl}
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto"
                title={t('ui.copy')}
                onClick={() => navigator.clipboard.writeText(status.endpointUrl)}
              >
                <FontAwesomeIcon icon={faCopy} className="size-3.5" />
              </Button>
            </div>
          )}
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      <ServerSecurity
        value={config.security}
        locked={running || busy}
        onChange={(security) => update({ security })}
        onError={setError}
      />

      <Card
        id="opcua.server.variables"
        title={t('opcua.server.variables', { count: config.variables.length })}
        className="shrink-0"
        actions={
          <>
            {running && <span className="text-xs text-slate-500">{t('ui.liveApplied')}</span>}
            <Button size="sm" disabled={busy} onClick={addVariable}>
              <FontAwesomeIcon icon={faPlus} className="size-3.5" /> {t('ui.add')}
            </Button>
          </>
        }
      >
        {config.variables.length > PAGE_SIZE && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Input
              className="w-64"
              value={filter}
              placeholder={t('opcua.server.filter')}
              aria-label={t('opcua.server.filter')}
              onChange={(e) => {
                setFilter(e.target.value)
                setPage(0)
              }}
            />
            {duplicates.size > 0 && (
              <span className="text-xs text-red-300">
                {t('opcua.server.duplicates', { names: [...duplicates].slice(0, 5).join(', ') })}
              </span>
            )}
            <span className="ml-auto text-xs text-slate-500">
              {filtered.length
                ? t('opcua.server.page', {
                    from: currentPage * PAGE_SIZE + 1,
                    to: currentPage * PAGE_SIZE + pageVariables.length,
                    count: filtered.length
                  })
                : t('opcua.server.noMatch')}
            </span>
            <Button
              variant="ghost"
              size="icon"
              disabled={currentPage === 0}
              title={t('opcua.server.previousPage')}
              onClick={() => setPage(currentPage - 1)}
            >
              <FontAwesomeIcon icon={faChevronLeft} className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              disabled={currentPage >= pageCount - 1}
              title={t('opcua.server.nextPage')}
              onClick={() => setPage(currentPage + 1)}
            >
              <FontAwesomeIcon icon={faChevronRight} className="size-3.5" />
            </Button>
          </div>
        )}
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                {headers.map(([h, hint], i) => (
                  <th key={i} className="px-1.5 pb-2 font-medium" title={hint}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageVariables.map((v) => (
                <VariableRow
                  key={v.id}
                  v={v}
                  structure={structureByName.get(v.dataType)}
                  structureNames={structureNames}
                  duplicate={duplicates.has(v.name)}
                  value={values[v.id]}
                  running={running}
                  busy={busy}
                  actions={rowActions}
                />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ServerMethods
        methods={config.methods}
        busy={busy}
        running={running}
        duplicates={duplicates}
        onAdd={() => addItem('methods', newMethod(config))}
        onUpdate={(id, patch) => updateItem('methods', id, patch, { immediate: true })}
        onRemove={(id) => removeItem('methods', id)}
        onError={setError}
      />

      <ServerAlarms
        alarms={config.alarms}
        variables={config.variables}
        values={values}
        busy={busy}
        running={running}
        duplicates={duplicates}
        onAdd={() => addItem('alarms', newAlarm(config))}
        onUpdate={(id, patch, options) => updateItem('alarms', id, patch, options)}
        onRemove={(id) => removeItem('alarms', id)}
        onRaise={(event) => live(() => api.raiseEvent(event))}
      />

      <ServerStructures
        structures={config.structures}
        locked={running || busy}
        onChange={changeStructures}
        onError={setError}
      />

      <ServerNodesets
        api={api}
        nodesets={nodesets}
        loaded={status.nodesets ?? []}
        locked={running || busy}
        onChange={setNodesets}
        onError={setError}
      />
    </div>
  )
}
