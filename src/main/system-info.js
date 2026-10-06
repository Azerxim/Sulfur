import { app } from 'electron'
import os from 'os'

/** Informations système du PC (canal IPC `system:info`). */
export function getSystemInfo() {
  const interfaces = Object.entries(os.networkInterfaces()).map(([name, addresses]) => ({
    name,
    internal: addresses.every((a) => a.internal),
    mac: addresses.find((a) => a.mac && a.mac !== '00:00:00:00:00:00')?.mac ?? null,
    addresses: addresses
      .map((a) => ({
        family: a.family === 4 ? 'IPv4' : a.family === 6 ? 'IPv6' : a.family,
        address: a.address,
        netmask: a.netmask,
        cidr: a.cidr,
        internal: a.internal
      }))
      .sort((a, b) => a.family.localeCompare(b.family))
  }))

  return {
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    appVersion: app.getVersion(),
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node
    },
    interfaces
  }
}

/** Module "cœur" toujours chargé, indépendant des modules de simulation. */
export const systemMainModule = {
  manifest: { id: 'system', name: 'Système', description: 'Informations sur le PC' },
  activate(ctx) {
    ctx.handle('info', getSystemInfo)
  }
}
