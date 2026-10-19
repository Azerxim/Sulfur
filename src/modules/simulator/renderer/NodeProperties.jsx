import { Copy, Plus, Trash2, X } from 'lucide-react'
import { Button, Checkbox, CommitInput, Field, Input, Select } from '@renderer/components/ui'
import { GENERATOR_FUNCTIONS, NODE_TYPES, PAYLOAD_TYPES, SWITCH_OPERATORS, UNARY_OPERATORS } from '../shared/flows'
import { CATEGORY_STYLES, NODE_ICONS } from './FlowNode'
import { PointSelect } from './PointPickers'
import { t } from '../shared/i18n'

/** Champ numérique ; `allowEmpty` : un champ vide vaut '' (ex. « valeur actuelle »). */
function NumberInput({ value, onChange, allowEmpty = false, ...props }) {
  return (
    <Input
      type="number"
      {...props}
      value={value ?? ''}
      onChange={(e) => onChange(allowEmpty && e.target.value === '' ? '' : Number(e.target.value))}
    />
  )
}

const text = (value) => (typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? ''))

function RulesEditor({ rules, onChange }) {
  const update = (i, patch) => onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  return (
    <div className="flex flex-col gap-1.5">
      {rules.map((rule, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-4 shrink-0 text-right text-[11px] text-slate-500 tabular-nums">{i + 1}</span>
          <Select className="w-28! shrink-0 px-2!" value={rule.op} onChange={(e) => update(i, { op: e.target.value })}>
            {SWITCH_OPERATORS.map((op) => (
              <option key={op} value={op}>
                {t(`simulator.operators.${op}`)}
              </option>
            ))}
          </Select>
          {!UNARY_OPERATORS.includes(rule.op) && (
            <Input
              className="min-w-0 font-mono"
              value={rule.value ?? ''}
              onChange={(e) => update(i, { value: e.target.value })}
            />
          )}
          {rule.op === 'between' && (
            <Input
              className="min-w-0 font-mono"
              value={rule.value2 ?? ''}
              onChange={(e) => update(i, { value2: e.target.value })}
            />
          )}
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto shrink-0"
            title={t('ui.remove')}
            disabled={rules.length <= 1}
            onClick={() => onChange(rules.filter((_, j) => j !== i))}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        className="self-start"
        onClick={() => onChange([...rules, { op: 'eq', value: '', value2: '' }])}
      >
        <Plus className="size-3.5" /> {t('simulator.props.addRule')}
      </Button>
    </div>
  )
}

/** Réglages propres au type du nœud. */
function ConfigFields({ type, config, points, faults, set }) {
  const writable = points.filter((p) => p.writable)
  const pointField = (list) => (
    <Field label={t('simulator.props.point')}>
      <PointSelect points={list} value={config.point} onChange={(point) => set({ point })} />
    </Field>
  )

  switch (type) {
    case 'inject':
      return (
        <>
          <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-2">
            <Field label={t('simulator.props.payloadType')}>
              <Select value={config.payloadType} onChange={(e) => set({ payloadType: e.target.value })}>
                {PAYLOAD_TYPES.map((p) => (
                  <option key={p} value={p}>
                    {t(`simulator.payloadTypes.${p}`)}
                  </option>
                ))}
              </Select>
            </Field>
            {config.payloadType === 'boolean' ? (
              <Field label={t('simulator.props.payload')}>
                <Select
                  value={String(config.payload === true || config.payload === 'true')}
                  onChange={(e) => set({ payload: e.target.value })}
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </Select>
              </Field>
            ) : (
              config.payloadType !== 'timestamp' && (
                <Field label={t('simulator.props.payload')}>
                  <Input
                    className="font-mono"
                    value={text(config.payload)}
                    onChange={(e) => set({ payload: e.target.value })}
                  />
                </Field>
              )
            )}
          </div>
          <Field label={t('simulator.props.topic')}>
            <Input value={config.topic ?? ''} onChange={(e) => set({ topic: e.target.value })} />
          </Field>
          <Field label={t('simulator.props.repeat')}>
            <NumberInput min={0} step={0.1} value={config.repeat} onChange={(repeat) => set({ repeat })} />
          </Field>
          <Checkbox
            label={t('simulator.props.once')}
            checked={!!config.once}
            onChange={(e) => set({ once: e.target.checked })}
          />
        </>
      )
    case 'watch':
      return (
        <>
          {pointField(points)}
          <Field label={t('simulator.props.interval')}>
            <NumberInput min={50} step={50} value={config.interval} onChange={(interval) => set({ interval })} />
          </Field>
          <Checkbox
            label={t('simulator.props.initial')}
            checked={!!config.initial}
            onChange={(e) => set({ initial: e.target.checked })}
          />
        </>
      )
    case 'read':
      return pointField(points)
    case 'write':
      return (
        <>
          {pointField(writable)}
          <Field label={t('simulator.props.source')}>
            <Select value={config.source} onChange={(e) => set({ source: e.target.value })}>
              <option value="msg">msg.payload</option>
              <option value="fixed">{t('simulator.props.fixed')}</option>
            </Select>
          </Field>
          {config.source === 'fixed' && (
            <Field label={t('simulator.props.value')}>
              <Input
                className="font-mono"
                value={text(config.value)}
                onChange={(e) => set({ value: e.target.value })}
              />
            </Field>
          )}
        </>
      )
    case 'delay':
      return (
        <Field label={t('simulator.props.duration')}>
          <NumberInput min={0} step={0.1} value={config.duration} onChange={(duration) => set({ duration })} />
        </Field>
      )
    case 'ramp':
      return (
        <>
          {pointField(writable.filter((p) => p.numeric))}
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('simulator.props.from')}>
              <NumberInput
                allowEmpty
                placeholder={t('simulator.props.fromCurrent')}
                value={config.from}
                onChange={(from) => set({ from })}
              />
            </Field>
            <Field label={t('simulator.props.to')}>
              <NumberInput allowEmpty placeholder="msg.payload" value={config.to} onChange={(to) => set({ to })} />
            </Field>
          </div>
          <Field label={t('simulator.props.duration')}>
            <NumberInput min={0} step={0.1} value={config.duration} onChange={(duration) => set({ duration })} />
          </Field>
        </>
      )
    case 'fault':
      return (
        <>
          <Field label={t('simulator.props.fault')}>
            <Select value={config.fault ?? ''} onChange={(e) => set({ fault: e.target.value })}>
              {!faults.some((f) => f.id === config.fault) && <option value={config.fault ?? ''}>—</option>}
              {faults.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('simulator.props.action')}>
            <Select value={config.action} onChange={(e) => set({ action: e.target.value })}>
              {['on', 'off', 'msg'].map((a) => (
                <option key={a} value={a}>
                  {t(`simulator.faultActions.${a}`)}
                </option>
              ))}
            </Select>
          </Field>
        </>
      )
    case 'switch':
      return (
        <>
          <Field label={t('simulator.props.property')}>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs text-slate-500">msg.</span>
              <Input
                className="font-mono"
                value={config.property ?? ''}
                onChange={(e) => set({ property: e.target.value })}
              />
            </div>
          </Field>
          <Field label={t('simulator.props.rules')}>
            <RulesEditor rules={config.rules ?? []} onChange={(rules) => set({ rules })} />
          </Field>
          <Checkbox
            label={t('simulator.props.checkAll')}
            checked={!!config.checkAll}
            onChange={(e) => set({ checkAll: e.target.checked })}
          />
        </>
      )
    case 'scale':
      return (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('simulator.props.inMin')}>
              <NumberInput value={config.inMin} onChange={(inMin) => set({ inMin })} />
            </Field>
            <Field label={t('simulator.props.inMax')}>
              <NumberInput value={config.inMax} onChange={(inMax) => set({ inMax })} />
            </Field>
            <Field label={t('simulator.props.outMin')}>
              <NumberInput value={config.outMin} onChange={(outMin) => set({ outMin })} />
            </Field>
            <Field label={t('simulator.props.outMax')}>
              <NumberInput value={config.outMax} onChange={(outMax) => set({ outMax })} />
            </Field>
          </div>
          <Checkbox
            label={t('simulator.props.clamp')}
            checked={!!config.clamp}
            onChange={(e) => set({ clamp: e.target.checked })}
          />
          <Checkbox
            label={t('simulator.props.round')}
            checked={!!config.round}
            onChange={(e) => set({ round: e.target.checked })}
          />
        </>
      )
    case 'counter':
      return (
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('simulator.props.initialValue')}>
            <NumberInput value={config.initial} onChange={(initial) => set({ initial })} />
          </Field>
          <Field label={t('simulator.props.step')}>
            <NumberInput value={config.step} onChange={(step) => set({ step })} />
          </Field>
        </div>
      )
    case 'filter':
      return (
        <Field label={t('simulator.props.deadband')}>
          <NumberInput min={0} value={config.deadband} onChange={(deadband) => set({ deadband })} />
        </Field>
      )
    case 'function':
      return (
        <>
          <Field label={t('simulator.props.code')}>
            <textarea
              spellCheck={false}
              rows={14}
              value={config.code ?? ''}
              onChange={(e) => set({ code: e.target.value })}
              onKeyDown={(e) => {
                // Tabulation : indentation plutôt que changement de champ.
                if (e.key !== 'Tab') return
                e.preventDefault()
                const el = e.currentTarget
                const { selectionStart: start, selectionEnd: end } = el
                set({ code: `${el.value.slice(0, start)}  ${el.value.slice(end)}` })
                requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2))
              }}
              className="w-full resize-y rounded-md border border-ink-700 bg-ink-950 p-2 font-mono text-xs text-slate-100 select-text focus:border-sulfur-500 focus:outline-none"
            />
          </Field>
          <p className="text-[11px] text-slate-500">{t('simulator.props.codeHint')}</p>
          <Field label={t('simulator.props.outputs')}>
            <NumberInput min={1} max={10} value={config.outputs} onChange={(outputs) => set({ outputs })} />
          </Field>
        </>
      )
    case 'generator':
      return (
        <>
          <Field label={t('simulator.props.simulation')}>
            <Select value={config.simulation} onChange={(e) => set({ simulation: e.target.value })}>
              {GENERATOR_FUNCTIONS.map((s) => (
                <option key={s} value={s}>
                  {t(`simulator.simulations.${s}`)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('simulator.props.min')}>
              <NumberInput value={config.min} onChange={(min) => set({ min })} />
            </Field>
            <Field label={t('simulator.props.max')}>
              <NumberInput value={config.max} onChange={(max) => set({ max })} />
            </Field>
            <Field label={t('simulator.props.period')}>
              <NumberInput min={0} step={0.1} value={config.period} onChange={(period) => set({ period })} />
            </Field>
            <Field label={t('simulator.props.interval')}>
              <NumberInput min={50} step={50} value={config.interval} onChange={(interval) => set({ interval })} />
            </Field>
          </div>
          <Checkbox
            label={t('simulator.props.integer')}
            checked={!!config.integer}
            onChange={(e) => set({ integer: e.target.checked })}
          />
          <Checkbox
            label={t('simulator.props.autostart')}
            checked={!!config.autostart}
            onChange={(e) => set({ autostart: e.target.checked })}
          />
        </>
      )
    case 'debug':
      return (
        <>
          <Field label={t('simulator.props.show')}>
            <Select
              value={config.property === 'msg' ? 'msg' : 'payload'}
              onChange={(e) => set({ property: e.target.value })}
            >
              <option value="payload">msg.payload</option>
              <option value="msg">{t('simulator.props.wholeMessage')}</option>
            </Select>
          </Field>
          <Checkbox
            label={t('simulator.props.active')}
            checked={!!config.active}
            onChange={(e) => set({ active: e.target.checked })}
          />
        </>
      )
    default:
      return null
  }
}

/** Propriétés du nœud sélectionné : nom, réglages de son type, duplication et suppression. */
export default function NodeProperties({ node, points, faults, onChange, onDuplicate, onRemove }) {
  const def = NODE_TYPES[node.type]
  const Icon = NODE_ICONS[node.type]
  const config = { ...def?.defaults, ...node.config }
  const set = (patch) => onChange({ config: { ...config, ...patch } })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className={`grid size-6 place-items-center rounded ${CATEGORY_STYLES[def?.category] ?? ''}`}>
          {Icon && <Icon className="size-3.5" />}
        </span>
        <span className="text-sm font-medium text-slate-200">{t(`simulator.nodes.${node.type}`)}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" title={t('simulator.editor.duplicateNode')} onClick={onDuplicate}>
            <Copy className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" title={t('ui.remove')} onClick={onRemove}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
      <p className="text-[11px] text-slate-500">{t(`simulator.nodeHints.${node.type}`)}</p>
      <Field label={t('ui.name')}>
        <CommitInput
          value={node.name ?? ''}
          placeholder={t('simulator.props.autoName')}
          onCommit={(name) => onChange({ name })}
        />
      </Field>
      {def && <ConfigFields type={node.type} config={config} points={points} faults={faults} set={set} />}
    </div>
  )
}
