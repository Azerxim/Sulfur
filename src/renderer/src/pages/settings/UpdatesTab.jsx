import { useEffect, useState } from 'react'
import { CircleCheck, Download, ExternalLink, Info, RefreshCw, RotateCcw, TriangleAlert } from 'lucide-react'
import { Button, ErrorBanner } from '@azerxim/sulfur-sdk/ui'
import { useI18n } from '../../preferences'
import { useUpdater } from '../../updater'
import Markdown from '../../components/Markdown'
import { releaseSection } from '../../markdown'
import { Badge, Panel, SettingRow, Switch, versionOrder } from './shared'

/** Statuts du module de mise à jour pour lesquels une nouvelle version est proposée. */
const OFFERED = ['available', 'downloading', 'downloaded']

/** Icône et couleurs du bloc d'état, selon le statut. */
const TONES = {
  ok: { icon: CircleCheck, className: 'bg-emerald-400/12 text-emerald-400' },
  offer: { icon: Download, className: 'bg-sulfur-400/12 text-sulfur-400' },
  ready: { icon: RotateCcw, className: 'bg-sulfur-400/12 text-sulfur-400' },
  busy: { icon: RefreshCw, className: 'bg-ink-850 text-slate-400', spin: true },
  error: { icon: TriangleAlert, className: 'bg-red-400/12 text-red-400' },
  info: { icon: Info, className: 'bg-ink-850 text-slate-400' }
}

/**
 * Bloc d'état des mises à jour : icône, titre, détail et l'action utile selon le statut (recherche,
 * téléchargement avec progression, installation), puis la recherche automatique et la source.
 */
