import { useState } from 'react'
import { Radar, ShieldCheck } from 'lucide-react'
import { Button, Checkbox, Field, Input, Select } from '@renderer/components/ui'
import { DEFAULT_CLIENT_SECURITY, SECURITY_MODES, SECURITY_POLICIES } from '../shared/constants'
import { opcuaApi } from './api'
import CertificatesDialog from './CertificatesDialog'

const policyLabel = (p) => SECURITY_POLICIES[p] ?? p

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
        <Field label="Mode de sécurité">
          <Select
            value={security.mode}
            disabled={locked}
            onChange={(e) => {
              const mode = e.target.value
              set({ mode, policy: mode === 'None' ? 'None' : security.policy === 'None' ? 'Basic256Sha256' : security.policy })
            }}
          >
            {Object.entries(SECURITY_MODES).map(([m, label]) => (
              <option key={m} value={m}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Politique">
          <Select value={secure ? security.policy : 'None'} disabled={locked || !secure} onChange={(e) => set({ policy: e.target.value })}>
            {!secure && <option value="None">None</option>}
            {Object.entries(SECURITY_POLICIES).map(([p, label]) => (
              <option key={p} value={p}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Authentification">
          <Select value={security.auth} disabled={locked} onChange={(e) => set({ auth: e.target.value })}>
            <option value="anonymous">Anonyme</option>
            <option value="username">Identifiant / mot de passe</option>
          </Select>
        </Field>
        <Field label="Identifiant">
          <Input
            value={security.username}
            disabled={locked || security.auth !== 'username'}
            onChange={(e) => set({ username: e.target.value })}
          />
        </Field>
        <Field label="Mot de passe">
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
          label="Accepter automatiquement le certificat du serveur"
          disabled={locked}
          checked={security.autoAcceptCertificates}
          onChange={(e) => set({ autoAcceptCertificates: e.target.checked })}
        />
        <div className="ml-auto flex gap-2">
          <Button size="sm" disabled={!endpoint || discovering} onClick={discover}>
            <Radar className="size-3.5" /> {discovering ? 'Découverte…' : 'Découvrir les endpoints'}
          </Button>
          <Button size="sm" onClick={() => setCertsOpen(true)}>
            <ShieldCheck className="size-3.5" /> Certificats
          </Button>
        </div>
      </div>

      {endpoints && (
        <div className="rounded-md border border-ink-800">
          <div className="flex items-center justify-between border-b border-ink-800 px-3 py-1.5 text-xs text-slate-400">
            Endpoints proposés par le serveur ({endpoints.length})
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
                    <td className="px-3 py-1.5 text-slate-200">{SECURITY_MODES[e.mode] ?? e.mode}</td>
                    <td className="px-3 py-1.5 font-mono text-[13px] text-slate-300">{policyLabel(e.policy)}</td>
                    <td className="px-3 py-1.5 text-xs text-slate-500">{e.userTokens.join(', ')}</td>
                    <td className="px-3 py-1.5 text-xs text-slate-500">niveau {e.securityLevel}</td>
                    <td className="px-2 py-1 text-right">
                      <Button
                        size="sm"
                        variant={current ? 'ghost' : 'secondary'}
                        disabled={locked || current}
                        onClick={() => set({ mode: e.mode, policy: e.policy })}
                      >
                        {current ? 'Sélectionné' : 'Utiliser'}
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {certsOpen && <CertificatesDialog which="client" onClose={() => setCertsOpen(false)} />}
    </div>
  )
}
