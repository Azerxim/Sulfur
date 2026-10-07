import fs from 'fs/promises'
import { basename } from 'path'
import { DataType, nodesets } from 'node-opcua'
import { t } from '../shared/i18n'
import { DATA_TYPES } from '../shared/constants'
import { NAME_PATTERN } from '../shared/fields'

/** Espace de noms des types structurés définis dans Sulfur. */
export const TYPES_NAMESPACE = 'urn:Sulfur:Types'
const STANDARD_MODEL = 'http://opcfoundation.org/UA/'

/** Taille maximale d'un fichier NodeSet2 importé. */
const MAX_NODESET_SIZE = 50 * 1024 * 1024

const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]

/**
 * Modèles définis et requis par un document NodeSet2 :
 * { namespaces: [uri], models: [uri], requires: [uri] }.
 */
export function describeNodeset(xml) {
  if (!/<UANodeSet[\s>]/.test(xml)) throw new Error(t('opcua.errors.notNodeset'))
  const uris = xml.match(/<NamespaceUris>([\s\S]*?)<\/NamespaceUris>/)?.[1] ?? ''
  const tags = (name) => [...xml.matchAll(new RegExp(`<${name}\\s[^>]*>`, 'g'))].map((m) => m[0])
  return {
    namespaces: [...uris.matchAll(/<Uri>([^<]*)<\/Uri>/g)].map((m) => m[1].trim()),
    models: tags('Model')
      .map((tag) => attr(tag, 'ModelUri'))
      .filter(Boolean),
    requires: [
      ...new Set(
        tags('RequiredModel')
          .map((tag) => attr(tag, 'ModelUri'))
          .filter(Boolean)
      )
    ]
  }
}

/** Lit les fichiers NodeSet2 choisis par l'utilisateur. */
export async function readNodesetFiles(paths) {
  return Promise.all(
    paths.map(async (path) => {
      const { size } = await fs.stat(path)
      if (size > MAX_NODESET_SIZE) throw new Error(t('opcua.errors.nodesetTooBig', { name: basename(path) }))
      const xml = await fs.readFile(path, 'utf8')
      try {
        return { name: basename(path), size, xml, ...describeNodeset(xml) }
      } catch (err) {
        throw new Error(`${basename(path)} : ${err.message}`, { cause: err })
      }
    })
  )
}

let bundled = null

/** Modèles compagnons fournis avec node-opcua : { [modelUri]: { file, requires } }. */
async function bundledModels() {
  if (bundled) return bundled
  bundled = {}
  for (const file of Object.values(nodesets)) {
    if (file === nodesets.standard) continue
    try {
      // L'en-tête (espaces de noms, modèles) se trouve au début du fichier.
      const handle = await fs.open(file)
      const { buffer, bytesRead } = await handle.read(Buffer.alloc(64 * 1024), 0, 64 * 1024, 0)
      await handle.close()
      const head = buffer.toString('utf8', 0, bytesRead)
      const { models, requires } = describeNodeset(head)
      for (const uri of models) bundled[uri] = { file, requires }
    } catch {
      // modèle illisible : simplement non proposé
    }
  }
  return bundled
}

/**
 * Documents à charger au démarrage du serveur : le modèle standard, les modèles compagnons fournis
 * avec node-opcua dont les fichiers importés ont besoin, puis les fichiers importés eux-mêmes.
 * Lève une erreur traduite si un modèle requis n'est disponible nulle part.
 */
export async function nodesetSources(imported = []) {
  const provided = new Set([STANDARD_MODEL, ...imported.flatMap((n) => n.models ?? [])])
  const available = await bundledModels()
  const extra = []
  const require = (uri, by) => {
    if (provided.has(uri)) return
    const model = available[uri]
    if (!model) throw new Error(t('opcua.errors.missingModel', { uri, name: by }))
    provided.add(uri)
    model.requires.forEach((dep) => require(dep, uri))
    extra.push(model.file)
  }
  for (const n of imported) (n.requires ?? []).forEach((uri) => require(uri, n.name))
  return [nodesets.standard, ...extra, ...imported.map((n) => ({ name: n.name, source: n.xml }))]
}

/** Vérifie les types structurés de la configuration (noms, champs). */
export function validateStructures(structures = []) {
  const names = new Set()
  for (const s of structures) {
    if (!NAME_PATTERN.test(s.name ?? '')) throw new Error(t('opcua.errors.invalidName', { name: s.name ?? '' }))
    if (names.has(s.name) || DATA_TYPES.includes(s.name))
      throw new Error(t('opcua.errors.typeExists', { name: s.name }))
    names.add(s.name)
    if (!s.fields?.length) throw new Error(t('opcua.errors.noFields', { name: s.name }))
    for (const f of s.fields) {
      if (!NAME_PATTERN.test(f.name ?? '') || !DATA_TYPES.includes(f.dataType)) {
        throw new Error(t('opcua.errors.invalidField', { name: s.name, field: f.name ?? '' }))
      }
    }
  }
}

/**
 * Document NodeSet2 décrivant les types structurés : un DataType sous Structure par type, avec sa
 * définition et son encodage binaire. node-opcua en déduit l'encodage, comme pour un modèle importé.
 */
export function structuresNodeset(structures) {
  const types = structures
    .map(
      (s) => `  <UADataType NodeId="ns=1;s=${s.name}" BrowseName="1:${s.name}">
    <DisplayName>${s.name}</DisplayName>
    <References><Reference ReferenceType="HasSubtype" IsForward="false">i=22</Reference></References>
    <Definition Name="1:${s.name}">
${s.fields
  .map(
    (f) =>
      `      <Field Name="${f.name}" DataType="i=${DataType[f.dataType]}"${f.array ? ' ValueRank="1" ArrayDimensions="0"' : ''}/>`
  )
  .join('\n')}
    </Definition>
  </UADataType>
  <UAObject NodeId="ns=1;s=${s.name}.DefaultBinary" BrowseName="Default Binary" SymbolicName="DefaultBinary">
    <DisplayName>Default Binary</DisplayName>
    <References>
      <Reference ReferenceType="HasEncoding" IsForward="false">ns=1;s=${s.name}</Reference>
      <Reference ReferenceType="HasTypeDefinition">i=76</Reference>
    </References>
  </UAObject>`
    )
    .join('\n')
  return `<?xml version="1.0" encoding="utf-8"?>
<UANodeSet xmlns="http://opcfoundation.org/UA/2011/03/UANodeSet.xsd">
  <NamespaceUris><Uri>${TYPES_NAMESPACE}</Uri></NamespaceUris>
  <Models>
    <Model ModelUri="${TYPES_NAMESPACE}" Version="1.0.0" PublicationDate="2026-01-01T00:00:00Z">
      <RequiredModel ModelUri="${STANDARD_MODEL}" Version="1.04.0" PublicationDate="2020-01-01T00:00:00Z"/>
    </Model>
  </Models>
  <Aliases>
    <Alias Alias="HasSubtype">i=45</Alias>
    <Alias Alias="HasEncoding">i=38</Alias>
    <Alias Alias="HasTypeDefinition">i=40</Alias>
  </Aliases>
${types}
</UANodeSet>
`
}
