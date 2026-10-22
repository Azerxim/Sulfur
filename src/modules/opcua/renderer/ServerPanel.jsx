import { useEffect, useRef, useState } from 'react'
import { Copy, Play, Plus, Square, Trash2 } from 'lucide-react'
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
import { getLocale } from '@azerxim/sulfur-sdk'
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

export default function ServerPanel({ status }) {
  const [config, setConfig] = usePersistentState('opcua', 'server', status.config ?? DEFAULT_SERVER_CONFIG)
  const [nodesets, setNodesets] = usePersistentState('opcua', 'nodesets', [])
  const [values, setValues] = useState({})
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
    opcuaApi.server.values().then(setValues)
    return opcuaApi.server.onValues(setValues)
  }, [])

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
      const current = await opcuaApi.server.status()
      if (current.config) setConfig(current.config)
    })

  /** Envoie un élément au serveur (immédiatement ou après un court délai). */
  function push(list, item, immediate) {
    clearTimeout(timers.current[item.id])
    const send = () => liveSync(() => opcuaApi.server[LIVE_LISTS[list][0]](item))
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
    if (running) liveSync(() => opcuaApi.server[LIVE_LISTS[list][1]](id))
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
  const setValue = (id, raw) => live(() => opcuaApi.server.setValue(id, raw))

  const structureNames = config.structures.map((s) => s.name)
  const named = [...config.variables, ...config.methods, ...config.alarms]
  const duplicates = named.map((v) => v.name).filter((n, i, all) => all.indexOf(n) !== i)
  const invalid =
    duplicates.length > 0 ||
    named.some((v) => !v.name.trim()) ||
    config.structures.some((s) => structureProblem(s, config.structures)) ||
    config.variables.some((v) => !DATA_TYPES.includes(v.dataType) && !structureNames.includes(v.dataType)) ||
    !isSecurityValid(config.security)

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
              <Button variant="danger" size="sm" disabled={busy} onClick={() => run(opcuaApi.server.stop)}>
                <Square className="size-3.5" /> {t('ui.stop')}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                disabled={busy || invalid}
                onClick={() => run(() => opcuaApi.server.start({ ...config, nodesets }))}
              >
                <Play className="size-3.5" /> {busy ? t('ui.starting') : t('ui.start')}
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
                  if (running) live(() => opcuaApi.server.setUpdateRate(Number(raw)))
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
                <Copy className="size-3.5" />
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
            <Button size="sm" disabled={busy} onClick={() => addItem('variables', newVariable(config))}>
              <Plus className="size-3.5" /> {t('ui.add')}
            </Button>
          </>
        }
      >
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
              {config.variables.map((v) => {
                const structure = config.structures.find((s) => s.name === v.dataType)
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
                        className={duplicates.includes(v.name) || !v.name.trim() ? 'border-red-500/60' : ''}
                        onCommit={(name) => updateVar(v.id, { name: name.trim() }, { immediate: true })}
                      />
                    </td>
                    <td className="p-1.5">
                      <Select
                        value={v.dataType}
                        disabled={busy}
                        title={running ? t('ui.typeRecreates') : undefined}
                        className={
                          !DATA_TYPES.includes(v.dataType) && !structureNames.includes(v.dataType)
                            ? 'border-red-500/60'
                            : ''
                        }
                        onChange={(e) => updateVar(v.id, { dataType: e.target.value }, { immediate: true })}
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
                        {!DATA_TYPES.includes(v.dataType) && !structureNames.includes(v.dataType) && (
                          <option>{v.dataType}</option>
                        )}
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
                          updateVar(
                            v.id,
                            { arrayLength: Math.max(0, Math.floor(Number(raw) || 0)) },
                            { immediate: true }
                          )
                        }
                      />
                    </td>
                    <td className="w-44 p-1.5">
                      {running ? (
                        <LiveValue variable={v} value={values[v.id]} onSet={(raw) => setValue(v.id, raw)} />
                      ) : (
                        <Input
                          className={structure || isArray ? 'font-mono' : ''}
                          value={
                            typeof v.initialValue === 'object' ? JSON.stringify(v.initialValue) : String(v.initialValue)
                          }
                          disabled={busy}
                          title={valueHint}
                          placeholder={structure ? structExample(structure) : undefined}
                          onChange={(e) => updateVar(v.id, { initialValue: e.target.value })}
                        />
                      )}
                    </td>
                    <td className="p-1.5">
                      <Select
                        value={structure ? 'none' : v.simulation}
                        disabled={busy || !!structure}
                        onChange={(e) => updateVar(v.id, { simulation: e.target.value }, { immediate: true })}
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
                          onChange={(e) => updateVar(v.id, { [key]: Number(e.target.value) })}
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
                          onChange={(e) => updateVar(v.id, { [key]: e.target.checked }, { immediate: true })}
                        />
                      </td>
                    ))}
                    <td className="p-1.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={busy}
                        onClick={() => removeItem('variables', v.id)}
                        title={t('ui.remove')}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
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
        onRaise={(event) => live(() => opcuaApi.server.raiseEvent(event))}
      />

      <ServerStructures
        structures={config.structures}
        locked={running || busy}
        onChange={changeStructures}
        onError={setError}
      />

      <ServerNodesets
        nodesets={nodesets}
        loaded={status.nodesets ?? []}
        locked={running || busy}
        onChange={setNodesets}
        onError={setError}
      />
    </div>
  )
}
