import dgram from 'dgram'
import net from 'net'
import { randomUUID } from 'crypto'
import dnsPacket from 'dns-packet'
import { DEFAULT_SERVER_CONFIG, MAX_QUERIES } from '../shared/constants'
import { absoluteName, recordData, recordProblem, reverseName } from '../shared/records'
import { t } from '../shared/i18n'

const RCODES = { NOERROR: 0, FORMERR: 1, SERVFAIL: 2, NXDOMAIN: 3, NOTIMP: 4, REFUSED: 5 }
const STATUS_EMIT_INTERVAL = 500
/** Taille maximale d'une réponse UDP sans EDNS (RFC 1035). */
const UDP_LIMIT = 512
const FORWARD_TIMEOUT = 2000
/** Longueur maximale d'une chaîne de CNAME suivie dans la zone. */
const MAX_CNAME_CHAIN = 8

const lower = (name) =>
  String(name ?? '')
    .replace(/\.$/, '')
    .toLowerCase()

/** Liste d'adresses « hôte[:port] » des serveurs amont. */
export function parseUpstreams(text) {
  return String(text ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/^\[?([^\]]+?)\]?(?::(\d+))?$/)
      const host = match?.[1]
      const port = Number(match?.[2] ?? 53)
      if (!host || !net.isIP(host) || !(port > 0 && port < 65536))
        throw new Error(t('dns.errors.invalidUpstream', { value: entry }))
      return { host, port }
    })
}

/**
 * Zone : Map nom absolu → enregistrements dns-packet ({ name, type, ttl, data }). Un enregistrement
 * SOA est créé au sommet du domaine ; les PTR sont déduits des A / AAAA si `autoPtr`.
 */
export function buildZone(config) {
  const domain = lower(config.domain)
  const defaultTtl = Number(config.ttl) || DEFAULT_SERVER_CONFIG.ttl
  const zone = new Map()
  const add = (record) => {
    const list = zone.get(record.name) ?? []
    if (!list.some((r) => r.type === record.type && JSON.stringify(r.data) === JSON.stringify(record.data)))
      list.push(record)
    zone.set(record.name, list)
  }
  for (const record of config.records ?? []) {
    const problem = recordProblem(record, domain)
    if (problem)
      throw new Error(
        t('dns.errors.badRecord', {
          name: record.name || '@',
          type: record.type,
          problem: t(problem.key, problem.params)
        })
      )
    const name = absoluteName(record.name, domain)
    const ttl = String(record.ttl ?? '').trim() === '' ? defaultTtl : Number(record.ttl)
    if (!Number.isInteger(ttl) || ttl < 0 || ttl > 2147483647)
      throw new Error(t('dns.errors.invalidTtl', { name: record.name || '@' }))
    add({ name, type: record.type, ttl, data: recordData(record, domain) })
    if (config.autoPtr && (record.type === 'A' || record.type === 'AAAA') && !name.startsWith('*')) {
      add({ name: reverseName(record.value.trim()), type: 'PTR', ttl, data: name })
    }
  }
  if (domain) {
    add({
      name: domain,
      type: 'SOA',
      ttl: defaultTtl,
      data: {
        mname: `ns.${domain}`,
        rname: `hostmaster.${domain}`,
        serial: Math.floor(Date.now() / 1000) >>> 0,
        refresh: 3600,
        retry: 600,
        expire: 86400,
        minimum: defaultTtl
      }
    })
  }
  return zone
}

/**
 * Serveur DNS faisant autorité sur un domaine de test (UDP et, au choix, TCP). Les noms hors zone
 * sont relayés vers des serveurs amont si le relais est activé, sinon refusés (REFUSED). Les
 * enregistrements sont modifiables serveur démarré.
 */
export class DnsServer {
  udp = null
  tcp = null
  config = null
  zone = new Map()
  queries = []
  counters = { total: 0, answered: 0, nxdomain: 0, forwarded: 0, refused: 0 }
  connections = new Set()
  faults = []
  statusTimer = null
  lastCounters = ''

  constructor({ onStatus = () => {}, onQuery = () => {} } = {}) {
    this.onStatus = onStatus
    this.onQuery = onQuery
  }

