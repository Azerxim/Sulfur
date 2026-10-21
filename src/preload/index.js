import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNEL_PATTERN } from '@azerxim/sulfur-sdk'
function assertChannel(channel) {
  if (!IPC_CHANNEL_PATTERN.test(channel)) throw new Error(`Canal IPC invalide : ${channel}`)
}

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)

// Thème appliqué avant toute exécution de la page : pas d'affichage dans le mauvais thème au démarrage.
const theme = arg('sulfur-theme') === 'light' ? 'light' : 'dark'
const setTheme = () => document.documentElement?.setAttribute('data-theme', theme)
if (document.documentElement) setTheme()
else document.addEventListener('readystatechange', setTheme, { once: true })

let initialPreferences = {}
try {
  initialPreferences = JSON.parse(arg('sulfur-preferences') ?? '{}')
} catch {
  // préférences illisibles : valeurs par défaut
}

contextBridge.exposeInMainWorld('sulfur', {
  /** Préférences connues du process principal au lancement (thème, langue). */
  initialPreferences,
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
