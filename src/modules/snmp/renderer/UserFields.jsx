import { Input, Select } from '@renderer/components/ui'
import { AUTH_PROTOCOLS, PRIV_PROTOCOLS, SECURITY_LEVELS } from '../shared/constants'
import { t } from '../shared/i18n'

/** Champs d'un utilisateur SNMPv3 (nom, niveau, protocoles et clés), sur une ligne de grille. */
export default function UserFields({ user, disabled, onChange }) {
  const auth = user.level !== 'noAuthNoPriv'
  const priv = user.level === 'authPriv'
  return (
    <>
      <Input
        className="font-mono"
        placeholder={t('snmp.users.name')}
        title={t('snmp.users.name')}
        value={user.name}
        disabled={disabled}
        onChange={(e) => onChange({ name: e.target.value })}
      />
      <Select
        value={user.level}
        title={t('snmp.users.level')}
        disabled={disabled}
        onChange={(e) => onChange({ level: e.target.value })}
      >
        {SECURITY_LEVELS.map((level) => (
          <option key={level} value={level}>
            {t(`snmp.levels.${level}`)}
          </option>
        ))}
      </Select>
      <Select
        value={user.authProtocol}
        title={t('snmp.users.authProtocol')}
        disabled={disabled || !auth}
        onChange={(e) => onChange({ authProtocol: e.target.value })}
      >
        {AUTH_PROTOCOLS.map((p) => (
          <option key={p} value={p}>
            {p.toUpperCase()}
          </option>
        ))}
      </Select>
      <Input
        type="password"
        autoComplete="off"
        placeholder={t('snmp.users.authKey')}
        title={t('snmp.users.keyHint')}
        value={user.authKey}
        disabled={disabled || !auth}
        onChange={(e) => onChange({ authKey: e.target.value })}
      />
      <Select
        value={user.privProtocol}
        title={t('snmp.users.privProtocol')}
        disabled={disabled || !priv}
        onChange={(e) => onChange({ privProtocol: e.target.value })}
      >
        {PRIV_PROTOCOLS.map((p) => (
          <option key={p} value={p}>
            {p.toUpperCase()}
          </option>
        ))}
      </Select>
      <Input
        type="password"
        autoComplete="off"
        placeholder={t('snmp.users.privKey')}
        title={t('snmp.users.keyHint')}
        value={user.privKey}
        disabled={disabled || !priv}
        onChange={(e) => onChange({ privKey: e.target.value })}
      />
    </>
  )
}