  get running() {
    return !!this.udp
  }

  status() {
    return {
      running: this.running,
      endpoint: this.running ? `${this.config.host}:${this.config.port}` : null,
      config: this.config,
      counters: { ...this.counters },
      names: this.running ? [...this.zone.keys()].length : 0
    }
  }

  /** Vérifie la configuration et prépare la zone ; retourne la configuration normalisée. */
  prepare(options) {
    const config = {
      ...DEFAULT_SERVER_CONFIG,
      ...options,
      forward: { ...DEFAULT_SERVER_CONFIG.forward, ...options?.forward }
    }
    const port = Number(config.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t('dns.errors.invalidPort'))
    const zone = buildZone(config)
    const upstreams = config.forward.enabled ? parseUpstreams(config.forward.servers) : []
    if (config.forward.enabled && !upstreams.length) throw new Error(t('dns.errors.noUpstream'))
    return { config: { ...config, port }, zone, upstreams }
  }

  async start(options) {
    if (this.running) throw new Error(t('errors.alreadyStarted'))
    const { config, zone, upstreams } = this.prepare(options)
    const host = config.host || '0.0.0.0'
    const udp = dgram.createSocket(net.isIPv6(host) ? 'udp6' : 'udp4')
    try {
      await new Promise((resolve, reject) => {
        udp.once('error', reject)
        udp.bind(config.port, host, () => {
          udp.off('error', reject)
          resolve()
        })
      })
    } catch (err) {
      udp.close()
      throw this.bindError(err, config.port)
    }
    udp.on('error', () => {})
    udp.on('message', (msg, rinfo) => this.onUdp(msg, rinfo))

    let tcp = null
    if (config.tcp) {
      tcp = net.createServer((socket) => this.onTcp(socket))
      try {
        await new Promise((resolve, reject) => {
          tcp.once('error', reject)
          tcp.listen(config.port, host, () => {
            tcp.off('error', reject)
            resolve()
          })
        })
      } catch (err) {
        udp.close()
        throw this.bindError(err, config.port)
      }
      tcp.on('error', () => {})
    }

    this.udp = udp
    this.tcp = tcp
    this.config = config
    this.zone = zone
    this.upstreams = upstreams
    this.counters = { total: 0, answered: 0, nxdomain: 0, forwarded: 0, refused: 0 }
    this.statusTimer = setInterval(() => {
      const counters = JSON.stringify(this.counters)
      if (counters !== this.lastCounters) {
        this.lastCounters = counters
        this.onStatus(this.status())
      }
    }, STATUS_EMIT_INTERVAL)
    this.onStatus(this.status())
    return this.status()
  }

  bindError(err, port) {
    if (err.code === 'EACCES') return new Error(t('dns.errors.portPrivileged', { port }), { cause: err })
    if (err.code === 'EADDRINUSE') return new Error(t('dns.errors.portInUse', { port }), { cause: err })
    return err
  }

  async stop() {
    clearInterval(this.statusTimer)
    this.statusTimer = null
    for (const socket of this.connections) socket.destroy()
    this.connections.clear()
    const { udp, tcp } = this
    this.udp = this.tcp = null
    if (udp) udp.close()
    if (tcp) await new Promise((resolve) => tcp.close(() => resolve()))
    this.onStatus(this.status())
    return this.status()
  }

  /** Remplace la zone (enregistrements, domaine, TTL, PTR automatiques, relais) serveur démarré. */
  update(options) {
    if (!this.running) throw new Error(t('errors.notStarted'))
    const { config, zone, upstreams } = this.prepare({
      ...options,
      host: this.config.host,
      port: this.config.port,
      tcp: this.config.tcp
    })
    this.config = config
    this.zone = zone
    this.upstreams = upstreams
    this.onStatus(this.status())
    return this.status()
  }

  list() {
    return this.queries
  }

  clear() {
    this.queries = []
    return []
  }

  setFaults(faults = []) {
    this.faults = faults
  }

  fault(type) {
    return this.faults.find((f) => f.type === type)
  }

  // --- Réception ----------------------------------------------------------------------------

