import { moduleT } from '@azerxim/sulfur-sdk'
import { virtualPath } from '@azerxim/sulfur-sdk/main'
import { manifest } from './shared'

const t = moduleT('demo')

export default {
  manifest,
  activate(ctx) {
    ctx.handle('hello', (name) => t('demo.hello', { name }))
    ctx.handle('path', (requested) => virtualPath(requested))
  }
}
