import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { Button, Card, Input, Select } from '@azerxim/sulfur-sdk/ui'
import { WEBHOOK_MODES } from '../shared/constants'
import { t } from '../shared/i18n'

/** Choix des variables suivies par un webhook (aucune : toutes). */
function VariablesPicker({ variables, value = [], disabled, onChange }) {
  const [open, setOpen] = useState(false)
  const root = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => !root.current?.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  const names = variables.filter((v) => value.includes(v.id)).map((v) => v.name)
  const toggle = (id) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])
  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center gap-2 rounded-md border border-ink-700 bg-ink-950 px-3 text-left text-sm text-slate-100 disabled:opacity-50"
      >
        <span className="min-w-0 flex-1 truncate">
          {names.length ? names.join(', ') : t('http.webhooks.allVariables')}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-slate-500" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 max-h-64 w-full min-w-48 overflow-auto rounded-md border border-ink-700 bg-ink-900 p-2 shadow-2xl">
          {variables.map((v) => (
            <label
              key={v.id}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm text-slate-300 hover:bg-ink-800"
            >
              <input
                type="checkbox"
                className="size-4 accent-sulfur-400"
                checked={value.includes(v.id)}
                onChange={() => toggle(v.id)}
              />
              {v.name}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

const newHook = () => ({
  id: crypto.randomUUID(),
  name: '',
  url: 'http://127.0.0.1:9000/webhook',
  method: 'POST',
  mode: 'change',
  interval: 1,
  variables: [],
  headers: [],
  enabled: true
})

/** Webhooks : appels sortants du serveur, sur changement de variables ou périodiques. */
export default function WebhooksCard({ webhooks, variables, running, busy, onChange }) {
  const set = (id, patch) => onChange(webhooks.map((w) => (w.id === id ? { ...w, ...patch } : w)))
  return (
    <Card
      id="http.server.webhooks"
      title={t('http.webhooks.title', { count: webhooks.length })}
      className="shrink-0"
      defaultCollapsed
      actions={
        <>
          {running && <span className="text-xs text-slate-500">{t('ui.liveApplied')}</span>}
          <Button size="sm" disabled={busy} onClick={() => onChange([...webhooks, newHook()])}>
            <Plus className="size-3.5" /> {t('ui.add')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <p className="text-xs text-slate-500">{t('http.webhooks.hint')}</p>
        {webhooks.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="w-8 px-1.5 pb-2 font-medium" title={t('http.webhooks.enabled')} />
                <th className="w-40 px-1.5 pb-2 font-medium">{t('ui.name')}</th>
                <th className="w-28 px-1.5 pb-2 font-medium">{t('http.webhooks.method')}</th>
                <th className="px-1.5 pb-2 font-medium">URL</th>
                <th className="w-40 px-1.5 pb-2 font-medium">{t('http.webhooks.mode')}</th>
                <th className="w-24 px-1.5 pb-2 font-medium">{t('http.webhooks.interval')}</th>
                <th className="w-52 px-1.5 pb-2 font-medium">{t('http.webhooks.variables')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {webhooks.map((w) => (
                <tr key={w.id} className="align-middle">
                  <td className="p-1.5 text-center">
                    <input
                      type="checkbox"
                      className="size-4 accent-sulfur-400"
                      title={t('http.webhooks.enabled')}
                      checked={w.enabled !== false}
                      disabled={busy}
                      onChange={(e) => set(w.id, { enabled: e.target.checked })}
                    />
                  </td>
                  <td className="p-1.5">
                    <Input value={w.name ?? ''} disabled={busy} onChange={(e) => set(w.id, { name: e.target.value })} />
                  </td>
                  <td className="p-1.5">
                    <Select value={w.method} disabled={busy} onChange={(e) => set(w.id, { method: e.target.value })}>
                      {['POST', 'PUT', 'PATCH'].map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </Select>
                  </td>
                  <td className="p-1.5">
                    <Input
                      className="font-mono"
                      value={w.url}
                      disabled={busy}
                      onChange={(e) => set(w.id, { url: e.target.value })}
                    />
                  </td>
                  <td className="p-1.5">
                    <Select value={w.mode} disabled={busy} onChange={(e) => set(w.id, { mode: e.target.value })}>
                      {WEBHOOK_MODES.map((m) => (
                        <option key={m} value={m}>
                          {t(`http.webhooks.modes.${m}`)}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="p-1.5">
                    <Input
                      type="number"
                      min={0}
                      step={0.5}
                      value={w.interval ?? 0}
                      disabled={busy}
                      title={t(`http.webhooks.intervalHints.${w.mode}`)}
                      onChange={(e) => set(w.id, { interval: Number(e.target.value) })}
                    />
                  </td>
                  <td className="p-1.5">
                    <VariablesPicker
                      variables={variables}
                      value={w.variables ?? []}
                      disabled={busy}
                      onChange={(list) => set(w.id, { variables: list })}
                    />
                  </td>
                  <td className="p-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t('ui.remove')}
                      disabled={busy}
                      onClick={() => onChange(webhooks.filter((x) => x.id !== w.id))}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  )
}
