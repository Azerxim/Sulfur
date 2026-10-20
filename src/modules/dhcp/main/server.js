import fs from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { ipToInt } from '@shared/networks'
import { MAX_LOG } from '../shared/constants'
import { prepareServerConfig } from './config'
import { LeaseTable } from './leases'
import { BROADCAST_FLAG, OP, OPTION, TYPE, TYPE_NAMES, decode, encode } from './protocol'
import { LIMITED_BROADCAST, openTransport } from './transport'
import { t } from '../shared/i18n'

const NO_ADDRESS = '0.0.0.0'
const EMPTY_COUNTERS = () => ({
  discovers: 0,
  offers: 0,
  requests: 0,
  acks: 0,
  naks: 0,
  releases: 0,
  declines: 0,
  informs: 0,
  ignored: 0,
  invalid: 0
})

/**
 * Serveur DHCP de test (RFC 2131) pour un réseau privé isolé. Garde-fous :
 *  - jamais démarré automatiquement, et démarré seulement après confirmation de l'avertissement ;
 *  - une interface choisie explicitement, dont le sous-réseau est privé (RFC 1918) ;
 *  - plage d'adresses limitée et contrôlée par rapport à ce sous-réseau ;
 *  - au choix, réponse aux seules adresses MAC listées ;
 *  - toutes les offres et attributions journalisées, y compris dans un fichier.
 * Les requêtes relayées (giaddr) sont ignorées : seul le réseau local de l'interface est servi.
 *
 * `env` (interfaces, allowSubnet) et `broadcastAddress` ne servent qu'aux tests.
 */
export class DhcpServer {
  transport = null
  config = null
  leases = null
  logEntries = []
  counters = EMPTY_COUNTERS()
  /** Écritures du fichier journal, dans l'ordre. */
  writes = Promise.resolve()

  constructor(logFile, { onStatus = () => {}, onLog = () => {}, env, broadcastAddress = LIMITED_BROADCAST } = {}) {
    this.logFile = logFile
    this.onStatus = onStatus
    this.onLog = onLog
    this.env = env
    this.broadcastAddress = broadcastAddress
  }

  get running() {
    return !!this.transport
  }

  status() {
    const c = this.config
    return {
      running: this.running,
      config: c && {
        interface: c.interface,
        address: c.address,
        cidr: c.subnet.cidr,
        poolStart: c.poolStart,
        poolEnd: c.poolEnd,
        poolSize: this.leases.size,
        macFilter: c.macFilter,
        macs: c.macs.length,
        port: c.port
      },
      counters: { ...this.counters },
      leases: this.leases && this.running ? this.leases.list() : [],
      logFile: this.logFile
    }
  }

  /** Configuration vérifiée sans démarrer (contrôle de la saisie avant l'avertissement). */
  check(options) {
    const config = prepareServerConfig(options, this.env)
    return { interface: config.interface, address: config.address, cidr: config.subnet.cidr }
  }

  /** Démarrage : `confirmed` doit valoir true (avertissement lu et accepté dans l'interface). */
  async start(options, confirmed) {
    if (this.running) throw new Error(t('errors.alreadyStarted'))
    if (confirmed !== true) throw new Error(t('dhcp.errors.notConfirmed'))
    const config = prepareServerConfig(options, this.env)
    this.transport = await openTransport({
      address: config.address,
      port: config.port,
      onMessage: (msg, rinfo) => this.onMessage(msg, rinfo),
      onError: (err) => this.log('error', { message: err.message })
    })
    this.config = config
    this.leases = new LeaseTable({ start: config.poolStart, end: config.poolEnd, leaseTime: config.leaseTime })
    this.counters = EMPTY_COUNTERS()
    await fs.mkdir(path.dirname(this.logFile), { recursive: true }).catch(() => {})
    this.log('info', {
      message: t('dhcp.log.started', {
        interface: config.interface,
        address: config.address,
        cidr: config.subnet.cidr,
        start: config.poolStart,
        end: config.poolEnd
      })
    })
    if (config.macFilter) this.log('info', { message: t('dhcp.log.macFilter', { count: config.macs.length }) })
    this.onStatus(this.status())
    return this.status()
  }

  async stop() {
    const transport = this.transport
    this.transport = null
    if (transport) {
      transport.close()
      this.log('info', { message: t('dhcp.log.stopped') })
    }
    this.onStatus(this.status())
    await this.writes
    return this.status()
  }

  logs() {
    return this.logEntries
  }

  clearLogs() {
    this.logEntries = []
    return []
  }

  /** Événement du journal affiché, ajouté aussi au fichier journal (une ligne par événement). */
  log(level, { type = null, mac = null, ip = null, message }) {
    const entry = { id: randomUUID(), time: new Date().toISOString(), level, type, mac, ip, message }
    this.logEntries.push(entry)
    if (this.logEntries.length > MAX_LOG) this.logEntries.splice(0, this.logEntries.length - MAX_LOG)
    this.onLog(entry)
    const line = [entry.time, level, type ?? '-', mac ?? '-', ip ?? '-', message].join('\t')
    this.writes = this.writes.then(() => fs.appendFile(this.logFile, `${line}\n`).catch(() => {}))
  }

  // --- Requêtes -------------------------------------------------------------------------------

  async onMessage(msg, rinfo) {
    let request
    try {
      request = decode(msg)
    } catch {
      this.counters.invalid++
      this.log('warn', { message: t('dhcp.log.invalid', { remote: `${rinfo.address}:${rinfo.port}` }) })
      return
    }
    const reply = this.handle(request)
    if (reply && this.transport) {
      await this.transport
        .send(reply.packet, this.config.clientPort, reply.address)
        .catch((err) => this.log('error', { mac: request.chaddr, message: err.message }))
    }
    this.onStatus(this.status())
  }

