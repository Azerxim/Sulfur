import { randomInt, randomUUID } from 'crypto'
import { isPrivateIPv4 } from '@shared/networks'
import { CLIENT_MODES, MAX_HISTORY } from '../shared/constants'
import { prepareClientConfig } from './config'
import { BROADCAST_FLAG, OP, OPTION, TYPE, TYPE_NAMES, decode, encode } from './protocol'
import { LIMITED_BROADCAST, openTransport } from './transport'
import { t } from '../shared/i18n'

/** Options demandées au serveur : masque, passerelle, DNS, domaine, bail, identifiant du serveur. */
const PARAMETERS = [OPTION.SUBNET_MASK, OPTION.ROUTER, OPTION.DNS, OPTION.DOMAIN, OPTION.LEASE_TIME, OPTION.SERVER_ID]

const describeReply = (p) => ({
  type: TYPE_NAMES[p.type],
  server: p.serverId,
  ip: p.yiaddr,
  subnetMask: p.subnetMask,
  routers: p.routers,
  dns: p.dns,
  domain: p.domain,
  leaseTime: p.leaseTime,
  message: p.message
})

/**
 * Client DHCP d'essai : DISCOVER (offres seulement) ou bail complet (DISCOVER, OFFER, REQUEST,
 * ACK), puis RELEASE. Il n'applique jamais l'adresse obtenue à l'interface : il affiche ce que les
 * serveurs proposent. Seules les réponses dont l'adresse et le serveur sont dans un réseau privé
 * sont retenues.
 *
 * `env` (interfaces, allowSubnet), `allowAddress` et `broadcastAddress` ne servent qu'aux tests.
 */
export class DhcpClient {
  history = []
  current = null
  /** Dernier bail obtenu (pour RELEASE). */
  lease = null

  constructor({ onStatus = () => {}, env, allowAddress = isPrivateIPv4, broadcastAddress = LIMITED_BROADCAST } = {}) {
    this.onStatus = onStatus
    this.env = env
    this.allowAddress = allowAddress
    this.broadcastAddress = broadcastAddress
  }

  status() {
    return { running: !!this.current, lease: this.lease }
  }

