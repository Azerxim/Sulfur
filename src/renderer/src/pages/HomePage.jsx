import { ArrowRight, BookOpen, ChartLine, ChevronRight, FlaskConical, Play, Save, Scale } from 'lucide-react'
import { StatusDot } from '@azerxim/sulfur-sdk/ui'
import { useEnabledModules } from '../enabled-modules'
import { useI18n, useManifestText } from '../preferences'
import { useModuleActivity } from '../activity'
import { activityLabel } from '../components/PageHeader'

const REPOSITORY = 'https://github.com/Azerxim/Sulfur'

/** Étapes de prise en main (libellés : home.steps.<id>.*), avec la page qu'elles ouvrent. */
const STEPS = [
  { id: 'start', icon: Play, page: 'opcua' },
  { id: 'simulate', icon: FlaskConical, page: 'simulator' },
  { id: 'record', icon: ChartLine, page: 'trends' },
  { id: 'save', icon: Save, page: 'settings' }
]

/** Colonnes du tableau des modules actifs : module, point d'accès, activité, ouverture. */
const ACTIVE_COLUMNS = 'grid-cols-[minmax(160px,1.2fr)_minmax(220px,2fr)_minmax(140px,1fr)_28px]'

function Stat({ label, value, hint }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[10px] border border-ink-800 bg-ink-900 px-4 py-3.5">
      <span className="text-xs text-slate-400">{label}</span>
      <span className="font-mono text-2xl font-medium text-slate-100">{value}</span>
      <span className="text-xs text-slate-500">{hint}</span>
    </div>
  )
}

/**
 * Page d'accueil : vue d'ensemble de ce qui tourne (modules actifs, points d'accès, sessions), prise
 * en main tant que rien ne tourne, puis accès à tous les modules par groupe.
 */
export default function HomePage({ onNavigate = () => {} }) {
  const { t } = useI18n()
  const { groups, modules } = useEnabledModules()
  const text = useManifestText()
  const activity = useModuleActivity()
  const groupOf = (id) => groups.find((g) => g.modules.some((m) => m.manifest.id === id))?.id
  const active = modules.filter((m) => activity(m.manifest.id).active)
  const sessions = active.reduce((n, m) => n + activity(m.manifest.id).sessions, 0)

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-sulfur-300">{t('home.headline')}</p>
        <p className="max-w-3xl text-sm text-slate-400">{t('home.intro')}</p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <Stat
          label={t('home.stats.active')}
          value={active.length}
          hint={t('home.stats.activeOf', { count: modules.length })}
        />
        <Stat label={t('home.stats.sessions')} value={sessions} hint={t('home.stats.sessionsHint')} />
        <Stat
          label={t('home.stats.available')}
          value={modules.length}
          hint={t('home.stats.availableHint', { count: groups.length })}
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
              {active.map(({ manifest }) => {
                const a = activity(manifest.id)
                const { name } = text(manifest)
                return (
                  <div
                    key={manifest.id}
                    className={`grid ${ACTIVE_COLUMNS} items-center gap-3 border-b border-ink-800/60 px-4 py-2.5 last:border-b-0`}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <StatusDot on />
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-medium text-slate-100">{name}</span>
                        <span className="truncate text-xs text-slate-500">
                          {t(`app.groups.${groupOf(manifest.id)}`)}
                        </span>
                      </span>
                    </span>
                    <span className="truncate font-mono text-xs text-slate-200 select-text">{a.endpoint ?? '—'}</span>
                    <span className="text-xs text-slate-400">{activityLabel(t, a)}</span>
                    <button
                      onClick={() => onNavigate(manifest.id)}
                      title={t('home.open', { name })}
                      aria-label={t('home.open', { name })}
                      className="grid size-7 place-items-center rounded-md text-slate-400 hover:bg-ink-850 hover:text-slate-200"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4 p-4">
            <p className="text-sm text-slate-400">{t('home.activeEmpty')}</p>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
              {STEPS.map(({ id, icon: Icon, page }, i) => (
                <button
                  key={id}
                  onClick={() => onNavigate(page)}
                  className="flex flex-col gap-2 rounded-lg border border-ink-800 bg-ink-950 p-4 text-left transition-colors hover:border-sulfur-400/50"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-slate-100">
                    <span className="grid size-6 place-items-center rounded-full bg-ink-850 font-mono text-xs text-sulfur-300">
                      {i + 1}
                    </span>
                    <Icon className="size-4 text-sulfur-400" />
                    {t(`home.steps.${id}.title`)}
                  </span>
                  <span className="text-xs text-slate-400">{t(`home.steps.${id}.text`)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-5">
        <h2 className="text-sm font-semibold text-slate-100">{t('home.allModules')}</h2>
        {groups.map((group) => (
          <div key={group.id} className="flex flex-col gap-3">
            <div>
              <h3 className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                {t(`app.groups.${group.id}`)}
              </h3>
              <p className="text-xs text-slate-500">{t(`home.groups.${group.id}`)}</p>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
              {group.modules.map(({ manifest, icon: Icon }) => (
                <button
                  key={manifest.id}
                  onClick={() => onNavigate(manifest.id)}
                  className="group flex items-start gap-3 rounded-[10px] border border-ink-800 bg-ink-900 p-4 text-left transition-colors hover:border-sulfur-400/50 hover:bg-ink-850"
                >
                  <Icon className="mt-0.5 size-5 shrink-0 text-sulfur-400" />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-center gap-2 text-sm font-medium text-slate-100">
                      {text(manifest).name}
                      {activity(manifest.id).active && <StatusDot on />}
                      <ArrowRight className="ml-auto size-3.5 text-slate-600 opacity-0 transition-opacity group-hover:opacity-100" />
                    </span>
                    <span className="text-xs text-slate-400">{text(manifest).description}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <footer className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-ink-800 pt-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <Scale className="size-3.5" /> {t('home.license')}
        </span>
        <a
          href={REPOSITORY}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 hover:text-sulfur-300"
        >
          <BookOpen className="size-3.5" /> {t('home.repository')}
        </a>
      </footer>
    </div>
  )
}
