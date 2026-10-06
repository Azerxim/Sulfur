import fs from 'fs/promises'
import net from 'net'
import os from 'os'
import path from 'path'

/** Dossier temporaire supprimé par `cleanup()`. */
export async function tempDir(prefix) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `sulfur-${prefix}-`))
  return { dir, cleanup: () => fs.rm(dir, { recursive: true, force: true }) }
}

/** Port TCP libre sur la machine. */
export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

/** Message d'erreur d'une opération, ou 'OK' si elle réussit. */
export async function errorOf(fn) {
  try {
    await (typeof fn === 'function' ? fn() : fn)
    return 'OK'
  } catch (err) {
    return err.message
  }
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
