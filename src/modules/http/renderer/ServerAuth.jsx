import { useState } from 'react'
import { KeyRound, Plus, RefreshCw, X } from 'lucide-react'
import { Button, Card, Field, Input, Select } from '@renderer/components/ui'
import { AUTH_TYPES, DEFAULT_SERVER_AUTH } from '../shared/constants'
import { httpApi } from './api'
import { t } from '../shared/i18n'

/** Secret aléatoire (jeton Bearer, clé d'API) : 32 octets en hexadécimal. */
const randomSecret = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('')

/** Mot de passe d'un utilisateur : saisi puis haché aussitôt (seule l'empreinte est conservée). */
function PasswordField({ hasHash, disabled, onHash, onError }) {
  const [draft, setDraft] = useState('')
  const commit = async () => {
    if (!draft) return
    try {
      onHash(await httpApi.server.hashPassword(draft))
      setDraft('')
    } catch (err) {
      onError(err.message)
    }
  }
  return (
    <Input
      type="password"
      autoComplete="new-password"
      placeholder={hasHash ? t('http.auth.passwordSet') : t('http.auth.password')}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  )
}

/** Authentification du serveur : aucune, Basic (utilisateurs), Bearer ou clé d'API. */
export default function ServerAuth({ value, locked, onChange, onError }) {
  const auth = { ...DEFAULT_SERVER_AUTH, ...value }
  const set = (patch) => onChange({ ...auth, ...patch })
  const setUser = (i, patch) => set({ users: auth.users.map((u, j) => (j === i ? { ...u, ...patch } : u)) })

  return (
    <Card id="http.server.auth" title={t('http.auth.title')} className="shrink-0" defaultCollapsed>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-[14rem_minmax(0,1fr)] items-end gap-3">
          <Field label={t('http.auth.type')}>
            <Select value={auth.type} disabled={locked} onChange={(e) => set({ type: e.target.value })}>
              {AUTH_TYPES.map((type) => (
                <option key={type} value={type}>
                  {t(`http.auth.types.${type}`)}
                </option>
              ))}
            </Select>
          </Field>
          <p className="mb-2 text-xs text-slate-500">{t(`http.auth.hints.${auth.type}`)}</p>
        </div>

        {auth.type === 'basic' && (
          <div className="flex flex-col gap-1.5">
            {auth.users.map((u, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-1.5">
                <Input
                  placeholder={t('http.auth.username')}
                  value={u.username ?? ''}
                  disabled={locked}
                  onChange={(e) => setUser(i, { username: e.target.value })}
                />
                <PasswordField
                  hasHash={!!u.passwordHash}
                  disabled={locked}
                  onHash={(passwordHash) => setUser(i, { passwordHash })}
                  onError={onError}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="mt-1"
                  title={t('ui.remove2')}
                  disabled={locked}
                  onClick={() => set({ users: auth.users.filter((_, j) => j !== i) })}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              className="self-start"
              disabled={locked}
              onClick={() => set({ users: [...auth.users, { username: '', passwordHash: '' }] })}
            >
              <Plus className="size-3.5" /> {t('http.auth.addUser')}
            </Button>
          </div>
        )}

        {auth.type === 'bearer' && (
          <Field label={t('http.auth.token')}>
            <div className="flex gap-2">
              <Input
                className="font-mono"
                value={auth.token}
                disabled={locked}
                onChange={(e) => set({ token: e.target.value })}
              />
              <Button disabled={locked} title={t('http.auth.generate')} onClick={() => set({ token: randomSecret() })}>
                <RefreshCw className="size-3.5" /> {t('http.auth.generate')}
              </Button>
            </div>
          </Field>
        )}

        {auth.type === 'apiKey' && (
          <div className="grid grid-cols-[14rem_minmax(0,1fr)] gap-3">
            <Field label={t('http.auth.headerName')}>
              <Input
                className="font-mono"
                value={auth.headerName}
                disabled={locked}
                onChange={(e) => set({ headerName: e.target.value })}
              />
            </Field>
            <Field label={t('http.auth.apiKey')}>
              <div className="flex gap-2">
                <Input
                  className="font-mono"
                  value={auth.apiKey}
                  disabled={locked}
                  onChange={(e) => set({ apiKey: e.target.value })}
                />
                <Button disabled={locked} onClick={() => set({ apiKey: randomSecret() })}>
                  <KeyRound className="size-3.5" /> {t('http.auth.generate')}
                </Button>
              </div>
            </Field>
          </div>
        )}
        {locked && <p className="text-xs text-slate-500">{t('ui.lockedWhileRunning')}</p>}
      </div>
    </Card>
  )
}
