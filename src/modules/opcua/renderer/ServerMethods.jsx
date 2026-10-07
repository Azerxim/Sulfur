import { Plus, Trash2 } from 'lucide-react'
import { Button, Card, CommitInput, Select } from '@renderer/components/ui'
import { METHOD_BEHAVIORS, METHOD_FAILURES } from '../shared/constants'
import FieldsInput from './FieldsInput'
import { t } from '../shared/i18n'

/** Valeur du sélecteur de comportement : 'echo', 'variables' ou le code d'erreur renvoyé. */
const behaviorValue = (m) => (m.behavior === 'fail' ? m.statusCode : m.behavior)
const behaviorPatch = (value) =>
  METHOD_FAILURES.includes(value) ? { behavior: 'fail', statusCode: value } : { behavior: value }

/** Méthodes simulées, appelables par les clients (modifiables à chaud). */
export default function ServerMethods({ methods, busy, running, duplicates, onAdd, onUpdate, onRemove, onError }) {
  return (
    <Card
      id="opcua.server.methods"
      title={t('opcua.methods.title', { count: methods.length })}
      className="shrink-0"
      actions={
        <>
          {running && <span className="text-xs text-slate-500">{t('ui.liveApplied')}</span>}
          <Button size="sm" disabled={busy} onClick={onAdd}>
            <Plus className="size-3.5" /> {t('ui.add')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {methods.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="w-44 px-1.5 pb-2 font-medium">{t('ui.name')}</th>
                <th className="px-1.5 pb-2 font-medium">{t('opcua.methods.inputs')}</th>
                <th className="px-1.5 pb-2 font-medium">{t('opcua.methods.outputs')}</th>
                <th className="w-60 px-1.5 pb-2 font-medium">{t('opcua.methods.behavior')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {methods.map((m) => (
                <tr key={m.id}>
                  <td className="p-1.5">
                    <CommitInput
                      value={m.name}
                      disabled={busy}
                      className={duplicates.includes(m.name) || !m.name.trim() ? 'border-red-500/60' : ''}
                      onCommit={(name) => onUpdate(m.id, { name: name.trim() })}
                    />
                  </td>
                  {['inputs', 'outputs'].map((key) => (
                    <td key={key} className="p-1.5">
                      <FieldsInput
                        value={m[key]}
                        disabled={busy}
                        title={t('opcua.methods.argsHint')}
                        placeholder="Value:Double"
                        onChange={(args) => onUpdate(m.id, { [key]: args })}
                        onError={onError}
                      />
                    </td>
                  ))}
                  <td className="p-1.5">
                    <Select
                      value={behaviorValue(m)}
                      disabled={busy}
                      title={t('opcua.methods.behaviorsHint')}
                      onChange={(e) => onUpdate(m.id, behaviorPatch(e.target.value))}
                    >
                      {METHOD_BEHAVIORS.filter((b) => b !== 'fail').map((b) => (
                        <option key={b} value={b}>
                          {t(`opcua.methods.behaviors.${b}`)}
                        </option>
                      ))}
                      {METHOD_FAILURES.map((code) => (
                        <option key={code} value={code}>
                          {t('opcua.methods.behaviors.fail', { status: code })}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="w-10 p-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      title={t('ui.remove')}
                      onClick={() => onRemove(m.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="text-xs text-slate-500">
          {t('opcua.methods.argsHint')} {t('opcua.methods.behaviorsHint')}
        </p>
      </div>
    </Card>
  )
}
