import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNEL_PATTERN } from '@shared/module'

function assertChannel(channel) {
  if (!IPC_CHANNEL_PATTERN.test(channel)) throw new Error(`Canal IPC invalide : ${channel}`)
}

contextBridge.exposeInMainWorld('sulfur', {
  /** Appelle un handler `<moduleId>:<action>` du process principal. Lève une erreur en cas d'échec. */
  async invoke(channel, ...args) {
    assertChannel(channel)
    const res = await ipcRenderer.invoke(channel, ...args)
    if (!res.ok) throw new Error(res.error)
    return res.data
  },
  /** S'abonne à un événement `<moduleId>:<event>`. Retourne une fonction de désabonnement. */
  on(channel, listener) {
    assertChannel(channel)
    const wrapped = (_e, payload) => listener(payload)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  }
})
