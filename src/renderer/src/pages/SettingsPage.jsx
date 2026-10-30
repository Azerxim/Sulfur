import { useEffect, useState } from 'react'
import {
  ChevronDown,
  Download,
  ExternalLink,
  FolderOpen,
  Monitor,
  Moon,
  PackagePlus,
  Puzzle,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Sun,
  Trash2,
  TriangleAlert,
  Upload
} from 'lucide-react'
import { compareVersions, LANGUAGES, MODULE_API_VERSION, parseVersion } from '@azerxim/sulfur-sdk'
import { Button, Card, Checkbox, ErrorBanner, Modal, Select, TabbedPage, useStoredState } from '@azerxim/sulfur-sdk/ui'
import { exportConfigurations, importConfigurations } from '../module-config'
import { availableModules, rejectedModules, setDisabledModules, useEnabledModules } from '../enabled-modules'
import { externalModules, reloadExternalModules } from '../external-modules'
import { appPages } from '../pages'
import { THEMES, useI18n, useManifestText, usePreferences } from '../preferences'
import { useUpdater } from '../updater'
import Markdown from '../components/Markdown'
import { releaseSection } from '../markdown'

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

/** Réglage sur une ligne : libellé et explication à gauche, contrôle à droite (dessous si la place manque). */
function SettingRow({ label, hint, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1 basis-64">
        <div className="text-sm font-medium text-slate-100">{label}</div>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

/** Choix unique parmi quelques options, en sélecteur compact. */
function Segmented({ label, options, value, onChange }) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex flex-wrap gap-0.5 rounded-lg border border-ink-800 bg-ink-950 p-0.5"
    >
      {options.map(({ id, label: text, title, icon: Icon }) => (
        <button
          key={id}
          role="radio"
          aria-checked={value === id}
          title={title}
          onClick={() => onChange(id)}
          className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-sm transition-colors ${
            value === id ? 'bg-ink-850 font-medium text-slate-100 shadow-sm' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {Icon && <Icon className={`size-4 ${value === id ? 'text-sulfur-400' : ''}`} />}
          {text}
        </button>
      ))}
    </div>
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
  const externalIds = externalModules().ids

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
      <div className="flex flex-col gap-3">
        {groups.map((group) => (
          <div key={group.id} className="flex flex-col gap-1.5">
            <div className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
              {t(`app.groups.${group.id}`)}
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-1.5">
              {group.modules.map(({ manifest, icon: Icon }) => {
                const enabled = !disabled.includes(manifest.id)
                return (
                  <label
                    key={manifest.id}
                    title={text(manifest).description}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-1.5 transition-colors has-disabled:cursor-not-allowed ${
                      enabled ? 'border-ink-800 bg-ink-850 hover:border-ink-700' : 'border-ink-800 opacity-60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="size-4 shrink-0 accent-sulfur-400"
                      checked={enabled}
                      disabled={busy}
                      onChange={(e) => toggle(manifest.id, e.target.checked)}
                    />
                    <Icon className="size-4 shrink-0 text-sulfur-400" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2 text-sm text-slate-100">
                        {text(manifest).name}
                        <span className="text-[11px] text-slate-500 tabular-nums">v{manifest.version}</span>
                        {manifest.edition === 'additional' && (
                          <span className="text-[11px] text-sulfur-300">{t('settings.moduleSwitch.additional')}</span>
                        )}
                        {externalIds.includes(manifest.id) && (
                          <span className="text-[11px] text-sky-300">{t('settings.moduleSwitch.external')}</span>
                        )}
                      </span>
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

/** Taille lisible d'un paquet (o, Ko, Mo selon la langue). */
const formatSize = (bytes, locale) => {
  const [value, unit] =
    bytes < 1024
      ? [bytes, 'byte']
      : bytes < 1024 * 1024
        ? [bytes / 1024, 'kilobyte']
        : [bytes / 1024 / 1024, 'megabyte']
  return new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: 1 }).format(
    value
  )
}

/**
 * Confirmation de l'installation d'un paquet vérifié par le process principal (`info` : voir
 * ExternalModules.inspect) : module, auteur, version installée et avertissement, le paquet n'étant
 * pas signé.
 */
function InstallPackageModal({ info, busy, onConfirm, onClose }) {
  const { t, locale } = useI18n()
  const order = info.installed ? versionOrder(info.version, info.installed) : null
  const label = !info.installed
    ? t('settings.externalModules.confirm.install')
    : order > 0
      ? t('settings.externalModules.confirm.update', { version: info.version })
      : t('settings.externalModules.confirm.replace', { version: info.installed })
  const rows = [
    [
      'id',
      <code key="id" className="font-mono">
        {info.id}
      </code>
    ],
    ['version', info.version],
    ['author', info.author ?? <span className="text-amber-300">{t('settings.externalModules.unknownAuthor')}</span>],
    [
      'content',
      t('settings.externalModules.confirm.files', { count: info.files, size: formatSize(info.size, locale) })
    ],
    ...(info.installed ? [['current', info.installed]] : [])
  ]
  return (
    <Modal
      title={t('settings.externalModules.confirm.title', { name: info.name })}
      onClose={onClose}
      className="max-w-lg"
    >
      <div className="flex flex-col gap-3">
        {info.description && <p className="text-sm text-slate-300">{info.description}</p>}
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {rows.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-slate-500">{t(`settings.externalModules.confirm.${key}`)}</dt>
              <dd className="text-slate-100 select-text">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {t('settings.externalModules.confirm.warning')}
        </p>
        <div className="flex justify-end gap-2">
          <Button disabled={busy} onClick={onClose}>
            {t('settings.externalModules.cancel')}
          </Button>
          <Button variant="primary" disabled={busy} onClick={onConfirm}>
            <PackagePlus className="size-4" /> {label}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/**
 * Modules externes : paquets installés dans le dossier des paquets, chargés seulement sur demande
 * (ils ne sont pas signés et s'exécutent avec les droits de Sulfur). Un paquet s'installe depuis une
 * archive `.sulfur-module`, après confirmation, ou en copiant son dossier. Le choix de chargement,
 * comme l'ajout, la mise à jour ou la suppression d'un paquet, s'applique au prochain démarrage ou
 * en actualisant les modules externes (automatique après une installation ou une suppression
 * quand les modules externes sont chargés).
 */
function ExternalModulesCard() {
  const { t } = useI18n()
  const { enabled: loaded, next, dir, ids } = externalModules()
  const [enabled, setEnabled] = useState(next)
  const [installed, setInstalled] = useState([])
  const [pending, setPending] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const refresh = () =>
    window.sulfur
      .invoke('modules:installed')
      .then(setInstalled)
      .catch((err) => setError(err.message))
  useEffect(() => {
    refresh()
  }, [])

  async function run(action) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  const toggle = (next) => run(async () => setEnabled(await window.sulfur.invoke('modules:setExternal', next)))
  const reload = () => run(reloadExternalModules)
  const choose = () =>
    run(async () => {
      const info = await window.sulfur.invoke('modules:choosePackage')
      if (info) setPending(info)
    })
  /** Après une installation ou une suppression : actualisation si le module est (ou sera) chargé. */
  async function applied(result, message) {
    if (result.reload) return reloadExternalModules()
    await refresh()
    setNotice(message)
  }
  const install = () =>
    run(async () => {
      const info = pending
      const result = await window.sulfur.invoke('modules:installPackage', info.token)
      setPending(null)
      await applied(result, t('settings.externalModules.installedOk', { name: info.name, version: info.version }))
    })
  const remove = (pkg) =>
    run(async () => {
      setRemoving(null)
      await applied(
        await window.sulfur.invoke('modules:removePackage', pkg.id),
        t('settings.externalModules.removedOk', { name: pkg.name })
      )
    })

  return (
    <Card
      id="settings.externalModules"
      title={t('settings.externalModules.title')}
      actions={
        <>
          <Button size="sm" disabled={busy} onClick={choose}>
            <PackagePlus className="size-3.5" /> {t('settings.externalModules.install')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={reload}
            title={t('settings.externalModules.reloadHint')}
          >
            <RefreshCw className={`size-3.5 ${busy ? 'animate-spin' : ''}`} /> {t('settings.externalModules.reload')}
          </Button>
        </>
      }
    >
      <p className="mb-3 text-xs text-slate-500">{t('settings.externalModules.hint')}</p>
      <div className="flex flex-col gap-3">
        <div>
          <Checkbox
            label={t('settings.externalModules.enable')}
            checked={enabled}
            disabled={busy}
            onChange={(e) => toggle(e.target.checked)}
          />
          <p className="mt-1 ml-6 text-xs text-amber-300">{t('settings.externalModules.warning')}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-slate-400">{t('settings.externalModules.installed')}</span>
          {installed.length === 0 && <p className="text-xs text-slate-500">{t('settings.externalModules.none')}</p>}
          {installed.map((pkg) => (
            <div
              key={pkg.folder}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-ink-800 px-3 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-2 text-sm text-slate-100">
                  {pkg.name}
                  <span className="text-[11px] text-slate-500 tabular-nums">v{pkg.version}</span>
                  {loaded && !ids.includes(pkg.id) && (
                    <span className="text-[11px] text-amber-300">{t('settings.externalModules.notLoaded')}</span>
                  )}
                </span>
                <span className="block text-xs text-slate-500">
                  <code className="font-mono">{pkg.id}</code> ·{' '}
                  {pkg.author
                    ? t('settings.externalModules.by', { author: pkg.author })
                    : t('settings.externalModules.unknownAuthor')}
                </span>
              </span>
              {removing === pkg.id ? (
                <span className="flex gap-2">
                  <Button size="sm" disabled={busy} onClick={() => setRemoving(null)}>
                    {t('settings.externalModules.cancel')}
                  </Button>
                  <Button size="sm" variant="danger" disabled={busy} onClick={() => remove(pkg)}>
                    <Trash2 className="size-3.5" /> {t('settings.externalModules.confirmRemove', { name: pkg.name })}
                  </Button>
                </span>
              ) : (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => setRemoving(pkg.id)}>
                  <Trash2 className="size-3.5" /> {t('settings.externalModules.remove')}
                </Button>
              )}
            </div>
          ))}
        </div>
        {dir && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-400">{t('settings.externalModules.folder')}</span>
            <code className="rounded bg-ink-950 px-1.5 py-0.5 font-mono text-xs break-all text-slate-300 select-text">
              {dir}
            </code>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => run(() => window.sulfur.invoke('modules:openPackagesDir'))}
            >
              <FolderOpen className="size-3.5" /> {t('settings.externalModules.open')}
            </Button>
          </div>
        )}
        {loaded && (
          <p className="text-xs text-slate-400">{t('settings.externalModules.loaded', { count: ids.length })}</p>
        )}
        {enabled !== loaded && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-sulfur-400/30 bg-sulfur-400/10 px-3 py-2">
            <span className="text-xs text-sulfur-200">{t('settings.externalModules.reloadNeeded')}</span>
            <Button size="sm" variant="primary" disabled={busy} onClick={reload}>
              <RefreshCw className="size-3.5" /> {t('settings.externalModules.reload')}
            </Button>
          </div>
        )}
        {notice && <p className="text-xs text-emerald-300">{notice}</p>}
        <ErrorBanner error={error} onClose={() => setError(null)} />
      </div>
      {pending && (
        <InstallPackageModal info={pending} busy={busy} onConfirm={install} onClose={() => !busy && setPending(null)} />
      )}
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

/** Comparaison d'une version de release à la version installée (null si l'une n'est pas semver). */
const versionOrder = (version, current) =>
  parseVersion(version) && parseVersion(current) ? compareVersions(version, current) : null

/**
 * Notes des releases GitHub, dans la langue de l'interface (section de la note pour cette langue).
 * Ouverte par défaut : la version proposée en mise à jour, sinon la version installée.
 */
function ReleaseNotesCard() {
  const { t, lang, locale } = useI18n()
  const { state, releases: fetchReleases } = useUpdater()
  const [releases, setReleases] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(null)

  const load = (refresh) => {
    setLoading(true)
    setError(null)
    fetchReleases(refresh)
      .then(setReleases)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    load(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const current = state?.currentVersion
  const offered = ['available', 'downloading', 'downloaded'].includes(state?.status) ? state.version : null
  const versions = releases?.map((r) => r.version) ?? []
  const shown = open ?? [offered, current].find((v) => v && versions.includes(v)) ?? versions[0]

  return (
    <Card
      id="settings.releaseNotes"
      title={t('settings.updates.notes.title')}
      actions={
        <Button size="sm" variant="ghost" disabled={loading} onClick={() => load(true)}>
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} /> {t('settings.updates.notes.refresh')}
        </Button>
      }
    >
      <div className="flex flex-col gap-2">
        <ErrorBanner error={error} onClose={() => setError(null)} />
        {!releases && !error && <p className="text-sm text-slate-500">{t('settings.updates.notes.loading')}</p>}
        {releases?.length === 0 && <p className="text-sm text-slate-500">{t('settings.updates.notes.empty')}</p>}
        {releases?.map((release) => {
          const expanded = release.version === shown
          const order = current ? versionOrder(release.version, current) : null
          return (
            <div key={release.version} className="rounded-md border border-ink-800">
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setOpen(expanded ? '' : release.version)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <ChevronDown
                    className={`size-4 shrink-0 text-slate-500 transition-transform ${expanded ? '' : '-rotate-90'}`}
                  />
                  <span className="text-sm font-medium text-slate-100">{release.name}</span>
                  {release.publishedAt && (
                    <span className="text-xs text-slate-500">
                      {new Date(release.publishedAt).toLocaleDateString(locale)}
                    </span>
                  )}
                  {order === 0 && (
                    <span className="rounded bg-ink-800 px-1.5 text-[11px] text-slate-300">
                      {t('settings.updates.notes.installed')}
                    </span>
                  )}
                  {order > 0 && (
                    <span className="rounded bg-sulfur-400/15 px-1.5 text-[11px] text-sulfur-300">
                      {t('settings.updates.notes.newer')}
                    </span>
                  )}
                </button>
                <a
                  href={release.url}
                  target="_blank"
                  rel="noreferrer"
                  title={t('settings.updates.notes.github')}
                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-200"
                >
                  <ExternalLink className="size-3.5" /> GitHub
                </a>
              </div>
              {expanded && (
                <div className="border-t border-ink-800 px-4 py-3">
                  <Markdown text={releaseSection(release.body, lang)} />
                </div>
              )}
            </div>
          )
        })}
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
      className="mx-auto w-full max-w-5xl"
    >
      {tab === 'modules' && (
        <>
          <ModulesCard />
          <ExternalModulesCard />
        </>
      )}
      {tab === 'updates' && (
        <>
          <UpdatesCard />
          <ReleaseNotesCard />
        </>
      )}
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
