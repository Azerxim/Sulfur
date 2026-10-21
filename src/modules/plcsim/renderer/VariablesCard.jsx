import { useEffect, useMemo, useState } from 'react'
import { Eye, RefreshCw, Search } from 'lucide-react'
import { Button, Card, Checkbox, ErrorBanner, Field, Input, Select, usePersistentState } from '@azerxim/sulfur-sdk/ui'
import { ADDRESS_TYPES } from '../shared/constants'
import { plcsimApi } from './api'
import { t } from '../shared/i18n'

/** Variables affichées au plus (le filtre permet d'atteindre les autres). */
const MAX_SHOWN = 300

/** Adresse d'une variable de la table : %I0.1, %MW10, DB1.DBX2.0… (indicative). */
function tagAddress(tag) {
  const area = { Input: 'I', Output: 'Q', Marker: 'M', DataBlock: 'DB', Counter: 'C', Timer: 'T' }[tag.area]
  if (!area) return ''
  return tag.primitive === 'Bool' ? `${area} ${tag.offset}.${tag.bit}` : `${area} ${tag.offset}`
}

/**
 * Variables de l'instance choisie : table des variables du programme (chargé depuis TIA Portal),
 * ou adresse d'entrée, de sortie ou de mémento. « Surveiller » ajoute la variable aux surveillances.
 */
/** Variables de l'instance choisie (liste déroulante de l'en-tête, partagée avec la liste des instances). */
export default function VariablesCard({ status, instance, onSelect }) {
  const [tags, setTags] = useState(null)
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [form, setForm] = usePersistentState('plcsim', 'addressWatch', {
    address: 'I0.0',
    dataType: 'Bool',
    label: '',
    hmiOnly: true
  })
  const connected = status.connected
  const running = instance && instance.state !== 'Off'

  // Nouvelle instance choisie : sa table des variables doit être relue.
  useEffect(() => {
    setTags(null)
    setError(null)
  }, [instance?.name])

  async function run(action) {
    setBusy(true)
    setError(null)
    try {
      return await action()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const load = () => run(async () => setTags(await plcsimApi.tags(instance.name, { hmiOnly: form.hmiOnly })))

  const shown = useMemo(() => {
    if (!tags) return []
    const words = filter.toLowerCase().split(/\s+/).filter(Boolean)
    return tags.filter((tag) => words.every((w) => tag.name.toLowerCase().includes(w))).slice(0, MAX_SHOWN)
  }, [tags, filter])

  const watchTag = (tag) =>
    run(() =>
      plcsimApi.addWatch({
        instance: instance.name,
        kind: 'tag',
        name: tag.name,
        type: tag.type,
        dataType: tag.dataType
      })
    )

  const watchAddress = () =>
    run(() =>
      plcsimApi.addWatch({
        instance: instance.name,
        kind: 'address',
        address: form.address,
        dataType: form.dataType,
        label: form.label.trim()
      })
    )

  return (
    <Card
      id="plcsim.variables"
      title={instance ? t('plcsim.variables.title', { name: instance.name }) : t('plcsim.variables.titleNone')}
      className="shrink-0"
      actions={
        connected &&
        status.instances.length > 1 && (
          <Select
            className="h-7! w-56 text-xs"
            value={instance?.name ?? ''}
            title={t('plcsim.watches.instance')}
            onChange={(e) => onSelect(e.target.value)}
          >
            {status.instances.map((i) => (
              <option key={i.id} value={i.name}>
                {i.name} · {t(`plcsim.states.${i.state}`, null, i.state)}
              </option>
            ))}
          </Select>
        )
      }
    >
      {!connected || !instance ? (
        <p className="text-sm text-slate-500">{t('plcsim.variables.noInstance')}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[1fr_1fr_1.2fr_auto] items-end gap-3">
            <Field label={t('plcsim.variables.address')}>
              <Input
                className="font-mono"
                value={form.address}
                placeholder="I0.0, QW2, MD10"
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </Field>
            <Field label={t('ui.type')}>
              <Select value={form.dataType} onChange={(e) => setForm((f) => ({ ...f, dataType: e.target.value }))}>
                {ADDRESS_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t('plcsim.variables.label')}>
              <Input
                value={form.label}
                placeholder={t('plcsim.variables.labelPlaceholder')}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              />
            </Field>
            <Button disabled={busy} onClick={watchAddress}>
              <Eye className="size-4" /> {t('plcsim.variables.watch')}
            </Button>
          </div>
          <p className="text-xs text-slate-500">{t('plcsim.variables.addressHint')}</p>

          <div className="flex flex-wrap items-end gap-3">
            <Button variant="primary" disabled={busy || !running} onClick={load}>
              <RefreshCw className="size-4" /> {tags ? t('plcsim.variables.reload') : t('plcsim.variables.load')}
            </Button>
            <Checkbox
              className="mb-2"
              label={t('plcsim.variables.hmiOnly')}
              checked={form.hmiOnly}
              onChange={(e) => setForm((f) => ({ ...f, hmiOnly: e.target.checked }))}
            />
            {tags && (
              <div className="relative ml-auto w-72">
                <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-slate-500" />
                <Input
                  className="pl-8"
                  value={filter}
                  placeholder={t('plcsim.variables.filter')}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
            )}
          </div>
          {!running && <p className="text-xs text-slate-500">{t('plcsim.variables.needsPower')}</p>}

          {tags &&
            (tags.length ? (
              <div className="max-h-96 overflow-auto rounded-md border border-ink-800">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-ink-900 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">{t('ui.name')}</th>
                      <th className="px-3 py-1.5 font-medium">{t('ui.type')}</th>
                      <th className="px-3 py-1.5 font-medium">{t('plcsim.variables.location')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((tag) => (
                      <tr key={tag.name} className="border-t border-ink-800">
                        <td className="px-3 py-1 font-mono text-[13px] text-slate-200 select-text">{tag.name}</td>
                        <td className="px-3 py-1 text-xs text-slate-400">{tag.dataType}</td>
                        <td className="px-3 py-1 font-mono text-xs text-slate-500">{tagAddress(tag)}</td>
                        <td className="px-2 py-1 text-right">
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => watchTag(tag)}>
                            <Eye className="size-3.5" /> {t('plcsim.variables.watch')}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {shown.length === MAX_SHOWN && (
                  <p className="px-3 py-2 text-xs text-slate-500">
                    {t('plcsim.variables.truncated', { count: MAX_SHOWN, total: tags.length })}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">{t('plcsim.variables.empty')}</p>
            ))}
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      )}
    </Card>
  )
}
