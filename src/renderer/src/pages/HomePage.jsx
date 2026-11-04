import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faArrowRight,
  faBookOpen,
  faChartLine,
  faChevronRight,
  faFlask,
  faFloppyDisk,
  faPlay,
  faPuzzlePiece,
  faScaleBalanced
} from '@fortawesome/free-solid-svg-icons'
import { MODULE_API_VERSION } from '@azerxim/sulfur-sdk'
import { Icon, StatusDot } from '@azerxim/sulfur-sdk/ui'
import { APP_VERSION } from '@shared/app'
import { hasPage, useEnabledModules } from '../enabled-modules'
import { useI18n, useManifestText } from '../preferences'
import { useModuleActivity } from '../activity'
import { activityLabel } from '../components/PageHeader'
import { selectSettingsTab } from './SettingsPage'

const REPOSITORY = 'https://github.com/Azerxim/Sulfur'

/**
 * Étapes de prise en main (libellés : home.steps.<id>.*), avec la page qu'elles ouvrent et, pour
 * les Paramètres, l'onglet affiché.
 */
const STEPS = [
  { id: 'start', icon: faPlay, page: 'opcua' },
  { id: 'simulate', icon: faFlask, page: 'simulator' },
  { id: 'record', icon: faChartLine, page: 'trends' },
  { id: 'save', icon: faFloppyDisk, page: 'settings', tab: 'general' },
  { id: 'modules', icon: faPuzzlePiece, page: 'settings', tab: 'modules' }
]

/** Colonnes du tableau de ce qui tourne : module et instance, point d'accès, activité, ouverture. */
const ACTIVE_COLUMNS = 'grid-cols-[minmax(180px,1.2fr)_minmax(220px,2fr)_minmax(140px,1fr)_28px]'

/** Ouvre le module `moduleId` sur l'onglet de l'instance `instanceId` (voir InstancesPage du SDK). */
function openInstance(onNavigate, moduleId, instanceId) {
  try {
    localStorage.setItem(`sulfur:tab:${moduleId}`, instanceId)
  } catch {
    // stockage indisponible : le module s'ouvre sur son dernier onglet
  }
  onNavigate(moduleId)
}

function Stat({ label, value, hint, highlight = false }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] border border-ink-800 bg-ink-900 px-4 py-3.5">
      <span className="text-xs text-slate-400">{label}</span>
      <span className={`font-mono text-2xl font-medium ${highlight ? 'text-emerald-300' : 'text-slate-100'}`}>
        {value}
      </span>
      <span className="truncate text-xs text-slate-500">{hint}</span>
    </div>
  )
}

