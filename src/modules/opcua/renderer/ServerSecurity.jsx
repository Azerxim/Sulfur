import { useState } from 'react'
import { KeyRound, Plus, ShieldCheck, Trash2 } from 'lucide-react'
import { Button, Card, Checkbox, Input } from '@renderer/components/ui'
import { DEFAULT_SERVER_SECURITY, DEPRECATED_POLICIES, SECURITY_MODES, SECURITY_POLICIES } from '../shared/constants'
import CertificatesDialog from '@renderer/components/CertificatesDialog'
import { certStore, opcuaApi } from './api'
import { t } from '../shared/i18n'

const serverCerts = certStore('server')

export const policyLabel = (p) =>
  DEPRECATED_POLICIES.includes(p) ? t('opcua.deprecated', { name: SECURITY_POLICIES[p] }) : (SECURITY_POLICIES[p] ?? p)
const toggle = (list, item, on) => (on ? [...new Set([...list, item])] : list.filter((x) => x !== item))

/**
 * Saisie d'un mot de passe : à la sortie du champ (ou Entrée), il est haché par le process principal
 * et seule l'empreinte est conservée — le champ est ensuite vidé.
 */
function PasswordField({ hasPassword, disabled, onHash, onError }) {
  const [draft, setDraft] = useState('')
  const [hashing, setHashing] = useState(false)

  async function commit() {
    if (!draft) return
    setHashing(true)
    try {
      onHash(await opcuaApi.security.hashPassword(draft))
      setDraft('')
    } catch (err) {
      onError(err.message)
    } finally {
      setHashing(false)
    }
  }

  return (
    <div className="relative flex-1">
      <Input
        type="password"
        autoComplete="new-password"
        placeholder={hasPassword ? t('opcua.security.passwordSet') : t('opcua.security.passwordRequired')}
        className={`pr-8 ${!hasPassword && !draft ? 'border-amber-500/60' : ''}`}
        value={draft}
        disabled={disabled || hashing}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      {hasPassword && !draft && (
        <KeyRound className="pointer-events-none absolute top-2.5 right-2.5 size-4 text-emerald-400/70" />
      )}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-medium tracking-wide text-slate-500 uppercase">{title}</h3>
      {children}
    </div>
  )
}

/** Paramétrage de la sécurité du serveur (appliqué au démarrage). */
export default function ServerSecurity({ value, onChange, locked, onError }) {
  const security = { ...DEFAULT_SERVER_SECURITY, ...value }
  const [certsOpen, setCertsOpen] = useState(false)
  const set = (patch) => onChange({ ...security, ...patch })
  const setUser = (i, patch) => set({ users: security.users.map((u, j) => (j === i ? { ...u, ...patch } : u)) })

  const secureModes = security.modes.some((m) => m !== 'None')
  const problems = [
    !security.modes.length && t('opcua.security.problems.noMode'),
    secureModes && !security.policies.length && t('opcua.security.problems.noPolicy'),
    !security.allowAnonymous && !security.users.length && t('opcua.security.problems.noAuth'),
    security.users.some((u) => !u.username.trim() || !u.passwordHash) && t('opcua.security.problems.incompleteUser')
  ].filter(Boolean)

  return (
    <Card
      id="opcua.server.security"
      title={t('ui.security')}
      className="shrink-0"
      actions={
        <>
          {locked && <span className="text-xs text-slate-500">{t('ui.lockedWhileRunning')}</span>}
          <Button size="sm" onClick={() => setCertsOpen(true)}>
            <ShieldCheck className="size-3.5" /> {t('ui.certificates')}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-[1fr_1.3fr_2fr] gap-6">
        <Section title={t('opcua.security.modes')}>
          {Object.keys(SECURITY_MODES).map((mode) => (
            <Checkbox
              key={mode}
              label={t(`opcua.securityModes.${mode}`)}
              disabled={locked}
              checked={security.modes.includes(mode)}
              onChange={(e) => set({ modes: toggle(security.modes, mode, e.target.checked) })}
            />
          ))}
          <Checkbox
            className="mt-2"
            label={t('ui.autoAcceptUnknownCerts')}
            disabled={locked}
            checked={security.autoAcceptCertificates}
            onChange={(e) => set({ autoAcceptCertificates: e.target.checked })}
          />
        </Section>

        <Section title={t('opcua.security.policies')}>
          {Object.keys(SECURITY_POLICIES).map((policy) => (
            <Checkbox
              key={policy}
              label={policyLabel(policy)}
              disabled={locked || !secureModes}
              checked={security.policies.includes(policy)}
              onChange={(e) => set({ policies: toggle(security.policies, policy, e.target.checked) })}
            />
          ))}
        </Section>

        <Section title={t('opcua.security.auth')}>
          <Checkbox
            label={t('opcua.security.anonymous')}
            disabled={locked}
            checked={security.allowAnonymous}
            onChange={(e) => set({ allowAnonymous: e.target.checked })}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {t('opcua.security.users', { count: security.users.length })}
            </span>
            <Button
              size="sm"
              disabled={locked}
              onClick={() =>
                set({
                  users: [...security.users, { username: `user${security.users.length + 1}`, passwordHash: null }]
                })
              }
            >
              <Plus className="size-3.5" /> {t('opcua.security.user')}
            </Button>
          </div>
          {security.users.map((u, i) => (
            <div key={i} className="flex gap-2">
              <Input
                placeholder={t('opcua.security.username')}
                className="flex-1"
                value={u.username}
                disabled={locked}
                onChange={(e) => setUser(i, { username: e.target.value })}
              />
              <PasswordField
                hasPassword={!!u.passwordHash}
                disabled={locked}
                onHash={(passwordHash) => setUser(i, { passwordHash })}
                onError={onError}
              />
              <Button
                variant="ghost"
                size="icon"
                className="mt-1"
                disabled={locked}
                title={t('ui.remove')}
                onClick={() => set({ users: security.users.filter((_, j) => j !== i) })}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
          <p className="text-[11px] text-slate-500">{t('opcua.security.hashedHint')}</p>
        </Section>
      </div>

      {problems.length > 0 && (
        <p className="mt-3 text-xs text-amber-300">{t('ui.incomplete', { problems: problems.join(' · ') })}</p>
      )}
      {certsOpen && (
        <CertificatesDialog
          t={t}
          title={t('opcua.server.certsTitle')}
          api={serverCerts}
          onClose={() => setCertsOpen(false)}
        />
      )}
    </Card>
  )
}

/** Vrai si la configuration de sécurité permet de démarrer le serveur. */
export function isSecurityValid(value) {
  const s = { ...DEFAULT_SERVER_SECURITY, ...value }
  const secureModes = s.modes.some((m) => m !== 'None')
  return (
    s.modes.length > 0 &&
    (!secureModes || s.policies.length > 0) &&
    (s.allowAnonymous || s.users.length > 0) &&
    s.users.every((u) => u.username.trim() && u.passwordHash)
  )
}
