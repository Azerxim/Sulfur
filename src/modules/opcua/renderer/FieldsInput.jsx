import { CommitInput } from '@azerxim/sulfur-sdk/ui'
import { formatFields, parseFields } from '../shared/fields'
import { t } from '../shared/i18n'

/** Liste de champs ou d'arguments saisie sous la forme « Nom:Type, Autre:Type[] ». */
export default function FieldsInput({ value, onChange, onError, ...props }) {
  return (
    <CommitInput
      {...props}
      className="font-mono"
      value={formatFields(value)}
      onCommit={(text) => {
        try {
          onChange(parseFields(text))
        } catch (err) {
          onError(t('opcua.errors.invalidFields', { part: err.message }))
        }
      }}
    />
  )
}
