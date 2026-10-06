import { useEffect, useState } from 'react'
import { Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { Button, Card, Checkbox, Field, Input, Select } from '@renderer/components/ui'
import CertificatesDialog from '@renderer/components/CertificatesDialog'
import { DEFAULT_SERVER_SECURITY } from '../shared/constants'
import { certStore } from './api'

const serverCerts = certStore('server')

function Section({ title, hint, children }) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <h3 className="text-xs font-medium tracking-wide text-slate-500 uppercase">{title}</h3>
        {hint && <p className="text-[11px] text-slate-600">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

/** Problèmes empêchant le démarrage du serveur avec cette configuration de sécurité. */
export function securityProblems(value) {
  const s = { ...DEFAULT_SERVER_SECURITY, ...value }
  const names = s.roles.map((r) => r.name.trim())
  return [
    s.mode === 'tls' && !s.roles.length && 'définissez au moins un rôle',
    names.some((n) => !n) && 'un rôle n\'a pas de nom',
    new Set(names).size !== names.length && 'deux rôles portent le même nom',
    s.defaultRole && !names.includes(s.defaultRole) && 'le rôle par défaut n\'existe plus'
  ].filter(Boolean)
}

/** Paramétrage de la sécurité du serveur Modbus (appliqué au démarrage). */
export default function ServerSecurity({ value, onChange, locked }) {
  const security = { ...DEFAULT_SERVER_SECURITY, ...value }
  const [certsOpen, setCertsOpen] = useState(false)
  const ipsText = security.allowedIps.join('\n')
  const [ipsDraft, setIpsDraft] = useState(ipsText)
  useEffect(() => setIpsDraft(ipsText), [ipsText])
  const set = (patch) => onChange({ ...security, ...patch })
  const setRole = (i, patch) => set({ roles: security.roles.map((r, j) => (j === i ? { ...r, ...patch } : r)) })
  const tlsMode = security.mode === 'tls'
  const problems = securityProblems(security)

  return (
    <Card
      id="modbus.server.security"
      title="Sécurité"
      className="shrink-0"
      actions={
        <>
          {locked && <span className="text-xs text-slate-500">Modifiable serveur arrêté</span>}
          <Button size="sm" onClick={() => setCertsOpen(true)}>
            <ShieldCheck className="size-3.5" /> Certificats
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-6">
        <Section title="Transport" hint="Modbus/TCP Security : TLS ≥ 1.2 avec authentification mutuelle par certificats.">
          <Select value={security.mode} disabled={locked} onChange={(e) => set({ mode: e.target.value })}>
            <option value="tcp">Modbus TCP (non chiffré)</option>
            <option value="tls">Modbus/TCP Security (TLS)</option>
          </Select>
          <Field label="Version TLS minimale">
            <Select
              value={security.minTlsVersion}
              disabled={locked || !tlsMode}
              onChange={(e) => set({ minTlsVersion: e.target.value })}
            >
              <option value="TLSv1.2">TLS 1.2</option>
              <option value="TLSv1.3">TLS 1.3</option>
            </Select>
          </Field>
          <Checkbox
            label="Exiger un certificat client"
            disabled={locked || !tlsMode}
            checked={security.requireClientCertificate}
            onChange={(e) => set({ requireClientCertificate: e.target.checked })}
          />
          <Checkbox
            label="Accepter automatiquement les certificats inconnus"
            disabled={locked || !tlsMode}
            checked={security.autoAcceptCertificates}
            onChange={(e) => set({ autoAcceptCertificates: e.target.checked })}
          />
        </Section>

        <Section title="Rôles (TLS)" hint="Rôle lu dans le certificat client (OID 1.3.6.1.4.1.50316.802.1).">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="pb-1 font-medium">Rôle</th>
                <th className="pb-1 text-center font-medium">Lecture</th>
                <th className="pb-1 text-center font-medium">Écriture</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {security.roles.map((r, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2">
                    <Input value={r.name} disabled={locked || !tlsMode} onChange={(e) => setRole(i, { name: e.target.value })} />
                  </td>
                  {['read', 'write'].map((k) => (
                    <td key={k} className="text-center">
                      <input
                        type="checkbox"
                        className="size-4 accent-sulfur-400"
                        disabled={locked || !tlsMode}
                        checked={!!r[k]}
                        onChange={(e) => setRole(i, { [k]: e.target.checked })}
                      />
                    </td>
                  ))}
                  <td className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Supprimer"
                      disabled={locked || !tlsMode}
                      onClick={() => set({ roles: security.roles.filter((_, j) => j !== i) })}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-end gap-2">
            <Field label="Certificat sans rôle / rôle inconnu" className="flex-1">
              <Select value={security.defaultRole} disabled={locked || !tlsMode} onChange={(e) => set({ defaultRole: e.target.value })}>
                <option value="">Refuser la connexion</option>
                {security.roles
                  .filter((r) => r.name.trim())
                  .map((r) => (
                    <option key={r.name} value={r.name}>
                      Appliquer le rôle {r.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Button
              size="sm"
              className="mb-1"
              disabled={locked || !tlsMode}
              onClick={() => set({ roles: [...security.roles, { name: `Role${security.roles.length + 1}`, read: true, write: false }] })}
            >
              <Plus className="size-3.5" /> Rôle
            </Button>
          </div>
        </Section>

        <Section title="Contrôle d'accès" hint="S'applique en TCP comme en TLS.">
          <Field label="Adresses autorisées (une par ligne, CIDR accepté — vide = toutes)">
            <textarea
              rows={3}
              placeholder={'192.168.1.0/24\n10.0.0.5\n::1'}
              className="w-full rounded-md border border-ink-700 bg-ink-950 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-600 focus:border-sulfur-500 focus:outline-none disabled:opacity-50"
              value={ipsDraft}
              disabled={locked}
              onChange={(e) => setIpsDraft(e.target.value)}
              onBlur={() => set({ allowedIps: ipsDraft.split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean) })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Connexions max. (0 = ∞)">
              <Input
                type="number"
                min={0}
                value={security.maxConnections}
                disabled={locked}
                onChange={(e) => set({ maxConnections: Number(e.target.value) })}
              />
            </Field>
            <Field label="Requêtes/s par client (0 = ∞)">
              <Input
                type="number"
                min={0}
                value={security.maxRequestsPerSecond}
                disabled={locked}
                onChange={(e) => set({ maxRequestsPerSecond: Number(e.target.value) })}
              />
            </Field>
          </div>
          <Checkbox
            label="Lecture seule (toute écriture refusée)"
            disabled={locked}
            checked={security.readOnly}
            onChange={(e) => set({ readOnly: e.target.checked })}
          />
        </Section>
      </div>

      {problems.length > 0 && <p className="mt-3 text-xs text-amber-300">Configuration incomplète : {problems.join(' · ')}.</p>}
      {!tlsMode && (
        <p className="mt-3 text-xs text-slate-500">
          En Modbus TCP non chiffré, aucun client n'est authentifié : seuls le contrôle d'accès et la lecture seule s'appliquent.
        </p>
      )}
      {certsOpen && <CertificatesDialog title="Certificats du serveur Modbus" api={serverCerts} onClose={() => setCertsOpen(false)} />}
    </Card>
  )
}
