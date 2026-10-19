/** Délimitation des messages Syslog sur TCP / TLS (RFC 6587). */

/** Taille maximale d'un message sur un flux : au-delà, le tampon est vidé tel quel. */
const MAX_FRAME = 64 * 1024

/** Message prêt à écrire sur un flux : longueur en tête (`octet`) ou terminé par une fin de ligne. */
export function frame(text, framing = 'octet') {
  return framing === 'lf' ? `${text}\n` : `${Buffer.byteLength(text)} ${text}`
}

/**
 * Découpe un flux en messages. Chaque message est lu selon sa propre forme : longueur en tête
 * (« octet counting ») s'il commence par un nombre suivi d'une espace, sinon jusqu'à la fin de
 * ligne (« non-transparent framing »).
 */
export class FrameDecoder {
  buffer = Buffer.alloc(0)

  /** Ajoute des octets reçus ; retourne les messages complets (texte). */
  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    const messages = []
    for (;;) {
      const counted = this.buffer
        .subarray(0, 12)
        .toString('latin1')
        .match(/^(\d{1,9}) /)
      if (counted) {
        const start = counted[0].length
        const end = start + Number(counted[1])
        if (this.buffer.length < end) break
        messages.push(this.buffer.subarray(start, end).toString('utf8'))
        this.buffer = this.buffer.subarray(end)
        continue
      }
      const lf = this.buffer.indexOf(0x0a)
      if (lf < 0) {
        if (this.buffer.length > MAX_FRAME) {
          messages.push(this.buffer.toString('utf8'))
          this.buffer = Buffer.alloc(0)
        }
        break
      }
      const line = this.buffer.subarray(0, lf).toString('utf8').replace(/\r$/, '')
      this.buffer = this.buffer.subarray(lf + 1)
      if (line.trim()) messages.push(line)
    }
    return messages
  }

  /** Fin du flux : le reste éventuel est un dernier message. */
  end() {
    const rest = this.buffer.toString('utf8').trim()
    this.buffer = Buffer.alloc(0)
    return rest ? [rest] : []
  }
}
