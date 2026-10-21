import { ArrowRight, BookOpen, ChartLine, FlaskConical, Play, Save, Scale } from 'lucide-react'
import { Card } from '@azerxim/sulfur-sdk/ui'
import { useEnabledModules } from '../enabled-modules'
import { useI18n, useManifestText } from '../preferences'
// Seul le champ `version` est intégré au build (import nommé d'un fichier JSON).
import { version } from '../../../../package.json'

const REPOSITORY = 'https://github.com/Azerxim/Sulfur'

/** Étapes de prise en main (libellés : home.steps.<id>.*), avec la page qu'elles ouvrent. */
const STEPS = [
  { id: 'start', icon: Play, page: 'opcua' },
  { id: 'simulate', icon: FlaskConical, page: 'simulator' },
  { id: 'record', icon: ChartLine, page: 'trends' },
  { id: 'save', icon: Save, page: 'settings' }
]

/** Page d'accueil : présentation de Sulfur, prise en main et accès aux modules par groupe. */
export default function HomePage({ onNavigate = () => {} }) {
  const { t } = useI18n()
  const { groups } = useEnabledModules()
  const text = useManifestText()

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <section className="flex items-center gap-5 rounded-lg border border-ink-800 bg-ink-900 px-6 py-6">
        <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-sulfur-400 text-3xl font-bold text-on-accent">
          S
        </div>
        <div className="flex flex-col gap-1.5">
          <h2 className="flex items-baseline gap-3 text-2xl font-semibold text-slate-100">
            Sulfur <span className="text-sm font-normal text-slate-500">v{version}</span>
          </h2>
          <p className="text-sm text-sulfur-300">{t('home.headline')}</p>
          <p className="max-w-3xl text-sm text-slate-400">{t('home.intro')}</p>
        </div>
      </section>

      <Card id="home.steps" title={t('home.stepsTitle')} collapsible={false}>
        <div className="grid grid-cols-4 gap-3">
          {STEPS.map(({ id, icon: Icon, page }, i) => (
            <button
              key={id}
              onClick={() => onNavigate(page)}
              className="group flex flex-col gap-2 rounded-md border border-ink-800 bg-ink-950 p-4 text-left transition-colors hover:border-sulfur-500/50"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
                <span className="grid size-6 place-items-center rounded-full bg-ink-800 text-xs text-sulfur-300">
                  {i + 1}
                </span>
                <Icon className="size-4 text-sulfur-400" />
                {t(`home.steps.${id}.title`)}
              </div>
              <p className="text-xs text-slate-400">{t(`home.steps.${id}.text`)}</p>
            </button>
          ))}
        </div>
      </Card>

      {groups.map((group) => (
        <section key={group.id} className="flex flex-col gap-3">
          <div>
            <h3 className="text-[11px] font-medium tracking-wider text-slate-500 uppercase">
              {t(`app.groups.${group.id}`)}
            </h3>
            <p className="text-xs text-slate-500">{t(`home.groups.${group.id}`)}</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {group.modules.map(({ manifest, icon: Icon }) => (
              <button
                key={manifest.id}
                onClick={() => onNavigate(manifest.id)}
                className="group flex items-start gap-3 rounded-lg border border-ink-800 bg-ink-900 p-4 text-left transition-colors hover:border-sulfur-500/50 hover:bg-ink-850"
              >
                <Icon className="mt-0.5 size-5 shrink-0 text-sulfur-400" />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-center gap-1 text-sm font-medium text-slate-100">
                    {text(manifest).name}
                    <ArrowRight className="size-3.5 text-slate-600 opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                  <span className="text-xs text-slate-400">{text(manifest).description}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}

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
