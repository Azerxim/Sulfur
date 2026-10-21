import dgram from 'dgram'
import net from 'net'
import { randomInt, randomUUID } from 'crypto'
import dnsPacket from 'dns-packet'
import { DEFAULT_CLIENT_CONFIG, QUERY_TYPES } from '../shared/constants'
import { isIPv4, isIPv6, reverseName } from '../shared/records'
import { formatData } from './server'
import { t } from '../shared/i18n'

const MAX_HISTORY = 100

/** Envoie une requête en UDP et attend la réponse de même identifiant. */
function queryUdp(packet, { server, port, timeout }) {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket(net.isIPv6(server) ? 'udp6' : 'udp4')
    const done = (err, value) => {
      clearTimeout(timer)
      socket.close()
      if (err) reject(err)
      else resolve(value)
    }
    const timer = setTimeout(() => done(new Error(t('dns.errors.timeout', { timeout }))), timeout)
    socket.on('error', (err) => done(err))
    socket.on('message', (msg) => {
      try {
        const response = dnsPacket.decode(msg)
        if (response.id === packet.id) done(null, { response, size: msg.length })
      } catch {
        // réponse illisible : on attend la suivante
      }
    })
    socket.send(dnsPacket.encode(packet), port, server, (err) => err && done(err))
  })
}

/** Envoie une requête en TCP (message précédé de sa longueur). */
function queryTcp(packet, { server, port, timeout }) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: server, port })
    let buffer = Buffer.alloc(0)
    const done = (err, value) => {
      clearTimeout(timer)
      socket.destroy()
      if (err) reject(err)
      else resolve(value)
    }
    const timer = setTimeout(() => done(new Error(t('dns.errors.timeout', { timeout }))), timeout)
    socket.on('error', (err) =>
      done(err.code === 'ECONNREFUSED' ? new Error(t('dns.errors.tcpRefused', { server, port })) : err)
    )
    socket.on('connect', () => socket.write(dnsPacket.streamEncode(packet)))
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk])
      if (buffer.length >= 2 && buffer.length >= 2 + buffer.readUInt16BE(0)) {
        try {
          done(null, { response: dnsPacket.streamDecode(buffer), size: buffer.length - 2 })
        } catch (err) {
          done(err)
        }
      }
    })
  })
}

const section = (records = []) =>
  records
    .filter((r) => r.type !== 'OPT')
    .map((r) => ({ name: r.name, type: r.type, ttl: r.ttl ?? null, value: formatData(r) }))

/**
 * Client DNS : une question par requête, en UDP (nouvel essai en TCP si la réponse est tronquée) ou
 * en TCP. Une adresse IP interrogée en PTR est convertie en nom inverse.
 */
export class DnsClient {
  history = []

  normalize(options) {
    const config = { ...DEFAULT_CLIENT_CONFIG, ...options }
    const port = Number(config.port)
    config.server = String(config.server ?? '').trim()
    if (!net.isIP(config.server)) throw new Error(t('dns.errors.invalidServer'))
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(t('dns.errors.invalidPort'))
    if (!QUERY_TYPES.includes(config.type)) throw new Error(t('dns.errors.unknownType', { type: config.type }))
    let name = String(config.name ?? '').trim()
    if (!name) throw new Error(t('dns.errors.missingName'))
    if (config.type === 'PTR' && (isIPv4(name) || isIPv6(name))) name = reverseName(name)
    return { ...config, port, name, timeout: Math.max(100, Number(config.timeout) || 2000) }
  }

  async query(options) {
    const config = this.normalize(options)
    const packet = {
      type: 'query',
      id: randomInt(1, 65535),
      flags: config.recursion ? dnsPacket.RECURSION_DESIRED : 0,
      questions: [{ type: config.type, name: config.name, class: 'IN' }]
    }
    const started = performance.now()
    let transport = config.tcp ? 'tcp' : 'udp'
    let result = await (config.tcp ? queryTcp : queryUdp)(packet, config)
    let truncated = false
    if (!config.tcp && result.response.flag_tc) {
      truncated = true
      transport = 'tcp'
      result = await queryTcp(packet, config)
    }
    const { response, size } = result
    const entry = {
      id: randomUUID(),
      time: new Date().toISOString(),
      server: `${config.server}:${config.port}`,
      name: config.name,
      type: config.type,
      transport,
      truncated,
      duration: Math.round((performance.now() - started) * 10) / 10,
      size,
      rcode: response.rcode,
      flags: {
        aa: response.flag_aa,
        tc: response.flag_tc,
        rd: response.flag_rd,
        ra: response.flag_ra
      },
      answers: section(response.answers),
      authorities: section(response.authorities),
      additionals: section(response.additionals)
    }
    this.history.unshift(entry)
    if (this.history.length > MAX_HISTORY) this.history.length = MAX_HISTORY
    return entry
  }

  clear() {
    this.history = []
    return []
  }
}
