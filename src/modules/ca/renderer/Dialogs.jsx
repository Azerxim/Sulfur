import { useEffect, useState } from 'react'
import { Copy, Download, FileUp } from 'lucide-react'
import { Button, ErrorBanner, Field, Input, Modal, Select } from '@renderer/components/ui'
import { formatDate } from '@shared/i18n'
import { DEFAULT_AUTHORITY, EXPORT_FORMATS, KEY_ALGORITHMS, REVOCATION_REASONS } from '../shared/constants'
import { caApi } from './api'
import { t } from '../shared/i18n'

/** Exécute une action asynchrone avec indicateur d'attente et message d'erreur. */
export function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const run = async (action) => {
    setBusy(true)
    setError(null)
    try {
      return await action()
    } catch (err) {
      setError(err.message)
      return undefined
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, setError, run }
}

const textareaClass =
  'min-h-28 w-full rounded-md border border-ink-700 bg-ink-950 px-3 py-2 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus:border-sulfur-500 focus:outline-none'

export function TextArea({ className = '', ...props }) {
  return <textarea spellCheck={false} className={`${textareaClass} ${className}`} {...props} />
}

/** Création d'une autorité racine, ou intermédiaire signée par `parent`. */
export function CreateAuthorityDialog({ authorities, parentId, onClose, onCreated }) {
  const [form, setForm] = useState({ ...DEFAULT_AUTHORITY, parentId: parentId ?? '' })
  const { busy, error, setError, run } = useAction()
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const parents = authorities.filter((a) => a.certificate.pathLength !== 0 && !a.certificate.expired)
  const intermediate = !!form.parentId

  useEffect(() => {
    if (intermediate && form.commonName === DEFAULT_AUTHORITY.commonName) set({ commonName: 'Sulfur Test Issuing CA' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intermediate])

  const submit = () =>
    run(async () => {
      const result = await caApi.createAuthority(form)
      onCreated(result)
    })

  return (
    <Modal title={t('ca.create.title')} onClose={onClose} className="max-w-2xl">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('ca.create.parent')} className="col-span-2">
            <Select value={form.parentId} onChange={(e) => set({ parentId: e.target.value })}>
              <option value="">{t('ca.create.noParent')}</option>
              {parents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.certificate.commonName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('ca.fields.commonName')} className="col-span-2">
            <Input value={form.commonName} onChange={(e) => set({ commonName: e.target.value })} autoFocus />
          </Field>
          <Field label={t('ca.fields.organization')}>
            <Input value={form.organization} onChange={(e) => set({ organization: e.target.value })} />
          </Field>
          <Field label={t('ca.fields.organizationalUnit')}>
            <Input value={form.organizationalUnit} onChange={(e) => set({ organizationalUnit: e.target.value })} />
          </Field>
          <Field label={t('ca.fields.country')}>
            <Input
              maxLength={2}
              placeholder="FR"
              value={form.country}
              onChange={(e) => set({ country: e.target.value })}
            />
          </Field>
          <Field label={t('ca.fields.validityDays')}>
            <Input
              type="number"
              min={1}
              value={form.validityDays}
              onChange={(e) => set({ validityDays: Number(e.target.value) })}
            />
          </Field>
          <Field label={t('ca.fields.keyAlgorithm')} className="col-span-2">
            <Select value={form.keyAlgorithm} onChange={(e) => set({ keyAlgorithm: e.target.value })}>
              {KEY_ALGORITHMS.map((k) => (
                <option key={k} value={k}>
                  {t(`ca.keyAlgorithms.${k}`)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <p className="text-xs text-slate-500">
          {intermediate ? t('ca.create.intermediateHint') : t('ca.create.rootHint')}
        </p>
        <ErrorBanner error={error} onClose={() => setError(null)} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('ca.cancel')}
          </Button>
          <Button variant="primary" disabled={busy || !form.commonName.trim()} onClick={submit}>
            {busy ? t('ca.create.creating') : t('ca.create.submit')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** Champ texte PEM avec lecture d'un fichier (PEM ou DER). */
export function PemField({ label, kind, value, onChange, placeholder }) {
  const [error, setError] = useState(null)
  const pick = () =>
    caApi
      .pickFile(kind)
      .then((file) => file && onChange(file.content))
      .catch((err) => setError(err.message))
  return (
    <Field label={label}>
      <TextArea value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={pick}>
          <FileUp className="size-3.5" /> {t('ca.import.pickFile')}
        </Button>
        {error && <span className="text-xs text-red-300">{error}</span>}
      </div>
    </Field>
  )
}

/** Import d'une autorité existante : certificat et clé privée (éventuellement chiffrée). */
export function ImportAuthorityDialog({ onClose, onImported }) {
  const [form, setForm] = useState({ certificate: '', privateKey: '', passphrase: '' })
  const { busy, error, setError, run } = useAction()
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const submit = () =>
    run(async () => {
      onImported(await caApi.importAuthority(form))
    })
  return (
    <Modal title={t('ca.import.title')} onClose={onClose} className="max-w-2xl">
      <div className="flex flex-col gap-4">
        <p className="text-xs text-slate-500">{t('ca.import.hint')}</p>
        <PemField
          label={t('ca.import.certificate')}
          kind="certificate"
          placeholder="-----BEGIN CERTIFICATE-----"
          value={form.certificate}
          onChange={(certificate) => set({ certificate })}
        />
        <PemField
          label={t('ca.import.privateKey')}
          kind="key"
          placeholder="-----BEGIN PRIVATE KEY-----"
          value={form.privateKey}
          onChange={(privateKey) => set({ privateKey })}
        />
        <Field label={t('ca.import.passphrase')}>
          <Input type="password" value={form.passphrase} onChange={(e) => set({ passphrase: e.target.value })} />
        </Field>
        <ErrorBanner error={error} onClose={() => setError(null)} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('ca.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={busy || !form.certificate.trim() || !form.privateKey.trim()}
            onClick={submit}
          >
            {t('ca.import.submit')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/**
 * Export d'un certificat (`serial`) ou de l'autorité (`serial` absent) dans le format choisi.
 * `hasKey` : la clé privée est connue (absente pour une CSR signée).
 */
export function ExportDialog({ authorityId, serial, hasKey, name, onClose }) {
  const formats = EXPORT_FORMATS.filter((f) => hasKey || (f !== 'key-pem' && f !== 'p12'))
  const [format, setFormat] = useState(formats[0])
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saved, setSaved] = useState(null)
  const { busy, error, setError, run } = useAction()
  const mismatch = format === 'p12' && password !== confirm

  const submit = () =>
    run(async () => {
      const result = await caApi.exportFile(authorityId, serial ?? null, format, { password })
      if (result) setSaved(result.filePath)
    })

  return (
    <Modal title={t('ca.export.titleOf', { name })} onClose={onClose} className="max-w-xl">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          {formats.map((f) => (
            <label key={f} className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-ink-800">
              <input
                type="radio"
                name="format"
                className="mt-1 accent-sulfur-400"
                checked={format === f}
                onChange={() => setFormat(f)}
              />
              <span>
                <span className="block text-sm text-slate-200">{t(`ca.formats.${f}`)}</span>
                <span className="block text-xs text-slate-500">{t(`ca.formatHints.${f}`)}</span>
              </span>
            </label>
          ))}
        </div>
        {format === 'p12' && (
          <div className="grid grid-cols-2 gap-4">
            <Field label={t('ca.export.password')}>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label={t('ca.export.passwordConfirm')}>
              <Input
                type="password"
                value={confirm}
                className={mismatch && confirm ? 'border-red-500/60' : ''}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
            <p className="col-span-2 text-xs text-slate-500">{t('ca.export.passwordHint')}</p>
          </div>
        )}
        {(format === 'key-pem' || format === 'p12') && (
          <p className="text-xs text-amber-300/80">{t('ca.export.keyWarning')}</p>
        )}
        {saved && <p className="text-xs break-all text-emerald-300">{t('ca.export.saved', { path: saved })}</p>}
        <ErrorBanner error={error} onClose={() => setError(null)} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('ui.close')}
          </Button>
          <Button variant="primary" disabled={busy || mismatch} onClick={submit}>
            <Download className="size-3.5" /> {t('ca.export.submit')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** Révocation d'un certificat émis, avec son motif. */
export function RevokeDialog({ authorityId, entry, onClose, onRevoked }) {
  const [reason, setReason] = useState('unspecified')
  const { busy, error, setError, run } = useAction()
  const submit = () =>
    run(async () => {
      onRevoked(await caApi.revoke(authorityId, entry.serial, reason))
    })
  return (
    <Modal title={t('ca.revoke.title', { name: entry.certificate.commonName })} onClose={onClose} className="max-w-lg">
      <div className="flex flex-col gap-4">
        <Field label={t('ca.revoke.reason')}>
          <Select value={reason} onChange={(e) => setReason(e.target.value)}>
            {Object.keys(REVOCATION_REASONS).map((r) => (
              <option key={r} value={r}>
                {t(`ca.reasons.${r}`)}
              </option>
            ))}
          </Select>
        </Field>
        <p className="text-xs text-slate-500">{t('ca.revoke.hint')}</p>
        <ErrorBanner error={error} onClose={() => setError(null)} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t('ca.cancel')}
          </Button>
          <Button variant="danger" disabled={busy} onClick={submit}>
            {t('ca.revoke.submit')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function Row({ label, children }) {
  if (children === null || children === undefined || children === '' || children?.length === 0) return null
  return (
    <>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-mono text-xs break-all text-slate-200 select-text">
        {Array.isArray(children) ? children.join(', ') : children}
      </dd>
    </>
  )
}

/** Détail d'un certificat : champs décodés et texte PEM (copiable). */
export function DetailsDialog({ authorityId, serial, onClose }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    caApi
      .details(authorityId, serial ?? null)
      .then(setData)
      .catch((err) => setError(err.message))
  }, [authorityId, serial])
  const c = data?.certificate
  const copy = () => {
    navigator.clipboard.writeText(data.pem)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <Modal
      title={c ? c.commonName : t('ui.loading')}
      onClose={onClose}
      className="max-w-3xl"
      actions={
        data && (
          <Button size="sm" variant="ghost" onClick={copy}>
            <Copy className="size-3.5" /> {copied ? t('ca.details.copied') : t('ca.details.copyPem')}
          </Button>
        )
      }
    >
      <ErrorBanner error={error} />
      {c && (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-[10rem_minmax(0,1fr)] gap-x-4 gap-y-1.5">
            <Row label={t('ca.details.subject')}>{c.subject}</Row>
            <Row label={t('ca.details.issuer')}>{c.issuer}</Row>
            <Row label={t('ca.details.serial')}>{c.serial}</Row>
            <Row label={t('ca.details.validity')}>
              {t('ca.details.validityRange', { from: formatDate(c.notBefore), to: formatDate(c.notAfter) })}
            </Row>
            <Row label={t('ca.details.key')}>{c.key}</Row>
            <Row label={t('ca.details.type')}>
              {c.isCa
                ? c.pathLength === 0
                  ? t('ca.details.intermediateCa')
                  : t('ca.details.rootCa')
                : t('ca.details.endEntity')}
            </Row>
            <Row label="DNS">{c.dns}</Row>
            <Row label="IP">{c.ips}</Row>
            <Row label="URI">{c.uris}</Row>
            <Row label={t('ca.details.keyUsages')}>{c.keyUsages}</Row>
            <Row label={t('ca.details.extendedKeyUsages')}>{c.extendedKeyUsages}</Row>
            <Row label={t('ca.details.role')}>{c.role}</Row>
            <Row label="SHA-256">{c.thumbprint}</Row>
            <Row label="SHA-1">{c.sha1}</Row>
          </dl>
          <TextArea readOnly value={data.pem} className="min-h-48" />
        </div>
      )}
    </Modal>
  )
}
