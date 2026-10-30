import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Download, Pause, Play, Trash2 } from 'lucide-react'
import { Button, Card, Checkbox, Select, usePersistentState } from '@azerxim/sulfur-sdk/ui'
import { formatTime } from '@azerxim/sulfur-sdk'
import { DEFAULT_DISPLAY_CONFIG, LOG_VIEWS, MAX_LOG } from '../shared/constants'
import { fromHex, textSegments, toHex } from '../shared/codec'
import { proxyApi } from './api'
import { t } from '../shared/i18n'

/** Entrées affichées au plus (les plus récentes). */
const MAX_SHOWN = 1000

/** Distance au bas de la liste (px) en deçà de laquelle l'affichage suit les nouvelles entrées. */
const STICK_DISTANCE = 24

/** Sens du trafic : client → équipement (up), équipement → client (down). */
const DIRECTIONS = {
  up: { arrow: '→', className: 'text-sky-300' },
  down: { arrow: '←', className: 'text-amber-300' }
}

const FAULT_STYLES = {
  blocked: 'bg-red-400/12 text-red-300',
  lost: 'bg-red-400/12 text-red-300',
  corrupted: 'bg-amber-400/12 text-amber-300'
}

const entryTime = (time) => `${formatTime(time)}.${String(new Date(time).getMilliseconds()).padStart(3, '0')}`

const Row = memo(function Row({ entry, view, timestamps, showRule }) {
  const time = timestamps && <span className="shrink-0 text-slate-500 tabular-nums">{entryTime(entry.time)}</span>
  const where = (
    <span className="w-36 shrink-0 truncate font-sans text-xs text-slate-500" title={entry.remote ?? undefined}>
      {showRule && entry.name ? `${entry.name} ` : ''}
      {entry.conn ? `#${entry.conn}` : ''}
    </span>
  )
  if (entry.dir === 'event') {
    const color =
      entry.level === 'error' ? 'text-red-300' : entry.level === 'warn' ? 'text-amber-300' : 'text-slate-400'
    return (
      <div className="flex gap-3 py-0.5">
        {time}
        {where}
        <span className={`font-sans ${color}`}>{entry.text}</span>
      </div>
    )
  }
  const bytes = fromHex(entry.hex)
  const dir = DIRECTIONS[entry.dir]
  return (
    <div
      className={`flex gap-3 border-t border-ink-800/60 py-0.5 hover:bg-ink-850 ${entry.fault === 'blocked' || entry.fault === 'lost' ? 'opacity-60' : ''}`}
    >
      {time}
      {where}
      <span className={`w-4 shrink-0 font-semibold ${dir.className}`} title={t(`proxy.log.dirs.${entry.dir}`)}>
        {dir.arrow}
      </span>
      <span
        className="w-12 shrink-0 text-right text-slate-500 tabular-nums"
        title={
          entry.size > bytes.length ? t('proxy.log.partial', { shown: bytes.length, size: entry.size }) : undefined
        }
      >
        {entry.size}
        {entry.size > bytes.length ? '+' : ''}
      </span>
      <div className="flex min-w-0 flex-1 gap-4 select-text">
        {view !== 'text' && (
          <span className={`break-all text-slate-200 ${view === 'both' ? 'flex-[3]' : 'flex-1'}`}>{toHex(bytes)}</span>
        )}
        {view !== 'hex' && (
          <span className={`break-all ${view === 'both' ? 'flex-[2]' : 'flex-1'}`}>
            {textSegments(bytes).map((s, i) => (
              <span key={i} className={s.control ? 'text-slate-500' : 'text-slate-200'}>
                {s.text}
              </span>
            ))}
          </span>
        )}
      </div>
      <span className="flex shrink-0 items-start gap-1.5 font-sans text-[11px]">
        {entry.delay > 0 && <span className="text-slate-500">{t('proxy.log.delay', { ms: entry.delay })}</span>}
        {entry.fault && (
          <span className={`rounded px-1.5 font-medium ${FAULT_STYLES[entry.fault]}`}>
            {t(`proxy.log.faults.${entry.fault}`)}
          </span>
        )}
      </span>
    </div>
  )
})

/**
 * Journal du proxy : données relayées dans les deux sens (hexadécimal et texte), connexions, défauts
 * appliqués et erreurs, filtrable par redirection ; figeable, exportable et effaçable.
 */
