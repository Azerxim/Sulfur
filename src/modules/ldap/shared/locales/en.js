export default {
  ldap: {
    name: 'LDAP / RADIUS',
    description: 'Simulated LDAP / LDAPS directory and RADIUS server (centralized authentication) and clients',
    tabs: {
      server: 'LDAP server',
      client: 'LDAP client',
      radiusServer: 'RADIUS server',
      radiusClient: 'RADIUS client'
    },
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
  },
  radius: {
    methods: {
      pap: 'PAP',
      chap: 'CHAP'
    },
    server: {
      authPort: 'Authentication port',
      acctPort: 'Accounting port',
      accounting: 'Accounting',
      requireMessageAuthenticator: 'Require Message-Authenticator',
      running: 'Running · {count} request(s)',
      hint: 'RADIUS over UDP (RFC 2865, 2866): PAP and CHAP authentication, accounting, Status-Server. Every reply carries a Message-Authenticator; requiring it in the requests protects against Blast-RADIUS. Standard ports 1812 / 1813 do not require administrator rights.',
      authentication: 'authentication',
      accountingLabel: 'accounting',
      counters:
        '{requests} request(s) · {accepts} accepted · {rejects} rejected · {dropped} dropped · {accounting} accounting',
      directoryUsers: 'directory accounts'
    },
    clients: {
      title: 'Clients (NAS) ({count})',
      name: 'Name',
      address: 'Address or network (CIDR)',
      secret: 'Shared secret',
      hint: 'Only the devices declared here get an answer, with their shared secret. 0.0.0.0/0 accepts any IPv4 address.'
    },
    users: {
      title: 'Local accounts ({count})',
      username: 'User name',
      password: 'Password',
      attributes: 'Reply attributes',
      hint: 'Passwords are kept in clear text: CHAP needs them. Reply attributes: one “Name = value” per line, e.g. Service-Type = Administrative-User, Session-Timeout = 3600, Filter-Id = admins, Cisco-AVPair = shell:priv-lvl=15, Vendor-Specific = 9:1:text.'
    },
    directory: {
      title: 'LDAP directory accounts',
      enabled: 'Authenticate the directory accounts',
      attribute: 'User name attribute',
      attributes: 'Reply attributes',
      hint: 'Accounts of the LDAP Server tab (running directory, or the saved one), found by this attribute and checked against userPassword. A local account with the same name comes first. CHAP only works with a clear-text userPassword.'
    },
    sessions: {
      title: 'Accounting sessions ({count})',
      user: 'User',
      id: 'Session',
      client: 'Client',
      since: 'Started'
    },
    client: {
      title: 'Access request',
      host: 'Server (IP address or name)',
      retries: 'Retries',
      nasIdentifier: 'NAS-Identifier',
      nasIpAddress: 'NAS-IP-Address',
      notSent: 'not sent',
      messageAuthenticator: 'Message-Authenticator',
      method: 'Method',
      statusServerHint: 'Check that the server answers (RFC 5997)',
      attributes: 'Additional attributes',
      attributesHint:
        'One “Name = value” per line, added to the requests (e.g. Calling-Station-Id = 00-11-22-33-44-55).',
      accountingTitle: 'Accounting',
      sessionId: 'Acct-Session-Id',
      sessionIdPlaceholder: 'generated at Start',
      sessionOpen: 'Session {id} open since {time}',
      noSession: 'No open session',
      acct: {
        start: 'Start',
        interim: 'Interim-Update',
        stop: 'Stop'
      },
      timing: '{destination} · {duration} ms · {attempts} attempt(s)',
      sessionTime: 'session time {seconds} s',
      noAttribute: 'No attribute in the response.'
    },
    log: {
      started: 'Server started on {endpoints}',
      stopped: 'Server stopped',
      updated: 'Configuration updated — {clients} client(s), {users} local account(s)',
      tooShort: 'packet too short',
      badLength: 'invalid length {length}',
      badAttribute: 'invalid attribute at offset {offset}',
      unknownClient: 'Request from an undeclared client: ignored',
      malformed: 'Malformed packet ignored: {message}',
      badMessageAuthenticator: 'Invalid Message-Authenticator ({client}): wrong shared secret? Ignored',
      missingMessageAuthenticator: 'Access-Request without Message-Authenticator ({client}): ignored',
      statusServer: 'Status-Server from {client}',
      unexpectedCode: 'Unexpected packet {code}: ignored',
      reject: 'Access-Reject {user} {method}: {reason}',
      accept: 'Access-Accept {user} ({method}, {source}) → {attributes}',
      forced: 'forced response (injected fault)',
      noUserName: 'no User-Name',
      badPassword: 'unreadable User-Password',
      eapUnsupported: 'EAP is not supported',
      noPassword: 'no User-Password or CHAP-Password',
      unknownUser: 'unknown user',
      chapNeedsCleartext: 'CHAP needs a clear-text password',
      wrongPassword: 'wrong password',
      sourceLocal: 'local account',
      badAccountingAuthenticator: 'Invalid Accounting-Request authenticator ({client}): wrong shared secret? Ignored',
      accounting: 'Accounting {type} · {user} · session {session} · {time}'
    },
    errors: {
      unknownAttribute: 'unknown attribute {name}',
      reservedAttribute: '{name} cannot be entered',
      invalidValue: 'invalid value for {name}: {value}',
      attributeSyntax: '“Name = value” expected',
      attributeLine: 'Line {line}: {message}',
      attributeTooLong: 'Attribute {name} too long (253 bytes at most)',
      packetTooLarge: 'Packet too large (4096 bytes at most)',
      passwordTooLong: 'Password too long (128 bytes at most)',
      invalidPort: 'Invalid port (1 to 65535)',
      samePort: 'Authentication and accounting cannot share the same port',
      invalidClient: 'Invalid client address: {address}',
      missingSecret: 'Shared secret missing for client {name}',
      noClient: 'Declare at least one client (NAS)',
      userAttributes: 'Reply attributes of {name}: {message}',
      portPrivileged: 'Port {port} requires administrator rights: choose a port ≥ 1024',
      portInUse: 'Port {port} is already in use',
      missingHost: 'Enter the server',
      missingClientSecret: 'Enter the shared secret',
      invalidMethod: 'Unknown authentication method',
      invalidRetries: 'Invalid number of retries (0 to 10)',
      timeout: 'No response from {destination} after {attempts} attempt(s)',
      refused: 'Port unreachable: no RADIUS server at this address',
      badResponseAuthenticator: 'Invalid response authenticator: wrong shared secret?',
      badResponseMessageAuthenticator: 'Invalid Message-Authenticator in the response: wrong shared secret?',
      missingUser: 'Enter the user name',
      invalidAccounting: 'Unknown accounting request'
    }
  }
}
