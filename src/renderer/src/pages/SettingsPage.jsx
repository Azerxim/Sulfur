import { useState } from 'react'
import { Download, Monitor, Moon, Puzzle, SlidersHorizontal, Sun, Upload } from 'lucide-react'
import { LANGUAGES } from '@azerxim/sulfur-sdk'
import { Button, Card, ErrorBanner, Select, TabbedPage, useStoredState } from '@azerxim/sulfur-sdk/ui'
import { exportConfigurations, importConfigurations } from '../module-config'
import { useEnabledModules } from '../enabled-modules'
import { appPages } from '../pages'
import { THEMES, useI18n, useManifestText, usePreferences } from '../preferences'
import { Segmented, SettingRow } from './settings/shared'
import ModulesTab from './settings/ModulesTab'
import UpdatesTab from './settings/UpdatesTab'

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
    run(exportConfigurations, ({ filePath, kept }) => [
      t('settings.configurations.exported', { path: filePath }),
      kept.length > 0 && t('settings.configurations.exportedKept', { modules: kept.join(', ') })
    ])
  const importAll = () =>
    run(importConfigurations, ({ filePath, kept, ignored }) => [
      t('settings.configurations.imported', { path: filePath }),
      kept.length > 0 && t('settings.configurations.kept', { modules: kept.join(', ') }),
      ignored.length > 0 && t('settings.configurations.ignored', { modules: ignored.join(', ') })
    ])

  return (
    <Card id="settings.configurations" title={t('settings.configurations.title')}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <p className="min-w-0 flex-1 basis-64 text-xs text-slate-500">{t('settings.configurations.hint')}</p>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button disabled={busy} onClick={exportAll}>
              <Download className="size-4" /> {t('settings.configurations.export')}
            </Button>
            <Button disabled={busy} onClick={importAll}>
              <Upload className="size-4" /> {t('settings.configurations.import')}
            </Button>
          </div>
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
 * Paramètres de l'application, en trois onglets : Général (langue, thème, page de démarrage,
 * configurations), Modules (activation, modules non chargés, modules externes) et Mises à jour.
 */
export default function SettingsPage() {
  const { t } = useI18n()
  const { prefs, update } = usePreferences()
  const text = useManifestText()
  const { modules } = useEnabledModules()
  const [tab, setTab] = useStoredState(SETTINGS_TAB_KEY, 'general', TABS)

  return (
    <TabbedPage
      value={tab}
      onChange={setTab}
      tabs={[
        { id: 'general', label: t('settings.tabs.general'), icon: SlidersHorizontal },
        { id: 'modules', label: t('settings.tabs.modules'), icon: Puzzle },
        { id: 'updates', label: t('settings.tabs.updates'), icon: Download }
      ]}
      // Les cartes gardent leur hauteur : le contenu défile au lieu de les écraser.
      className="*:shrink-0"
    >
      {tab === 'modules' && <ModulesTab />}
      {tab === 'updates' && <UpdatesTab />}
      {tab === 'general' && (
        <>
          <Card id="settings.preferences" title={t('settings.preferences')} collapsible={false}>
            <div className="flex flex-col divide-y divide-ink-800">
              <SettingRow label={t('settings.language')} hint={t('settings.languageHint')}>
                <Segmented
                  label={t('settings.language')}
                  value={prefs.language}
                  onChange={(language) => update({ language })}
                  options={Object.entries(LANGUAGES).map(([code, lang]) => ({
                    id: code,
                    label: lang.label,
                    title: code.toUpperCase()
                  }))}
                />
              </SettingRow>
              <SettingRow label={t('settings.theme')} hint={t('settings.themeHint')}>
                <Segmented
                  label={t('settings.theme')}
                  value={prefs.theme}
                  onChange={(theme) => update({ theme })}
                  options={THEMES.map((theme) => ({
                    id: theme,
                    label: t(`settings.themes.${theme}`),
                    title: t(`settings.themeDescriptions.${theme}`),
                    icon: THEME_ICONS[theme]
                  }))}
                />
              </SettingRow>
              <SettingRow label={t('settings.startPage')} hint={t('settings.startPageHint')}>
                <Select
                  className="w-64"
                  aria-label={t('settings.startPage')}
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
              </SettingRow>
            </div>
          </Card>
          <ConfigurationsCard />
        </>
      )}
    </TabbedPage>
  )
}
