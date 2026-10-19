import { useState } from 'react'
import { Check, Download, ExternalLink, Monitor, Moon, RefreshCw, RotateCcw, Sun, Upload } from 'lucide-react'
import { LANGUAGES } from '@shared/languages'
import { Button, Card, Checkbox, ErrorBanner, Select } from '../components/ui'
import { exportConfigurations, importConfigurations } from '../module-config'
import { rendererModules } from '../modules'
import { appPages } from '../pages'
import { THEMES, useI18n, useManifestText, usePreferences } from '../preferences'
import { useUpdater } from '../updater'

const THEME_ICONS = { dark: Moon, light: Sun, system: Monitor }

function Choice({ selected, onClick, icon: Icon, title, subtitle }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={`flex min-w-48 flex-1 items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
        selected ? 'border-sulfur-400 bg-sulfur-400/10' : 'border-ink-700 hover:border-ink-600 hover:bg-ink-850'
      }`}
    >
      {Icon && <Icon className={`size-5 shrink-0 ${selected ? 'text-sulfur-400' : 'text-slate-500'}`} />}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-slate-100">{title}</span>
        {subtitle && <span className="block text-xs text-slate-500">{subtitle}</span>}
      </span>
      {selected && <Check className="size-4 shrink-0 text-sulfur-400" />}
    </button>
  )
}

