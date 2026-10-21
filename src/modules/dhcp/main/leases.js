import { intToIp, ipToInt } from '@azerxim/sulfur-sdk'
import { DECLINE_HOLD, OFFER_HOLD } from '../shared/constants'

/**
 * Baux d'une plage d'adresses. Une adresse est « offerte » (réservée OFFER_HOLD en attente du
 * REQUEST), « attribuée » (jusqu'à la fin du bail) ou « refusée » (DECLINE : signalée en conflit
 * par un client, mise de côté DECLINE_HOLD). Une adresse dont l'échéance est passée est libre.
 */
export class LeaseTable {
  /** ip -> { ip, mac, hostname, state: 'offered' | 'bound' | 'declined', expires } */
  leases = new Map()

  constructor({ start, end, leaseTime }) {
    this.first = ipToInt(start)
    this.last = ipToInt(end)
    this.leaseTime = leaseTime
  }

  inPool(ip) {
    const n = ipToInt(ip)
    return n >= this.first && n <= this.last
  }

  /** Bail en cours d'une adresse (null si libre ou échu). */
  get(ip, now = Date.now()) {
    const lease = this.leases.get(ip)
    return lease && lease.expires > now ? lease : null
  }

  /** Bail en cours d'un client (offert ou attribué). */
  findByMac(mac, now = Date.now()) {
    for (const lease of this.leases.values()) {
      if (lease.mac === mac && lease.state !== 'declined' && lease.expires > now) return lease
    }
    return null
  }

  isFree(ip, now = Date.now()) {
    return this.inPool(ip) && !this.get(ip, now)
  }

  /**
   * Adresse offerte à un client : son bail en cours, sinon l'adresse demandée si elle est libre,
   * sinon la première adresse libre de la plage. null si la plage est épuisée.
   */
  offer(mac, { requested, hostname } = {}, now = Date.now()) {
    const current = this.findByMac(mac, now)
    if (current) {
      if (current.state === 'offered') current.expires = now + OFFER_HOLD
      if (hostname) current.hostname = hostname
      return current.ip
    }
    let ip = requested && this.isFree(requested, now) ? requested : null
    for (let n = this.first; !ip && n <= this.last; n++) if (this.isFree(intToIp(n), now)) ip = intToIp(n)
    if (!ip) return null
    this.leases.set(ip, { ip, mac, hostname: hostname ?? null, state: 'offered', expires: now + OFFER_HOLD })
    return ip
  }

  /** Attribution (ACK) d'une adresse à un client : refusée si elle est hors plage ou tenue par un autre. */
  bind(mac, ip, { hostname } = {}, now = Date.now()) {
    if (!this.inPool(ip)) return false
    const current = this.get(ip, now)
    if (current && current.mac !== mac) return false
    // Un client n'a qu'un bail : celui qu'il tenait sur une autre adresse est libéré.
    const other = this.findByMac(mac, now)
    if (other && other.ip !== ip) this.leases.delete(other.ip)
    this.leases.set(ip, {
      ip,
      mac,
      hostname: hostname ?? current?.hostname ?? null,
      state: 'bound',
      expires: now + this.leaseTime * 1000
    })
    return true
  }

  /** Abandon d'une offre (le client a choisi un autre serveur). */
  cancelOffer(mac, now = Date.now()) {
    const lease = this.findByMac(mac, now)
    if (lease?.state === 'offered') this.leases.delete(lease.ip)
  }

  /** Libération (RELEASE) par le client qui tient l'adresse. */
  release(mac, ip, now = Date.now()) {
    const lease = this.get(ip, now)
    if (!lease || lease.mac !== mac) return false
    this.leases.delete(ip)
    return true
  }

  /** Adresse signalée en conflit (DECLINE) : mise de côté. */
  decline(mac, ip, now = Date.now()) {
    if (!this.inPool(ip)) return false
    this.leases.set(ip, { ip, mac, hostname: null, state: 'declined', expires: now + DECLINE_HOLD })
    return true
  }

  /** Baux en cours, par adresse croissante. */
  list(now = Date.now()) {
    for (const [ip, lease] of this.leases) if (lease.expires <= now) this.leases.delete(ip)
    return [...this.leases.values()]
      .sort((a, b) => ipToInt(a.ip) - ipToInt(b.ip))
      .map((lease) => ({ ...lease, expires: new Date(lease.expires).toISOString() }))
  }

  get size() {
    return this.last - this.first + 1
  }
}
