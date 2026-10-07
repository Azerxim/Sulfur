import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, Circle, Copy, Play, Plus, Square, Trash2 } from 'lucide-react'
import { Button, Card, Checkbox, CommitInput, ErrorBanner, Input, Select } from '@renderer/components/ui'
import { getLocale } from '@shared/i18n'
import { STEP_TYPES } from '../shared/constants'
import { simulatorApi } from './api'
import { PointSelect, PointsPicker } from './PointPickers'
import { t } from '../shared/i18n'

const withIds = (steps) => steps.map((s) => ({ ...s, id: crypto.randomUUID() }))

/** Valeurs par défaut d'une étape d'un type donné. */
function defaultStep(type, points, faults) {
  const point = points.find((p) => p.writable)?.key ?? ''
  switch (type) {
    case 'set':
      return { type, point, value: '' }
    case 'ramp':
      return { type, point: points.find((p) => p.writable && p.numeric)?.key ?? point, from: '', to: 100, duration: 10 }
    case 'wait':
      return { type, duration: 1 }
    case 'fault':
      return { type, fault: faults[0]?.id ?? '', action: 'on' }
    default:
      return { type }
  }
}

function Duration({ value, onChange }) {
  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="number"
        min={0}
        step={0.1}
        className="w-24"
        value={value ?? 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="text-xs text-slate-500">s</span>
    </div>
  )
}

