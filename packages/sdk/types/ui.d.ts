/** SDK des modules Sulfur — interface (React). */
import type {
  ButtonHTMLAttributes,
  ComponentType,
  InputHTMLAttributes,
  ReactElement,
  ReactNode,
  SelectHTMLAttributes
} from 'react'
import type { ModuleManifest, Translate } from './index.js'

/** Partie "renderer" d'un module. */
export interface RendererModule {
  manifest: ModuleManifest
  /** Icône (lucide-react ou composant SVG équivalent). */
  icon: ComponentType<{ className?: string }>
  Component: ComponentType<{ onNavigate?: (id: string) => void }>
}

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
  tabs: { id: T; label: ReactNode; icon?: ComponentType<{ className?: string }>; badge?: ReactNode }[]
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
