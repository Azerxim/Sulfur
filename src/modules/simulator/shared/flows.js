/**
 * Flux du simulateur, à la manière de Node-RED : des nœuds reliés par des fils, à travers lesquels
 * circulent des messages `{ payload, topic, … }`.
 *
 *   flux  = { id, name, disabled, nodes: [nœud], wires: [fil] }
 *   nœud  = { id, type, name, x, y, config: { … } }   (config : voir NODE_TYPES[type].defaults)
 *   fil   = { id, source, port, target }               (sortie `port` de `source` → entrée de `target`)
 *
 * Les points sont désignés par leur clé `<module>/<id>` (voir `points.js` du SDK), les défauts par leur
 * identifiant dans la table des défauts du simulateur.
 */

/** Familles de nœuds, dans l'ordre de la palette (libellés : simulator.categories.*). */
export const NODE_CATEGORIES = ['triggers', 'points', 'timing', 'logic', 'function', 'generators', 'output']

/** Fonctions des générateurs (voir `simulate` du SDK, libellés : simulator.simulations.*). */
export const GENERATOR_FUNCTIONS = ['sine', 'ramp', 'random', 'toggle']

/** Types de charge utile d'un déclencheur (libellés : simulator.payloadTypes.*). */
export const PAYLOAD_TYPES = ['number', 'string', 'boolean', 'json', 'timestamp']

/** Opérateurs d'un aiguillage (libellés : simulator.operators.*). `else` : aucune règle précédente. */
export const SWITCH_OPERATORS = ['eq', 'neq', 'lt', 'lte', 'gt', 'gte', 'between', 'true', 'false', 'else']

/** Opérateurs sans valeur de comparaison. */
export const UNARY_OPERATORS = ['true', 'false', 'else']

/** Code par défaut d'un nœud fonction. */
export const DEFAULT_FUNCTION_CODE = 'return msg'

/** Durée maximale d'exécution d'un nœud fonction pour un message (ms). */
export const FUNCTION_TIMEOUT = 1000

/** Messages de débogage conservés. */
export const DEBUG_LIMIT = 200

/**
 * Types de nœuds (libellés : simulator.nodes.<type>). `inputs` : 0 ou 1 entrée ; `outputs` : nombre
 * de sorties, éventuellement fonction de la configuration.
 */
export const NODE_TYPES = {
  inject: {
    category: 'triggers',
    inputs: 0,
    outputs: 1,
    // Déclenché à la main, au déploiement (`once`) et/ou toutes les `repeat` secondes.
    defaults: { payloadType: 'number', payload: '0', topic: '', once: false, repeat: 0 }
  },
  watch: {
    category: 'triggers',
    inputs: 0,
    outputs: 1,
    // Émet la valeur du point à chaque changement (scrutation toutes les `interval` ms).
    defaults: { point: '', interval: 200, initial: false }
  },
  read: { category: 'points', inputs: 1, outputs: 1, defaults: { point: '' } },
  write: {
    category: 'points',
    inputs: 1,
    outputs: 1,
    // source 'msg' : écrit msg.payload ; 'fixed' : écrit `value`.
    defaults: { point: '', source: 'msg', value: '' }
  },
  delay: { category: 'timing', inputs: 1, outputs: 1, defaults: { duration: 1 } },
  ramp: {
    category: 'timing',
    inputs: 1,
    outputs: 1,
    // from vide : valeur actuelle du point ; to vide : msg.payload. Durée en secondes.
    defaults: { point: '', from: '', to: 100, duration: 10 }
  },
  fault: {
    category: 'timing',
    inputs: 1,
    outputs: 1,
    // action 'on' | 'off' | 'msg' (msg.payload vrai → activer, faux → arrêter).
    defaults: { fault: '', action: 'on' }
  },
  switch: {
    category: 'logic',
    inputs: 1,
    outputs: (config) => Math.max(1, config.rules?.length ?? 1),
    // Une sortie par règle ; checkAll : toutes les règles vérifiées, sinon la première seulement.
    defaults: {
      property: 'payload',
      rules: [
        { op: 'gt', value: '50', value2: '' },
        { op: 'else', value: '', value2: '' }
      ],
      checkAll: false
    }
  },
  scale: {
    category: 'logic',
    inputs: 1,
    outputs: 1,
    defaults: { inMin: 0, inMax: 100, outMin: 0, outMax: 1, clamp: true, round: false }
  },
  counter: {
    category: 'logic',
    inputs: 1,
    outputs: 1,
    // msg.reset : remet le compteur à sa valeur initiale.
    defaults: { initial: 0, step: 1 }
  },
  filter: {
    category: 'logic',
    inputs: 1,
    outputs: 1,
    // Ne laisse passer que les changements de msg.payload (de plus de `deadband` pour un nombre).
    defaults: { deadband: 0 }
  },
  function: {
    category: 'function',
    inputs: 1,
    outputs: (config) => Math.max(1, Math.min(10, Number(config.outputs) || 1)),
    defaults: { code: DEFAULT_FUNCTION_CODE, outputs: 1 }
  },
  generator: {
    category: 'generators',
    inputs: 1,
    outputs: 1,
    // Émet toutes les `interval` ms ; msg.payload faux / vrai en entrée met en pause / relance.
    defaults: { simulation: 'sine', period: 10, min: 0, max: 100, interval: 500, integer: false, autostart: true }
  },
  debug: {
    category: 'output',
    inputs: 1,
    outputs: 0,
    // property 'payload' : msg.payload ; 'msg' : le message entier.
    defaults: { property: 'payload', active: true }
  }
}

