import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Play, Plus, Scissors, Square, Trash2, TriangleAlert, Zap } from 'lucide-react'
import { Button, Card, Checkbox, CommitInput, ErrorBanner, Field, Select, StatusDot } from '@azerxim/sulfur-sdk/ui'
import { formatTime } from '@azerxim/sulfur-sdk'
import { DEFAULT_FAULTS, DIRECTIONS, PROTOCOLS, newRule } from '../shared/constants'
import { formatBytes } from '../shared/codec'
import { proxyApi } from './api'
import { t } from '../shared/i18n'

/** Délai avant d'envoyer au proxy les défauts modifiés d'une redirection démarrée. */
const LIVE_DEBOUNCE = 300

/** Défauts actifs d'une redirection (la perte ne vaut qu'en UDP). */
const activeFaults = (rule) => {
  const f = { ...DEFAULT_FAULTS, ...rule.faults }
  return [f.latency > 0 || f.jitter > 0, rule.protocol === 'udp' && f.loss > 0, f.corrupt > 0, f.block].filter(Boolean)
    .length
}

/** Champ numérique validé à la sortie du champ ou sur Entrée. */
function NumberField({ label, value, onCommit, disabled, title }) {
  return (
    <Field label={label}>
      <CommitInput
        className="font-mono"
        inputMode="numeric"
        value={value}
        disabled={disabled}
        title={title}
        onCommit={(raw) => onCommit(Number(String(raw).replace(',', '.')))}
      />
    </Field>
  )
}

