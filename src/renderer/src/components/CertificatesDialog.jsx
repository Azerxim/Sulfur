import { useEffect, useState } from 'react'
import { FolderOpen, RefreshCw, ShieldCheck, ShieldX, Trash2 } from 'lucide-react'
import { formatDate, t as appT } from '@shared/i18n'
import { Button, ErrorBanner, Modal } from './ui'

const STORES = ['rejected', 'trusted', 'own']

function CertRow({ cert, store, onAction, t }) {
  return (
    <div className="flex items-center gap-3 border-t border-ink-800 px-3 py-2 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm text-slate-200">
          <span className="truncate">{cert.commonName}</span>
          {cert.expired && <span className="rounded bg-red-500/15 px-1.5 text-[11px] text-red-300">{t('certs.expired')}</span>}
          {cert.error && <span className="rounded bg-red-500/15 px-1.5 text-[11px] text-red-300">{cert.error}</span>}
        </div>
        <div className="truncate font-mono text-[11px] text-slate-500 select-text">
          {cert.description ?? cert.applicationUri ?? cert.file} · {t('certs.thumbprint')} {cert.thumbprint.slice(0, 16)}…
          {cert.notAfter && ` · ${t('certs.validUntil', { date: formatDate(cert.notAfter) })}`}
        </div>
      </div>
      {store === 'rejected' && (
        <Button size="sm" variant="primary" onClick={() => onAction('trust', cert)}>
          <ShieldCheck className="size-3.5" /> {t('certs.approve')}
        </Button>
      )}
      {store === 'trusted' && (
        <Button size="sm" onClick={() => onAction('reject', cert)}>
          <ShieldX className="size-3.5" /> {t('certs.reject')}
        </Button>
      )}
      {store !== 'own' && (
        <Button size="icon" variant="ghost" title={t('ui.remove')} onClick={() => onAction('remove', cert)}>
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  )
}

/**
 * Gestion d'un magasin de certificats (rejetés / approuvés / propre).
 * `api` = { list(), trust(thumbprint), reject(thumbprint), remove(thumbprint), openFolder() }
 * `t` = traducteur du module appelant, pour rester dans la même langue que lui.
 */
export default function CertificatesDialog({ title, api, onClose, t = appT }) {
  const [certs, setCerts] = useState(null)
  const [error, setError] = useState(null)

  const call = (promise) =>
    promise
      .then((list) => {
        if (list) setCerts(list)
        setError(null)
      })
      .catch((err) => setError(err.message))

  const load = () => call(api.list())
  useEffect(() => {
    load()
  }, [api])

  const onAction = (action, cert) => {
    if (action === 'remove' && !confirm(t('certs.confirmRemove', { name: cert.commonName }))) return
    call(api[action](cert.thumbprint))
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={() => call(api.openFolder())}>
            <FolderOpen className="size-3.5" /> {t('certs.openFolder')}
          </Button>
          <Button size="sm" variant="ghost" onClick={load}>
            <RefreshCw className="size-3.5" /> {t('ui.refresh')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ErrorBanner error={error} onClose={() => setError(null)} />
        {STORES.map((store) => (
          <section key={store}>
            <h3 className="text-sm font-medium text-slate-200">
              {t(`certs.${store}`)} <span className="text-slate-500">({certs?.[store]?.length ?? 0})</span>
            </h3>
            <p className="mb-2 text-xs text-slate-500">{t(`certs.${store}Hint`)}</p>
            <div className="rounded-md border border-ink-800">
              {certs?.[store]?.length ? (
                certs[store].map((c) => <CertRow key={c.thumbprint} cert={c} store={store} onAction={onAction} t={t} />)
              ) : (
                <p className="px-3 py-2 text-sm text-slate-600">{certs ? t('certs.none') : t('ui.loading')}</p>
              )}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  )
}
