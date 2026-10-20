import { RefreshCw } from 'lucide-react'
import { Button, Select } from '@renderer/components/ui'
import { t } from '../shared/i18n'

/**
 * Choix explicite d'une interface (aucune par défaut). Les interfaces dont le sous-réseau n'est pas
 * privé sont listées mais ne peuvent pas être choisies.
 */
export default function InterfaceSelect({ value, interfaces, disabled, onChange, onReload }) {
  const known = interfaces.some((i) => i.name === value)
  return (
    <div className="flex gap-1">
      <Select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('dhcp.interfaces.choose')}</option>
        {value && !known && <option value={value}>{t('dhcp.interfaces.absent', { name: value })}</option>}
        {interfaces.map((i) => (
          <option key={`${i.name}-${i.address}`} value={i.name} disabled={!i.private}>
            {i.private
              ? t('dhcp.interfaces.option', { name: i.name, address: i.address, cidr: i.cidr })
              : t('dhcp.interfaces.notPrivate', { name: i.name, address: i.address, cidr: i.cidr })}
          </option>
        ))}
      </Select>
      <Button variant="ghost" title={t('ui.refresh')} disabled={disabled} onClick={onReload}>
        <RefreshCw className="size-4" />
      </Button>
    </div>
  )
}
