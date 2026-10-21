import { useState } from 'react'
import {
  Check,
  Download,
  ExternalLink,
  Monitor,
  Moon,
  Puzzle,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Sun,
  Upload
} from 'lucide-react'
import { LANGUAGES } from '@shared/languages'
import { Button, Card, Checkbox, ErrorBanner, Select, Tabs, useStoredState } from '../components/ui'
import { exportConfigurations, importConfigurations } from '../module-config'
import { MODULE_API_VERSION } from '@shared/module'
import { availableModules, rejectedModules, setDisabledModules, useEnabledModules } from '../enabled-modules'
import { appPages } from '../pages'
import { THEMES, useI18n, useManifestText, usePreferences } from '../preferences'
import { useUpdater } from '../updater'

const THEME_ICONS = { dark: Moon, light: Sun, system: Monitor }

/** Onglets des Paramètres, onglet affiché mémorisé localement sous SETTINGS_TAB_KEY. */
const TABS = ['general', 'modules', 'updates']
const SETTINGS_TAB_KEY = 'sulfur:tab:settings'

/** Onglet affiché à la prochaine ouverture des Paramètres (sans effet si le stockage est indisponible). */
export function selectSettingsTab(tab) {
  try {
    localStorage.setItem(SETTINGS_TAB_KEY, tab)
  } catch {
    // stockage indisponible : les Paramètres s'ouvrent sur le dernier onglet affiché
  }
}

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

/**
 * Modules activés : un module désactivé est masqué, arrêté et n'est plus chargé au démarrage ; sa
 * configuration est conservée. Le process principal refuse de désactiver un module en marche.
 */
function ModulesCard() {
  const { t } = useI18n()
  const text = useManifestText()
  const { prefs, update } = usePreferences()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const disabled = prefs.disabledModules ?? []
  const { groups, modules } = availableModules()
  const rejected = rejectedModules()

  async function apply(next) {
    setBusy(true)
    setError(null)
    try {
      await setDisabledModules(next, update)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  const toggle = (id, enabled) => apply(enabled ? disabled.filter((x) => x !== id) : [...disabled, id])

  return (
    <Card id="settings.moduleSwitch" title={t('settings.moduleSwitch.title')}>
      <p className="mb-3 text-xs text-slate-500">{t('settings.moduleSwitch.hint')}</p>
      <div className="flex flex-col gap-4">
        {groups.map((group) => (
          <div key={group.id} className="flex flex-col gap-2">
            <div className="text-[11px] font-medium tracking-wider text-slate-500 uppercase">
              {t(`app.groups.${group.id}`)}
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-2">
              {group.modules.map(({ manifest, icon: Icon }) => {
                const enabled = !disabled.includes(manifest.id)
                return (
                  <label
                    key={manifest.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition-colors has-disabled:cursor-not-allowed ${
                      enabled ? 'border-ink-700 bg-ink-850' : 'border-ink-800 opacity-60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-sulfur-400"
                      checked={enabled}
                      disabled={busy}
                      onChange={(e) => toggle(manifest.id, e.target.checked)}
                    />
                    <Icon className="mt-0.5 size-4 shrink-0 text-sulfur-400" />
                    <span className="min-w-0">
                      <span className="flex items-baseline gap-2 text-sm text-slate-100">
                        {text(manifest).name}
                        <span className="text-[11px] text-slate-500 tabular-nums">v{manifest.version}</span>
                        {manifest.edition === 'premium' && (
                          <span className="text-[11px] text-sulfur-300">{t('settings.moduleSwitch.premium')}</span>
                        )}
                      </span>
                      <span className="block text-xs text-slate-500">{text(manifest).description}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-slate-400">
            {t('settings.moduleSwitch.summary', {
              enabled: modules.length - disabled.length,
              total: modules.length
            })}
          </span>
          <Button size="sm" disabled={busy || !disabled.length} onClick={() => apply([])}>
            {t('settings.moduleSwitch.enableAll')}
          </Button>
          <Button
            size="sm"
            disabled={busy || disabled.length === modules.length}
            onClick={() => apply(modules.map((m) => m.manifest.id))}
          >
            {t('settings.moduleSwitch.disableAll')}
          </Button>
        </div>
        {rejected.length > 0 && (
          <div className="flex flex-col gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
            <span className="text-xs font-medium text-amber-300">
              {t('settings.moduleSwitch.rejected', { count: rejected.length })}
            </span>
            {rejected.map((r, i) => (
              <span key={`${r.id}-${i}`} className="text-xs text-slate-300">
                <span className="font-medium text-slate-100">{r.name}</span>{' '}
                <span className="text-slate-500">
                  ({r.id}, v{r.version})
                </span>{' '}
                — {t(`modules.problems.${r.reason}`, r.params)}
              </span>
            ))}
          </div>
        )}
        <p className="text-[11px] text-slate-500">{t('settings.moduleSwitch.api', { version: MODULE_API_VERSION })}</p>
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

/**
 * Paramètres de l'application, en trois onglets : Général (langue, thème, page de démarrage,
 * configurations), Modules (activation, modules non chargés) et Mises à jour.
 */
export default function SettingsPage() {
  const { t } = useI18n()
  const { prefs, update } = usePreferences()
  const text = useManifestText()
  const { modules } = useEnabledModules()
  const [tab, setTab] = useStoredState(SETTINGS_TAB_KEY, 'general', TABS)

  return (
    <div className="flex flex-col gap-4 p-6">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'general', label: t('settings.tabs.general'), icon: SlidersHorizontal },
          { id: 'modules', label: t('settings.tabs.modules'), icon: Puzzle },
          { id: 'updates', label: t('settings.tabs.updates'), icon: Download }
        ]}
      />
      {tab === 'modules' && <ModulesCard />}
      {tab === 'updates' && <UpdatesCard />}
      {tab === 'general' && (
        <>
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
            <Select
              className="max-w-sm"
              value={prefs.startPage}
              onChange={(e) => update({ startPage: e.target.value })}
            >
              <option value="last">{t('settings.lastPage')}</option>
              <optgroup label={t('settings.modules')}>
                {modules.map(({ manifest }) => (
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
        </>
      )}
    </div>
  )
}