/** Rien ne tourne : présentation de Sulfur et étapes de prise en main. */
function GettingStarted({ created, onNavigate }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-slate-300">
          {created > 0 ? t('home.activeStopped', { count: created }) : t('home.activeEmpty')}
        </p>
        <p className="max-w-3xl text-xs text-slate-500">
          <span className="font-medium text-sulfur-300">{t('home.headline')}.</span> {t('home.intro')}
        </p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        {STEPS.map(({ id, icon, page, tab }, i) => (
          <button
            key={id}
            onClick={() => {
              if (tab) selectSettingsTab(tab)
              onNavigate(page)
            }}
            className="flex flex-col gap-2 rounded-lg border border-ink-800 bg-ink-950 p-4 text-left transition-colors hover:border-sulfur-400/50"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-ink-850 font-mono text-xs text-sulfur-300">
                {i + 1}
              </span>
              <FontAwesomeIcon icon={icon} className="size-4 shrink-0 text-sulfur-400" />
            </span>
            <span className="text-sm font-medium text-slate-100">{t(`home.steps.${id}.title`)}</span>
            <span className="text-xs text-slate-400">{t(`home.steps.${id}.text`)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Activité d'une instance (même libellés que l'en-tête des modules). */
const instanceActivity = (instance) => ({
  active: instance.active,
  server: instance.running,
  client: instance.client && instance.active,
  sessions: instance.sessions
})

/**
 * Ce qui tourne : une ligne par instance en marche (serveur, client…) et par outil actif, avec son
 * point d'accès (celui d'un serveur, ou la cible d'un client) et son activité.
 */
function RunningRows({ modules, activity, groupOf, onNavigate }) {
  const { t } = useI18n()
  const text = useManifestText()
  return modules.flatMap(({ manifest }) => {
    const a = activity(manifest.id)
    const { name } = text(manifest)
    const rows = a.instanced
      ? a.instances
          .filter((i) => i.active)
          .map((i) => ({
            key: `${manifest.id}/${i.id}`,
            subtitle: i.name,
            endpoint: i.endpoint,
            target: i.client,
            label: activityLabel(t, instanceActivity(i)),
            open: () => openInstance(onNavigate, manifest.id, i.id)
          }))
      : [
          {
            key: manifest.id,
            subtitle: t(`app.groups.${groupOf(manifest.id)}`),
            endpoint: a.endpoint,
            target: false,
            label: activityLabel(t, a),
            open: () => onNavigate(manifest.id)
          }
        ]
    return rows.map((row) => (
      <div
        key={row.key}
        className={`grid ${ACTIVE_COLUMNS} items-center gap-3 border-b border-ink-800/60 px-4 py-2.5 last:border-b-0`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <StatusDot on />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-slate-100">{name}</span>
            <span className="truncate text-xs text-slate-500">{row.subtitle}</span>
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs text-slate-200 select-text">
          {row.target && row.endpoint && (
            <FontAwesomeIcon icon={faArrowRight} title={t('home.target')} className="size-3 shrink-0 text-slate-500" />
          )}
          <span className="truncate">{row.endpoint ?? '—'}</span>
        </span>
        <span className="text-xs text-slate-400">{row.label}</span>
        <button
          onClick={row.open}
          title={t('home.open', { name: `${name} · ${row.subtitle}` })}
          aria-label={t('home.open', { name: `${name} · ${row.subtitle}` })}
          className="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-ink-850 hover:text-slate-200"
        >
          <FontAwesomeIcon icon={faChevronRight} className="size-4" />
        </button>
      </div>
    ))
  })
}

/**
 * Vue d'ensemble : ce qui tourne en ce moment (chiffres clés, instances en marche avec leur point
 * d'accès et leur activité), puis l'état de chaque module par groupe. Prise en main tant que rien
 * ne tourne.
 */
export default function HomePage({ onNavigate = () => {} }) {
  const { t } = useI18n()
  const { groups, modules } = useEnabledModules()
  const text = useManifestText()
  const activity = useModuleActivity()
  const groupOf = (id) => groups.find((g) => g.modules.some((m) => m.manifest.id === id))?.id
  const nameOf = (id) => {
    const mod = modules.find((m) => m.manifest.id === id)
    return mod ? text(mod.manifest).name : id
  }
  const sum = (field) => modules.reduce((n, m) => n + activity(m.manifest.id)[field], 0)
  const active = modules.filter((m) => activity(m.manifest.id).active)
  const created = modules.reduce((n, m) => n + activity(m.manifest.id).instances.length, 0)
  const servers = sum('servers')
  const clients = sum('clients')
  const sessions = active.reduce((n, m) => n + activity(m.manifest.id).sessions, 0)
  const tools = (groups.find((g) => g.id === 'tools')?.modules ?? []).filter(hasPage)
  const activeTools = tools.filter((m) => activity(m.manifest.id).active).length

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <Stat
          label={t('home.stats.active')}
          value={active.length}
          hint={t('home.stats.activeOf', { count: modules.length, instances: created })}
          highlight={active.length > 0}
        />
        <Stat
          label={t('home.stats.servers')}
          value={servers}
          hint={t('home.stats.serversHint', { count: sessions })}
          highlight={servers > 0}
        />
        <Stat
          label={t('home.stats.clients')}
          value={clients}
          hint={t('home.stats.clientsHint')}
          highlight={clients > 0}
        />
        <Stat
          label={t('home.stats.tools')}
          value={activeTools}
          hint={t('home.stats.toolsHint')}
          highlight={activeTools > 0}
        />
      </div>

      <section className="overflow-hidden rounded-[10px] border border-ink-800 bg-ink-900">
        <h2 className="flex min-h-12 items-center border-b border-ink-800 px-4 text-sm font-semibold text-slate-100">
          {t('home.activeTitle')}
        </h2>
        {active.length > 0 ? (
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div
                className={`grid ${ACTIVE_COLUMNS} gap-3 border-b border-ink-800 px-4 py-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase`}
              >
                <span>{t('home.columns.module')}</span>
                <span>{t('home.columns.endpoint')}</span>
                <span>{t('home.columns.activity')}</span>
              </div>
              <RunningRows modules={active} activity={activity} groupOf={groupOf} onNavigate={onNavigate} />
            </div>
          </div>
        ) : (
          <GettingStarted created={created} onNavigate={onNavigate} />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-100">{t('home.statusTitle')}</h2>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] items-start gap-3">
          {groups.map((group) => {
            const running = group.modules.filter((m) => activity(m.manifest.id).active).length
            return (
              <div key={group.id} className="overflow-hidden rounded-[10px] border border-ink-800 bg-ink-900">
                <div className="flex flex-col gap-0.5 border-b border-ink-800 px-4 py-3">
                  <h3 className="flex items-center justify-between gap-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                    <span className="truncate">{t(`app.groups.${group.id}`)}</span>
                    <span className="font-mono font-normal tracking-normal">
                      {running}/{group.modules.length}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">{t(`home.groups.${group.id}`, null, '')}</p>
                </div>
                <div className="flex flex-col p-1.5">
                  {group.modules.map((mod) => {
                    const { manifest, icon } = mod
                    const a = activity(manifest.id)
                    const { name, description } = text(manifest)
                    const live = a.instances.filter((i) => i.active).length
                    // Module sans page : il complète d'autres modules, dont la page s'ouvre.
                    const extended = hasPage(mod) ? [] : (manifest.extends ?? [])
                    return (
                      <button
                        key={manifest.id}
                        onClick={() => onNavigate(manifest.id)}
                        title={description}
                        className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-left text-sm hover:bg-ink-850"
                      >
                        <Icon icon={icon} className="size-4 shrink-0 text-slate-500" />
                        <span className="min-w-0 flex-1 truncate text-slate-200">{name}</span>
                        {a.active ? (
                          <span className="flex min-w-0 items-center gap-2 text-xs text-emerald-300">
                            <span className="truncate">
                              {live > 1
                                ? t('home.running', { count: live })
                                : a.port
                                  ? `:${a.port}`
                                  : activityLabel(t, a)}
                            </span>
                            <StatusDot on />
                          </span>
                        ) : (
                          <span className="flex min-w-0 items-center gap-2 text-xs text-slate-500">
                            <span className="truncate">
                              {extended.length > 0
                                ? t('home.extends', { names: extended.map(nameOf).join(', ') })
                                : a.instances.length > 0
                                  ? t('home.instances', { count: a.instances.length })
                                  : ''}
                            </span>
                            <StatusDot on={false} />
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <footer className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-ink-800 pt-4 text-xs text-slate-500">
        <span className="font-mono">{t('home.version', { version: APP_VERSION, sdk: MODULE_API_VERSION })}</span>
        <span className="inline-flex items-center gap-1.5">
          <FontAwesomeIcon icon={faScaleBalanced} className="size-3.5" /> {t('home.license')}
        </span>
        <a
          href={REPOSITORY}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 hover:text-sulfur-300"
        >
          <FontAwesomeIcon icon={faBookOpen} className="size-3.5" /> {t('home.repository')}
        </a>
      </footer>
    </div>
  )
}
