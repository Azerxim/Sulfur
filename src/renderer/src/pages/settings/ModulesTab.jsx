import { useEffect, useState } from 'react'
import { FolderOpen, Package, PackagePlus, RefreshCw, Search, ShieldAlert, Trash2, TriangleAlert } from 'lucide-react'
import { MODULE_API_VERSION } from '@azerxim/sulfur-sdk'
import { Button, ErrorBanner, Modal } from '@azerxim/sulfur-sdk/ui'
import { availableModules, rejectedModules, setDisabledModules } from '../../enabled-modules'
import { externalModules, reloadExternalModules } from '../../external-modules'
import { useModuleActivity } from '../../activity'
import { useI18n, useManifestText, usePreferences } from '../../preferences'
import { Badge, Panel, Segmented, Switch, versionOrder } from './shared'

/** Texte comparable sans casse ni accents (filtre des modules). */
const normalize = (text) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Modules activés : un module désactivé est masqué, arrêté et n'est plus chargé au démarrage ; sa
 * configuration est conservée. Un module en marche ne peut pas être désactivé (interrupteur bloqué,
 * le process principal le refuserait de toute façon).
 */
function ModulesPanel() {
  const { t } = useI18n()
  const text = useManifestText()
  const activity = useModuleActivity()
  const { prefs, update } = usePreferences()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const disabled = prefs.disabledModules ?? []
  const { groups, modules } = availableModules()
  const rejected = rejectedModules()
  const running = modules.filter((m) => activity(m.manifest.id).active).length

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

  const q = normalize(query.trim())
  const shown = (manifest) => {
    const enabled = !disabled.includes(manifest.id)
    if ((filter === 'on' && !enabled) || (filter === 'off' && enabled)) return false
    const { name, description } = text(manifest)
    return !q || normalize(`${name} ${description}`).includes(q)
  }
  const visible = groups
    .map((group) => ({ ...group, shown: group.modules.filter((m) => shown(m.manifest)) }))
    .filter((group) => group.shown.length)

  return (
    <Panel
      labelledBy="settings-modules"
      title={t('settings.moduleSwitch.title')}
      subtitle={[
        t('settings.moduleSwitch.summary', { enabled: modules.length - disabled.length, total: modules.length }),
        running > 0 && t('settings.moduleSwitch.running', { count: running })
      ]
        .filter(Boolean)
        .join(' · ')}
      actions={
        <>
          <label className="flex h-8 w-56 items-center gap-2 rounded-md border border-ink-800 bg-ink-950 px-2.5 text-slate-500 focus-within:border-sulfur-400">
            <Search className="size-3.5 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('settings.moduleSwitch.filter')}
              aria-label={t('settings.moduleSwitch.filter')}
              className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />
          </label>
          <Segmented
            size="sm"
            label={t('settings.moduleSwitch.show')}
            value={filter}
            onChange={setFilter}
            options={['all', 'on', 'off'].map((id) => ({ id, label: t(`settings.moduleSwitch.filters.${id}`) }))}
          />
          <Button size="sm" disabled={busy || !disabled.length} onClick={() => apply([])}>
            {t('settings.moduleSwitch.enableAll')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || disabled.length === modules.length}
            onClick={() => apply(modules.map((m) => m.manifest.id).filter((id) => !activity(id).active))}
          >
            {t('settings.moduleSwitch.disableAll')}
          </Button>
        </>
      }
    >
      <p className="px-3.5 pt-2.5 text-xs text-slate-500">{t('settings.moduleSwitch.hint')}</p>
      <div className="px-3.5 pt-2.5 empty:hidden">
        <ErrorBanner error={error} onClose={() => setError(null)} />
      </div>

      <div className="pt-1 pb-1">
        {visible.map((group) => (
          <div key={group.id}>
            <div className="flex items-center justify-between px-3.5 pt-3 pb-1.5 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
              <span>{t(`app.groups.${group.id}`)}</span>
              <span className="font-mono font-normal tracking-normal">
                {group.modules.filter((m) => !disabled.includes(m.manifest.id)).length}/{group.modules.length}
              </span>
            </div>
            {group.shown.map(({ manifest }) => {
              const enabled = !disabled.includes(manifest.id)
              const locked = activity(manifest.id).active
              const { name, description } = text(manifest)
              return (
                <div
                  key={manifest.id}
                  className={`grid min-h-12 grid-cols-[44px_minmax(0,1fr)_auto_56px] items-center gap-2.5 border-t border-ink-800/70 px-3.5 py-1 ${
                    enabled ? '' : 'opacity-60'
                  }`}
                >
                  <Switch
                    checked={enabled}
                    disabled={busy || locked}
                    label={name}
                    title={locked ? t('settings.moduleSwitch.locked') : undefined}
                    onChange={(on) => toggle(manifest.id, on)}
                  />
                  <div className="flex min-w-0 flex-col">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[13px] font-medium text-slate-100">{name}</span>
                      {manifest.edition === 'additional' && (
                        <Badge tone="accent">{t('settings.moduleSwitch.additional')}</Badge>
                      )}
                    </span>
                    <span className="truncate text-xs text-slate-500" title={description}>
                      {description}
                    </span>
                  </div>
                  <span className="text-xs whitespace-nowrap">
                    {locked ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-300">
                        <span className="size-1.5 rounded-full bg-emerald-400" />
                        {t('app.activity.running')}
                      </span>
                    ) : (
                      !enabled && <span className="text-slate-500">{t('settings.moduleSwitch.disabled')}</span>
                    )}
                  </span>
                  <span className="text-right font-mono text-[11px] text-slate-500">{manifest.version}</span>
                </div>
              )
            })}
          </div>
        ))}
        {!visible.length && (
          <p className="px-3.5 py-6 text-center text-[13px] text-slate-500">{t('settings.moduleSwitch.noMatch')}</p>
        )}
      </div>

      {rejected.length > 0 && (
        <div className="mx-3.5 mt-1 flex gap-2.5 rounded-lg bg-amber-400/12 px-3 py-2.5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-400" />
          <div className="flex flex-col gap-1 text-xs">
            <span className="font-semibold text-amber-300">
              {t('settings.moduleSwitch.rejected', { count: rejected.length })}
            </span>
            {rejected.map((r, i) => (
              <span key={`${r.id}-${i}`} className="text-slate-300">
                <span className="font-medium text-slate-100">{r.name}</span>{' '}
                <span className="font-mono text-slate-500">
                  {r.id} · v{r.version}
                </span>{' '}
                — {t(`modules.problems.${r.reason}`, r.params)}
              </span>
            ))}
          </div>
        </div>
      )}
      <p className="px-3.5 pt-2 pb-3 text-[11px] text-slate-500">
        {t('settings.moduleSwitch.api', { version: MODULE_API_VERSION })}
      </p>
    </Panel>
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
    ['id', <code className="font-mono">{info.id}</code>],
    ['version', <span className="font-mono">{info.version}</span>],
    ['author', info.author ?? <span className="text-amber-300">{t('settings.externalModules.unknownAuthor')}</span>],
    [
      'content',
      t('settings.externalModules.confirm.files', { count: info.files, size: formatSize(info.size, locale) })
    ],
    ...(info.installed ? [['current', <span className="font-mono">{info.installed}</span>]] : [])
  ]
  return (
    <Modal
      title={t('settings.externalModules.confirm.title', { name: info.name })}
      onClose={onClose}
      className="max-w-lg"
    >
      <div className="flex flex-col gap-3.5">
        {info.description && <p className="text-[13px] text-slate-400">{info.description}</p>}
        <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13px]">
          {rows.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-slate-500">{t(`settings.externalModules.confirm.${key}`)}</dt>
              <dd className="text-slate-100 select-text">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="flex gap-2.5 rounded-lg bg-amber-400/12 px-3 py-2.5 text-xs text-slate-200">
          <ShieldAlert className="mt-px size-4 shrink-0 text-amber-400" />
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
function ExternalModulesPanel() {
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
  const toggle = (on) => run(async () => setEnabled(await window.sulfur.invoke('modules:setExternal', on)))
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
    <Panel
      labelledBy="settings-external-modules"
      title={t('settings.externalModules.title')}
      subtitle={t('settings.externalModules.hint')}
      actions={
        <>
          <Button size="sm" disabled={busy} onClick={reload} title={t('settings.externalModules.reloadHint')}>
            <RefreshCw className={`size-3.5 ${busy ? 'animate-spin' : ''}`} /> {t('settings.externalModules.reload')}
          </Button>
          <Button size="sm" variant="primary" disabled={busy} onClick={choose}>
            <PackagePlus className="size-3.5" /> {t('settings.externalModules.install')}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3 border-b border-ink-800/70 px-3.5 py-3">
        <Switch checked={enabled} disabled={busy} label={t('settings.externalModules.enable')} onChange={toggle} />
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-medium text-slate-100">{t('settings.externalModules.enable')}</span>
          <span className="flex gap-1.5 text-xs text-amber-300">
            <ShieldAlert className="mt-px size-3.5 shrink-0" />
            {t('settings.externalModules.warning')}
          </span>
        </div>
      </div>

      {(enabled !== loaded || notice || error) && (
        <div className="flex flex-col gap-2 px-3.5 pt-3">
          {enabled !== loaded && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-sulfur-400/12 py-2 pr-2 pl-3">
              <span className="flex-1 text-xs text-slate-100">{t('settings.externalModules.reloadNeeded')}</span>
              <Button size="sm" variant="primary" disabled={busy} onClick={reload}>
                {t('settings.externalModules.reload')}
              </Button>
            </div>
          )}
          {notice && <p className="rounded-lg bg-emerald-400/12 px-3 py-2 text-xs text-emerald-300">{notice}</p>}
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      )}

      <div className="px-3.5 pt-3 pb-1.5 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
        {t('settings.externalModules.installed')} · {installed.length}
      </div>
      {installed.length === 0 && (
        <p className="border-t border-ink-800/70 px-3.5 py-3 text-[13px] text-slate-500">
          {t('settings.externalModules.none')}
        </p>
      )}
      {installed.map((pkg) => {
        const active = loaded && ids.includes(pkg.id)
        return (
          <div
            key={pkg.folder}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-ink-800/70 px-3.5 py-2.5"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink-850 text-slate-400">
              <Package className="size-4" />
            </span>
            <div className="flex min-w-0 flex-1 basis-64 flex-col">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-medium text-slate-100">{pkg.name}</span>
                <span className="font-mono text-[11px] text-slate-500">v{pkg.version}</span>
                <Badge tone={active ? 'ok' : 'warn'}>
                  {t(active ? 'settings.externalModules.loadedBadge' : 'settings.externalModules.notLoaded')}
                </Badge>
              </span>
              <span className="truncate text-xs text-slate-500">
                <code className="font-mono">{pkg.id}</code> ·{' '}
                {pkg.author
                  ? t('settings.externalModules.by', { author: pkg.author })
                  : t('settings.externalModules.unknownAuthor')}
              </span>
            </div>
            {removing === pkg.id ? (
              <span className="flex gap-1.5">
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
        )
      })}

      {dir && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2.5 border-t border-ink-800 bg-ink-950 px-3.5 py-2.5">
          <span className="text-xs text-slate-400">{t('settings.externalModules.folder')}</span>
          <code className="min-w-0 flex-1 basis-48 truncate font-mono text-xs text-slate-200 select-text" title={dir}>
            {dir}
          </code>
          <Button size="sm" disabled={busy} onClick={() => run(() => window.sulfur.invoke('modules:openPackagesDir'))}>
            <FolderOpen className="size-3.5" /> {t('settings.externalModules.open')}
          </Button>
        </div>
      )}

      {pending && (
        <InstallPackageModal info={pending} busy={busy} onConfirm={install} onClose={() => !busy && setPending(null)} />
      )}
    </Panel>
  )
}

/** Onglet Modules des Paramètres : modules activés, puis modules externes. */
export default function ModulesTab() {
  return (
    <>
      <ModulesPanel />
      <ExternalModulesPanel />
    </>
  )
}
