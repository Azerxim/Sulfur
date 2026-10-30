import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'
import { StatusDot } from '@azerxim/sulfur-sdk/ui'
import { useI18n } from '../preferences'
import { useUpdater } from '../updater'
import { useModuleActivity } from '../activity'
import { selectSettingsTab } from '../pages/SettingsPage'
// Seul le champ `version` est intégré au build (import nommé d'un fichier JSON).
import { version } from '../../../../package.json'

/** Première adresse IPv4 externe du PC (null si aucune). */
async function mainAddress() {
  const info = await window.sulfur.invoke('system:info')
  return (
    (info?.interfaces ?? []).flatMap((i) => i.addresses).find((a) => !a.internal && a.family === 'IPv4')?.address ??
    null
  )
}

/**
 * Barre d'état : modules actifs et sessions clientes, adresse IP du PC (ouvre la page Informations),
 * mise à jour disponible ou prête (ouvre l'onglet Mises à jour des paramètres) et version.
 */
export default function StatusBar({ modules, onSelect }) {
  const { t } = useI18n()
  const activity = useModuleActivity()
  const { state } = useUpdater()
  const [address, setAddress] = useState(null)

  useEffect(() => {
    mainAddress()
      .then(setAddress)
      .catch(() => {})
  }, [])

  const active = modules.filter((m) => activity(m.manifest.id).active)
  const sessions = active.reduce((n, m) => n + activity(m.manifest.id).sessions, 0)
  const update = state && ['available', 'downloading', 'downloaded'].includes(state.status)

  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-ink-800 bg-ink-900 px-4 text-xs text-slate-400">
      <StatusDot on={active.length > 0} label={t('app.statusBar.active', { count: active.length })} />
      {sessions > 0 && <span>{t('app.statusBar.sessions', { count: sessions })}</span>}
      {address && (
        <button
          onClick={() => onSelect('info')}
          title={t('info.ips')}
          className="font-mono text-[11px] hover:text-slate-200"
        >
          {address}
        </button>
      )}
      <span className="flex-1" />
      {update && (
        <button
          onClick={() => {
            selectSettingsTab('updates')
            onSelect('settings')
          }}
          className="inline-flex items-center gap-1.5 text-sulfur-300 hover:text-sulfur-200"
        >
          <Download className="size-3.5" />
          {t(state.status === 'downloaded' ? 'app.updateReady' : 'app.updateAvailable', { version: state.version })}
        </button>
      )}
      <span className="font-mono text-[11px] text-slate-500">v{version}</span>
    </footer>
  )
}