/** Paramètres d'une étape selon son type. */
function StepFields({ step, points, faults, onChange }) {
  const writable = points.filter((p) => p.writable)
  switch (step.type) {
    case 'set':
      return (
        <div className="grid grid-cols-[minmax(0,1fr)_12rem] gap-2">
          <PointSelect points={writable} value={step.point} onChange={(point) => onChange({ point })} />
          <Input
            className="font-mono"
            placeholder={t('simulator.step.value')}
            value={typeof step.value === 'object' ? JSON.stringify(step.value) : String(step.value ?? '')}
            onChange={(e) => onChange({ value: e.target.value })}
          />
        </div>
      )
    case 'ramp':
      return (
        <div className="grid grid-cols-[minmax(0,1fr)_auto_7rem_auto_7rem_auto] items-center gap-2">
          <PointSelect
            points={writable.filter((p) => p.numeric)}
            value={step.point}
            onChange={(point) => onChange({ point })}
          />
          <span className="text-xs text-slate-500">{t('simulator.step.from')}</span>
          <Input
            type="number"
            placeholder={t('simulator.step.fromCurrent')}
            title={t('simulator.step.from')}
            value={step.from ?? ''}
            onChange={(e) => onChange({ from: e.target.value === '' ? '' : Number(e.target.value) })}
          />
          <span className="text-xs text-slate-500">{t('simulator.step.to')}</span>
          <Input
            type="number"
            title={t('simulator.step.to')}
            value={step.to ?? 0}
            onChange={(e) => onChange({ to: Number(e.target.value) })}
          />
          <Duration value={step.duration} onChange={(duration) => onChange({ duration })} />
        </div>
      )
    case 'wait':
      return <Duration value={step.duration} onChange={(duration) => onChange({ duration })} />
    case 'fault':
      return (
        <div className="grid grid-cols-[minmax(0,1fr)_10rem] gap-2">
          <Select value={step.fault ?? ''} onChange={(e) => onChange({ fault: e.target.value })}>
            {!faults.some((f) => f.id === step.fault) && <option value={step.fault ?? ''}>—</option>}
            {faults.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
          <Select value={step.action ?? 'on'} onChange={(e) => onChange({ action: e.target.value })}>
            <option value="on">{t('simulator.step.on')}</option>
            <option value="off">{t('simulator.step.off')}</option>
          </Select>
        </div>
      )
    default:
      return null
  }
}

function Scenario({ scenario, points, faults, run, busy, onChange, onDuplicate, onRemove, onError }) {
  const [open, setOpen] = useState(true)
  const running = run?.id === scenario.id
  const steps = scenario.steps ?? []
  const setSteps = (next) => onChange({ steps: next })
  const updateStep = (id, patch) => setSteps(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const move = (index, delta) => {
    const next = [...steps]
    const [step] = next.splice(index, 1)
    next.splice(index + delta, 0, step)
    setSteps(next)
  }
  const call = (action) => action().catch((err) => onError(err.message))

  return (
    <div className={`rounded-md border ${running ? 'border-sulfur-500/50' : 'border-ink-800'}`}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          className="grid size-5 place-items-center rounded text-slate-500 hover:bg-ink-800 hover:text-slate-200"
          title={open ? t('ui.collapse') : t('ui.expand')}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronDown className={`size-4 transition-transform ${open ? '' : '-rotate-90'}`} />
        </button>
        <CommitInput className="h-8! w-64" value={scenario.name} onCommit={(name) => onChange({ name })} />
        <Checkbox
          label={t('simulator.scenarios.loop')}
          checked={!!scenario.loop}
          onChange={(e) => onChange({ loop: e.target.checked })}
        />
        <span className="text-xs whitespace-nowrap text-slate-500">
          {t('simulator.scenarios.steps', { count: steps.length })}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {running && (
            <span className="text-xs whitespace-nowrap text-sulfur-300 tabular-nums">
              {t('simulator.scenarios.running', { step: run.step, count: run.count })}
              {run.loop && ` · ${t('simulator.scenarios.iteration', { n: run.iteration })}`}
            </span>
          )}
          {running ? (
            <Button variant="danger" size="sm" onClick={() => call(simulatorApi.stop)}>
              <Square className="size-3.5" /> {t('simulator.scenarios.stop')}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              disabled={busy || !steps.length}
              onClick={() => call(() => simulatorApi.play(scenario, faults))}
            >
              <Play className="size-3.5" /> {t('simulator.scenarios.play')}
            </Button>
          )}
          <Button variant="ghost" size="icon" title={t('simulator.scenarios.duplicate')} onClick={onDuplicate}>
            <Copy className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" title={t('ui.remove')} disabled={running} onClick={onRemove}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {open && (
        <div className="border-t border-ink-800 px-3 py-2">
          <table className="w-full text-sm">
            <tbody>
              {steps.map((step, index) => (
                <tr
                  key={step.id}
                  className={`align-middle ${running && run.step === index + 1 ? 'bg-sulfur-400/10' : ''}`}
                >
                  <td className="w-8 p-1 text-right text-xs text-slate-500 tabular-nums">{index + 1}</td>
                  <td className="w-36 p-1">
                    <Select
                      value={step.type}
                      onChange={(e) =>
                        updateStep(step.id, { ...defaultStep(e.target.value, points, faults), id: step.id })
                      }
                    >
                      {STEP_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {t(`simulator.steps.${type}`)}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="p-1">
                    <StepFields
                      step={step}
                      points={points}
                      faults={faults}
                      onChange={(patch) => updateStep(step.id, patch)}
                    />
                  </td>
                  <td className="w-28 p-1 text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t('simulator.scenarios.moveUp')}
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t('simulator.scenarios.moveDown')}
                      disabled={index === steps.length - 1}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t('ui.remove')}
                      onClick={() => setSteps(steps.filter((s) => s.id !== step.id))}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button
            size="sm"
            className="mt-1"
            onClick={() => setSteps([...steps, { ...defaultStep('set', points, faults), id: crypto.randomUUID() }])}
          >
            <Plus className="size-3.5" /> {t('simulator.scenarios.addStep')}
          </Button>
        </div>
      )}
    </div>
  )
}

/** Scénarios : étapes enchaînées dans le temps, saisies ou enregistrées, et rejouées. */
export default function ScenariosCard({ scenarios, onChange, faults, points, status, onError }) {
  const [recordKeys, setRecordKeys] = useState([])
  const [dismissed, setDismissed] = useState(null)
  const recording = status.recording
  const call = (action) => action().catch((err) => onError(err.message))

  const update = (id, patch) => onChange(scenarios.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const nextName = () => {
    let n = scenarios.length + 1
    while (scenarios.some((s) => s.name === t('simulator.scenarios.newName', { n }))) n++
    return t('simulator.scenarios.newName', { n })
  }
  const add = () =>
    onChange([
      ...scenarios,
      { id: crypto.randomUUID(), name: nextName(), loop: false, steps: withIds([defaultStep('set', points, faults)]) }
    ])

  const stopRecording = () =>
    call(async () => {
      const steps = await simulatorApi.stopRecording()
      const time = new Date().toLocaleTimeString(getLocale(), { hour12: false })
      onChange([
        ...scenarios,
        {
          id: crypto.randomUUID(),
          name: t('simulator.scenarios.recordedName', { time }),
          loop: false,
          steps: withIds(steps)
        }
      ])
    })

  const error = status.error && status.error !== dismissed ? status.error : null

  return (
    <Card
      id="simulator.scenarios"
      title={t('simulator.scenarios.title', { count: scenarios.length })}
      className="shrink-0"
      actions={
        <Button size="sm" onClick={add}>
          <Plus className="size-3.5" /> {t('ui.add')}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs text-slate-500">{t('simulator.scenarios.hint')}</p>
        <ErrorBanner error={error} onClose={() => setDismissed(status.error)} />

        <div className="flex items-center gap-3 rounded-md bg-ink-950 px-3 py-2">
          <span className="shrink-0 text-xs text-slate-400">{t('simulator.scenarios.recordPoints')}</span>
          <div className="min-w-0 flex-1">
            <PointsPicker
              points={points}
              value={recording ? recording.keys : recordKeys}
              disabled={!!recording}
              emptyLabel="—"
              onChange={setRecordKeys}
            />
          </div>
          {recording ? (
            <>
              <span className="flex items-center gap-1.5 text-xs text-red-300 tabular-nums">
                <span className="size-2 animate-pulse rounded-full bg-red-400" />
                {t('simulator.scenarios.recording', { count: recording.count })}
              </span>
              <Button variant="danger" size="sm" onClick={stopRecording}>
                <Square className="size-3.5" /> {t('simulator.scenarios.stopRecording')}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              disabled={!recordKeys.length}
              title={t('simulator.scenarios.recordHint')}
              onClick={() => call(() => simulatorApi.startRecording(recordKeys))}
            >
              <Circle className="size-3.5 text-red-400" /> {t('simulator.scenarios.record')}
            </Button>
          )}
        </div>

        {!scenarios.length && <p className="text-sm text-slate-500">{t('simulator.scenarios.empty')}</p>}
        {scenarios.map((s) => (
          <Scenario
            key={s.id}
            scenario={s}
            points={points}
            faults={faults}
            run={status.scenario}
            busy={!!status.scenario}
            onChange={(patch) => update(s.id, patch)}
            onDuplicate={() =>
              onChange([
                ...scenarios,
                { ...s, id: crypto.randomUUID(), name: `${s.name} (2)`, steps: withIds(s.steps) }
              ])
            }
            onRemove={() => onChange(scenarios.filter((x) => x.id !== s.id))}
            onError={onError}
          />
        ))}
      </div>
    </Card>
  )
}