/** Export / import de la configuration de tous les modules (banc de test). */
function ConfigurationsCard() {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  async function run(action, describe) {
    setBusy(true)
    setMessage(null)
    setError(null)
    try {
      const result = await action()
      if (result) setMessage(describe(result))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const exportAll = () =>
    run(exportConfigurations, ({ filePath }) => [t('settings.configurations.exported', { path: filePath })])
  const importAll = () =>
    run(importConfigurations, ({ filePath, ignored }) => [
      t('settings.configurations.imported', { path: filePath }),
      ignored.length > 0 && t('settings.configurations.ignored', { modules: ignored.join(', ') })
    ])

  return (
    <Card id="settings.configurations" title={t('settings.configurations.title')}>
      <p className="mb-3 text-xs text-slate-500">{t('settings.configurations.hint')}</p>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={exportAll}>
            <Download className="size-4" /> {t('settings.configurations.export')}
          </Button>
          <Button disabled={busy} onClick={importAll}>
            <Upload className="size-4" /> {t('settings.configurations.import')}
          </Button>
        </div>
        {message?.filter(Boolean).map((line) => (
          <p key={line} className="text-sm break-all text-emerald-300">
            {line}
          </p>
        ))}
        <ErrorBanner error={error} onClose={() => setError(null)} />
      </div>
    </Card>
  )
}

/** Mises à jour depuis les releases GitHub : recherche automatique (désactivable), téléchargement, installation. */
function UpdatesCard() {
  const { t, locale } = useI18n()
  const { state, check, download, install, openReleases, setAutoCheck } = useUpdater()
  if (!state) return null
  const { supported, canInstall, status } = state
  const busy = ['checking', 'downloading'].includes(status)

  return (
    <Card id="settings.updates" title={t('settings.updates.title')}>
      <p className="mb-3 text-xs text-slate-500">{t('settings.updates.hint')}</p>
      <div className="flex flex-col gap-3">
        <div>
          <Checkbox
            label={t('settings.updates.autoCheck')}
            checked={state.autoCheck}
            disabled={!supported}
            onChange={(e) => setAutoCheck(e.target.checked)}
          />
          <p className="ml-6 text-xs text-slate-500">{t('settings.updates.autoCheckHint')}</p>
        </div>

        <p className="text-sm text-slate-300">{t('settings.updates.current', { version: state.currentVersion })}</p>

        {!supported && <p className="text-sm text-slate-500">{t('settings.updates.unsupported')}</p>}
        {status === 'checking' && <p className="text-sm text-slate-400">{t('settings.updates.checking')}</p>}
        {status === 'not-available' && state.checkedAt && (
          <p className="text-sm text-emerald-300">
            {t('settings.updates.upToDate', { time: new Date(state.checkedAt).toLocaleString(locale) })}
          </p>
        )}
        {status === 'available' && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-sulfur-300">{t('settings.updates.available', { version: state.version })}</p>
            {!canInstall && <p className="text-xs text-slate-500">{t('settings.updates.macHint')}</p>}
          </div>
        )}
        {status === 'downloading' && (
          <p className="text-sm text-slate-300">
            {t('settings.updates.downloading', { progress: state.progress ?? 0 })}
          </p>
        )}
        {status === 'downloaded' && (
          <div>
            <p className="text-sm text-emerald-300">{t('settings.updates.downloaded', { version: state.version })}</p>
            <p className="text-xs text-slate-500">{t('settings.updates.downloadedHint')}</p>
          </div>
        )}
        {status === 'error' && <ErrorBanner error={state.error} />}

        <div className="flex flex-wrap gap-2">
          {status === 'available' && (
            <Button variant="primary" onClick={download}>
              {canInstall ? <Download className="size-4" /> : <ExternalLink className="size-4" />}
              {canInstall ? t('settings.updates.download') : t('settings.updates.openDownload')}
            </Button>
          )}
          {status === 'downloaded' && (
            <Button variant="primary" onClick={install}>
              <RotateCcw className="size-4" /> {t('settings.updates.install')}
            </Button>
          )}
          {['available', 'downloading', 'downloaded'].includes(status) && (
            <Button onClick={openReleases}>
              <ExternalLink className="size-4" /> {t('settings.updates.releaseNotes')}
            </Button>
          )}
          {supported && !['available', 'downloading', 'downloaded'].includes(status) && (
            <Button disabled={busy} onClick={check}>
              <RefreshCw className={`size-4 ${status === 'checking' ? 'animate-spin' : ''}`} />{' '}
              {t('settings.updates.check')}
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

/** Paramètres de l'application : langue, thème, configurations et mises à jour. */
export default function SettingsPage() {
  const { t } = useI18n()
  const { prefs, update } = usePreferences()
  const text = useManifestText()

  return (
    <div className="flex flex-col gap-4 p-6">
      <Card id="settings.language" title={t('settings.language')}>
        <p className="mb-3 text-xs text-slate-500">{t('settings.languageHint')}</p>
        <div className="flex flex-wrap gap-3">
          {Object.entries(LANGUAGES).map(([code, lang]) => (
            <Choice
              key={code}
              selected={prefs.language === code}
              onClick={() => update({ language: code })}
              title={lang.label}
              subtitle={code.toUpperCase()}
            />
          ))}
        </div>
      </Card>

      <Card id="settings.theme" title={t('settings.theme')}>
        <p className="mb-3 text-xs text-slate-500">{t('settings.themeHint')}</p>
        <div className="flex flex-wrap gap-3">
          {THEMES.map((theme) => (
            <Choice
              key={theme}
              selected={prefs.theme === theme}
              onClick={() => update({ theme })}
              icon={THEME_ICONS[theme]}
              title={t(`settings.themes.${theme}`)}
              subtitle={t(`settings.themeDescriptions.${theme}`)}
            />
          ))}
        </div>
      </Card>

      <Card id="settings.startPage" title={t('settings.startPage')}>
        <p className="mb-3 text-xs text-slate-500">{t('settings.startPageHint')}</p>
        <Select className="max-w-sm" value={prefs.startPage} onChange={(e) => update({ startPage: e.target.value })}>
          <option value="last">{t('settings.lastPage')}</option>
          <optgroup label={t('settings.modules')}>
            {rendererModules.map(({ manifest }) => (
              <option key={manifest.id} value={manifest.id}>
                {text(manifest).name}
              </option>
            ))}
          </optgroup>
          <optgroup label={t('settings.pages')}>
            {appPages.map(({ manifest }) => (
              <option key={manifest.id} value={manifest.id}>
                {text(manifest).name}
              </option>
            ))}
          </optgroup>
        </Select>
      </Card>

      <ConfigurationsCard />

      <UpdatesCard />
    </div>
  )
}
