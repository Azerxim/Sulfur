import { builtinManifest } from '@shared/module'

export const HTTP_MODULE = builtinManifest({
  id: 'http',
  name: 'HTTP / REST',
  description: 'Serveur REST simulé (variables, routes, webhooks) et client HTTP / HTTPS'
})

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

/** Méthode d'une route : une méthode précise ou toutes (`ANY`). */
export const ROUTE_METHODS = ['ANY', ...METHODS]

/** Types des variables simulées (libellés : http.dataTypes.*). */
export const DATA_TYPES = ['Number', 'Integer', 'Boolean', 'String', 'JSON']

/** Types numériques : simulables et publiés comme points numériques. */
export const NUMERIC_TYPES = ['Number', 'Integer', 'Boolean']

/** Générateurs de valeurs (libellés : simulations.*). */
export const SIMULATIONS = ['none', 'sine', 'ramp', 'random', 'toggle']

/** Authentification (libellés : http.auth.types.*). */
export const AUTH_TYPES = ['none', 'basic', 'bearer', 'apiKey']

export const CONTENT_TYPES = ['application/json', 'text/plain', 'text/html', 'application/xml', 'text/csv']

/** Codes HTTP proposés pour le défaut « code d'état forcé ». */
export const FAULT_STATUSES = [400, 401, 403, 404, 408, 429, 500, 502, 503, 504]

/** Entrées conservées dans le journal des requêtes du serveur. */
export const MAX_LOG = 300

/** Taille maximale d'un corps de requête accepté par le serveur (octets). */
export const MAX_BODY = 1024 * 1024

/** Taille conservée d'un corps dans le journal (caractères). */
export const LOG_BODY = 2000

/** Webhook : à chaque changement des variables choisies, ou toutes les `interval` secondes. */
export const WEBHOOK_MODES = ['change', 'interval']

export const DEFAULT_SERVER_AUTH = {
  type: 'none',
  /** Utilisateurs de l'authentification Basic : mots de passe hachés (`passwordHash`). */
  users: [],
  token: '',
  headerName: 'X-API-Key',
  apiKey: ''
}

export const DEFAULT_SERVER_CONFIG = {
  host: '0.0.0.0',
  port: 8080,
  https: false,
  /** En-têtes CORS : l'API est appelable depuis une page web d'une autre origine. */
  cors: true,
  /** API intégrée : GET <base>/variables, GET / PUT <base>/variables/<nom>. */
  api: true,
  basePath: '/api',
  updateRate: 100,
  auth: DEFAULT_SERVER_AUTH,
  variables: [
    {
      id: 'var-1',
      name: 'temperature',
      dataType: 'Number',
      initialValue: 20,
      simulation: 'sine',
      period: 10000,
      min: 15,
      max: 25,
      writable: false
    },
    {
      id: 'var-2',
      name: 'setpoint',
      dataType: 'Integer',
      initialValue: 50,
      simulation: 'none',
      period: 1000,
      min: 0,
      max: 100,
      writable: true
    },
    {
      id: 'var-3',
      name: 'running',
      dataType: 'Boolean',
      initialValue: true,
      simulation: 'toggle',
      period: 5000,
      min: 0,
      max: 1,
      writable: true
    },
    {
      id: 'var-4',
      name: 'status',
      dataType: 'String',
      initialValue: 'OK',
      simulation: 'none',
      period: 1000,
      min: 0,
      max: 1,
      writable: true
    }
  ],
  routes: [
    {
      id: 'route-1',
      method: 'GET',
      path: '/health',
      status: 200,
      contentType: 'application/json',
      headers: [],
      body: '{ "status": "{{var.status}}", "time": "{{now}}" }',
      delay: 0,
      setVariable: '',
      source: ''
    },
    {
      id: 'route-2',
      method: 'POST',
      path: '/api/setpoint',
      status: 200,
      contentType: 'application/json',
      headers: [],
      body: '{ "setpoint": {{var.setpoint}} }',
      delay: 0,
      setVariable: 'var-2',
      source: 'body.value'
    },
    {
      id: 'route-3',
      method: 'GET',
      path: '/api/devices/:id',
      status: 200,
      contentType: 'application/json',
      headers: [],
      body: '{ "id": "{{params.id}}", "temperature": {{var.temperature}}, "running": {{var.running}} }',
      delay: 0,
      setVariable: '',
      source: ''
    }
  ],
  webhooks: []
}

export const DEFAULT_CLIENT_CONFIG = {
  baseUrl: 'http://127.0.0.1:8080',
  timeout: 5000,
  /** HTTPS : accepter un certificat auto-signé ou non reconnu (serveur de test). */
  allowInsecure: true,
  auth: { type: 'none', username: '', password: '', token: '', headerName: 'X-API-Key', apiKey: '' },
  headers: [],
  pollInterval: 1000
}

/** Requête préparée du client. */
export const DEFAULT_CLIENT_REQUEST = {
  method: 'GET',
  path: '/api/variables',
  headers: [],
  body: ''
}
