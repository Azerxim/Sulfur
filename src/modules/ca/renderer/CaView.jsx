import { useEffect, useState } from 'react'
import { Download, Eye, FileSignature, FolderOpen, Import, Plus, RefreshCw, ShieldOff, Trash2 } from 'lucide-react'
import { Button, Card, ErrorBanner, Field, Input, Select, Tabs, useStoredState } from '@renderer/components/ui'
import { usePersistentState } from '@renderer/module-config'
import { formatDate } from '@shared/i18n'
import { DEFAULT_ISSUE, KEY_ALGORITHMS, PROFILES } from '../shared/constants'
import { caApi } from './api'
import {
  CreateAuthorityDialog,
  DetailsDialog,
  ExportDialog,
  ImportAuthorityDialog,
  PemField,
  RevokeDialog,
  useAction
} from './Dialogs'
import { t } from '../shared/i18n'

const STATUS_STYLES = {
  valid: 'bg-emerald-500/15 text-emerald-300',
  expired: 'bg-amber-500/15 text-amber-300',
  revoked: 'bg-red-500/15 text-red-300'
}

function Badge({ className = 'bg-ink-800 text-slate-300', children }) {
  return <span className={`rounded px-1.5 py-0.5 text-[11px] whitespace-nowrap ${className}`}>{children}</span>
}

/** Type d'une autorité : racine, intermédiaire, importée. */
function authorityKind(a) {
  if (a.certificate.selfSigned) return t('ca.authorities.root')
  return t('ca.authorities.intermediate')
}

function AuthorityDetails({ authority, onChange, onCreateChild, setDialog }) {
  const { run, busy, error, setError } = useAction()
  const c = authority.certificate
  const remove = () => {
    if (!confirm(t('ca.authority.confirmRemove', { name: c.commonName }))) return
    run(async () => onChange(await caApi.removeAuthority(authority.id), null))
  }
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
        <dt className="text-slate-500">{t('ca.details.subject')}</dt>
        <dd className="font-mono break-all text-slate-200 select-text">{c.subject}</dd>
        {!c.selfSigned && (
          <>
            <dt className="text-slate-500">{t('ca.details.issuer')}</dt>
            <dd className="font-mono break-all text-slate-200 select-text">{c.issuer}</dd>
          </>
        )}
        <dt className="text-slate-500">{t('ca.details.validity')}</dt>
        <dd className="text-slate-200">
          {t('ca.details.validityRange', { from: formatDate(c.notBefore), to: formatDate(c.notAfter) })}
          {c.expired && <Badge className={`ml-2 ${STATUS_STYLES.expired}`}>{t('ca.statuses.expired')}</Badge>}
        </dd>
        <dt className="text-slate-500">{t('ca.details.key')}</dt>
        <dd className="text-slate-200">{c.key}</dd>
        <dt className="text-slate-500">SHA-256</dt>
        <dd className="font-mono break-all text-slate-400 select-text">{c.thumbprint}</dd>
        <dt className="text-slate-500">{t('ca.authority.crl')}</dt>
        <dd className="text-slate-200">
          {authority.crl
            ? t('ca.authority.crlInfo', {
                date: formatDate(authority.crl.thisUpdate),
                next: authority.crl.nextUpdate ? formatDate(authority.crl.nextUpdate) : '—',
                count: authority.issued.filter((i) => i.revoked).length
              })
            : '—'}
        </dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setDialog({ type: 'details', serial: null })}>
          <Eye className="size-3.5" /> {t('ca.authority.view')}
        </Button>
        <Button size="sm" onClick={() => setDialog({ type: 'export', serial: null, hasKey: true, name: c.commonName })}>
          <Download className="size-3.5" /> {t('ca.authority.export')}
        </Button>
        <Button
          size="sm"
          disabled={busy}
          title={t('ca.authority.updateCrlHint')}
          onClick={() => run(async () => onChange(await caApi.updateCrl(authority.id)))}
        >
          <RefreshCw className="size-3.5" /> {t('ca.authority.updateCrl')}
        </Button>
        <Button size="sm" onClick={() => setDialog({ type: 'crl' })}>
          <Download className="size-3.5" /> {t('ca.authority.exportCrl')}
        </Button>
        {c.pathLength !== 0 && (
          <Button size="sm" onClick={onCreateChild}>
            <Plus className="size-3.5" /> {t('ca.authority.createIntermediate')}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => caApi.openFolder(authority.id).catch((e) => setError(e.message))}
        >
          <FolderOpen className="size-3.5" /> {t('ca.openFolder')}
        </Button>
        <Button size="sm" variant="danger" className="ml-auto" disabled={busy} onClick={remove}>
          <Trash2 className="size-3.5" /> {t('ca.authority.remove')}
        </Button>
      </div>
      <ErrorBanner error={error} onClose={() => setError(null)} />
    </div>
  )
}

