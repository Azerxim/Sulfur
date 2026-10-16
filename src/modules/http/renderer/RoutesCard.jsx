import { useState } from 'react'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { Button, Card, Field, Input, Select } from '@renderer/components/ui'
import { CONTENT_TYPES, ROUTE_METHODS } from '../shared/constants'
import HeadersEditor from './HeadersEditor'
import { t } from '../shared/i18n'

function newRoute(routes) {
  let n = routes.length + 1
  while (routes.some((r) => r.path === `/route-${n}`)) n++
  return {
    id: crypto.randomUUID(),
    method: 'GET',
    path: `/route-${n}`,
    status: 200,
    contentType: 'application/json',
    headers: [],
    body: '{ "ok": true }',
    delay: 0,
    setVariable: '',
    source: ''
  }
}

const statusColor = (status) =>
  status >= 500
    ? 'text-red-300'
    : status >= 400
      ? 'text-amber-300'
      : status >= 300
        ? 'text-sky-300'
        : 'text-emerald-300'

function Route({ route, variables, busy, onChange, onRemove }) {
  const [open, setOpen] = useState(false)
  const set = (patch) => onChange({ ...route, ...patch })
  const invalidPath = !String(route.path).startsWith('/')
  const status = Number(route.status)
  const invalidStatus = !Number.isInteger(status) || status < 100 || status > 599

  return (
    <div className="rounded-md border border-ink-800">
      <div className="grid grid-cols-[auto_7rem_minmax(0,1fr)_6rem_auto] items-center gap-2 px-2 py-1.5">
        <button
          type="button"
          className="grid size-6 place-items-center rounded text-slate-500 hover:bg-ink-800 hover:text-slate-200"
          title={open ? t('ui.collapse') : t('ui.expand')}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronDown className={`size-4 transition-transform ${open ? '' : '-rotate-90'}`} />
        </button>
        <Select value={route.method} disabled={busy} onChange={(e) => set({ method: e.target.value })}>
          {ROUTE_METHODS.map((m) => (
            <option key={m} value={m}>
              {m === 'ANY' ? t('http.routes.anyMethod') : m}
            </option>
          ))}
        </Select>
        <Input
          className={`font-mono ${invalidPath ? 'border-red-500/60' : ''}`}
          value={route.path}
          disabled={busy}
          title={t('http.routes.pathHint')}
          onChange={(e) => set({ path: e.target.value })}
        />
        <Input
          type="number"
          min={100}
          max={599}
          className={`font-mono ${invalidStatus ? 'border-red-500/60' : statusColor(status)}`}
          value={route.status}
          disabled={busy}
          title={t('http.routes.status')}
          onChange={(e) => set({ status: Number(e.target.value) })}
        />
        <Button variant="ghost" size="icon" title={t('ui.remove')} disabled={busy} onClick={onRemove}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      {open && (
        <div className="flex flex-col gap-3 border-t border-ink-800 p-3">
          <div className="grid grid-cols-[14rem_8rem_minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <Field label={t('http.routes.contentType')}>
              <Input
                list="http-content-types"
                className="font-mono"
                value={route.contentType}
                disabled={busy}
                onChange={(e) => set({ contentType: e.target.value })}
              />
            </Field>
            <Field label={t('http.routes.delay')}>
              <Input
                type="number"
                min={0}
                value={route.delay ?? 0}
                disabled={busy}
                onChange={(e) => set({ delay: Number(e.target.value) })}
              />
            </Field>
            <Field label={t('http.routes.setVariable')}>
              <Select
                value={route.setVariable ?? ''}
                disabled={busy}
                onChange={(e) => set({ setVariable: e.target.value })}
              >
                <option value="">—</option>
                {variables
                  .filter((v) => v.writable || v.id === route.setVariable)
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label={t('http.routes.source')}>
              <Input
                className="font-mono"
                placeholder="body.value"
                value={route.source ?? ''}
                disabled={busy || !route.setVariable}
                onChange={(e) => set({ source: e.target.value })}
              />
            </Field>
          </div>
          <Field label={t('http.routes.body')}>
            <textarea
              rows={5}
              spellCheck={false}
              value={route.body ?? ''}
              disabled={busy}
              onChange={(e) => set({ body: e.target.value })}
              className="w-full resize-y rounded-md border border-ink-700 bg-ink-950 p-2 font-mono text-xs text-slate-100 select-text focus:border-sulfur-500 focus:outline-none"
            />
          </Field>
          <p className="text-[11px] text-slate-500">{t('http.routes.templateHint')}</p>
          <Field label={t('http.routes.headers')}>
            <HeadersEditor value={route.headers ?? []} disabled={busy} onChange={(headers) => set({ headers })} />
          </Field>
        </div>
      )}
    </div>
  )
}

/** Routes personnalisées du serveur, vérifiées dans l'ordre (la première qui correspond répond). */
export default function RoutesCard({ routes, variables, running, busy, onChange }) {
  return (
    <Card
      id="http.server.routes"
      title={t('http.routes.title', { count: routes.length })}
      className="shrink-0"
      actions={
        <>
          {running && <span className="text-xs text-slate-500">{t('ui.liveApplied')}</span>}
          <Button size="sm" disabled={busy} onClick={() => onChange([...routes, newRoute(routes)])}>
            <Plus className="size-3.5" /> {t('ui.add')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <p className="text-xs text-slate-500">{t('http.routes.hint')}</p>
        <datalist id="http-content-types">
          {CONTENT_TYPES.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        {routes.map((route) => (
          <Route
            key={route.id}
            route={route}
            variables={variables}
            busy={busy}
            onChange={(next) => onChange(routes.map((r) => (r.id === route.id ? next : r)))}
            onRemove={() => onChange(routes.filter((r) => r.id !== route.id))}
          />
        ))}
      </div>
    </Card>
  )
}