  /** Traitement d'une requête : réponse à envoyer ({ packet, address }) ou null. */
  handle(request, now = Date.now()) {
    if (request.op !== OP.REQUEST) return null
    const config = this.config
    const mac = request.chaddr
    const type = TYPE_NAMES[request.type]
    if (!mac) {
      this.counters.ignored++
      this.log('warn', { type, message: t('dhcp.log.hardware') })
      return null
    }
    if (request.giaddr !== NO_ADDRESS) {
      this.counters.ignored++
      this.log('warn', { type, mac, message: t('dhcp.log.relayed', { type, relay: request.giaddr }) })
      return null
    }
    if (config.macFilter && !config.macs.includes(mac)) {
      this.counters.ignored++
      this.log('warn', { type, mac, message: t('dhcp.log.notListed', { type, mac }) })
      return null
    }
    const hostname = request.hostname ?? null

    switch (request.type) {
      case TYPE.DISCOVER: {
        this.counters.discovers++
        this.log('info', { type, mac, message: t('dhcp.log.discover', { mac, hostname: hostname ?? '—' }) })
        const ip = this.leases.offer(mac, { requested: request.requestedIp, hostname }, now)
        if (!ip) {
          this.log('warn', { type: 'OFFER', mac, message: t('dhcp.log.exhausted', { mac }) })
          return null
        }
        this.counters.offers++
        this.log('info', { type: 'OFFER', mac, ip, message: t('dhcp.log.offer', { ip, mac }) })
        return this.reply(request, TYPE.OFFER, ip)
      }

      case TYPE.REQUEST: {
        this.counters.requests++
        const ip = request.requestedIp ?? (request.ciaddr !== NO_ADDRESS ? request.ciaddr : null)
        if (request.serverId && request.serverId !== config.address) {
          // Le client a retenu l'offre d'un autre serveur.
          this.leases.cancelOffer(mac, now)
          this.log('info', { type, mac, message: t('dhcp.log.otherServer', { mac, server: request.serverId }) })
          return null
        }
        if (!ip) return null
        this.log('info', { type, mac, ip, message: t('dhcp.log.request', { ip, mac }) })
        const n = ipToInt(ip)
        let reason = null
        if (!(n > config.subnet.network && n < config.subnet.broadcast)) reason = 'otherNetwork'
        else if (!this.leases.bind(mac, ip, { hostname }, now))
          reason = this.leases.inPool(ip) ? 'taken' : 'outsidePool'
        if (reason) {
          this.counters.naks++
          this.log('warn', {
            type: 'NAK',
            mac,
            ip,
            message: t('dhcp.log.nak', { ip, mac, reason: t(`dhcp.reasons.${reason}`) })
          })
          return this.reply(request, TYPE.NAK, null)
        }
        this.counters.acks++
        this.log('info', {
          type: 'ACK',
          mac,
          ip,
          message: t('dhcp.log.ack', { ip, mac, lease: config.leaseTime })
        })
        return this.reply(request, TYPE.ACK, ip)
      }

      case TYPE.DECLINE: {
        this.counters.declines++
        const ip = request.requestedIp
        if (ip && this.leases.decline(mac, ip, now))
          this.log('warn', { type, mac, ip, message: t('dhcp.log.decline', { ip, mac }) })
        return null
      }

      case TYPE.RELEASE: {
        this.counters.releases++
        const ip = request.ciaddr
        const released = this.leases.release(mac, ip, now)
        this.log('info', {
          type,
          mac,
          ip,
          message: t(released ? 'dhcp.log.release' : 'dhcp.log.releaseUnknown', { ip, mac })
        })
        return null
      }

      case TYPE.INFORM: {
        this.counters.informs++
        if (request.ciaddr === NO_ADDRESS) return null
        this.log('info', { type, mac, ip: request.ciaddr, message: t('dhcp.log.inform', { ip: request.ciaddr, mac }) })
        return this.reply(request, TYPE.ACK, null)
      }

      default:
        return null
    }
  }

  /**
   * Réponse à une requête. Sans adresse IP connue du client, elle est diffusée (255.255.255.255,
   * émise par l'interface du serveur) ; un client qui a déjà une adresse (renouvellement, INFORM)
   * la reçoit directement. Un NAK est toujours diffusé.
   */
  reply(request, type, yiaddr) {
    const config = this.config
    const options = [[OPTION.SERVER_ID, config.address]]
    if (type === TYPE.NAK) {
      options.push([OPTION.MESSAGE, 'requested address not available'])
    } else {
      if (yiaddr) {
        options.push(
          [OPTION.LEASE_TIME, config.leaseTime],
          [OPTION.RENEWAL, Math.floor(config.leaseTime / 2)],
          [OPTION.REBINDING, Math.floor((config.leaseTime * 7) / 8)]
        )
      }
      options.push([OPTION.SUBNET_MASK, config.subnet.netmask])
      if (config.router) options.push([OPTION.ROUTER, config.router])
      if (config.dns.length) options.push([OPTION.DNS, config.dns])
      if (config.domain) options.push([OPTION.DOMAIN, config.domain])
    }
    const known = request.ciaddr !== NO_ADDRESS && type !== TYPE.NAK
    const packet = encode({
      op: OP.REPLY,
      type,
      xid: request.xid,
      flags: known ? request.flags : request.flags | BROADCAST_FLAG,
      ciaddr: type === TYPE.NAK ? null : request.ciaddr,
      yiaddr,
      chaddr: request.chaddr,
      options
    })
    return { packet, address: known ? request.ciaddr : this.broadcastAddress }
  }
}