export default function TrafficLog({ rules }) {
  const [display, setDisplay] = usePersistentState('proxy', 'display', DEFAULT_DISPLAY_CONFIG)
  const [entries, setEntries] = useState([])
  const [paused, setPaused] = useState(false)
  const [frozen, setFrozen] = useState(null)
  const [notice, setNotice] = useState(null)
  const listRef = useRef(null)
  const stick = useRef(true)

  useEffect(() => {
    proxyApi.log.list().then(setEntries)
    // Capture des données : réglage enregistré appliqué au proxy.
    proxyApi.capture(display.capture).catch(() => {})
    return proxyApi.log.onEntries((batch) => setEntries((list) => [...list, ...batch].slice(-MAX_LOG)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const source = paused && frozen ? frozen : entries
  const filtered = display.rule ? source.filter((e) => e.rule === display.rule || e.rule === null) : source
  const shown = filtered.slice(-MAX_SHOWN)
  const lastId = shown.at(-1)?.id

  // Affichage collé au bas de la liste tant que l'utilisateur n'est pas remonté dans le journal.
  useLayoutEffect(() => {
    const list = listRef.current
    if (list && stick.current) list.scrollTop = list.scrollHeight
  }, [shown.length, lastId, display.view])

  const set = (patch) => setDisplay((d) => ({ ...d, ...patch }))

  const togglePause = () => {
    setFrozen(paused ? null : entries)
    setPaused(!paused)
  }

  const exportLog = () =>
    proxyApi.log
      .export()
      .then((result) => result && setNotice(t('proxy.log.exported', { file: result.filePath })))
      .catch((err) => setNotice(err.message))

  return (
    <Card
      id="proxy.log"
      title={t('proxy.log.title', { count: entries.length })}
      className="min-h-80 flex-1"
      actions={
        <>
          {paused && <span className="text-xs text-amber-300">{t('proxy.log.paused')}</span>}
          <Select
            className="h-7! w-48 text-xs"
            value={display.rule}
            aria-label={t('proxy.log.allRules')}
            onChange={(e) => set({ rule: e.target.value })}
          >
            <option value="">{t('proxy.log.allRules')}</option>
            {rules.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
          <Select className="h-7! w-40 text-xs" value={display.view} onChange={(e) => set({ view: e.target.value })}>
            {LOG_VIEWS.map((v) => (
              <option key={v} value={v}>
                {t(`proxy.log.views.${v}`)}
              </option>
            ))}
          </Select>
          <span title={t('proxy.log.captureHint')}>
            <Checkbox
              className="text-xs"
              label={t('proxy.log.capture')}
              checked={display.capture}
              onChange={(e) => {
                set({ capture: e.target.checked })
                proxyApi.capture(e.target.checked).catch((err) => setNotice(err.message))
              }}
            />
          </span>
          <Checkbox
            className="text-xs"
            label={t('proxy.log.timestamps')}
            checked={display.timestamps}
            onChange={(e) => set({ timestamps: e.target.checked })}
          />
          <Button
            variant="ghost"
            size="icon"
            title={paused ? t('proxy.log.resume') : t('proxy.log.pause')}
            onClick={togglePause}
          >
            {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title={t('proxy.log.export')}
            disabled={!entries.length}
            onClick={exportLog}
          >
            <Download className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title={t('proxy.log.clear')}
            onClick={() =>
              proxyApi.log.clear().then((list) => {
                setEntries(list)
                setFrozen(paused ? list : null)
                setNotice(null)
              })
            }
          >
            <Trash2 className="size-3.5" />
          </Button>
        </>
      }
    >
      <div className="flex h-full min-h-64 flex-col gap-2">
        {notice && <p className="text-xs break-all text-slate-400">{notice}</p>}
        {shown.length ? (
          <div
            ref={listRef}
            className="min-h-0 flex-1 overflow-auto font-mono text-[13px]"
            onScroll={(e) => {
              const el = e.currentTarget
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_DISTANCE
            }}
          >
            {filtered.length > shown.length && (
              <p className="pb-1 font-sans text-xs text-slate-500">
                {t('proxy.log.truncated', { shown: shown.length, count: filtered.length })}
              </p>
            )}
            {shown.map((entry) => (
              <Row
                key={entry.id}
                entry={entry}
                view={display.view}
                timestamps={display.timestamps}
                showRule={!display.rule}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t('proxy.log.empty')}</p>
        )}
      </div>
    </Card>
  )
}
