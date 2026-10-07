import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { getLocale } from '@shared/i18n'
import { seriesColor } from './palette'

export const formatNumber = (v) =>
  v === null || v === undefined || Number.isNaN(v)
    ? '—'
    : v.toLocaleString(getLocale(), { maximumFractionDigits: Math.abs(v) >= 100 ? 1 : 3 })

/** Pas des graduations de temps (s) : l'heure est affichée à la seconde. */
const TIME_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 21600, 43200, 86400]

const formatClock = (seconds) => new Date(seconds * 1000).toLocaleTimeString(getLocale(), { hour12: false })

/** Couleurs de l'habillage (axes, grille) lues dans le thème courant. */
function chromeColors(el) {
  const style = getComputedStyle(el)
  return { text: style.color, grid: style.borderColor }
}

/**
 * Graphique temporel (uPlot) : un seul axe vertical, réticule et info-bulle listant toutes les
 * courbes, zoom par glisser (qui suspend le suivi), curseur synchronisé entre graphiques (`syncKey`).
 *
 *  - series : [{ key, label, slot, hidden }]
 *  - data   : [instants (s), ...valeurs par courbe]
 *  - range  : { min, max } (s) imposé quand le suivi est actif, sinon null
 *  - paused : échelle de temps figée (zoom de l'utilisateur) ; sinon, tout l'enregistrement
 */
export default function TrendChart({ series, data, range, paused, theme, height = 320, syncKey, onZoom, onCursor }) {
  const root = useRef(null)
  const plot = useRef(null)
  const chart = useRef(null)
  const latest = useRef({ data, range, onZoom, onCursor })
  latest.current = { data, range, onZoom, onCursor }
  const [tip, setTip] = useState(null)

  const shape = series.map((s) => `${s.key}:${s.slot}:${s.hidden ? 0 : 1}`).join() + `|${theme}|${height}`

  // (Re)création du graphique quand les courbes, le thème ou la taille changent.
  useLayoutEffect(() => {
    const el = root.current
    const { text, grid } = chromeColors(el)
    const axis = {
      stroke: text,
      grid: { stroke: grid, width: 1 },
      ticks: { stroke: grid, width: 1 },
      font: '11px system-ui'
    }
    let selecting = false
    const u = new uPlot(
      {
        width: el.clientWidth || 600,
        height,
        legend: { show: false },
        scales: { x: { time: true } },
        cursor: {
          drag: { x: true, y: false, setScale: true },
          points: { size: 8, width: 2 },
          ...(syncKey ? { sync: { key: syncKey } } : {})
        },
        axes: [
          { ...axis, incrs: TIME_STEPS, values: (_u, ticks) => ticks.map(formatClock) },
          { ...axis, size: 64, values: (_u, ticks) => ticks.map(formatNumber) }
        ],
        series: [
          {},
          ...series.map((s) => ({
            label: s.label,
            stroke: seriesColor(s.slot, theme),
            width: 2,
            show: !s.hidden,
            points: { show: false },
            spanGaps: false
          }))
        ],
        hooks: {
          setSelect: [
            (u) => {
              if (u.select.width > 0) selecting = true
            }
          ],
          setScale: [
            (u, key) => {
              if (key === 'x' && selecting) {
                selecting = false
                latest.current.onZoom?.()
              }
            }
          ],
          setCursor: [
            (u) => {
              const idx = u.cursor.idx
              latest.current.onCursor?.(idx ?? null)
              if (idx === null || idx === undefined || u.cursor.left < 0) return setTip(null)
              setTip({
                idx,
                left: u.cursor.left,
                top: u.cursor.top,
                width: u.over.clientWidth,
                offset: u.over.offsetLeft,
                offsetTop: u.over.offsetTop
              })
            }
          ]
        }
      },
      latest.current.data,
      plot.current
    )
    chart.current = u
    if (latest.current.range) u.setScale('x', latest.current.range)
    const observer = new ResizeObserver(() => u.setSize({ width: el.clientWidth, height }))
    observer.observe(el)
    return () => {
      observer.disconnect()
      u.destroy()
      chart.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape, syncKey])

  // Nouvelles données : mise à jour sans recréer le graphique (fenêtre suivie, ou zoom conservé).
  useEffect(() => {
    const u = chart.current
    if (!u) return
    if (range || paused) {
      const { min, max } = u.scales.x
      u.setData(data, false)
      u.setScale('x', range ?? { min, max })
    } else {
      u.setData(data)
    }
  }, [data, range, paused])

  const time = tip ? data[0][tip.idx] : null
  return (
    <div className="relative border-ink-800 text-slate-400" ref={root}>
      <div ref={plot} />
      {tip && time !== undefined && (
        <div
          className="pointer-events-none absolute z-10 min-w-36 rounded-md border border-ink-700 bg-ink-900/95 px-2.5 py-1.5 text-xs shadow-lg"
          style={{
            top: tip.offsetTop + Math.max(0, tip.top - 12),
            left: tip.offset + tip.left + (tip.left > tip.width / 2 ? -12 : 12),
            transform: tip.left > tip.width / 2 ? 'translateX(-100%)' : undefined
          }}
        >
          <div className="mb-1 text-slate-500 tabular-nums">{formatClock(time)}</div>
          {series.map((s, i) =>
            s.hidden ? null : (
              <div key={s.key} className="flex items-center gap-2">
                <span className="h-0.5 w-3 rounded" style={{ background: seriesColor(s.slot, theme) }} />
                <span className="font-semibold text-slate-100 tabular-nums">
                  {formatNumber(data[i + 1]?.[tip.idx])}
                </span>
                <span className="truncate text-slate-400">{s.label}</span>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
