import { useState } from 'react'
import { Eye, EyeOff, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { Button, Card, Checkbox, Input } from '@renderer/components/ui'
import { DEFAULT_SERVER_SECURITY, SECURITY_MODES, SECURITY_POLICIES } from '../shared/constants'
import CertificatesDialog from './CertificatesDialog'

const toggle = (list, item, on) => (on ? [...new Set([...list, item])] : list.filter((x) => x !== item))

function Section({ title, children }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-medium tracking-wide text-slate-500 uppercase">{title}</h3>
      {children}
    </div>
  )
}

/** Paramétrage de la sécurité du serveur (appliqué au démarrage). */
export default function ServerSecurity({ value, onChange, locked }) {
  const security = { ...DEFAULT_SERVER_SECURITY, ...value }
  const [showPasswords, setShowPasswords] = useState(false)
  const [certsOpen, setCertsOpen] = useState(false)
  const set = (patch) => onChange({ ...security, ...patch })
  const setUser = (i, patch) => set({ users: security.users.map((u, j) => (j === i ? { ...u, ...patch } : u)) })

  const secureModes = security.modes.some((m) => m !== 'None')
  const problems = [
    !security.modes.length && 'au moins un mode de sécurité est requis',
    secureModes && !security.policies.length && 'les modes signés nécessitent au moins une politique',
    !security.allowAnonymous && !security.users.length && 'autorisez l\'accès anonyme ou ajoutez un utilisateur'
  ].filter(Boolean)

  return (
    <Card
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
      <div className="grid grid-cols-[1fr_1.3fr_2fr] gap-6">
        <Section title="Modes">
          {Object.entries(SECURITY_MODES).map(([mode, label]) => (
            <Checkbox
              key={mode}
              label={label}
              disabled={locked}
              checked={security.modes.includes(mode)}
              onChange={(e) => set({ modes: toggle(security.modes, mode, e.target.checked) })}
            />
          ))}
          <Checkbox
            className="mt-2"
            label="Accepter automatiquement les certificats inconnus"
            disabled={locked}
            checked={security.autoAcceptCertificates}
            onChange={(e) => set({ autoAcceptCertificates: e.target.checked })}
          />
        </Section>

        <Section title="Politiques (modes signés)">
          {Object.entries(SECURITY_POLICIES).map(([policy, label]) => (
            <Checkbox
              key={policy}
              label={label}
              disabled={locked || !secureModes}
              checked={security.policies.includes(policy)}
              onChange={(e) => set({ policies: toggle(security.policies, policy, e.target.checked) })}
            />
          ))}
        </Section>

        <Section title="Authentification">
          <Checkbox
            label="Accès anonyme autorisé"
            disabled={locked}
            checked={security.allowAnonymous}
            onChange={(e) => set({ allowAnonymous: e.target.checked })}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">Utilisateurs ({security.users.length})</span>
            <div className="flex gap-1">
              <Button
                size="icon"
                variant="ghost"
                title={showPasswords ? 'Masquer les mots de passe' : 'Afficher les mots de passe'}
                onClick={() => setShowPasswords((s) => !s)}
              >
                {showPasswords ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              </Button>
              <Button
                size="sm"
                disabled={locked}
                onClick={() => set({ users: [...security.users, { username: `user${security.users.length + 1}`, password: '' }] })}
              >
                <Plus className="size-3.5" /> Utilisateur
              </Button>
            </div>
          </div>
          {security.users.map((u, i) => (
            <div key={i} className="flex gap-2">
              <Input
                placeholder="Identifiant"
                value={u.username}
                disabled={locked}
                onChange={(e) => setUser(i, { username: e.target.value })}
              />
              <Input
                placeholder="Mot de passe"
                type={showPasswords ? 'text' : 'password'}
                value={u.password}
                disabled={locked}
                onChange={(e) => setUser(i, { password: e.target.value })}
              />
              <Button
                variant="ghost"
                size="icon"
                className="mt-1"
                disabled={locked}
                title="Supprimer"
                onClick={() => set({ users: security.users.filter((_, j) => j !== i) })}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </Section>
      </div>

      {problems.length > 0 && (
        <p className="mt-3 text-xs text-amber-300">Configuration incomplète : {problems.join(' · ')}.</p>
      )}
      {certsOpen && <CertificatesDialog which="server" onClose={() => setCertsOpen(false)} />}
    </Card>
  )
}

/** Vrai si la configuration de sécurité permet de démarrer le serveur. */
export function isSecurityValid(value) {
  const s = { ...DEFAULT_SERVER_SECURITY, ...value }
  const secureModes = s.modes.some((m) => m !== 'None')
  return s.modes.length > 0 && (!secureModes || s.policies.length > 0) && (s.allowAnonymous || s.users.length > 0)
}