/** Export de la liste de révocation (PEM ou DER). */
function CrlExport({ authority, onClose }) {
  const { run, error, setError } = useAction()
  const [saved, setSaved] = useState(null)
  const save = (format) =>
    run(async () => {
      const result = await caApi.exportFile(authority.id, null, format)
      if (result) setSaved(result.filePath)
    })
  return (
    <div className="flex flex-col gap-2 rounded-md border border-ink-800 bg-ink-950 p-3">
      <p className="text-xs text-slate-500">{t('ca.authority.crlHint')}</p>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => save('crl-pem')}>
          {t('ca.formats.crl-pem')}
        </Button>
        <Button size="sm" onClick={() => save('crl-der')}>
          {t('ca.formats.crl-der')}
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}>
          {t('ui.close')}
        </Button>
      </div>
      {saved && <p className="text-xs break-all text-emerald-300">{t('ca.export.saved', { path: saved })}</p>}
      <ErrorBanner error={error} onClose={() => setError(null)} />
    </div>
  )
}

/** Formulaire d'émission : clé générée par l'autorité, ou signature d'une demande (CSR). */
function IssueCard({ authority, onIssued }) {
  const [mode, setMode] = useStoredState('sulfur:ca:issueMode', 'generate', ['generate', 'csr'])
  const [form, setForm] = usePersistentState('ca', 'issue', DEFAULT_ISSUE)
  const [csr, setCsr] = useState('')
  const [message, setMessage] = useState(null)
  const { run, busy, error, setError } = useAction()
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const csrMode = mode === 'csr'

  const addHost = () =>
    run(async () => {
      const { hostname, ips } = await caApi.hostNames()
      const merge = (current, extra) => [...new Set([...current.split(/[\s,;]+/).filter(Boolean), ...extra])].join(', ')
      set({ dns: merge(form.dns, [hostname, 'localhost']), ips: merge(form.ips, ips) })
      if (form.profile === 'opcua' && !form.uris.trim()) set({ uris: `urn:${hostname}:Sulfur` })
    })

  const submit = () =>
    run(async () => {
      setMessage(null)
      const result = csrMode ? await caApi.sign(authority.id, { ...form, csr }) : await caApi.issue(authority.id, form)
      onIssued(result.list)
      const issued = result.list.find((a) => a.id === authority.id)?.issued.find((i) => i.serial === result.serial)
      setMessage(t('ca.issue.done', { name: issued?.certificate.commonName ?? result.serial }))
      if (csrMode) setCsr('')
    })

  const opcuaEcc = form.profile === 'opcua' && !csrMode && !form.keyAlgorithm.startsWith('rsa')
  const disabled = busy || authority.certificate.expired || (csrMode ? !csr.trim() : !form.commonName.trim())

  return (
    <Card
      id="ca.issue"
      title={t('ca.issue.title', { name: authority.certificate.commonName })}
      className="shrink-0"
      actions={
        <Tabs
          value={mode}
          onChange={setMode}
          tabs={[
            { id: 'generate', label: t('ca.issue.modes.generate') },
            { id: 'csr', label: t('ca.issue.modes.csr') }
          ]}
        />
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-4 gap-4">
          <Field label={t('ca.issue.profile')}>
            <Select value={form.profile} onChange={(e) => set({ profile: e.target.value })}>
              {PROFILES.map((p) => (
                <option key={p} value={p}>
                  {t(`ca.profiles.${p}`)}
                </option>
              ))}
            </Select>
          </Field>
          {!csrMode && (
            <>
              <Field label={t('ca.fields.commonName')}>
                <Input value={form.commonName} onChange={(e) => set({ commonName: e.target.value })} />
              </Field>
              <Field label={t('ca.fields.organization')}>
                <Input value={form.organization} onChange={(e) => set({ organization: e.target.value })} />
              </Field>
              <Field label={t('ca.fields.organizationalUnit')}>
                <Input value={form.organizationalUnit} onChange={(e) => set({ organizationalUnit: e.target.value })} />
              </Field>
            </>
          )}
          <Field label={t('ca.fields.validityDays')}>
            <Input
              type="number"
              min={1}
              value={form.validityDays}
              onChange={(e) => set({ validityDays: Number(e.target.value) })}
            />
          </Field>
          {!csrMode && (
            <Field label={t('ca.fields.keyAlgorithm')}>
              <Select value={form.keyAlgorithm} onChange={(e) => set({ keyAlgorithm: e.target.value })}>
                {KEY_ALGORITHMS.map((k) => (
                  <option key={k} value={k}>
                    {t(`ca.keyAlgorithms.${k}`)}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {form.profile === 'modbus' && (
            <Field label={t('ca.issue.role')}>
              <Input
                list="ca-modbus-roles"
                placeholder={t('ca.issue.rolePlaceholder')}
                value={form.role}
                onChange={(e) => set({ role: e.target.value })}
              />
              <datalist id="ca-modbus-roles">
                <option value="Operator" />
                <option value="Viewer" />
              </datalist>
            </Field>
          )}
        </div>
        <p className="text-xs text-slate-500">{t(`ca.profileHints.${form.profile}`)}</p>

        {csrMode && (
          <PemField
            label={t('ca.issue.csr')}
            kind="csr"
            placeholder="-----BEGIN CERTIFICATE REQUEST-----"
            value={csr}
            onChange={setCsr}
          />
        )}

        <div className="grid grid-cols-3 gap-4">
          <Field label={csrMode ? t('ca.issue.extraDns') : t('ca.issue.dns')}>
            <Input
              className="font-mono"
              placeholder="plc.local, *.example.org"
              value={form.dns}
              onChange={(e) => set({ dns: e.target.value })}
            />
          </Field>
          <Field label={csrMode ? t('ca.issue.extraIps') : t('ca.issue.ips')}>
            <Input
              className="font-mono"
              placeholder="192.168.1.10"
              value={form.ips}
              onChange={(e) => set({ ips: e.target.value })}
            />
          </Field>
          <Field label={form.profile === 'opcua' ? t('ca.issue.applicationUri') : t('ca.issue.uris')}>
            <Input
              className="font-mono"
              placeholder={form.profile === 'opcua' ? 'urn:hostname:Application' : 'urn:…'}
              value={form.uris}
              onChange={(e) => set({ uris: e.target.value })}
            />
          </Field>
        </div>
        {opcuaEcc && <p className="text-xs text-amber-300/80">{t('ca.issue.opcuaRsa')}</p>}
        {authority.certificate.expired && <p className="text-xs text-amber-300/80">{t('ca.issue.expiredAuthority')}</p>}

        <div className="flex items-center gap-3">
          <Button onClick={addHost} disabled={busy}>
            <Plus className="size-3.5" /> {t('ca.issue.addHost')}
          </Button>
          {message && <span className="text-xs text-emerald-300">{message}</span>}
          <Button variant="primary" className="ml-auto" disabled={disabled} onClick={submit}>
            <FileSignature className="size-4" />{' '}
            {busy ? t('ca.issue.issuing') : csrMode ? t('ca.issue.sign') : t('ca.issue.submit')}
          </Button>
        </div>
        <ErrorBanner error={error} onClose={() => setError(null)} />
      </div>
    </Card>
  )
}

function IssuedList({ authority, onChange, setDialog }) {
  const { run, error, setError } = useAction()
  const remove = (entry) => {
    if (!confirm(t('ca.list.confirmRemove', { name: entry.certificate.commonName }))) return
    run(async () => onChange(await caApi.remove(authority.id, entry.serial)))
  }
  const headers = [
    t('ca.fields.commonName'),
    t('ca.issue.profile'),
    t('ca.list.names'),
    t('ca.list.expires'),
    t('ui.status'),
    ''
  ]
  return (
    <Card id="ca.issued" title={t('ca.list.title', { count: authority.issued.length })} className="shrink-0">
      <ErrorBanner error={error} onClose={() => setError(null)} />
      {authority.issued.length ? (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs text-slate-500">
              {headers.map((h, i) => (
                <th key={i} className="px-2 py-1.5 font-normal">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {authority.issued.map((entry) => {
              const c = entry.certificate
              const names = [...c.dns, ...c.ips, ...c.uris]
              return (
                <tr key={entry.serial} className="border-t border-ink-800">
                  <td className="px-2 py-1.5 text-slate-200">
                    {c.commonName}
                    <div className="font-mono text-[11px] text-slate-500">{entry.serial.slice(0, 16)}…</div>
                  </td>
                  <td className="px-2 py-1.5 text-xs text-slate-400">
                    {t(`ca.profiles.${entry.profile}`, null, entry.profile)}
                    {c.role && <div className="text-slate-500">{t('ca.list.role', { role: c.role })}</div>}
                    {!entry.hasKey && entry.profile !== 'authority' && (
                      <div className="text-slate-500">{t('ca.list.fromCsr')}</div>
                    )}
                  </td>
                  <td
                    className="max-w-64 truncate px-2 py-1.5 font-mono text-xs text-slate-400"
                    title={names.join(', ')}
                  >
                    {names.join(', ') || '—'}
                  </td>
                  <td className="px-2 py-1.5 text-xs whitespace-nowrap text-slate-400">{formatDate(c.notAfter)}</td>
                  <td className="px-2 py-1.5">
                    <Badge className={STATUS_STYLES[entry.status]}>
                      {entry.revoked
                        ? t('ca.list.revokedOn', { date: formatDate(entry.revoked.date) })
                        : t(`ca.statuses.${entry.status}`)}
                    </Badge>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        title={t('ca.list.details')}
                        onClick={() => setDialog({ type: 'details', serial: entry.serial })}
                      >
                        <Eye className="size-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title={t('ca.list.export')}
                        onClick={() =>
                          setDialog({ type: 'export', serial: entry.serial, hasKey: entry.hasKey, name: c.commonName })
                        }
                      >
                        <Download className="size-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title={t('ca.list.revoke')}
                        disabled={!!entry.revoked}
                        onClick={() => setDialog({ type: 'revoke', entry })}
                      >
                        <ShieldOff className="size-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        title={entry.revoked ? t('ca.errors.revokedKept') : t('ui.remove')}
                        disabled={!!entry.revoked}
                        onClick={() => remove(entry)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-slate-600">{t('ca.list.none')}</p>
      )}
    </Card>
  )
}

export default function CaView() {
  const [authorities, setAuthorities] = useState(null)
  const [selectedId, setSelectedId] = useStoredState('sulfur:ca:authority', '')
  const [dialog, setDialog] = useState(null)
  const [error, setError] = useState(null)

  const load = () =>
    caApi
      .list()
      .then(setAuthorities)
      .catch((err) => setError(err.message))
  useEffect(() => {
    load()
  }, [])

  const selected = authorities?.find((a) => a.id === selectedId) ?? authorities?.[0] ?? null

  /** Liste mise à jour après une action ; `id` : autorité à sélectionner (null : la première). */
  const changed = (list, id) => {
    setAuthorities(list)
    if (id !== undefined) setSelectedId(id ?? '')
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-6">
      <Card
        id="ca.authorities"
        title={t('ca.authorities.title', { count: authorities?.length ?? 0 })}
        className="shrink-0"
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => caApi.openFolder().catch((e) => setError(e.message))}>
              <FolderOpen className="size-3.5" /> {t('ca.openFolder')}
            </Button>
            <Button size="sm" onClick={() => setDialog({ type: 'import' })}>
              <Import className="size-3.5" /> {t('ca.authorities.import')}
            </Button>
            <Button size="sm" variant="primary" onClick={() => setDialog({ type: 'create', parentId: '' })}>
              <Plus className="size-3.5" /> {t('ca.authorities.create')}
            </Button>
          </>
        }
      >
        <ErrorBanner error={error} onClose={() => setError(null)} />
        {!authorities ? (
          <p className="text-sm text-slate-600">{t('ui.loading')}</p>
        ) : !authorities.length ? (
          <p className="text-sm text-slate-500">{t('ca.authorities.none')}</p>
        ) : (
          <div className="grid grid-cols-[minmax(14rem,1fr)_2fr] gap-4">
            <div className="flex flex-col gap-1">
              {authorities.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  className={`flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left ${
                    selected?.id === a.id ? 'border-sulfur-500/50 bg-ink-800' : 'border-transparent hover:bg-ink-800/60'
                  } ${a.parentId ? 'ml-4' : ''}`}
                >
                  <span className="text-sm text-slate-200">{a.certificate.commonName}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                    <Badge>{authorityKind(a)}</Badge>
                    {a.imported && <Badge>{t('ca.authorities.imported')}</Badge>}
                    {a.certificate.key} · {t('ca.authorities.issuedCount', { count: a.issued.length })}
                  </span>
                </button>
              ))}
            </div>
            {selected && (
              <AuthorityDetails
                key={selected.id}
                authority={selected}
                onChange={changed}
                onCreateChild={() => setDialog({ type: 'create', parentId: selected.id })}
                setDialog={setDialog}
              />
            )}
          </div>
        )}
        {dialog?.type === 'crl' && selected && <CrlExport authority={selected} onClose={() => setDialog(null)} />}
      </Card>

      {selected && <IssueCard authority={selected} onIssued={(list) => changed(list)} />}
      {selected && <IssuedList authority={selected} onChange={changed} setDialog={setDialog} />}

      {dialog?.type === 'create' && authorities && (
        <CreateAuthorityDialog
          authorities={authorities}
          parentId={dialog.parentId}
          onClose={() => setDialog(null)}
          onCreated={({ id, list }) => {
            changed(list, id)
            setDialog(null)
          }}
        />
      )}
      {dialog?.type === 'import' && (
        <ImportAuthorityDialog
          onClose={() => setDialog(null)}
          onImported={({ id, list }) => {
            changed(list, id)
            setDialog(null)
          }}
        />
      )}
      {dialog?.type === 'export' && selected && (
        <ExportDialog
          authorityId={selected.id}
          serial={dialog.serial}
          hasKey={dialog.hasKey}
          name={dialog.name}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.type === 'details' && selected && (
        <DetailsDialog authorityId={selected.id} serial={dialog.serial} onClose={() => setDialog(null)} />
      )}
      {dialog?.type === 'revoke' && selected && (
        <RevokeDialog
          authorityId={selected.id}
          entry={dialog.entry}
          onClose={() => setDialog(null)}
          onRevoked={(list) => {
            changed(list)
            setDialog(null)
          }}
        />
      )}
    </div>
  )
}