function StatusPanel({ updater, onShowNotes }) {
  const { t, locale } = useI18n()
  const { state, check, download, install, openReleases, setAutoCheck } = updater
  const { supported, canInstall, status, currentVersion: current, version } = state
  const installedLine = t('settings.updates.current', { version: current })
  const checkButton = (label = t('settings.updates.check')) => (
    <Button disabled={status === 'checking'} onClick={check}>
      <RefreshCw className={`size-4 ${status === 'checking' ? 'animate-spin' : ''}`} /> {label}
    </Button>
  )

  const view = !supported
    ? { tone: 'info', title: installedLine, detail: t('settings.updates.unsupported') }
    : ({
        idle: {
          tone: 'info',
          title: installedLine,
          detail: t('settings.updates.autoCheckHint'),
          actions: checkButton()
        },
        checking: {
          tone: 'busy',
          title: t('settings.updates.checking'),
          detail: installedLine,
          actions: checkButton()
        },
        'not-available': {
          tone: 'ok',
          title: t('settings.updates.upToDate'),
          detail: state.checkedAt
            ? t('settings.updates.checkedAt', {
                version: current,
                time: new Date(state.checkedAt).toLocaleString(locale)
              })
            : installedLine,
          actions: checkButton()
        },
        available: {
          tone: 'offer',
          title: t('settings.updates.available', { version }),
          detail: canInstall ? installedLine : t('settings.updates.macHint'),
          actions: (
            <>
              <Button onClick={() => onShowNotes(version)}>{t('settings.updates.releaseNotes')}</Button>
              <Button variant="primary" onClick={download}>
                {canInstall ? <Download className="size-4" /> : <ExternalLink className="size-4" />}
                {canInstall ? t('settings.updates.download') : t('settings.updates.openDownload')}
              </Button>
            </>
          )
        },
        downloading: {
          tone: 'offer',
          title: t('settings.updates.downloadingTitle', { version }),
          detail: t('settings.updates.downloadingHint'),
          progress: state.progress ?? 0
        },
        downloaded: {
          tone: 'ready',
          title: t('settings.updates.downloaded', { version }),
          detail: t('settings.updates.downloadedHint'),
          actions: (
            <Button variant="primary" onClick={install}>
              <RotateCcw className="size-4" /> {t('settings.updates.install')}
            </Button>
          )
        },
        error: {
          tone: 'error',
          title: t('settings.updates.errorTitle'),
          detail: state.error,
          detailClass: 'text-red-300 break-all',
          actions: checkButton(t('app.retry'))
        }
      }[status] ?? { tone: 'info', title: installedLine, actions: checkButton() })
  const tone = TONES[view.tone]

  return (
    <section
      aria-label={t('settings.updates.title')}
      className="overflow-hidden rounded-[10px] border border-ink-800 bg-ink-900"
    >
      <div className="flex flex-wrap items-center gap-4 p-4">
        <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${tone.className}`}>
          <tone.icon className={`size-5 ${tone.spin ? 'animate-spin' : ''}`} />
        </span>
        <div role="status" className="flex min-w-0 flex-1 basis-72 flex-col gap-0.5">
          <span className="text-base font-semibold text-slate-100">{view.title}</span>
          {view.detail && <span className={`text-[13px] ${view.detailClass ?? 'text-slate-400'}`}>{view.detail}</span>}
        </div>
        {view.actions && <div className="flex flex-wrap gap-2">{view.actions}</div>}
      </div>
      {view.progress !== undefined && (
        <div className="flex items-center gap-3 px-4 pb-4">
          <div
            role="progressbar"
            aria-label={t('settings.updates.downloadingTitle', { version })}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={view.progress}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-850"
          >
            <div
              className="h-full rounded-full bg-sulfur-400 transition-[width]"
              style={{ width: `${view.progress}%` }}
            />
          </div>
          <span className="w-10 text-right font-mono text-xs text-slate-400">{view.progress} %</span>
        </div>
      )}

      <div className="flex flex-col divide-y divide-ink-800/70 border-t border-ink-800 px-4 py-3">
        <SettingRow label={t('settings.updates.autoCheck')} hint={t('settings.updates.autoCheckHint')}>
          <Switch
            checked={state.autoCheck}
            disabled={!supported}
            label={t('settings.updates.autoCheck')}
            onChange={setAutoCheck}
          />
        </SettingRow>
        <SettingRow label={t('settings.updates.source')} hint={t('settings.updates.hint')}>
          <Button size="sm" variant="ghost" onClick={openReleases}>
            <ExternalLink className="size-3.5" /> {t('settings.updates.openReleases')}
          </Button>
        </SettingRow>
      </div>
    </section>
  )
}

/**
 * Notes des releases GitHub, dans la langue de l'interface (section de la note pour cette langue) :
 * liste des versions à gauche, note de la version choisie à droite. Par défaut : la version
 * proposée en mise à jour, sinon la version installée.
 */
function ReleaseNotesPanel({ updater, selected, onSelect }) {
  const { t, lang, locale } = useI18n()
  const { state, releases: fetchReleases } = updater
  const [releases, setReleases] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

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
  const offered = OFFERED.includes(state?.status) ? state.version : null
  const versions = releases?.map((r) => r.version) ?? []
  const shownVersion = [selected, offered, current].find((v) => v && versions.includes(v)) ?? versions[0]
  const shown = releases?.find((r) => r.version === shownVersion)
  const date = (release) => (release.publishedAt ? new Date(release.publishedAt).toLocaleDateString(locale) : '')

  return (
    <Panel
      labelledBy="settings-release-notes"
      title={t('settings.updates.notes.title')}
      actions={
        <Button size="sm" variant="ghost" disabled={loading} onClick={() => load(true)}>
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} /> {t('settings.updates.notes.refresh')}
        </Button>
      }
    >
      {error && (
        <div className="p-3.5">
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      )}
      {!releases && !error && <p className="p-3.5 text-[13px] text-slate-500">{t('settings.updates.notes.loading')}</p>}
      {releases?.length === 0 && (
        <p className="p-3.5 text-[13px] text-slate-500">{t('settings.updates.notes.empty')}</p>
      )}
      {releases?.length > 0 && (
        <div className="flex min-h-80 flex-wrap">
          <div
            role="listbox"
            aria-label={t('settings.updates.notes.versions')}
            className="flex max-h-[32rem] flex-1 basis-52 flex-col gap-0.5 overflow-y-auto border-r border-ink-800 p-1.5"
          >
            {releases.map((release) => {
              const order = current ? versionOrder(release.version, current) : null
              const active = release.version === shownVersion
              return (
                <button
                  key={release.version}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => onSelect(release.version)}
                  className={`flex flex-col gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors ${
                    active ? 'bg-ink-850' : 'hover:bg-ink-850/60'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`font-mono text-[13px] font-medium ${active ? 'text-slate-100' : 'text-slate-300'}`}
                    >
                      v{release.version}
                    </span>
                    {order === 0 && <Badge>{t('settings.updates.notes.installed')}</Badge>}
                    {order > 0 && <Badge tone="accent">{t('settings.updates.notes.newer')}</Badge>}
                  </span>
                  <span className="text-xs text-slate-500">{date(release)}</span>
                </button>
              )
            })}
          </div>
          {shown && (
            <article className="flex min-w-0 flex-[999_1_420px] flex-col gap-3 px-5 py-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-lg font-semibold text-slate-100">{shown.name}</h3>
                <span className="text-xs text-slate-500">{date(shown)}</span>
                <a
                  href={shown.url}
                  target="_blank"
                  rel="noreferrer"
                  title={t('settings.updates.notes.github')}
                  className="ml-auto inline-flex items-center gap-1 text-xs text-sulfur-300 hover:text-sulfur-200"
                >
                  GitHub <ExternalLink className="size-3.5" />
                </a>
              </div>
              <Markdown text={releaseSection(shown.body, lang)} />
            </article>
          )}
        </div>
      )}
    </Panel>
  )
}

/** Onglet Mises à jour des Paramètres : état et actions, puis notes de version. */
export default function UpdatesTab() {
  const updater = useUpdater()
  const [selected, setSelected] = useState(null)
  if (!updater.state) return null
  return (
    <>
      <StatusPanel updater={updater} onShowNotes={setSelected} />
      <ReleaseNotesPanel updater={updater} selected={selected} onSelect={setSelected} />
    </>
  )
}
