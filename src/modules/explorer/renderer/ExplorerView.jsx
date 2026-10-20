import { useEffect, useState } from 'react'
import { Button, Card, ErrorBanner, Field, Input } from '@renderer/components/ui'
import { usePersistentState } from '@renderer/module-config'
import { DEFAULT_SCAN, MAX_HOSTS } from '../shared/constants'
import { PRIVATE_NETWORKS } from '@shared/networks'
import { explorerApi } from './api'
import { t } from '../shared/i18n'

/** Délai avant de vérifier la saisie (frappe au clavier). */
const CHECK_DELAY = 400

export default function ExplorerView() {
  const [config, setConfig] = usePersistentState('explorer', 'scan', DEFAULT_SCAN)
  const [networks, setNetworks] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    explorerApi
      .networks()
      .then(setNetworks)
      .catch(() => setNetworks({ local: [] }))
  }, [])

  // Vérification de la saisie par le process principal (seul juge des réseaux autorisés).
  useEffect(() => {
    if (!config.targets.trim()) {
      setResult(null)
      setError(null)
      return undefined
    }
    let current = true
    const timer = setTimeout(
      () =>
        explorerApi
          .checkTargets(config.targets)
          .then((checked) => {
            if (!current) return
            setResult(checked)
            setError(null)
          })
          .catch((err) => {
            if (!current) return
            setResult(null)
            setError(err.message)
          }),
      CHECK_DELAY
    )
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [config.targets])

  const local = networks?.local ?? []

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-6">
      <Card id="explorer.targets" title={t('explorer.targets.title')} className="shrink-0">
        <div className="flex flex-col gap-3">
          <Field label={t('explorer.targets.label')}>
            <Input
              className="font-mono"
              value={config.targets}
              placeholder="192.168.1.0/24"
              onChange={(e) => setConfig((c) => ({ ...c, targets: e.target.value }))}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">{t('explorer.targets.local')}</span>
            {networks && !local.length && (
              <span className="text-xs text-slate-600">{t('explorer.targets.noLocal')}</span>
            )}
            {local.map((n) => (
              <Button
                key={`${n.interface}-${n.cidr}`}
                size="sm"
                title={n.address}
                onClick={() => setConfig((c) => ({ ...c, targets: n.cidr }))}
              >
                <span className="text-slate-400">{n.interface}</span>
                <span className="font-mono">{n.cidr}</span>
              </Button>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            {t('explorer.targets.hint', { networks: PRIVATE_NETWORKS.map((n) => n.cidr).join(', '), max: MAX_HOSTS })}
          </p>
          <p className="text-xs text-slate-500">{t('explorer.targets.later')}</p>
          <ErrorBanner error={error} />
        </div>
      </Card>

      <Card
        id="explorer.preview"
        title={t('explorer.preview.title', { count: result?.count ?? 0 })}
        className="min-h-48 shrink-0"
      >
        {result ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-300">
              {result.count > 1
                ? t('explorer.preview.range', { first: result.first, last: result.last })
                : result.first}
            </p>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-x-4 gap-y-1 font-mono text-xs text-slate-400">
              {result.preview.map((address) => (
                <span key={address}>{address}</span>
              ))}
            </div>
            {result.count > result.preview.length && (
              <p className="text-xs text-slate-500">
                {t('explorer.preview.more', { count: result.count - result.preview.length })}
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-600">{t('explorer.preview.empty')}</p>
        )}
      </Card>
    </div>
  )
}
