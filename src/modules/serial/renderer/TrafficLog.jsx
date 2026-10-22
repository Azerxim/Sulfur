import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Download, Pause, Play, Trash2 } from 'lucide-react'
import { Button, Card, Checkbox, Select, usePersistentState } from '@azerxim/sulfur-sdk/ui'
import { formatTime } from '@azerxim/sulfur-sdk'
import { DEFAULT_DISPLAY_CONFIG, LOG_VIEWS, MAX_LOG } from '../shared/constants'
import { fromHex, textSegments, toHex } from '../shared/codec'
import { serialApi } from './api'
import { t } from '../shared/i18n'

/** Entrées affichées au plus (les plus récentes). */
const MAX_SHOWN = 1000

/** Distance au bas de la liste (px) en deçà de laquelle l'affichage suit les nouvelles entrées. */
const STICK_DISTANCE = 24

const DIRECTIONS = {
  rx: { label: 'RX', className: 'text-sky-300' },
  tx: { label: 'TX', className: 'text-amber-300' }
}

const entryTime = (time) => `${formatTime(time)}.${String(new Date(time).getMilliseconds()).padStart(3, '0')}`

const Row = memo(function Row({ entry, view, timestamps }) {
  const time = timestamps && <span className="shrink-0 text-slate-500 tabular-nums">{entryTime(entry.time)}</span>
  if (entry.dir === 'event') {
    return (
      <div className="flex gap-3 py-0.5">
        {time}
        <span className={`font-sans ${entry.level === 'error' ? 'text-red-300' : 'text-slate-400'}`}>{entry.text}</span>
      </div>
    )
  }
  const bytes = fromHex(entry.hex)
  const dir = DIRECTIONS[entry.dir]
  return (
    <div className="flex gap-3 border-t border-ink-800/60 py-0.5 hover:bg-ink-800/40">
      {time}
      <span className={`w-6 shrink-0 font-semibold ${dir.className}`}>{dir.label}</span>
      <span className="w-12 shrink-0 text-right text-slate-500 tabular-nums">{bytes.length}</span>
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
      {entry.source && <span className="shrink-0 font-sans text-xs text-slate-500">{entry.source}</span>}
    </div>
  )
})

export default function TrafficLog() {
  const [display, setDisplay] = usePersistentState('serial', 'display', DEFAULT_DISPLAY_CONFIG)
  const [entries, setEntries] = useState([])
  const [paused, setPaused] = useState(false)
  const [frozen, setFrozen] = useState(null)
  const [notice, setNotice] = useState(null)
  const listRef = useRef(null)
  const stick = useRef(true)

  useEffect(() => {
    serialApi.log.list().then(setEntries)
    return serialApi.log.onEntries((batch) => setEntries((list) => [...list, ...batch].slice(-MAX_LOG)))
  }, [])

  const source = paused && frozen ? frozen : entries
  const shown = source.slice(-MAX_SHOWN)
  const lastId = shown.at(-1)?.id

  // Affichage collé au bas de la liste tant que l'utilisateur n'est pas remonté dans le journal.
  useLayoutEffect(() => {
    const list = listRef.current
    if (list && stick.current) list.scrollTop = list.scrollHeight
  }, [shown.length, lastId, display.view])

  const togglePause = () => {
    setFrozen(paused ? null : entries)
    setPaused(!paused)
  }

  const exportLog = () =>
    serialApi.log
      .export()
      .then((result) => result && setNotice(t('serial.log.exported', { file: result.filePath })))
      .catch((err) => setNotice(err.message))

  return (
    <Card
      id="serial.log"
      title={t('serial.log.title', { count: entries.length })}
      className="min-h-80 flex-1"
      actions={
        <>
          {paused && <span className="text-xs text-amber-300">{t('serial.log.paused')}</span>}
          <Select
            className="h-7! w-40 text-xs"
            value={display.view}
            onChange={(e) => setDisplay((d) => ({ ...d, view: e.target.value }))}
          >
            {LOG_VIEWS.map((v) => (
              <option key={v} value={v}>
                {t(`serial.log.views.${v}`)}
              </option>
            ))}
          </Select>
          <Checkbox
            className="text-xs"
            label={t('serial.log.timestamps')}
            checked={display.timestamps}
            onChange={(e) => setDisplay((d) => ({ ...d, timestamps: e.target.checked }))}
          />
          <Button
            variant="ghost"
            size="icon"
            title={paused ? t('serial.log.resume') : t('serial.log.pause')}
            onClick={togglePause}
          >
            {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title={t('serial.log.export')}
            disabled={!entries.length}
            onClick={exportLog}
          >
            <Download className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title={t('serial.log.clear')}
            onClick={() =>
              serialApi.log.clear().then((list) => {
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
            {source.length > shown.length && (
              <p className="pb-1 font-sans text-xs text-slate-500">
                {t('serial.log.truncated', { shown: shown.length, count: source.length })}
              </p>
            )}
            {shown.map((entry) => (
              <Row key={entry.id} entry={entry} view={display.view} timestamps={display.timestamps} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">{t('serial.log.empty')}</p>
        )}
      </div>
    </Card>
  )
}
