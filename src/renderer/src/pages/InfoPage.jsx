import { useEffect, useState } from 'react'
import { Check, Copy, Network, RefreshCw } from 'lucide-react'
import { Button, Card, ErrorBanner } from '@azerxim/sulfur-sdk/ui'
import { useI18n } from '../preferences'

function CopyButton({ text }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="ghost"
      size="icon"
      title={t('ui.copy')}
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
    >
      {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
    </Button>
  )
}

export default function InfoPage() {
  const { t } = useI18n()
  const [info, setInfo] = useState(null)
  const [error, setError] = useState(null)
  const [showInternal, setShowInternal] = useState(false)

  const load = () =>
    window.sulfur
      .invoke('system:info')
      .then((data) => {
        setInfo(data)
        setError(null)
      })
      .catch((err) => setError(err.message))

  useEffect(() => {
    load()
  }, [])

  const interfaces = (info?.interfaces ?? []).filter((i) => showInternal || !i.internal)
  const mainIps = (info?.interfaces ?? []).flatMap((i) => i.addresses).filter((a) => !a.internal && a.family === 'IPv4')

  return (
    <div className="flex flex-col gap-4 p-6">
      <ErrorBanner error={error} onClose={() => setError(null)} />

      {info && (
        <Card id="info.system" title={t('info.system')}>
          <dl className="grid grid-cols-[200px_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-slate-500">{t('info.hostname')}</dt>
            <dd className="font-mono text-slate-200 select-text">{info.hostname}</dd>
            <dt className="text-slate-500">{t('info.os')}</dt>
            <dd className="text-slate-200">
              {info.platform} ({info.arch})
            </dd>
            <dt className="text-slate-500">{t('info.appVersion')}</dt>
            <dd className="text-slate-200">{info.appVersion}</dd>
            <dt className="text-slate-500">{t('info.runtime')}</dt>
            <dd className="text-slate-200">
              {info.versions.electron} / {info.versions.node}
            </dd>
          </dl>
        </Card>
      )}

      <Card
        id="info.ips"
        title={t('info.ips')}
        actions={
          <Button variant="ghost" size="sm" onClick={load}>
            <RefreshCw className="size-3.5" /> {t('ui.refresh')}
          </Button>
        }
      >
        {mainIps.length ? (
          <div className="flex flex-wrap gap-3">
            {mainIps.map((a) => (
              <div key={a.address} className="flex items-center gap-2 rounded-md bg-ink-950 py-1.5 pr-1.5 pl-3">
                <span className="font-mono text-lg text-sulfur-300 select-text">{a.address}</span>
                <CopyButton text={a.address} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">{info ? t('info.noIp') : t('ui.loading')}</p>
        )}
      </Card>

      <Card
        id="info.interfaces"
        title={t('info.interfaces')}
        actions={
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              className="size-3.5 accent-sulfur-400"
              checked={showInternal}
              onChange={(e) => setShowInternal(e.target.checked)}
            />
            {t('info.showInternal')}
          </label>
        }
      >
        <div className="flex flex-col gap-3">
          {interfaces.map((itf) => (
            <div key={itf.name} className="rounded-md border border-ink-800">
              <div className="flex items-center gap-2 border-b border-ink-800 px-3 py-2 text-sm">
                <Network className="size-4 text-slate-500" />
                <span className="font-medium text-slate-200">{itf.name}</span>
                {itf.internal && (
                  <span className="rounded bg-ink-800 px-1.5 text-[11px] text-slate-400">{t('info.internal')}</span>
                )}
                {itf.mac && <span className="ml-auto font-mono text-xs text-slate-500 select-text">MAC {itf.mac}</span>}
              </div>
              <table className="w-full text-sm">
                <tbody className="font-mono text-[13px]">
                  {itf.addresses.map((a) => (
                    <tr key={a.address} className="border-t border-ink-800 first:border-t-0">
                      <td className="w-16 px-3 py-1.5 font-sans text-xs text-slate-500">{a.family}</td>
                      <td className="px-3 py-1.5 break-all text-slate-200 select-text">{a.address}</td>
                      <td className="px-3 py-1.5 text-slate-500 select-text">{a.netmask}</td>
                      <td className="w-10 px-1.5 py-1 text-right">
                        <CopyButton text={a.address} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
