import { useState } from 'react'
import { Check, Download, Monitor, Moon, Sun, Upload } from 'lucide-react'
import { LANGUAGES } from '@shared/languages'
import { Button, Card, ErrorBanner } from '../components/ui'
import { exportConfigurations, importConfigurations } from '../module-config'
import { THEMES, useI18n, usePreferences } from '../preferences'

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

/** Paramètres de l'application : langue, thème et configurations. */
export default function SettingsPage() {
  const { t } = useI18n()
  const { prefs, update } = usePreferences()

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

      <ConfigurationsCard />
    </div>
  )
}
