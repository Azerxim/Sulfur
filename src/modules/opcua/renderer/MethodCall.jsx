import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import { Button, Field, Input } from '@azerxim/sulfur-sdk/ui'
import { opcuaApi } from './api'
import { formatValue } from './format'
import { t } from '../shared/i18n'

const argHint = (arg) =>
  arg.builtIn === 'ExtensionObject' ? t('opcua.client.structHint') : arg.array ? t('opcua.client.arrayHint') : undefined

/** Appel d'une méthode sélectionnée dans l'arborescence : un champ par argument d'entrée. */
export default function MethodCall({ nodeId, onError }) {
  const [info, setInfo] = useState(null)
  const [inputs, setInputs] = useState([])
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    opcuaApi.client.methodInfo(nodeId).then(
      (i) => {
        if (cancelled) return
        setInfo(i)
        setInputs(i.inputs.map(() => ''))
      },
      (err) => !cancelled && onError(err.message)
    )
    return () => {
      cancelled = true
    }
  }, [nodeId, onError])

  async function call() {
    setBusy(true)
    setResult(null)
    try {
      setResult(await opcuaApi.client.call(nodeId, inputs))
    } catch (err) {
      onError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!info) return <p className="text-sm text-slate-500">{t('ui.loading')}</p>

  return (
    <div className="flex flex-col gap-3">
      <div className="text-xs text-slate-400">{t('opcua.client.inputs')}</div>
      {info.inputs.length === 0 && <p className="text-sm text-slate-500">{t('opcua.client.noInputs')}</p>}
      {info.inputs.map((arg, i) => (
        <Field key={i} label={`${arg.name} · ${arg.type}`}>
          <Input
            className="font-mono"
            value={inputs[i] ?? ''}
            placeholder={argHint(arg)}
            title={arg.description ?? undefined}
            onChange={(e) => setInputs((all) => all.map((v, j) => (j === i ? e.target.value : v)))}
            onKeyDown={(e) => e.key === 'Enter' && call()}
          />
        </Field>
      ))}
      <div>
        <Button variant="primary" disabled={busy} onClick={call}>
          <Play className="size-4" /> {t('opcua.client.call')}
        </Button>
      </div>
      {result && (
        <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-1.5 border-t border-ink-800 pt-3 text-sm">
          <dt className="text-slate-500">{t('ui.status')}</dt>
          <dd className={result.statusCode === 'Good' ? 'text-emerald-300' : 'text-red-300'}>{result.statusCode}</dd>
          {result.outputs.map((out) => (
            <div key={out.name} className="contents">
              <dt className="text-slate-500">{out.name}</dt>
              <dd className="font-mono break-all text-sulfur-300">{formatValue(out.value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
