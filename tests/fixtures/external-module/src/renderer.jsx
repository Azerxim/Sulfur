import { useState } from 'react'
import { Puzzle } from 'lucide-react'
import { moduleT } from '@azerxim/sulfur-sdk'
import { Button, Card } from '@azerxim/sulfur-sdk/ui'
import { manifest } from './shared'
import './style.css'

const t = moduleT('demo')

function DemoView() {
  const [count, setCount] = useState(0)
  return (
    <Card title={t('demo.hello', { name: 'Sulfur' })}>
      <p className="bg-ink-850 text-sulfur-300">{t('demo.count', { count })}</p>
      <Button onClick={() => setCount(count + 1)}>+1</Button>
    </Card>
  )
}

export default { manifest, icon: Puzzle, Component: DemoView }
