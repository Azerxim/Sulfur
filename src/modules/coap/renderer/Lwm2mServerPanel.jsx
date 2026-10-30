import { useState } from 'react'
import { BookOpen, Eye, Pencil, Play, Radar, Square, Zap, X } from 'lucide-react'
import { Button, Card, ErrorBanner, Field, Input, Select, StatusDot, usePersistentState } from '@azerxim/sulfur-sdk/ui'
import { formatTime } from '@azerxim/sulfur-sdk'
import { formatName } from '../shared/codec'
import { DEFAULT_LWM2M_SERVER_CONFIG, READ_FORMATS } from '../shared/constants'
import { OBJECTS, parsePath, pathLabel } from '../shared/lwm2m'
import { coapApi } from './api'
import LogCard, { CodeBadge } from './LogCard'
import { t } from '../shared/i18n'

/** Chemins proposés pour un appareil : ses instances, puis les ressources connues de chacune. */
function knownPaths(objects = []) {
  return objects.flatMap((href) => {
    const p = parsePath(href)
    const resources = OBJECTS[p?.object]?.resources ?? {}
    return [href, ...Object.keys(resources).map((id) => `${href}/${id}`)]
  })
}

/** Résultat d'une opération : code, format, valeurs, liens ou contenu brut. */
function OperationResult({ result }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-ink-800 bg-ink-950 p-3">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className={`font-mono ${result.ok ? 'text-emerald-300' : 'text-amber-300'}`}>{result.code}</span>
        {result.format && <span className="font-mono text-slate-500">{result.format}</span>}
        {result.notObservable && <span className="text-amber-300">{t('coap.client.notObservable')}</span>}
      </div>
      {result.values?.length > 0 && (
        <table className="w-full text-xs">
          <tbody>
            {result.values.map((v) => (
              <tr key={v.path} className="border-t border-ink-800/70 first:border-t-0">
                <td className="w-32 py-1 font-mono text-slate-500">{v.path}</td>
                <td className="py-1 text-slate-400">{v.label}</td>
                <td className="py-1 text-right font-mono text-sulfur-300 select-text">{v.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {result.links && (
        <p className="font-mono text-xs break-all text-slate-300 select-text">
          {result.links.map((l) => l.href).join('  ')}
        </p>
      )}
      {result.text && <p className="font-mono text-xs break-all text-slate-300 select-text">{result.text}</p>}
    </div>
  )
}

/** Opérations sur un appareil enregistré : lecture, écriture, exécution, découverte, observation. */
function DevicePanel({ registration }) {
  const [form, setForm] = usePersistentState('coap', 'lwm2mOperation', {
    path: '/3303/0/5700',
    format: 11542,
    value: ''
  })
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const paths = knownPaths(registration.objects)
  const p = parsePath(form.path)
  const isResource = p?.depth === 3

  async function run(action) {
    setBusy(true)
    setError(null)
    try {
      setResult(await action())
    } catch (err) {
      setError(err.message)
      setResult(null)
    } finally {
      setBusy(false)
    }
  }

  const id = registration.id
  return (
    <div className="flex flex-col gap-3 border-t border-ink-800 pt-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('coap.lwm2m.path')} className="w-56">
          <Input
            className="font-mono"
            list={`lwm2m-paths-${id}`}
            value={form.path}
            onChange={(e) => set({ path: e.target.value })}
          />
          <datalist id={`lwm2m-paths-${id}`}>
            {paths.map((path) => (
              <option key={path} value={path}>
                {pathLabel(path)}
              </option>
            ))}
          </datalist>
        </Field>
        <span className="h-9 content-center text-xs text-slate-500">
          {p ? pathLabel(form.path) : t('coap.lwm2m.invalidPath')}
        </span>
        <Field label={t('coap.lwm2m.format')} className="w-60">
          <Select value={form.format} onChange={(e) => set({ format: Number(e.target.value) })}>
            {READ_FORMATS.map((f) => (
              <option key={f} value={f}>
                {formatName(f)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Button disabled={busy || !p} onClick={() => run(() => coapApi.lwm2mServer.read(id, form.path, form.format))}>
          <BookOpen className="size-4" /> {t('coap.lwm2m.ops.read')}
        </Button>
        <Button disabled={busy || !p} onClick={() => run(() => coapApi.lwm2mServer.discover(id, form.path))}>
          <Radar className="size-4" /> {t('coap.lwm2m.ops.discover')}
        </Button>
        <Button
          disabled={busy || !p}
          onClick={() => run(() => coapApi.lwm2mServer.observe(id, form.path, form.format))}
        >
          <Eye className="size-4" /> {t('coap.lwm2m.ops.observe')}
        </Button>
        <span className="mx-1 h-6 w-px bg-ink-800" />
        <Field label={t('coap.lwm2m.value')} className="w-44">
          <Input
            className="font-mono"
            value={form.value}
            disabled={!isResource}
            onChange={(e) => set({ value: e.target.value })}
          />
        </Field>
        <Button
          disabled={busy || !isResource}
          onClick={() => run(() => coapApi.lwm2mServer.write(id, form.path, form.value))}
        >
          <Pencil className="size-4" /> {t('coap.lwm2m.ops.write')}
        </Button>
        <Button
          disabled={busy || !isResource}
          onClick={() => run(() => coapApi.lwm2mServer.execute(id, form.path, form.value))}
        >
          <Zap className="size-4" /> {t('coap.lwm2m.ops.execute')}
        </Button>
      </div>
      <ErrorBanner error={error} onClose={() => setError(null)} />
      {result && <OperationResult result={result} />}
    </div>
  )
}

/** Serveur LwM2M : adresse, appareils enregistrés, opérations, observations et journal. */
export default function Lwm2mServerPanel({ status }) {
  const [config, setConfig] = usePersistentState('coap', 'lwm2mServer', DEFAULT_LWM2M_SERVER_CONFIG)
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const running = status.running
  const registrations = status.registrations ?? []

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

  return (
    <>
      <Card id="coap.lwm2m.server" title={t('coap.lwm2m.title')} className="shrink-0">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t('coap.address')} className="w-40">
              <Input
                className="font-mono"
                value={config.host}
                disabled={running || busy}
                onChange={(e) => setConfig({ ...config, host: e.target.value })}
              />
            </Field>
            <Field label={t('coap.port')} className="w-28">
              <Input
                className="font-mono"
                type="number"
                value={config.port}
                disabled={running || busy}
                onChange={(e) => setConfig({ ...config, port: Number(e.target.value) })}
              />
            </Field>
            {running ? (
              <Button disabled={busy} onClick={() => run(coapApi.lwm2mServer.stop)}>
                <Square className="size-4" /> {t('ui.stop')}
              </Button>
            ) : (
              <Button variant="primary" disabled={busy} onClick={() => run(() => coapApi.lwm2mServer.start(config))}>
                <Play className="size-4" /> {t('ui.start')}
              </Button>
            )}
            <StatusDot
              on={running}
              label={running ? t('coap.lwm2m.running', { count: registrations.length }) : t('ui.stopped')}
            />
          </div>
          <p className="text-xs text-slate-500">{t('coap.lwm2m.hint')}</p>
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      {running && (
        <Card
          id="coap.lwm2m.devices"
          title={t('coap.lwm2m.devices', { count: registrations.length })}
          className="shrink-0"
        >
          {registrations.length ? (
            <div className="flex flex-col gap-3">
              {registrations.map((reg) => (
                <div key={reg.id} className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <StatusDot on />
                    <span className="font-mono text-sm font-medium text-slate-100">{reg.endpoint}</span>
                    <span className="font-mono text-xs text-slate-400">
                      {reg.address}:{reg.port}
                    </span>
                    <span className="text-xs text-slate-500">
                      {t('coap.lwm2m.registration', {
                        version: reg.version,
                        binding: reg.binding,
                        lifetime: reg.lifetime,
                        time: formatTime(reg.updatedAt)
                      })}
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {reg.objects.map((href) => (
                        <span
                          key={href}
                          className="rounded bg-ink-850 px-1.5 py-px font-mono text-[11px] text-slate-300"
                          title={pathLabel(href)}
                        >
                          {href}
                        </span>
                      ))}
                    </span>
                    <Button
                      size="sm"
                      variant={selected === reg.id ? 'secondary' : 'ghost'}
                      className="ml-auto"
                      onClick={() => setSelected(selected === reg.id ? null : reg.id)}
                    >
                      {t('coap.lwm2m.operations')}
                    </Button>
                  </div>
                  {selected === reg.id && <DevicePanel registration={reg} />}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">{t('coap.lwm2m.noDevice', { port: status.config?.port })}</p>
          )}
        </Card>
      )}

      {status.observations?.length > 0 && (
        <Card
          id="coap.lwm2m.observations"
          title={t('coap.client.observations', { count: status.observations.length })}
          className="shrink-0"
        >
          <div className="flex flex-col gap-2">
            {status.observations.map((o) => (
              <div key={o.token} className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-mono text-slate-200">{o.endpoint}</span>
                <span className="text-slate-400">{o.label}</span>
                <span className="font-mono text-sulfur-300">
                  {o.values.length === 1 ? o.values[0].value : t('coap.lwm2m.valuesCount', { count: o.values.length })}
                </span>
                <span className="text-xs text-slate-500">
                  {t('coap.client.notifications', { count: o.count, since: formatTime(o.since) })}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() => coapApi.lwm2mServer.cancel(o.token).catch((err) => setError(err.message))}
                >
                  <X className="size-3.5" /> {t('coap.client.cancel')}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <LogCard
        id="coap.lwm2m.log"
        load={coapApi.lwm2mServer.log}
        subscribe={coapApi.lwm2mServer.onLog}
        clear={coapApi.lwm2mServer.clearLog}
        renderEntry={(e) => (
          <>
            <span className="w-20 shrink-0 font-sans text-sky-300">{t(`coap.lwm2m.ops.${e.op}`)}</span>
            <span className="w-36 shrink-0 truncate text-slate-400">{e.endpoint}</span>
            <span className="w-28 shrink-0 text-slate-200" title={pathLabel(e.path)}>
              {e.path}
            </span>
            {e.error ? (
              <span className="font-sans text-red-300">{e.error}</span>
            ) : (
              <>
                <CodeBadge code={e.code} />
                <span className="min-w-0 flex-1 truncate text-slate-400" title={e.payload}>
                  {e.payload}
                </span>
              </>
            )}
          </>
        )}
      />
    </>
  )
}
