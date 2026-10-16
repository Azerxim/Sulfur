import http from 'http'
import https from 'https'
import { t } from '../shared/i18n'

/** Taille maximale d'une réponse lue par le client (octets) : au-delà, le corps est tronqué. */
const MAX_RESPONSE = 10 * 1024 * 1024

/** En-têtes d'authentification d'un client : { type, username, password, token, headerName, apiKey }. */
export function authHeaders(auth = {}) {
  switch (auth.type) {
    case 'basic':
      return {
        authorization: `Basic ${Buffer.from(`${auth.username ?? ''}:${auth.password ?? ''}`).toString('base64')}`
      }
    case 'bearer':
      return { authorization: `Bearer ${auth.token ?? ''}` }
    case 'apiKey':
      return auth.headerName ? { [auth.headerName.toLowerCase()]: auth.apiKey ?? '' } : {}
    default:
      return {}
  }
}

/** Liste d'en-têtes [{ name, value }] → objet (en-têtes vides ignorés, noms en minuscules). */
export const headerObject = (list = []) =>
  Object.fromEntries(
    list.filter((h) => h.name?.trim()).map((h) => [h.name.trim().toLowerCase(), String(h.value ?? '')])
  )

/**
 * Requête HTTP(S) sortante. `allowInsecure` : accepte un certificat serveur auto-signé ou non reconnu.
 * Retourne { status, statusText, headers, body, size, duration, truncated }.
 */
export function httpRequest(url, { method = 'GET', headers = {}, body, timeout = 5000, allowInsecure = false } = {}) {
  let target
  try {
    target = new URL(url)
  } catch {
    return Promise.reject(new Error(t('http.errors.invalidUrl', { url })))
  }
  if (!['http:', 'https:'].includes(target.protocol)) {
    return Promise.reject(new Error(t('http.errors.invalidUrl', { url })))
  }
  const transport = target.protocol === 'https:' ? https : http
  const payload = body === undefined || body === null || body === '' ? null : Buffer.from(String(body))
  const started = Date.now()

  return new Promise((resolve, reject) => {
    const req = transport.request(
      target,
      {
        method,
        headers: { ...headers, ...(payload ? { 'content-length': payload.length } : {}) },
        rejectUnauthorized: !allowInsecure,
        timeout
      },
      (res) => {
        const chunks = []
        let size = 0
        let truncated = false
        res.on('data', (chunk) => {
          size += chunk.length
          if (size <= MAX_RESPONSE) chunks.push(chunk)
          else truncated = true
        })
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            statusText: res.statusMessage,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
            size,
            duration: Date.now() - started,
            truncated
          })
        )
        res.on('error', reject)
      }
    )
    req.on('timeout', () => req.destroy(new Error(t('http.errors.timeout', { timeout }))))
    req.on('error', (err) => {
      if (err.code === 'ECONNREFUSED')
        reject(new Error(t('http.errors.refused', { host: target.host }), { cause: err }))
      else if (err.code === 'ECONNRESET' || err.code === 'EPIPE')
        reject(new Error(t('http.errors.reset'), { cause: err }))
      else reject(err)
    })
    if (payload) req.write(payload)
    req.end()
  })
}
