import dgram from 'dgram'
import { t } from '../shared/i18n'

export const LIMITED_BROADCAST = '255.255.255.255'

/**
 * Sockets UDP d'une interface, sans jamais écouter sur 0.0.0.0 :
 *  - un socket lié à l'adresse de l'interface, par lequel tout est envoyé : une diffusion
 *    (255.255.255.255) émise depuis cette adresse sort par cette interface seulement ;
 *  - sous Linux et macOS, un second socket lié à 255.255.255.255 pour recevoir les diffusions des
 *    clients sans adresse (sous Windows, le premier socket les reçoit déjà).
 * Node ne permet pas de lier un socket à une interface (SO_BINDTODEVICE) : sous Linux et macOS,
 * le second socket reçoit aussi les diffusions arrivées par les autres interfaces ; les réponses,
 * elles, ne partent que par l'interface choisie.
 */
export async function openTransport({ address, port, platform = process.platform, onMessage, onError = () => {} }) {
  const sockets = []
  const bind = (host) =>
    new Promise((resolve, reject) => {
      const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
      socket.once('error', reject)
      socket.bind({ port, address: host }, () => {
        socket.off('error', reject)
        resolve(socket)
      })
    })
  try {
    const unicast = await bind(address)
    unicast.setBroadcast(true)
    sockets.push(unicast)
    if (platform !== 'win32') {
      sockets.push(
        await bind(LIMITED_BROADCAST).catch((err) => {
          if (err.code === 'EADDRNOTAVAIL') throw new Error(t('dhcp.errors.broadcastUnsupported'), { cause: err })
          throw err
        })
      )
    }
  } catch (err) {
    for (const socket of sockets) socket.close()
    if (err.code === 'EACCES') throw new Error(t('dhcp.errors.portPrivileged', { port }), { cause: err })
    if (err.code === 'EADDRINUSE') throw new Error(t('dhcp.errors.portInUse', { port }), { cause: err })
    throw err
  }
  for (const socket of sockets) {
    socket.on('message', onMessage)
    socket.on('error', onError)
  }
  const [unicast] = sockets
  return {
    send: (buf, toPort, toAddress) =>
      new Promise((resolve, reject) => unicast.send(buf, toPort, toAddress, (err) => (err ? reject(err) : resolve()))),
    close: () => {
      for (const socket of sockets) {
        try {
          socket.close()
        } catch {
          // déjà fermé
        }
      }
    }
  }
}
