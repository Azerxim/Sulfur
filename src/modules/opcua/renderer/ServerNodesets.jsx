import { FileUp, Trash2 } from 'lucide-react'
import { Button, Card } from '@azerxim/sulfur-sdk/ui'
import { getLocale } from '@azerxim/sulfur-sdk'
import { opcuaApi } from './api'
import { t } from '../shared/i18n'

const formatSize = (bytes) => t('opcua.nodesets.size', { size: Math.ceil(bytes / 1024).toLocaleString(getLocale()) })

/** Fichiers NodeSet2 importés dans l'espace d'adressage du serveur (chargés au démarrage). */
export default function ServerNodesets({ nodesets, loaded, locked, onChange, onError }) {
  async function pick() {
    try {
      const files = await opcuaApi.server.pickNodesets()
      if (!files) return
      // Un fichier du même nom remplace le précédent.
      const names = new Set(files.map((f) => f.name))
      onChange([
        ...nodesets.filter((n) => !names.has(n.name)),
        ...files.map((f) => ({ id: crypto.randomUUID(), ...f }))
      ])
    } catch (err) {
      onError(err.message)
    }
  }

  return (
    <Card
      id="opcua.server.nodesets"
      title={t('opcua.nodesets.title', { count: nodesets.length })}
      className="shrink-0"
      defaultCollapsed
      actions={
        <>
          {locked && <span className="text-xs text-slate-500">{t('ui.lockedWhileRunning')}</span>}
          <Button size="sm" disabled={locked} onClick={pick}>
            <FileUp className="size-3.5" /> {t('opcua.nodesets.import')}
          </Button>
        </>
      }
    >
      {!nodesets.length ? (
        <p className="text-sm text-slate-500">{t('opcua.nodesets.empty')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <ul className="flex flex-col divide-y divide-ink-800 text-sm">
            {nodesets.map((n) => (
              <li key={n.id} className="flex items-start gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-200">{n.name}</span>
                    <span className="text-xs text-slate-500">{formatSize(n.size ?? n.xml?.length ?? 0)}</span>
                    {loaded.includes(n.name) && (
                      <span className="rounded bg-emerald-500/10 px-1.5 text-xs text-emerald-300">
                        {t('opcua.nodesets.loaded')}
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-xs break-all text-slate-400">
                    {t('opcua.nodesets.namespaces')} : {n.namespaces?.join(', ') || '—'}
                  </div>
                  {n.requires?.length > 0 && (
                    <div className="font-mono text-xs break-all text-slate-500">
                      {t('opcua.nodesets.requires')} : {n.requires.join(', ')}
                    </div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={locked}
                  title={t('ui.remove')}
                  onClick={() => onChange(nodesets.filter((x) => x.id !== n.id))}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">{t('opcua.nodesets.hint')}</p>
        </div>
      )}
    </Card>
  )
}