  /** Échange avec les serveurs, en `mode` 'discover' ou 'lease'. Retourne l'entrée d'historique. */
  async run(options, mode) {
    if (this.current) throw new Error(t('dhcp.errors.clientBusy'))
    if (!CLIENT_MODES.includes(mode)) throw new Error(t('dhcp.errors.invalidMode'))
    const config = prepareClientConfig(options, this.env)
    const entry = {
      id: randomUUID(),
      time: new Date().toISOString(),
      mode,
      interface: config.interface,
      mac: config.mac,
      offers: [],
      ignored: [],
      lease: null,
      nak: null,
      ok: false
    }
    const xid = randomInt(1, 2 ** 32 - 1)
    const replies = []
    let wake = null
    const transport = await openTransport({
      address: config.address,
      port: config.clientPort,
      onMessage: (msg) => {
        let p
        try {
          p = decode(msg)
        } catch {
          return
        }
        // Réponse à notre échange seulement (les diffusions des autres clients passent aussi ici).
        if (p.op !== OP.REPLY || p.xid !== xid || p.chaddr !== config.mac) return
        replies.push(p)
        wake?.()
      }
    })
    this.current = { entry, transport }
    this.onStatus(this.status())
    /** Prochaine réponse qui satisfait `accept`, null au bout du délai. */
    const next = (accept, timeout) =>
      new Promise((resolve) => {
        const timer = setTimeout(() => {
          wake = null
          resolve(null)
        }, timeout)
        const look = () => {
          const index = replies.findIndex(accept)
          if (index < 0) return
          clearTimeout(timer)
          wake = null
          resolve(replies.splice(index, 1)[0])
        }
        wake = look
        look()
      })
    const send = (type, extra = []) =>
      transport.send(
        encode({
          op: OP.REQUEST,
          type,
          xid,
          flags: BROADCAST_FLAG,
          chaddr: config.mac,
          options: [
            [
              OPTION.CLIENT_ID,
              Buffer.concat([Buffer.from([1]), Buffer.from(config.mac.split(':').map((h) => parseInt(h, 16)))])
            ],
            [OPTION.HOSTNAME, config.hostname],
            ...extra,
            [OPTION.PARAMETERS, PARAMETERS]
          ]
        }),
        config.port,
        this.broadcastAddress
      )
    const acceptable = (p) => this.allowAddress(p.yiaddr) && !!p.serverId && this.allowAddress(p.serverId)

    try {
      await send(TYPE.DISCOVER, [[OPTION.REQUESTED_IP, config.requestedIp]])
      const deadline = Date.now() + config.timeout
      // Offres reçues pendant le délai (mode bail : la première acceptable suffit).
      while (Date.now() < deadline) {
        const offer = await next((p) => p.type === TYPE.OFFER, deadline - Date.now())
        if (!offer) break
        if (acceptable(offer)) entry.offers.push(describeReply(offer))
        else entry.ignored.push(describeReply(offer))
        if (mode === 'lease' && entry.offers.length) break
      }
      if (!entry.offers.length) {
        entry.error = entry.ignored.length ? t('dhcp.errors.offersNotPrivate') : t('dhcp.errors.noOffer')
      } else if (mode === 'discover') {
        entry.ok = true
      } else {
        const chosen = entry.offers[0]
        await send(TYPE.REQUEST, [
          [OPTION.REQUESTED_IP, chosen.ip],
          [OPTION.SERVER_ID, chosen.server]
        ])
        const answer = await next(
          (p) => (p.type === TYPE.ACK || p.type === TYPE.NAK) && p.serverId === chosen.server,
          config.timeout
        )
        if (!answer) entry.error = t('dhcp.errors.noAck', { server: chosen.server })
        else if (answer.type === TYPE.NAK) {
          entry.nak = describeReply(answer)
          entry.error = t('dhcp.errors.nak', { server: chosen.server, message: answer.message ?? '—' })
        } else {
          entry.lease = describeReply(answer)
          entry.ok = true
          this.lease = {
            ...entry.lease,
            interface: config.interface,
            mac: config.mac,
            port: config.port,
            clientPort: config.clientPort,
            obtained: new Date().toISOString()
          }
        }
      }
    } catch (err) {
      entry.error = err.message
    } finally {
      transport.close()
      this.current = null
    }
    this.record(entry)
    return entry
  }

  /** Libération (RELEASE) du dernier bail obtenu, envoyée directement à son serveur. */
  async release(options = {}) {
    if (this.current) throw new Error(t('dhcp.errors.clientBusy'))
    const lease = this.lease
    if (!lease) throw new Error(t('dhcp.errors.noLease'))
    const config = prepareClientConfig({ ...options, interface: lease.interface, mac: lease.mac }, this.env)
    const transport = await openTransport({ address: config.address, port: lease.clientPort, onMessage: () => {} })
    const entry = {
      id: randomUUID(),
      time: new Date().toISOString(),
      mode: 'release',
      interface: lease.interface,
      mac: lease.mac,
      lease: { ip: lease.ip, server: lease.server },
      ok: false
    }
    try {
      await transport.send(
        encode({
          op: OP.REQUEST,
          type: TYPE.RELEASE,
          xid: randomInt(1, 2 ** 32 - 1),
          ciaddr: lease.ip,
          chaddr: lease.mac,
          options: [[OPTION.SERVER_ID, lease.server]]
        }),
        lease.port,
        lease.server
      )
      entry.ok = true
      this.lease = null
    } catch (err) {
      entry.error = err.message
    } finally {
      transport.close()
    }
    this.record(entry)
    return entry
  }

  record(entry) {
    this.history.unshift(entry)
    this.history.splice(MAX_HISTORY)
    this.onStatus(this.status())
  }

  clear() {
    this.history = []
    return []
  }

  abort() {
    this.current?.transport.close()
  }
}