/** Défauts d'une redirection et connexions en cours. */
function FaultsPanel({ rule, running, onFaults, onCut }) {
  const faults = { ...DEFAULT_FAULTS, ...rule.faults }
  const set = (patch) => onFaults({ ...faults, ...patch })
  const connections = running?.connections ?? []
  return (
    <div className="grid gap-4 border-t border-ink-800 bg-ink-950 px-3.5 py-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <div className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
          {t('proxy.faults.title')}
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2.5">
          <NumberField label={t('proxy.faults.latency')} value={faults.latency} onCommit={(v) => set({ latency: v })} />
          <NumberField
            label={t('proxy.faults.jitter')}
            value={faults.jitter}
            title={t('proxy.faults.jitterHint')}
            onCommit={(v) => set({ jitter: v })}
          />
          <NumberField
            label={t('proxy.faults.loss')}
            value={faults.loss}
            disabled={rule.protocol !== 'udp'}
            title={rule.protocol !== 'udp' ? t('proxy.faults.lossTcp') : undefined}
            onCommit={(v) => set({ loss: v })}
          />
          <NumberField
            label={t('proxy.faults.corrupt')}
            value={faults.corrupt}
            title={t('proxy.faults.corruptHint')}
            onCommit={(v) => set({ corrupt: v })}
          />
          <Field label={t('proxy.faults.direction')}>
            <Select value={faults.direction} onChange={(e) => set({ direction: e.target.value })}>
              {DIRECTIONS.map((d) => (
                <option key={d} value={d}>
                  {t(`proxy.directions.${d}`)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span title={t('proxy.faults.blockHint')}>
            <Checkbox
              label={t('proxy.faults.block')}
              checked={faults.block}
              onChange={(e) => set({ block: e.target.checked })}
            />
          </span>
          <span className="flex-1" />
          <Button
            size="sm"
            variant="ghost"
            disabled={!activeFaults(rule)}
            onClick={() => onFaults({ ...DEFAULT_FAULTS })}
          >
            {t('proxy.faults.reset')}
          </Button>
          <Button size="sm" variant="danger" disabled={!running} title={t('proxy.faults.cutHint')} onClick={onCut}>
            <Scissors className="size-3.5" /> {t('proxy.faults.cut')}
          </Button>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
          {t('proxy.connections.title', { count: connections.length })}
        </div>
        {connections.length ? (
          <div className="max-h-48 overflow-auto rounded-md border border-ink-800">
            <table className="w-full text-xs">
              <thead className="bg-ink-900 text-left text-slate-500">
                <tr>
                  <th className="px-2.5 py-1.5 font-medium">{t('proxy.connections.client')}</th>
                  <th className="px-2.5 py-1.5 font-medium">{t('proxy.connections.since')}</th>
                  <th className="px-2.5 py-1.5 text-right font-medium">{t('proxy.connections.traffic')}</th>
                </tr>
              </thead>
              <tbody>
                {connections.map((c) => (
                  <tr key={c.id} className="border-t border-ink-800/70">
                    <td className="px-2.5 py-1.5 font-mono text-slate-200 select-text">
                      <span className="text-slate-500">#{c.id}</span> {c.remote}
                    </td>
                    <td className="px-2.5 py-1.5 text-slate-400 tabular-nums">{formatTime(c.since)}</td>
                    <td className="px-2.5 py-1.5 text-right text-slate-400 tabular-nums">
                      {t('proxy.rules.traffic', { up: formatBytes(c.up), down: formatBytes(c.down) })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-slate-500">{t('proxy.connections.none')}</p>
        )}
      </div>
    </div>
  )
}

/** Une redirection : adresses, compteurs, défauts, démarrage / arrêt. */
function RuleRow({
  rule,
  running,
  busy,
  expanded,
  onToggleExpand,
  onChange,
  onFaults,
  onStart,
  onStop,
  onCut,
  onRemove
}) {
  const locked = !!running || busy
  const faultCount = activeFaults(rule)
  const counters = running?.counters
  const sessions = running?.connections.length ?? 0
  return (
    <div className="border-t border-ink-800 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2 px-3.5 py-2.5">
        <StatusDot on={!!running} />
        <CommitInput
          className="h-8! w-44!"
          value={rule.name}
          title={t('ui.name')}
          aria-label={t('ui.name')}
          onCommit={(name) => onChange({ name })}
        />
        <Select
          className="h-8! w-20!"
          value={rule.protocol}
          disabled={locked}
          aria-label={t('proxy.rules.protocol')}
          onChange={(e) => onChange({ protocol: e.target.value })}
        >
          {PROTOCOLS.map((p) => (
            <option key={p} value={p}>
              {t(`proxy.protocols.${p}`)}
            </option>
          ))}
        </Select>
        <span className="flex items-center gap-1" title={t('proxy.rules.listen')}>
          <CommitInput
            className="h-8! w-32! font-mono"
            value={rule.listenHost}
            disabled={locked}
            aria-label={t('proxy.rules.listenHost')}
            title={t('proxy.rules.listenHost')}
            onCommit={(listenHost) => onChange({ listenHost: listenHost.trim() })}
          />
          <span className="text-slate-500">:</span>
          <CommitInput
            className="h-8! w-20! font-mono"
            inputMode="numeric"
            value={rule.listenPort}
            disabled={locked}
            aria-label={t('proxy.rules.listenPort')}
            title={t('proxy.rules.listenPort')}
            onCommit={(port) => onChange({ listenPort: Number(port) })}
          />
        </span>
        <ArrowRight className="size-4 shrink-0 text-slate-500" />
        <span className="flex items-center gap-1" title={t('proxy.rules.target')}>
          <CommitInput
            className="h-8! w-40! font-mono"
            value={rule.targetHost}
            disabled={locked}
            aria-label={t('proxy.rules.targetHost')}
            title={t('proxy.rules.targetHost')}
            onCommit={(targetHost) => onChange({ targetHost: targetHost.trim() })}
          />
          <span className="text-slate-500">:</span>
          <CommitInput
            className="h-8! w-20! font-mono"
            inputMode="numeric"
            value={rule.targetPort}
            disabled={locked}
            aria-label={t('proxy.rules.targetPort')}
            title={t('proxy.rules.targetPort')}
            onCommit={(port) => onChange({ targetPort: Number(port) })}
          />
        </span>
        <span className="min-w-0 flex-1 truncate text-xs text-slate-400 tabular-nums">
          {running && (
            <>
              {t(rule.protocol === 'udp' ? 'proxy.rules.sessions' : 'proxy.rules.connections', { count: sessions })}
              {' · '}
              <span title={t('proxy.rules.trafficHint')}>
                {t('proxy.rules.traffic', { up: formatBytes(counters.up), down: formatBytes(counters.down) })}
              </span>
            </>
          )}
        </span>
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={expanded}
          title={faultCount ? t('proxy.rules.activeFaults', { count: faultCount }) : t('proxy.faults.title')}
          className={faultCount ? 'bg-amber-400/12 text-amber-300! hover:bg-amber-400/20' : ''}
          onClick={onToggleExpand}
        >
          <Zap className="size-3.5" /> {t('proxy.rules.faults')}
          {faultCount > 0 && <span className="font-mono">{faultCount}</span>}
        </Button>
        {running ? (
          <Button size="sm" disabled={busy} onClick={onStop}>
            <Square className="size-3.5" /> {t('ui.stop')}
          </Button>
        ) : (
          <Button size="sm" disabled={busy} onClick={onStart}>
            <Play className="size-3.5 text-emerald-400" /> {t('ui.start')}
          </Button>
        )}
        <Button variant="ghost" size="icon" title={t('ui.remove')} disabled={locked} onClick={onRemove}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      {expanded && <FaultsPanel rule={rule} running={running} onFaults={onFaults} onCut={onCut} />}
    </div>
  )
}

/**
 * Redirections du proxy (enregistrées) : adresses modifiables redirection arrêtée, nom et défauts
 * envoyés au proxy en direct quand elle est démarrée.
 */
export default function RulesCard({ status, rules, setRules }) {
  const [expanded, setExpanded] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const timers = useRef({})
  const running = Object.fromEntries((status.rules ?? []).map((r) => [r.id, r]))
  const runningCount = Object.keys(running).length

  // Redirections démarrées : leur configuration dans le proxy fait foi (fenêtre rechargée).
  const synced = useRef(false)
  useEffect(() => {
    if (synced.current || !status.rules) return
    synced.current = true
    const live = Object.fromEntries(status.rules.map((r) => [r.id, r.config]))
    if (status.rules.length) setRules((list) => list.map((r) => (live[r.id] ? { ...r, ...live[r.id] } : r)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.rules])

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

  /** Modifie une redirection ; démarrée, elle est mise à jour dans le proxy (après un court délai). */
  function update(id, patch) {
    const next = { ...rules.find((r) => r.id === id), ...patch }
    setRules((list) => list.map((r) => (r.id === id ? next : r)))
    if (!running[id]) return
    clearTimeout(timers.current[id])
    timers.current[id] = setTimeout(() => proxyApi.update(next).catch((err) => setError(err.message)), LIVE_DEBOUNCE)
  }

  const toggleExpand = (id) =>
    setExpanded((set) => {
      const next = new Set(set)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const add = () => {
    const rule = newRule(rules.length + 1)
    setRules((list) => [...list, rule])
  }

  const simulatorFaults = status.simulatorFaults ?? []

  return (
    <Card
      id="proxy.rules"
      title={t('proxy.rules.title', { count: rules.length })}
      className="shrink-0"
      actions={
        <>
          {runningCount > 0 && (
            <span className="text-xs text-emerald-300">{t('proxy.rules.running', { count: runningCount })}</span>
          )}
          {runningCount > 0 ? (
            <Button size="sm" disabled={busy} onClick={() => run(proxyApi.stopAll)}>
              <Square className="size-3.5" /> {t('proxy.rules.stopAll')}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              disabled={busy || !rules.length}
              onClick={() => run(() => proxyApi.startAll(rules))}
            >
              <Play className="size-3.5" /> {t('proxy.rules.startAll')}
            </Button>
          )}
          <Button size="sm" disabled={busy} onClick={add}>
            <Plus className="size-3.5" /> {t('ui.add')}
          </Button>
        </>
      }
    >
      <div className="-mx-3.5 -my-3.5 flex flex-col">
        <p className="px-3.5 pt-3 pb-2 text-xs text-slate-500">{t('proxy.rules.hint')}</p>
        {simulatorFaults.length > 0 && (
          <p className="mx-3.5 mb-2 flex items-center gap-2 rounded-md bg-amber-400/12 px-3 py-2 text-xs text-amber-300">
            <TriangleAlert className="size-3.5 shrink-0" />
            {t('proxy.faults.simulator', {
              types: simulatorFaults.map((type) => t(`proxy.faults.simulatorTypes.${type}`)).join(', ')
            })}
          </p>
        )}
        {error && (
          <div className="px-3.5 pb-2">
            <ErrorBanner error={error} onClose={() => setError(null)} />
          </div>
        )}
        <div className="border-t border-ink-800">
          {rules.length === 0 && <p className="px-3.5 py-4 text-sm text-slate-500">{t('proxy.rules.empty')}</p>}
          {rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              running={running[rule.id]}
              busy={busy}
              expanded={expanded.has(rule.id)}
              onToggleExpand={() => toggleExpand(rule.id)}
              onChange={(patch) => update(rule.id, patch)}
              onFaults={(faults) => update(rule.id, { faults })}
              onStart={() => run(() => proxyApi.start(rule))}
              onStop={() => run(() => proxyApi.stop(rule.id))}
              onCut={() => run(() => proxyApi.cut(rule.id))}
              onRemove={() => setRules((list) => list.filter((r) => r.id !== rule.id))}
            />
          ))}
        </div>
      </div>
    </Card>
  )
}
