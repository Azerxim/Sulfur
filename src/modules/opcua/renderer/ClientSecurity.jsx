import { useState } from 'react'
import { Radar, ShieldCheck } from 'lucide-react'
import { Button, Checkbox, Field, Input, Select } from '@renderer/components/ui'
import { DEFAULT_CLIENT_SECURITY, SECURITY_MODES, SECURITY_POLICIES } from '../shared/constants'
import { certStore, opcuaApi } from './api'
import CertificatesDialog from '@renderer/components/CertificatesDialog'
import { policyLabel } from './ServerSecurity'
import { t } from '../shared/i18n'

const clientCerts = certStore('client')

/** Paramètres de sécurité de la connexion client + découverte des endpoints du serveur. */
export default function ClientSecurity({ value, onChange, endpoint, locked, onError }) {
  const security = { ...DEFAULT_CLIENT_SECURITY, ...value }
  const [endpoints, setEndpoints] = useState(null)
  const [discovering, setDiscovering] = useState(false)
  const [certsOpen, setCertsOpen] = useState(false)
  const set = (patch) => onChange({ ...security, ...patch })
  const secure = security.mode !== 'None'

  async function discover() {
    setDiscovering(true)
    try {
      setEndpoints(await opcuaApi.client.discover(endpoint))
    } catch (err) {
      onError(err.message)
    } finally {
      setDiscovering(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[1fr_1.2fr_1fr_1fr_1fr] items-end gap-3">
        <Field label={t('opcua.client.mode')}>
          <Select
            value={security.mode}
            disabled={locked}
            onChange={(e) => {
              const mode = e.target.value
              set({ mode, policy: mode === 'None' ? 'None' : security.policy === 'None' ? 'Basic256Sha256' : security.policy })
            }}
          >
            {Object.keys(SECURITY_MODES).map((m) => (
              <option key={m} value={m}>
                {t(`opcua.securityModes.${m}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('opcua.client.policy')}>
          <Select value={secure ? security.policy : 'None'} disabled={locked || !secure} onChange={(e) => set({ policy: e.target.value })}>
            {!secure && <option value="None">None</option>}
            {Object.keys(SECURITY_POLICIES).map((p) => (
              <option key={p} value={p}>
                {policyLabel(p)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('opcua.client.auth')}>
          <Select value={security.auth} disabled={locked} onChange={(e) => set({ auth: e.target.value })}>
            <option value="anonymous">{t('opcua.client.anonymous')}</option>
            <option value="username">{t('opcua.client.usernamePassword')}</option>
          </Select>
        </Field>
        <Field label={t('opcua.client.username')}>
          <Input
            value={security.username}
            disabled={locked || security.auth !== 'username'}
            onChange={(e) => set({ username: e.target.value })}
          />
        </Field>
        <Field label={t('opcua.client.password')}>
          <Input
            type="password"
            value={security.password}
            disabled={locked || security.auth !== 'username'}
            onChange={(e) => set({ password: e.target.value })}
          />
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <Checkbox
          label={t('ui.autoAcceptServerCert')}
          disabled={locked}
          checked={security.autoAcceptCertificates}
          onChange={(e) => set({ autoAcceptCertificates: e.target.checked })}
        />
        <div className="ml-auto flex gap-2">
          <Button size="sm" disabled={!endpoint || discovering} onClick={discover}>
            <Radar className="size-3.5" /> {discovering ? t('opcua.client.discovering') : t('opcua.client.discover')}
          </Button>
          <Button size="sm" onClick={() => setCertsOpen(true)}>
            <ShieldCheck className="size-3.5" /> {t('ui.certificates')}
          </Button>
        </div>
      </div>

      {endpoints && (
        <div className="rounded-md border border-ink-800">
          <div className="flex items-center justify-between border-b border-ink-800 px-3 py-1.5 text-xs text-slate-400">
            {t('opcua.client.endpoints', { count: endpoints.length })}
            <button className="text-slate-500 hover:text-slate-200" onClick={() => setEndpoints(null)}>
              ✕
            </button>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {endpoints.map((e, i) => {
                const current = e.mode === security.mode && (e.mode === 'None' || e.policy === security.policy)
                return (
                  <tr key={i} className="border-t border-ink-800 first:border-t-0">
                    <td className="px-3 py-1.5 text-slate-200">{t(`opcua.securityModes.${e.mode}`, null, e.mode)}</td>
                    <td className="px-3 py-1.5 font-mono text-[13px] text-slate-300">{policyLabel(e.policy)}</td>
                    <td className="px-3 py-1.5 text-xs text-slate-500">{e.userTokens.join(', ')}</td>
                    <td className="px-3 py-1.5 text-xs text-slate-500">{t('opcua.client.level', { level: e.securityLevel })}</td>
                    <td className="px-2 py-1 text-right">
                      <Button
                        size="sm"
                        variant={current ? 'ghost' : 'secondary'}
                        disabled={locked || current}
                        onClick={() => set({ mode: e.mode, policy: e.policy })}
                      >
                        {current ? t('opcua.client.selected') : t('opcua.client.use')}
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {certsOpen && <CertificatesDialog t={t} title={t('opcua.client.certsTitle')} api={clientCerts} onClose={() => setCertsOpen(false)} />}
    </div>
  )
}
