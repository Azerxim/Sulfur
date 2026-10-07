import { useEffect, useState } from 'react'
import { Eye, EyeOff, Plug, PlugZap, RefreshCw, Send, X } from 'lucide-react'
import { Button, Card, ErrorBanner, Field, Input, StatusDot } from '@renderer/components/ui'
import { DEFAULT_CLIENT_SECURITY, ROOT_NODES } from '../shared/constants'
import { usePersistentState } from '@renderer/module-config'
import { opcuaApi } from './api'
import NodeTree from './NodeTree'
import ClientSecurity from './ClientSecurity'
import MethodCall from './MethodCall'
import HistoryView from './HistoryView'
import EventsCard from './EventsCard'
import { t } from '../shared/i18n'
import { formatTime, formatValue } from './format'

export default function ClientPanel({ status, serverEndpoint }) {
  const [endpoint, setEndpoint] = usePersistentState('opcua', 'clientEndpoint', 'opc.tcp://localhost:4840/UA/Sulfur')
  // Le mot de passe n'est jamais enregistré.
  const [security, setSecurity] = usePersistentState('opcua', 'clientSecurity', DEFAULT_CLIENT_SECURITY, {
    persist: (s) => ({ ...s, password: '' })
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [details, setDetails] = useState(null)
  const [writeValue, setWriteValue] = useState('')
  const [live, setLive] = useState({})
  const [treeKey, setTreeKey] = useState(0)
  const connected = status.connected

  // Pré-remplit l'endpoint avec celui du serveur local lorsqu'il démarre.
  useEffect(() => {
    if (serverEndpoint && !connected) setEndpoint(serverEndpoint)
  }, [serverEndpoint, connected, setEndpoint])

  useEffect(
    () =>
      opcuaApi.client.onData((change) =>
        setLive((l) => ({ ...l, [change.nodeId]: { ...l[change.nodeId], ...change } }))
      ),
    []
  )

  useEffect(() => {
    if (!connected) {
      setSelected(null)
      setDetails(null)
      setLive({})
    }
  }, [connected])

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

  async function select(node) {
    setSelected(node)
    setDetails(null)
    if (node.nodeClass !== 'Variable') return
    const d = await run(() => opcuaApi.client.read(node.nodeId))
    if (d) {
      setDetails(d)
      setWriteValue(formatValue(d.value))
    }
  }

  const refresh = () => select(selected)
  const write = () =>
    run(async () => {
      await opcuaApi.client.write(selected.nodeId, writeValue)
      setDetails(await opcuaApi.client.read(selected.nodeId))
    })

  const isMonitored = selected && status.monitored?.includes(selected.nodeId)
  const toggleMonitor = () =>
    run(() =>
      isMonitored
        ? opcuaApi.client.unsubscribe(selected.nodeId).then(() => dropLive(selected.nodeId))
        : opcuaApi.client.subscribe(selected.nodeId)
    )
  const dropLive = (nodeId) =>
    setLive((l) => {
      const { [nodeId]: _, ...rest } = l
      return rest
    })

  return (
    <div className="-mr-2 flex min-h-0 flex-1 flex-col gap-4 overflow-auto pr-2">
      <Card
        id="opcua.client.connection"
        title={t('ui.connection')}
        className="shrink-0"
        actions={
          <StatusDot
            on={connected}
            label={
              connected && status.security
                ? t('opcua.client.connectedWith', {
                    security: `${status.security.mode}${status.security.mode !== 'None' ? ` / ${status.security.policy}` : ''}`
                  })
                : connected
                  ? t('ui.connected')
                  : t('ui.disconnected')
            }
          />
        }
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-end gap-3">
            <Field label={t('opcua.client.endpoint')} className="flex-1">
              <Input
                className="font-mono"
                value={endpoint}
                disabled={connected || busy}
                onChange={(e) => setEndpoint(e.target.value)}
                onKeyDown={(e) =>
                  e.key === 'Enter' && !connected && run(() => opcuaApi.client.connect(endpoint, security))
                }
              />
            </Field>
            {connected ? (
              <Button variant="danger" disabled={busy} onClick={() => run(opcuaApi.client.disconnect)}>
                <Plug className="size-4" /> {t('ui.disconnect')}
              </Button>
            ) : (
              <Button
                variant="primary"
                disabled={busy || !endpoint}
                onClick={() => run(() => opcuaApi.client.connect(endpoint, security))}
              >
                <PlugZap className="size-4" /> {busy ? t('ui.connecting') : t('ui.connect')}
              </Button>
            )}
          </div>
          <ClientSecurity
            value={security}
            onChange={setSecurity}
            endpoint={endpoint}
            locked={connected || busy}
            onError={setError}
          />
          <ErrorBanner error={error} onClose={() => setError(null)} />
        </div>
      </Card>

      <div className="grid min-h-[36rem] flex-1 shrink-0 grid-cols-[minmax(260px,1fr)_2fr] gap-4">
        <Card
          id="opcua.client.tree"
          title={t('opcua.client.addressSpace')}
          actions={
            <Button
              variant="ghost"
              size="icon"
              disabled={!connected}
              title={t('opcua.client.reload')}
              onClick={() => setTreeKey((k) => k + 1)}
            >
              <RefreshCw className="size-3.5" />
            </Button>
          }
        >
          <div className="h-full overflow-auto">
            {connected ? (
              <NodeTree key={treeKey} roots={ROOT_NODES} selectedId={selected?.nodeId} onSelect={select} />
            ) : (
              <p className="text-sm text-slate-500">{t('opcua.client.connectToBrowse')}</p>
            )}
          </div>
        </Card>

        <div className="flex min-h-0 flex-col gap-4">
          <Card
            id="opcua.client.node"
            title={t('opcua.client.selectedNode')}
            actions={
              details && (
                <>
                  <Button variant="ghost" size="sm" onClick={refresh}>
                    <RefreshCw className="size-3.5" /> {t('opcua.client.read')}
                  </Button>
                  <Button size="sm" onClick={toggleMonitor}>
                    {isMonitored ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    {isMonitored ? t('opcua.client.unmonitor') : t('opcua.client.monitor')}
                  </Button>
                </>
              )
            }
          >
            {!selected ? (
              <p className="text-sm text-slate-500">{t('opcua.client.selectNode')}</p>
            ) : (
              <div className="flex h-full flex-col gap-4 overflow-auto">
                <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-slate-500">NodeId</dt>
                  <dd className="font-mono break-all text-slate-200">{selected.nodeId}</dd>
                  <dt className="text-slate-500">BrowseName</dt>
                  <dd className="font-mono text-slate-200">{selected.browseName}</dd>
                  <dt className="text-slate-500">{t('opcua.client.nodeClass')}</dt>
                  <dd className="text-slate-200">{selected.nodeClass}</dd>
                  {details && (
                    <>
                      <dt className="text-slate-500">{t('ui.value')}</dt>
                      <dd className="font-mono break-all text-sulfur-300">{formatValue(details.value)}</dd>
                      <dt className="text-slate-500">{t('ui.type')}</dt>
                      <dd className="text-slate-200">{details.dataType}</dd>
                      <dt className="text-slate-500">{t('ui.status')}</dt>
                      <dd className="text-slate-200">{details.statusCode}</dd>
                      <dt className="text-slate-500">{t('ui.timestamp')}</dt>
                      <dd className="text-slate-200">{formatTime(details.sourceTimestamp)}</dd>
                    </>
                  )}
                </dl>
                {details?.writable && (
                  <div className="flex items-end gap-2">
                    <Field label={t('opcua.client.newValue')} className="flex-1">
                      <Input
                        className="font-mono"
                        value={writeValue}
                        onChange={(e) => setWriteValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && write()}
                      />
                    </Field>
                    <Button variant="primary" disabled={busy} onClick={write}>
                      <Send className="size-4" /> {t('opcua.client.write')}
                    </Button>
                  </div>
                )}
                {details?.historizing && (
                  <HistoryView key={selected.nodeId} nodeId={selected.nodeId} onError={setError} />
                )}
                {selected.nodeClass === 'Method' && (
                  <MethodCall key={selected.nodeId} nodeId={selected.nodeId} onError={setError} />
                )}
              </div>
            )}
          </Card>

          <Card
            id="opcua.client.monitoring"
            title={t('ui.monitoring', { count: status.monitored?.length ?? 0 })}
            className="flex-1"
          >
            <div className="h-full overflow-auto">
              {!status.monitored?.length ? (
                <p className="text-sm text-slate-500">{t('opcua.client.noMonitored')}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-slate-500">
                    <tr>
                      <th className="pb-2 font-medium">NodeId</th>
                      <th className="pb-2 font-medium">{t('ui.value')}</th>
                      <th className="pb-2 font-medium">{t('ui.status')}</th>
                      <th className="pb-2 font-medium">{t('ui.timestamp')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody className="font-mono text-[13px]">
                    {status.monitored.map((nodeId) => {
                      const d = live[nodeId] ?? {}
                      return (
                        <tr key={nodeId} className="border-t border-ink-800">
                          <td className="py-1.5 pr-3 text-slate-300">{nodeId}</td>
                          <td className="py-1.5 pr-3 text-sulfur-300 tabular-nums">{formatValue(d.value)}</td>
                          <td className="py-1.5 pr-3 text-slate-400">{d.statusCode ?? '—'}</td>
                          <td className="py-1.5 pr-3 text-slate-400 tabular-nums">{formatTime(d.sourceTimestamp)}</td>
                          <td className="py-1.5 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              title={t('ui.remove2')}
                              onClick={() =>
                                run(() => opcuaApi.client.unsubscribe(nodeId).then(() => dropLive(nodeId)))
                              }
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
            </div>
          </Card>
        </div>
      </div>

      <EventsCard connected={connected} subscribed={!!status.events} onError={setError} />
    </div>
  )
}
