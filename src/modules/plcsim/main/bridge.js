import { spawn as spawnProcess } from 'child_process'
import { EventEmitter } from 'events'
import path from 'path'
import { t } from '../shared/i18n'

/** Délai de démarrage du pont (chargement de PowerShell et de l'API). */
const START_TIMEOUT = 60_000
/** Délai par défaut d'une requête. */
const CALL_TIMEOUT = 20_000
/** Dernières lignes d'erreur conservées pour expliquer un arrêt inattendu. */
const STDERR_LINES = 20

/** Windows PowerShell 5.1 (.NET Framework, requis par l'API Simulation Runtime). */
export const powershellPath = () =>
  path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')

/**
 * Processus pont vers l'API de PLCSim Advanced (script `bridge.ps1`) : requêtes JSON par lignes sur
 * l'entrée standard, réponses sur la sortie standard. Événement `exit` (message) à l'arrêt du pont.
 */
export class PlcsimBridge extends EventEmitter {
  child = null
  seq = 0
  pending = new Map()
  stderr = []

  constructor({ scriptPath, apiPath, spawn = spawnProcess, command = powershellPath() }) {
    super()
    this.scriptPath = scriptPath
    this.apiPath = apiPath
    this.spawn = spawn
    this.command = command
  }

  /** Lance le pont ; résout avec les informations de l'API ({ apiVersion, runtimeAvailable… }). */
  start() {
    return new Promise((resolve, reject) => {
      let settled = false
      const settle = (fn, value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        fn(value)
      }
      const child = this.spawn(
        this.command,
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          this.scriptPath,
          '-ApiPath',
          this.apiPath
        ],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
      )
      this.child = child
      const timer = setTimeout(() => {
        settle(reject, new Error(t('plcsim.errors.startTimeout')))
        child.kill()
      }, START_TIMEOUT)

      let buffer = ''
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk) => {
        buffer += chunk
        let index
        while ((index = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, index).trim()
          buffer = buffer.slice(index + 1)
          if (!line.startsWith('{')) continue
          let message
          try {
            message = JSON.parse(line)
          } catch {
            continue
          }
          if (message.event === 'ready') settle(resolve, message.data)
          else if (message.event === 'fatal')
            settle(reject, new Error(t('plcsim.errors.apiLoad', { message: message.error })))
          else this.onResponse(message)
        }
      })
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk) => {
        this.stderr.push(...chunk.split(/\r?\n/).filter((l) => l.trim()))
        this.stderr.splice(0, Math.max(0, this.stderr.length - STDERR_LINES))
      })
      child.stdin.on('error', () => {})
      child.on('error', (err) => settle(reject, new Error(t('plcsim.errors.spawn', { message: err.message }))))
      child.on('exit', (code) => {
        this.child = null
        const detail = this.stderr.join(' ').slice(0, 500)
        const error = new Error(t('plcsim.errors.bridgeExited', { code: code ?? '—', detail: detail || '—' }))
        settle(reject, error)
        for (const p of this.pending.values()) {
          clearTimeout(p.timer)
          p.reject(error)
        }
        this.pending.clear()
        this.emit('exit', error)
      })
    })
  }

  onResponse(message) {
    const pending = this.pending.get(message.id)
    if (!pending) return
    this.pending.delete(message.id)
    clearTimeout(pending.timer)
    if (message.ok) pending.resolve(message.result)
    else {
      const err = new Error(
        message.code ? t(`plcsim.runtimeErrors.${message.code}`, null, message.error) : message.error
      )
      err.code = message.code
      pending.reject(err)
    }
  }

  /** Appelle une méthode du pont. `timeout` en ms (les mises sous tension peuvent être longues). */
  call(method, params = {}, timeout = CALL_TIMEOUT) {
    if (!this.child) return Promise.reject(new Error(t('plcsim.errors.notConnected')))
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(t('plcsim.errors.callTimeout', { method, timeout })))
      }, timeout)
      this.pending.set(id, { resolve, reject, timer })
      this.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`)
    })
  }

  /** Arrête le pont (demande de sortie, puis arrêt forcé). */
  async stop() {
    const child = this.child
    if (!child) return
    const exited = new Promise((resolve) => child.once('exit', resolve))
    this.call('exit', {}, 2000).catch(() => {})
    const timer = setTimeout(() => child.kill(), 3000)
    await exited
    clearTimeout(timer)
  }
}
