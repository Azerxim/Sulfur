import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChartLine, Circle, Download, Eraser, Eye, EyeOff, List, LocateFixed, Square, X } from 'lucide-react'
import { Button, Card, CommitInput, ErrorBanner, Field, Select, Tabs, useStoredState } from '@renderer/components/ui'
import { usePersistentState } from '@renderer/module-config'
import { getLocale } from '@shared/i18n'
import { DEFAULT_CONFIG, MAX_ROWS, MIN_INTERVAL, WINDOWS } from '../shared/constants'
import { trendsApi } from './api'
import { MAX_SERIES, freeSlot, seriesColor } from './palette'
import TrendChart, { formatNumber } from './TrendChart'
import { useTheme } from './useTheme'
import { t } from '../shared/i18n'

/** Fréquence de rafraîchissement de la liste des points (les surveillances des clients changent). */
const POINTS_REFRESH = 3000

const pointLabel = (p) => `${p.moduleName} · ${t(`trends.groups.${p.group}`)} · ${p.name}`

export default function TrendsView() {
  const [config, setConfig] = usePersistentState('trends', 'config', DEFAULT_CONFIG)
  const [points, setPoints] = useState([])
  const [status, setStatus] = useState({ recording: false, count: 0 })
  const [rows, setRows] = useState([])
  const [paused, setPaused] = useState(false)
  const [cursor, setCursor] = useState(null)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [tab, setTab] = useStoredState('sulfur:tab:trends', 'chart', ['chart', 'series'])
  const theme = useTheme()
  const recording = status.recording

  useEffect(() => {
    const load = () => trendsApi.points().then(setPoints, () => {})
    load()
    const timer = setInterval(load, POINTS_REFRESH)
    trendsApi.status().then(setStatus)
    trendsApi.data().then(setRows)
    const offs = [
      trendsApi.onStatus(setStatus),
      trendsApi.onSamples(({ rows: added, count }) => {
        setRows((all) => [...all, ...added].slice(-MAX_ROWS))
        setStatus((current) => ({ ...current, count }))
      })
    ]
    return () => {
      clearInterval(timer)
      offs.forEach((off) => off())
    }
  }, [])

  async function run(action) {
    setError(null)
    setNotice(null)
    try {
      return await action()
    } catch (err) {
      setError(err.message)
    }
  }

  const update = (patch) => setConfig((c) => ({ ...c, ...patch }))

  function changeSeries(series) {
    update({ series })
    if (recording) run(() => trendsApi.setSeries(series.map((s) => s.key)))
  }

  const addSeries = (key) => {
    const slot = freeSlot(config.series)
    if (key && slot >= 0) changeSeries([...config.series, { key, slot, hidden: false }])
  }

  const byKey = useMemo(() => Object.fromEntries(points.map((p) => [p.key, p])), [points])
  const series = config.series.map((s) => ({ ...s, label: byKey[s.key] ? pointLabel(byKey[s.key]) : s.key }))

  // Échantillons de la fenêtre affichée et échelle de temps suivie.
  const { data, range } = useMemo(() => {
    const last = rows.at(-1)?.t ?? Date.now()
    const follow = !paused && config.window > 0
    const shown = follow ? rows.filter((r) => r.t >= last - config.window) : rows
    return {
      data: [shown.map((r) => r.t / 1000), ...config.series.map((s) => shown.map((r) => r.values[s.key] ?? null))],
      // Tant que la fenêtre n'est pas remplie, l'axe commence au premier échantillon.
      range: follow ? { min: Math.max(last - config.window, rows[0]?.t ?? last) / 1000, max: last / 1000 } : null
    }
  }, [rows, config.series, config.window, paused])

  const onZoom = useCallback(() => setPaused(true), [])
  const stats = (i) => {
    let min = null
    let max = null
    let last = null
    for (const v of data[i + 1]) {
      if (v === null) continue
      if (min === null || v < min) min = v
      if (max === null || v > max) max = v
      last = v
    }
    return { current: cursor !== null ? data[i + 1][cursor] : last, min, max }
  }

  const available = points.filter((p) => !config.series.some((s) => s.key === p.key))
  const groups = Object.entries(Object.groupBy(available, (p) => `${p.moduleName} · ${t(`trends.groups.${p.group}`)}`))
  const visible = series.filter((s) => !s.hidden)
  const split = config.layout === 'split'

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-6">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          {
            id: 'chart',
            label: t('trends.chart.title'),
            icon: ChartLine,
            badge: recording && <span className="size-1.5 animate-pulse rounded-full bg-red-400" />
          },
          { id: 'series', label: t('trends.series.title', { count: config.series.length }), icon: List }
        ]}
      />
      {tab === 'chart' && (
        <Card
          id="trends.chart"
          title={t('trends.chart.title')}
          fill
          actions={
            <>
              <span className="text-xs text-slate-500 tabular-nums">
                {recording
                  ? t('trends.recording.running', { count: status.count.toLocaleString(getLocale()) })
                  : t('trends.recording.stopped', { count: status.count.toLocaleString(getLocale()) })}
              </span>
              {recording ? (
                <Button variant="danger" size="sm" onClick={() => run(trendsApi.stop)}>
                  <Square className="size-3.5" /> {t('trends.recording.stop')}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!config.series.length}
                  onClick={() =>
                    run(() => trendsApi.start({ series: config.series.map((s) => s.key), interval: config.interval }))
                  }
                >
                  <Circle className="size-3.5" /> {t('trends.recording.start')}
                </Button>
              )}
              <Button
                size="sm"
                disabled={!status.count}
                onClick={() =>
                  run(async () => {
                    await trendsApi.clear()
                    setRows([])
                    setPaused(false)
                  })
                }
              >
                <Eraser className="size-3.5" /> {t('trends.recording.clear')}
              </Button>
              <Button
                size="sm"
                disabled={!status.count}
                onClick={() =>
                  run(async () => {
                    const result = await trendsApi.exportCsv(config.decimal)
                    if (result) setNotice(t('trends.recording.exported', { file: result.filePath }))
                  })
                }
              >
                <Download className="size-3.5" /> {t('trends.recording.export')}
              </Button>
            </>
          }
        >
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <Field label={t('trends.chart.window')} className="w-32">
                <Select
                  value={config.window}
                  onChange={(e) => {
                    update({ window: Number(e.target.value) })
                    setPaused(false)
                  }}
                >
                  {WINDOWS.map((ms) => (
                    <option key={ms} value={ms}>
                      {t(`trends.chart.windows.${ms}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('trends.chart.layout')} className="w-52">
                <Select value={config.layout ?? 'shared'} onChange={(e) => update({ layout: e.target.value })}>
                  <option value="shared">{t('trends.chart.shared')}</option>
                  <option value="split">{t('trends.chart.split')}</option>
                </Select>
              </Field>
              <Field label={t('trends.recording.interval')} className="w-48">
                <CommitInput
                  type="number"
                  min={MIN_INTERVAL}
                  value={config.interval}
                  disabled={recording}
                  onCommit={(raw) => update({ interval: Math.max(MIN_INTERVAL, Number(raw) || MIN_INTERVAL) })}
                />
              </Field>
              <Field label={t('trends.recording.decimal')} className="w-44">
                <Select value={config.decimal} onChange={(e) => update({ decimal: e.target.value })}>
                  <option value=".">{t('trends.recording.decimalPoint')}</option>
                  <option value=",">{t('trends.recording.decimalComma')}</option>
                </Select>
              </Field>
              {paused && (
                <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
                  {t('trends.chart.paused')}
                  <Button size="sm" onClick={() => setPaused(false)}>
                    <LocateFixed className="size-3.5" /> {t('trends.chart.follow')}
                  </Button>
                </div>
              )}
            </div>
            <ErrorBanner error={error} onClose={() => setError(null)} />
            {notice && <p className="text-xs break-all text-emerald-300">{notice}</p>}

            {!visible.length || !rows.length ? (
              <div className="grid min-h-60 flex-1 place-items-center rounded-md border border-dashed border-ink-700 text-sm text-slate-500">
                {!config.series.length
                  ? t('trends.chart.empty')
                  : recording
                    ? t('trends.chart.waiting')
                    : t('trends.chart.empty')}
              </div>
            ) : split ? (
              <div className="flex flex-col gap-2">
                {visible.map((s) => {
                  const i = series.indexOf(s)
                  return (
                    <div key={s.key}>
                      <div className="mb-1 flex items-center gap-2 text-xs text-slate-300">
                        <span className="h-0.5 w-4 rounded" style={{ background: seriesColor(s.slot, theme) }} />
                        {s.label}
                      </div>
                      <TrendChart
                        series={[s]}
                        data={[data[0], data[i + 1]]}
                        range={range}
                        paused={paused}
                        theme={theme}
                        height={150}
                        syncKey="sulfur-trends"
                        onZoom={onZoom}
                        onCursor={setCursor}
                      />
                    </div>
                  )
                })}
              </div>
            ) : (
              <TrendChart
                series={series}
                data={data}
                range={range}
                paused={paused}
                theme={theme}
                height="fill"
                onZoom={onZoom}
                onCursor={setCursor}
              />
            )}
            <p className="text-xs text-slate-500">
              {t('trends.chart.hint')} {t('trends.recording.limit', { count: MAX_ROWS.toLocaleString(getLocale()) })}
            </p>
          </div>
        </Card>
      )}

      {tab === 'series' && (
        <Card
          id="trends.series"
          title={t('trends.series.title', { count: config.series.length })}
          fill
          actions={
            <Select
              className="h-7! w-72 text-xs"
              value=""
              disabled={config.series.length >= MAX_SERIES || !available.length}
              title={config.series.length >= MAX_SERIES ? t('trends.series.tooMany', { count: MAX_SERIES }) : undefined}
              onChange={(e) => addSeries(e.target.value)}
            >
              <option value="">{t('trends.series.add')}</option>
              {groups.map(([group, list]) => (
                <optgroup key={group} label={group}>
                  {list.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          }
        >
          {!config.series.length ? (
            <p className="text-sm text-slate-500">
              {points.length ? t('trends.chart.empty') : t('trends.series.none')}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="pb-2 font-medium">{t('trends.series.point')}</th>
                  <th className="pb-2 text-right font-medium">
                    {cursor !== null ? t('trends.series.atCursor') : t('trends.series.last')}
                  </th>
                  <th className="pb-2 text-right font-medium">{t('trends.series.min')}</th>
                  <th className="pb-2 text-right font-medium">{t('trends.series.max')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {series.map((s, i) => {
                  const { current, min, max } = stats(i)
                  return (
                    <tr key={s.key} className={`border-t border-ink-800 ${s.hidden ? 'opacity-50' : ''}`}>
                      <td className="py-1.5 pr-3">
                        <span className="flex items-center gap-2 text-slate-200">
                          <span
                            className="h-0.5 w-4 shrink-0 rounded"
                            style={{ background: seriesColor(s.slot, theme) }}
                          />
                          {s.label}
                          {!byKey[s.key] && (
                            <span className="text-xs text-slate-500">({t('trends.series.unavailable')})</span>
                          )}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 text-right font-semibold text-slate-100 tabular-nums">
                        {formatNumber(current)}
                      </td>
                      <td className="py-1.5 pr-3 text-right text-slate-400 tabular-nums">{formatNumber(min)}</td>
                      <td className="py-1.5 pr-3 text-right text-slate-400 tabular-nums">{formatNumber(max)}</td>
                      <td className="w-20 py-1.5 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="icon"
                          title={s.hidden ? t('trends.series.show') : t('trends.series.hide')}
                          onClick={() =>
                            update({
                              series: config.series.map((x) => (x.key === s.key ? { ...x, hidden: !x.hidden } : x))
                            })
                          }
                        >
                          {s.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t('trends.series.remove')}
                          onClick={() => changeSeries(config.series.filter((x) => x.key !== s.key))}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  )
}