  async onUdp(msg, rinfo) {
    const response = await this.handle(msg, `${rinfo.address}:${rinfo.port}`, 'udp')
    if (response && this.udp) this.udp.send(response, rinfo.port, rinfo.address)
  }

  onTcp(socket) {
    this.connections.add(socket)
    socket.on('error', () => {})
    socket.on('close', () => this.connections.delete(socket))
    socket.setTimeout(10_000, () => socket.destroy())
    let buffer = Buffer.alloc(0)
    socket.on('data', async (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      while (buffer.length >= 2) {
        const length = buffer.readUInt16BE(0)
        if (buffer.length < 2 + length) break
        const msg = buffer.subarray(2, 2 + length)
        buffer = buffer.subarray(2 + length)
        const response = await this.handle(msg, `${socket.remoteAddress}:${socket.remotePort}`, 'tcp')
        if (response && !socket.destroyed) {
          const prefix = Buffer.alloc(2)
          prefix.writeUInt16BE(response.length)
          socket.write(Buffer.concat([prefix, response]))
        }
      }
    })
  }

  /** Traite une requête et retourne la réponse encodée (null : pas de réponse). */
  async handle(msg, remote, transport) {
    let query
    try {
      query = dnsPacket.decode(msg)
    } catch {
      return null
    }
    if (query.type !== 'query') return null
    this.counters.total++
    if (this.fault('noResponse')) return null
    const delay = Number(this.fault('delay')?.params?.ms) || 0
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))

    const question = query.questions?.[0]
    const started = Date.now()
    let result
    if (!question || query.questions.length !== 1) result = { rcode: 'FORMERR', answers: [] }
    else if (this.fault('exception'))
      result = { rcode: this.fault('exception').params?.code || 'SERVFAIL', answers: [] }
    else {
      result = this.resolve(question)
      if (result.forward) {
        const forwarded = await this.forward(msg)
        this.counters.forwarded++
        this.record(
          remote,
          transport,
          question,
          forwarded ? this.summarize(forwarded) : { rcode: 'SERVFAIL' },
          started,
          true
        )
        return forwarded
          ? this.fitUdp(forwarded, query, transport)
          : this.encode(query, { rcode: 'SERVFAIL', answers: [] })
      }
    }
    this.record(remote, transport, question, result, started, false)
    return this.encode(query, result, transport)
  }

  /** Réponse locale à une question : { rcode, answers, authorities, authoritative } ou { forward: true }. */
  resolve(question) {
    const name = lower(question.name)
    const type = question.type
    const domain = lower(this.config.domain)
    const inZone = (n) => !!domain && (n === domain || n.endsWith(`.${domain}`))
    const soa = domain ? this.zone.get(domain)?.filter((r) => r.type === 'SOA') : []

    const lookup = (n) => {
      if (this.zone.has(n)) return this.zone.get(n)
      // Joker : *.domaine couvre les noms absents de la zone sous ce domaine.
      const labels = n.split('.')
      for (let i = 1; i < labels.length; i++) {
        const wildcard = this.zone.get(`*.${labels.slice(i).join('.')}`)
        if (wildcard) return wildcard.map((r) => ({ ...r, name: n }))
      }
      return null
    }

    const records = lookup(name)
    if (!records) {
      if (inZone(name)) return { rcode: 'NXDOMAIN', answers: [], authorities: soa, authoritative: true }
      if (this.upstreams?.length) return { forward: true }
      return { rcode: 'REFUSED', answers: [] }
    }
    if (type === 'ANY') return { rcode: 'NOERROR', answers: records, authoritative: true }

    const answers = []
    let current = records
    for (let hop = 0; hop < MAX_CNAME_CHAIN; hop++) {
      const matches = current.filter((r) => r.type === type)
      if (matches.length) {
        answers.push(...matches)
        break
      }
      const cname = current.find((r) => r.type === 'CNAME')
      if (!cname || type === 'CNAME') break
      answers.push(cname)
      current = lookup(cname.data)
      if (!current) break
    }
    return { rcode: 'NOERROR', answers, authorities: answers.length ? [] : soa, authoritative: true }
  }

  encode(query, result, transport = 'udp') {
    const rd = query.flags & dnsPacket.RECURSION_DESIRED
    const flags =
      (result.authoritative ? dnsPacket.AUTHORITATIVE_ANSWER : 0) |
      rd |
      (this.upstreams?.length ? dnsPacket.RECURSION_AVAILABLE : 0) |
      (RCODES[result.rcode] ?? 2)
    const packet = {
      type: 'response',
      id: query.id,
      flags,
      questions: query.questions ?? [],
      answers: (result.answers ?? []).map((r) => ({ ...r, class: 'IN' })),
      authorities: (result.authorities ?? []).map((r) => ({ ...r, class: 'IN' }))
    }
    const buffer = dnsPacket.encode(packet)
    if (transport === 'udp' && buffer.length > this.udpLimit(query)) {
      // Réponse trop grande pour UDP : tronquée (TC), le client recommence en TCP.
      return dnsPacket.encode({ ...packet, flags: flags | (1 << 9), answers: [], authorities: [] })
    }
    return buffer
  }

  /** Taille UDP acceptée par le client (EDNS), 512 octets sinon. */
  udpLimit(query) {
    const opt = (query.additionals ?? []).find((r) => r.type === 'OPT')
    return Math.max(UDP_LIMIT, Math.min(Number(opt?.udpPayloadSize) || UDP_LIMIT, 4096))
  }

  fitUdp(response, query, transport) {
    if (transport !== 'udp' || response.length <= this.udpLimit(query)) return response
    const decoded = dnsPacket.decode(response)
    return dnsPacket.encode({
      ...decoded,
      flags: decoded.flags | (1 << 9),
      answers: [],
      authorities: [],
      additionals: []
    })
  }

  /** Relaie la requête brute vers les serveurs amont, l'un après l'autre (réponse brute, ou null). */
  async forward(msg) {
    for (const { host, port } of this.upstreams) {
      const response = await new Promise((resolve) => {
        const socket = dgram.createSocket(net.isIPv6(host) ? 'udp6' : 'udp4')
        const done = (value) => {
          clearTimeout(timer)
          socket.close()
          resolve(value)
        }
        const timer = setTimeout(() => done(null), FORWARD_TIMEOUT)
        socket.on('error', () => done(null))
        socket.on('message', (reply) => done(reply))
        socket.send(msg, port, host, (err) => err && done(null))
      })
      if (response) return response
    }
    return null
  }

  summarize(response) {
    try {
      const decoded = dnsPacket.decode(response)
      return { rcode: decoded.rcode, answers: decoded.answers ?? [] }
    } catch {
      return { rcode: 'SERVFAIL', answers: [] }
    }
  }

  record(remote, transport, question, result, started, forwarded) {
    if (result.rcode === 'NXDOMAIN') this.counters.nxdomain++
    else if (result.rcode === 'REFUSED') this.counters.refused++
    else if (result.rcode === 'NOERROR') this.counters.answered++
    const entry = {
      id: randomUUID(),
      time: new Date().toISOString(),
      remote,
      transport,
      name: question?.name ?? '',
      type: question?.type ?? '',
      rcode: result.rcode,
      answers: (result.answers ?? []).map((r) => `${r.type} ${formatData(r)}`),
      forwarded,
      duration: Date.now() - started
    }
    this.queries.push(entry)
    if (this.queries.length > MAX_QUERIES) this.queries.splice(0, this.queries.length - MAX_QUERIES)
    this.onQuery(entry)
  }
}

/** Texte d'une donnée d'enregistrement (journal, client). */
export function formatData(record) {
  const d = record.data
  switch (record.type) {
    case 'MX':
      return `${d.preference} ${d.exchange}`
    case 'SRV':
      return `${d.priority} ${d.weight} ${d.port} ${d.target}`
    case 'TXT':
      return (Array.isArray(d) ? d : [d]).map((s) => (Buffer.isBuffer(s) ? s.toString() : String(s))).join('')
    case 'SOA':
      return `${d.mname} ${d.rname} ${d.serial} ${d.refresh} ${d.retry} ${d.expire} ${d.minimum}`
    default:
      return Buffer.isBuffer(d) ? d.toString('hex') : typeof d === 'object' ? JSON.stringify(d) : String(d)
  }
}
