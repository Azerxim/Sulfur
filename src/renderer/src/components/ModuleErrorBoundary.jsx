import { Component } from 'react'
import { RotateCcw, TriangleAlert } from 'lucide-react'
import { t } from '@azerxim/sulfur-sdk'
import { resetModuleConfig } from '../module-config'
import { Button } from '@azerxim/sulfur-sdk/ui'

/**
 * Affiche une erreur à la place d'un module dont l'interface plante (par exemple après l'import
 * d'une configuration incohérente), avec la possibilité de rétablir sa configuration par défaut.
 * `moduleId` vaut null pour une page de l'application (pas de configuration enregistrée).
 */
export default class ModuleErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error("[sulfur] erreur d'affichage", this.props.moduleId ?? '', error, info.componentStack)
  }

  reset = async () => {
    if (this.props.moduleId) await resetModuleConfig(this.props.moduleId).catch((err) => console.error(err))
    this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="m-6 flex flex-col items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
        <div className="flex items-center gap-2 font-medium">
          <TriangleAlert className="size-4" /> {t('app.moduleError')}
        </div>
        <pre className="max-w-full overflow-auto font-mono text-xs whitespace-pre-wrap text-red-300">
          {String(this.state.error?.message ?? this.state.error)}
        </pre>
        <Button size="sm" onClick={this.reset}>
          <RotateCcw className="size-3.5" /> {this.props.moduleId ? t('app.resetModuleConfig') : t('app.retry')}
        </Button>
      </div>
    )
  }
}
