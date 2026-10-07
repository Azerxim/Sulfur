import { Plus, Trash2 } from 'lucide-react'
import { Button, Card, CommitInput } from '@renderer/components/ui'
import { DATA_TYPES } from '../shared/constants'
import { NAME_PATTERN } from '../shared/fields'
import FieldsInput from './FieldsInput'
import { t } from '../shared/i18n'

function uniqueName(structures) {
  const names = new Set(structures.map((s) => s.name))
  let i = structures.length + 1
  while (names.has(`Structure${i}`)) i++
  return `Structure${i}`
}

/** Problème d'un type structuré, ou null. */
export function structureProblem(structure, structures) {
  if (!NAME_PATTERN.test(structure.name) || DATA_TYPES.includes(structure.name)) return 'name'
  if (structures.filter((s) => s.name === structure.name).length > 1) return 'name'
  if (!structure.fields?.length) return 'fields'
  return null
}

/** Types structurés (ExtensionObject), modifiables serveur arrêté. */
export default function ServerStructures({ structures, locked, onChange, onError }) {
  const update = (id, patch) => onChange(structures.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const add = () =>
    onChange([
      ...structures,
      {
        id: crypto.randomUUID(),
        name: uniqueName(structures),
        fields: [
          { name: 'X', dataType: 'Double', array: false },
          { name: 'Y', dataType: 'Double', array: false }
        ]
      }
    ])

  return (
    <Card
      id="opcua.server.structures"
      title={t('opcua.structures.title', { count: structures.length })}
      className="shrink-0"
      defaultCollapsed
      actions={
        <>
          {locked && <span className="text-xs text-slate-500">{t('ui.lockedWhileRunning')}</span>}
          <Button size="sm" disabled={locked} onClick={add}>
            <Plus className="size-3.5" /> {t('ui.add')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <p className="text-xs text-slate-500">{t('opcua.structures.hint')}</p>
        {structures.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="w-56 px-1.5 pb-2 font-medium">{t('ui.name')}</th>
                <th className="px-1.5 pb-2 font-medium">{t('opcua.structures.fields')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {structures.map((s) => {
                const problem = structureProblem(s, structures)
                return (
                  <tr key={s.id}>
                    <td className="p-1.5">
                      <CommitInput
                        value={s.name}
                        disabled={locked}
                        className={problem === 'name' ? 'border-red-500/60' : ''}
                        onCommit={(name) => update(s.id, { name: name.trim() })}
                      />
                    </td>
                    <td className="p-1.5">
                      <FieldsInput
                        value={s.fields}
                        disabled={locked}
                        title={t('opcua.structures.fieldsHint')}
                        placeholder="X:Double, Y:Double"
                        onChange={(fields) => update(s.id, { fields })}
                        onError={onError}
                      />
                    </td>
                    <td className="w-10 p-1.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={locked}
                        title={t('ui.remove')}
                        onClick={() => onChange(structures.filter((x) => x.id !== s.id))}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        <p className="text-xs text-slate-500">{t('opcua.structures.fieldsHint')}</p>
      </div>
    </Card>
  )
}
