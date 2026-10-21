import fs from 'fs'
import path from 'path'
import { isPlainObject } from '@azerxim/sulfur-sdk'
/**
 * Configuration enregistrée d'un module : un fichier JSON `{ <section>: valeur }`.
 * L'écriture est synchrone et atomique (fichier temporaire puis renommage) : rien n'est perdu si
 * l'application se ferme juste après une modification, et le fichier n'est jamais à moitié écrit.
 */
export class ConfigStore {
  constructor(file) {
    this.file = file
    this.data = this.read()
  }

  read() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      return isPlainObject(data) ? data : {}
    } catch {
      return {}
    }
  }

  get() {
    return this.data
  }

  /** Remplace une section. */
  set(section, value) {
    if (typeof section !== 'string' || !section) throw new Error(`Section invalide : ${section}`)
    this.data = { ...this.data, [section]: value }
    this.write()
  }

  /** Remplace toute la configuration (import). */
  replace(data) {
    this.data = isPlainObject(data) ? data : {}
    this.write()
  }

  write() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2))
    fs.renameSync(tmp, this.file)
  }
}
