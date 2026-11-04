/** SDK des modules Sulfur — interface (React). */
import type {
  ButtonHTMLAttributes,
  ComponentType,
  InputHTMLAttributes,
  ReactElement,
  ReactNode,
  SelectHTMLAttributes
} from 'react'
import type { Instance, ModuleManifest, Translate } from './index.js'

/** Définition d'icône FontAwesome (`faServer` de @fortawesome/free-solid-svg-icons…). */
export interface IconDefinition {
  prefix: string
  iconName: string
  icon: readonly unknown[]
}

/** Icône : définition FontAwesome, ou composant React recevant `className` (modules antérieurs). */
export type IconSource = IconDefinition | ComponentType<{ className?: string }>

/** Partie "renderer" d'un module. */
export interface RendererModule {
  manifest: ModuleManifest
  /** Icône de la barre latérale (définition FontAwesome, `faServer`…). Avec `Component`. */
  icon?: IconSource
  /** Page du module ; facultative pour un module qui ne fait qu'apporter des onglets à d'autres. */
  Component?: ComponentType<{ onNavigate?: (id: string) => void }>
  /** Onglets apportés à d'autres modules, déclarés dans `manifest.extends` (API 1.2). */
  extensions?: ModuleExtension[]
}

/** Propriétés d'un onglet apporté : module visé et module qui l'apporte (dont il appelle les canaux). */
export interface ExtensionTabProps {
  target: string
  module: string
}

/** Onglet apporté par un module à la page d'un autre module (`target`). */
export interface ModuleExtension {
  target: string
  tab: {
    /** Identifiant unique dans la page visée. */
    id: string
    /** Libellé, ou fonction qui le retourne (appelée à l'affichage : suit la langue). */
    label: ReactNode | (() => ReactNode)
    icon?: IconSource
    Component: ComponentType<ExtensionTabProps>
  }
}

/** Onglet apporté, tel que le lit le module visé ; `Component` reçoit déjà `target` et `module`. */
export interface ExtensionEntry {
  key: string
  id: string
  label: ReactNode | (() => ReactNode)
  icon?: IconSource
  module: string
  target: string
  Component: ComponentType
}

/**
 * Onglets apportés au module `target` par les autres modules activés, à afficher après ses propres
 * onglets (InstancesPage le fait d'elle-même) ; vide si rien ne le complète.
 */
export function useExtensions(target: string): ExtensionEntry[]

/** Icône FontAwesome dimensionnée par `className` (`size-4`…) ; rien si `icon` est absent. */
export function Icon(props: { icon?: IconSource | null; className?: string; title?: string }): ReactElement | null

export function Button(
  props: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
    size?: 'sm' | 'md' | 'icon'
  }
): ReactElement

/** Section titrée, repliable (état mémorisé sous `id`) ; `fill` : occupe toute la hauteur. */
export function Card(props: {
  id?: string
  title?: ReactNode
  actions?: ReactNode
  className?: string
  collapsible?: boolean
  defaultCollapsed?: boolean
  fill?: boolean
  children?: ReactNode
}): ReactElement

export function Input(props: InputHTMLAttributes<HTMLInputElement>): ReactElement
/** Champ validé à la sortie ou sur Entrée (Échap annule). */
export function CommitInput(
  props: Omit<InputHTMLAttributes<HTMLInputElement>, 'value'> & { value: unknown; onCommit: (value: string) => void }
): ReactElement
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>): ReactElement
export function Field(props: { label: ReactNode; className?: string; children?: ReactNode }): ReactElement
export function StatusDot(props: { on: boolean; label?: ReactNode }): ReactElement
export function ErrorBanner(props: { error?: string | null; onClose?: () => void }): ReactElement | null
export function Tabs<T extends string>(props: {
  value: T
  onChange: (id: T) => void
  tabs: { id: T; label: ReactNode; icon?: IconSource; badge?: ReactNode }[]
  variant?: 'segmented' | 'bar'
  /** Variante `bar` : contenu affiché à droite de la barre (boutons d'ajout…). */
  actions?: ReactNode
}): ReactElement
/** Page à onglets : barre collée sous l'en-tête (`actions` à droite), puis le contenu. */
export function TabbedPage<T extends string>(props: {
  value: T
  onChange: (id: T) => void
  tabs: { id: T; label: ReactNode; icon?: IconSource; badge?: ReactNode }[]
  actions?: ReactNode
  className?: string
  children?: ReactNode
}): ReactElement
export function Checkbox(props: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }): ReactElement
export function Modal(props: {
  title: ReactNode
  onClose: () => void
  actions?: ReactNode
  className?: string
  children?: ReactNode
}): ReactElement

/** Valeur texte mémorisée localement sous `key` (onglet affiché…). */
export function useStoredState<T extends string>(key: string, initial: T, allowed?: T[]): [T, (value: T) => void]

/**
 * État enregistré dans la configuration du module (section `section`) et restauré au démarrage ;
 * `persist(value)` : valeur réellement enregistrée (ex. sans les secrets).
 */
export function usePersistentState<T>(
  moduleId: string,
  section: string,
  defaults: T,
  options?: { persist?: (value: T) => unknown }
): [T, (value: T | ((previous: T) => T)) => void]

export interface CertificateEntry {
  thumbprint: string
  commonName: string
  notAfter?: string
  expired?: boolean
  error?: string
  description?: string
  applicationUri?: string
  file?: string
}

/** Magasins de certificats d'un module (approuvés, refusés, certificat propre). */
export function CertificatesDialog(props: {
  title: ReactNode
  api: {
    list(): Promise<{ own: CertificateEntry[]; trusted: CertificateEntry[]; rejected: CertificateEntry[] }>
    trust(thumbprint: string): Promise<unknown>
    reject(thumbprint: string): Promise<unknown>
    remove(thumbprint: string): Promise<unknown>
    openFolder(): Promise<unknown>
  }
  onClose: () => void
  t?: Translate
}): ReactElement

// --- Instances (serveurs, clients… en nombre libre) ------------------------------------------------

/** Instances du module : liste (événement `<moduleId>:instances`) et actions. */
export function useInstances(moduleId: string): {
  instances: Instance[]
  loaded: boolean
  create(role: string, name?: string): Promise<Instance>
  rename(id: string, name: string): Promise<string>
  remove(id: string): Promise<void>
}
/** État des instances d'un rôle : `{ [id instance]: état }`. */
export function useInstanceStatuses(moduleId: string, role: string): Record<string, Record<string, unknown>>
/**
 * Page à un onglet par instance (ajout par rôle, renommage, suppression d'une instance arrêtée) ;
 * sans instance, propose d'en créer une.
 */
export function InstancesPage(props: {
  moduleId: string
  roles: { role: string; label: ReactNode; icon: IconSource }[]
  statuses?: Record<string, Record<string, unknown>>
  emptyHint?: ReactNode
  children: (instance: Instance) => ReactNode
}): ReactElement | null
