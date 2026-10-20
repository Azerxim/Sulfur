/** Taille lisible d'un fichier (o, Kio, Mio, Gio). */
export function formatSize(bytes) {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} o`
  const units = ['Kio', 'Mio', 'Gio']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(1)} ${units[i]}`
}
