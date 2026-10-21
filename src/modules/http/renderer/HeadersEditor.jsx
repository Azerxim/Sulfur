import { Plus, X } from 'lucide-react'
import { Button, Input } from '@azerxim/sulfur-sdk/ui'
import { t } from '../shared/i18n'

/** Liste d'en-têtes HTTP [{ name, value }] modifiable. */
export default function HeadersEditor({ value = [], onChange, disabled }) {
  const update = (i, patch) => onChange(value.map((h, j) => (j === i ? { ...h, ...patch } : h)))
  return (
    <div className="flex flex-col gap-1.5">
      {value.map((h, i) => (
        <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] gap-1.5">
          <Input
            className="font-mono"
            placeholder={t('http.headers.name')}
            value={h.name ?? ''}
            disabled={disabled}
            onChange={(e) => update(i, { name: e.target.value })}
          />
          <Input
            className="font-mono"
            placeholder={t('http.headers.value')}
            value={h.value ?? ''}
            disabled={disabled}
            onChange={(e) => update(i, { value: e.target.value })}
          />
          <Button
            variant="ghost"
            size="icon"
            className="mt-1"
            title={t('ui.remove2')}
            disabled={disabled}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        className="self-start"
        disabled={disabled}
        onClick={() => onChange([...value, { name: '', value: '' }])}
      >
        <Plus className="size-3.5" /> {t('http.headers.add')}
      </Button>
    </div>
  )
}