/** Nombre de sorties d'un nœud. */
export function nodeOutputs(node) {
  const def = NODE_TYPES[node.type]
  if (!def) return 0
  return typeof def.outputs === 'function' ? def.outputs({ ...def.defaults, ...node.config }) : def.outputs
}

/** Nouveau nœud d'un type donné à la position (x, y). */
export function createNode(type, x = 0, y = 0, config = {}) {
  return {
    id: crypto.randomUUID(),
    type,
    name: '',
    x,
    y,
    config: structuredClone({ ...NODE_TYPES[type].defaults, ...config })
  }
}

export const createWire = (source, target, port = 0) => ({ id: crypto.randomUUID(), source, port, target })

/** Lecture d'une propriété d'un message par son chemin (`payload`, `data.value`…). */
export function getProperty(msg, path = 'payload') {
  let value = msg
  for (const part of String(path || 'payload').split('.')) {
    if (value === null || value === undefined) return undefined
    value = value[part]
  }
  return value
}

/** Espacement des nœuds créés automatiquement (scénarios convertis, enregistrements). */
const STEP_X = 200
const ORIGIN = { x: 40, y: 60 }

/**
 * Flux équivalent à une suite d'étapes de scénario (ancien format, ou enregistrement) :
 * un déclencheur manuel suivi d'un nœud par étape ; `loop` reboucle la dernière étape sur la première.
 *   étape = { type: 'set', point, value } | { type: 'wait', duration } |
 *           { type: 'ramp', point, from, to, duration } | { type: 'fault', fault, action }
 */
export function stepsToFlow({ id = crypto.randomUUID(), name = '', loop = false, steps = [] }, origin = ORIGIN) {
  const trigger = createNode('inject', origin.x, origin.y, { payloadType: 'string', payload: '' })
  const nodes = [trigger]
  for (const step of steps) {
    const x = origin.x + STEP_X * nodes.length
    if (step.type === 'set')
      nodes.push(createNode('write', x, origin.y, { point: step.point, source: 'fixed', value: step.value }))
    else if (step.type === 'wait') nodes.push(createNode('delay', x, origin.y, { duration: step.duration }))
    else if (step.type === 'ramp')
      nodes.push(
        createNode('ramp', x, origin.y, {
          point: step.point,
          from: step.from ?? '',
          to: step.to,
          duration: step.duration
        })
      )
    else if (step.type === 'fault')
      nodes.push(createNode('fault', x, origin.y, { fault: step.fault, action: step.action === 'off' ? 'off' : 'on' }))
  }
  const wires = nodes.slice(1).map((node, i) => createWire(nodes[i].id, node.id))
  if (loop && nodes.length > 1) wires.push(createWire(nodes.at(-1).id, nodes[1].id))
  return { id, name, disabled: false, nodes, wires }
}

/**
 * Configuration enregistrée d'une version antérieure : les scénarios (section `scenarios`) deviennent
 * des flux. Retourne la configuration inchangée s'il n'y a rien à convertir.
 */
export function migrateSimulatorConfig(config) {
  if (!config || !Array.isArray(config.scenarios)) return config
  const { scenarios, ...rest } = config
  if (Array.isArray(rest.flows)) return rest
  return { ...rest, flows: scenarios.map((scenario) => stepsToFlow(scenario)) }
}
