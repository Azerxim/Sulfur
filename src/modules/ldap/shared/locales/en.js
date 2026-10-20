export default {
  ldap: {
    name: 'LDAP',
    description: 'Simulated LDAP / LDAPS directory (authentication, search) and client',
    security: {
      plain: 'LDAP (unencrypted)',
      ldaps: 'LDAPS (TLS)'
    },
    scopes: {
      base: 'Base entry',
      one: 'One level',
      sub: 'Subtree'
    },
    ldif: {
      syntax: '“attribute: value” expected',
      base64: 'invalid base64 value',
      dn: 'invalid DN',
      noDn: 'attribute before the first “dn:” line',
      duplicate: 'entry defined twice'
    },
    server: {
      title: 'Server configuration',
      running: 'Running · {count} connection(s)',
      host: 'Listening interface',
      port: 'Port',
      securityLabel: 'Security',
      sizeLimit: 'Maximum entries per search',
      startTls: 'Allow StartTLS',
      allowAnonymous: 'Anonymous bind and search',
      hint: 'Read-only directory: simple bind (DN and password), search, compare, StartTLS and “Who am I”. Writes are refused (unwillingToPerform). Standard ports 389 / 636 require administrator rights on Linux.',
      counters:
        '{entries} entries · {connections} connection(s) · {binds} bind(s), {bindFailures} failed · {searches} search(es)',
      certificate: 'certificate {name} · thumbprint {thumbprint}…',
      directory: 'Directory ({count} entries)',
      resetLdif: 'Example directory',
      confirmReset: 'Replace the directory with the example directory?',
      ldifHint:
        'LDIF: entries separated by a blank line. userPassword in clear text or hashed ({SSHA}, {SHA}, {SSHA256}, {SSHA512}); memberOf is deduced from the groups (member, uniqueMember). Passwords are never returned by a search.',
      accounts: 'Accounts that can bind ({count})',
      accountsHint: 'Entries with a userPassword: their DN and password authenticate a client.',
      log: 'Log ({count})',
      clearLog: 'Clear',
      noLog: 'No event yet.'
    },
    client: {
      url: 'Server URL',
      bindDn: 'Bind DN',
      anonymous: 'anonymous',
      password: 'Password',
      authenticate: 'Authenticate',
      startTls: 'StartTLS',
      rejectUnauthorized: 'Reject an unknown server certificate',
      timeout: 'Timeout (ms)',
      search: 'Search',
      base: 'Search base',
      scope: 'Scope',
      filter: 'Filter',
      attributes: 'Attributes (all if empty)',
      sizeLimit: 'Limit',
      searchButton: 'Search',
      result: 'Result',
      bindOk: 'Bind succeeded as {dn} · identity {identity} · {duration} ms',
      searchSummary: '{count} entry(ies) · {duration} ms',
      noEntry: 'No entry matches the search.',
      history: 'History ({count})',
      noHistory: 'No operation yet.',
      kinds: {
        bind: 'bind',
        search: 'search'
      }
    },
    log: {
      started: 'Server started on {endpoint} — {count} entries',
      stopped: 'Server stopped',
      updated: 'Directory updated — {count} entries',
      tlsFailure: 'TLS handshake failed: {message}',
      protocolError: 'Protocol error, connection closed: {message}',
      writeRefused: '{op} on {dn} refused: read-only directory',
      readOnly: 'read-only directory',
      unsupported: 'Unsupported operation (0x{tag}), connection closed',
      saslUnsupported: 'SASL binds are not supported',
      anonymousRefused: 'Anonymous bind refused',
      anonymousDisabled: 'anonymous bind disabled',
      anonymousBind: 'Anonymous bind',
      bindFailed: 'Bind failed for {dn}: {reason}',
      emptyPassword: 'empty password',
      badDn: 'invalid DN',
      noEntry: 'unknown entry',
      noPassword: 'entry without userPassword',
      wrongPassword: 'wrong password',
      bindOk: 'Bind succeeded: {dn}',
      searchRefused: 'Search in {base} refused: bind required',
      bindRequired: 'bind required',
      search: 'Search {base} ({scope}) {filter} → {count} entry(ies)',
      alreadyTls: 'connection already encrypted',
      startTlsDisabled: 'StartTLS disabled',
      startTls: 'Connection upgraded to TLS ({protocol})',
      unknownExtended: 'unsupported extended operation {name}'
    },
    errors: {
      ldif: 'LDIF line {line}: {problem}',
      invalidPort: 'Invalid port (1 to 65535)',
      invalidSizeLimit: 'Invalid size limit',
      portPrivileged: 'Port {port} requires administrator rights: choose a port ≥ 1024',
      portInUse: 'Port {port} is already in use',
      invalidUrl: 'URL ldap://host:port or ldaps://host:port expected',
      invalidScope: 'Invalid scope',
      startTlsOnLdaps: 'StartTLS is not used with ldaps://',
      result: 'LDAP error {code}: {message}',
      connectionRefused: 'Connection refused by the server',
      readOnlyPoint: 'Point {id} is read-only'
    }
  }
}
