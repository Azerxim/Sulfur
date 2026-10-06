import { useEffect, useState } from 'react'
import { FolderOpen, RefreshCw, ShieldCheck, ShieldX, Trash2 } from 'lucide-react'
import { Button, ErrorBanner, Modal } from '@renderer/components/ui'
import { opcuaApi } from './api'

const STORES = [
  { id: 'rejected', title: 'Rejetés', hint: 'Certificats inconnus reçus et refusés. Approuvez-les pour autoriser la connexion.' },
  { id: 'trusted', title: 'Approuvés', hint: 'Certificats des pairs autorisés à se connecter.' },
  { id: 'own', title: 'Certificat de l\'application', hint: 'Généré automatiquement au premier démarrage.' }
]

const formatDate = (iso) => new Date(iso).toLocaleDateString('fr-FR')

function CertRow({ cert, store, onAction }) {
  return (
    <div className="flex items-center gap-3 border-t border-ink-800 px-3 py-2 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm text-slate-200">
          <span className="truncate">{cert.commonName}</span>
          {cert.expired && <span className="rounded bg-red-500/15 px-1.5 text-[11px] text-red-300">expiré</span>}
          {cert.error && <span className="rounded bg-red-500/15 px-1.5 text-[11px] text-red-300">{cert.error}</span>}
        </div>
        <div className="truncate font-mono text-[11px] text-slate-500 select-text">
          {cert.applicationUri ?? cert.file} · SHA1 {cert.thumbprint.slice(0, 16)}…
          {cert.notAfter && ` · valide jusqu'au ${formatDate(cert.notAfter)}`}
        </div>
      </div>
      {store === 'rejected' && (
        <Button size="sm" variant="primary" onClick={() => onAction('trust', cert)}>
          <ShieldCheck className="size-3.5" /> Approuver
        </Button>
      )}
      {store === 'trusted' && (
        <Button size="sm" onClick={() => onAction('reject', cert)}>
          <ShieldX className="size-3.5" /> Rejeter
        </Button>
      )}
      {store !== 'own' && (
        <Button size="icon" variant="ghost" title="Supprimer" onClick={() => onAction('remove', cert)}>
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  )
}

/** Gestion du magasin de certificats du serveur (`which="server"`) ou du client (`which="client"`). */
export default function CertificatesDialog({ which, onClose }) {
  const [certs, setCerts] = useState(null)
  const [error, setError] = useState(null)

  const call = (promise) =>
    promise
      .then((list) => {
        if (list) setCerts(list)
        setError(null)
      })
      .catch((err) => setError(err.message))

  const load = () => call(opcuaApi.certs.list(which))
  useEffect(() => {
    load()
  }, [which])

  const onAction = (action, cert) => {
    if (action === 'remove' && !confirm(`Supprimer le certificat « ${cert.commonName} » ?`)) return
    call(opcuaApi.certs[action](which, cert.thumbprint))
  }

  return (
    <Modal
      title={`Certificats du ${which === 'server' ? 'serveur' : 'client'}`}
      onClose={onClose}
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={() => call(opcuaApi.certs.openFolder(which))}>
            <FolderOpen className="size-3.5" /> Ouvrir le dossier
          </Button>
          <Button size="sm" variant="ghost" onClick={load}>
            <RefreshCw className="size-3.5" /> Actualiser
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ErrorBanner error={error} onClose={() => setError(null)} />
        {STORES.map((s) => (
          <section key={s.id}>
            <h3 className="text-sm font-medium text-slate-200">
              {s.title} <span className="text-slate-500">({certs?.[s.id]?.length ?? 0})</span>
            </h3>
            <p className="mb-2 text-xs text-slate-500">{s.hint}</p>
            <div className="rounded-md border border-ink-800">
              {certs?.[s.id]?.length ? (
                certs[s.id].map((c) => <CertRow key={c.thumbprint} cert={c} store={s.id} onAction={onAction} />)
              ) : (
                <p className="px-3 py-2 text-sm text-slate-600">{certs ? 'Aucun certificat' : 'Chargement…'}</p>
              )}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  )
}
