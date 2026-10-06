/** Calcule la valeur simulée d'une variable à l'instant `t` (ms). */
export function simulate(variable, current, t, dt) {
  const { simulation, period = 1000, min = 0, max = 1, dataType } = variable
  const span = max - min
  const isInt = ['Int16', 'Int32', 'UInt32'].includes(dataType)
  const round = (v) => (isInt ? Math.round(v) : v)

  switch (simulation) {
    case 'sine':
      return round(min + span / 2 + (span / 2) * Math.sin((2 * Math.PI * t) / period))
    case 'ramp':
      return round(min + ((t % period) / period) * span)
    case 'random':
      // Mise à jour toutes les `period` ms
      if (Math.floor(t / period) === Math.floor((t - dt) / period)) return current
      return round(min + Math.random() * span)
    case 'toggle':
      if (dataType === 'Boolean') return Math.floor(t / period) % 2 === 0
      return Math.floor(t / period) % 2 === 0 ? min : max
    default:
      return current
  }
}
