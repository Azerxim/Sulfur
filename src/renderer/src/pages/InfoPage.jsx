import { useEffect, useState } from 'react'
import { Check, Copy, Network, RefreshCw } from 'lucide-react'
import { Button, Card, ErrorBanner } from '../components/ui'

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="ghost"
      size="icon"
      title="Copier"
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
  const mainIps = (info?.interfaces ?? [])
    .flatMap((i) => i.addresses)
    .filter((a) => !a.internal && a.family === 'IPv4')

  return (
    <div className="flex flex-col gap-4 p-6">
      <ErrorBanner error={error} onClose={() => setError(null)} />

      <Card
        title="Adresses IP du PC"
        actions={
          <Button variant="ghost" size="sm" onClick={load}>
            <RefreshCw className="size-3.5" /> Actualiser
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
          <p className="text-sm text-slate-500">{info ? 'Aucune adresse IPv4 externe (PC hors réseau ?)' : 'Chargement…'}</p>
        )}
      </Card>

      <Card
        title="Interfaces réseau"
        actions={
          <label className="flex items-center gap-2 text-xs text-slate-400">
            <input
              type="checkbox"
              className="size-3.5 accent-sulfur-400"
              checked={showInternal}
              onChange={(e) => setShowInternal(e.target.checked)}
            />
            Afficher les interfaces internes
          </label>
        }
      >
        <div className="flex flex-col gap-3">
          {interfaces.map((itf) => (
            <div key={itf.name} className="rounded-md border border-ink-800">
              <div className="flex items-center gap-2 border-b border-ink-800 px-3 py-2 text-sm">
                <Network className="size-4 text-slate-500" />
                <span className="font-medium text-slate-200">{itf.name}</span>
                {itf.internal && <span className="rounded bg-ink-800 px-1.5 text-[11px] text-slate-400">interne</span>}
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

      {info && (
        <Card title="Système">
          <dl className="grid grid-cols-[160px_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-slate-500">Nom du PC</dt>
            <dd className="font-mono text-slate-200 select-text">{info.hostname}</dd>
            <dt className="text-slate-500">Système</dt>
            <dd className="text-slate-200">
              {info.platform} ({info.arch})
            </dd>
            <dt className="text-slate-500">Version de Sulfur</dt>
            <dd className="text-slate-200">{info.appVersion}</dd>
            <dt className="text-slate-500">Electron / Node</dt>
            <dd className="text-slate-200">
              {info.versions.electron} / {info.versions.node}
            </dd>
          </dl>
        </Card>
      )}
    </div>
  )
}
