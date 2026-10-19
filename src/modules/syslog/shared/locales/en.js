export default {
  syslog: {
    name: 'Syslog',
    description: 'Syslog server (UDP / TCP / TLS, RFC 5424 and 3164) and message sender',
    transports: {
      udp: 'UDP',
      tcp: 'TCP',
      tls: 'TLS'
    },
    formats: {
      rfc5424: 'RFC 5424',
      rfc3164: 'RFC 3164 (BSD)',
      unknown: 'Free text'
    },
    framings: {
      octet: 'Length prefix (octet counting)',
      lf: 'End of line (LF)'
    },
    severities: {
      emerg: 'Emergency',
      alert: 'Alert',
      crit: 'Critical',
      err: 'Error',
      warning: 'Warning',
      notice: 'Notice',
      info: 'Informational',
      debug: 'Debug'
    },
    server: {
      title: 'Server configuration',
      running: 'Running · {count} message(s)',
      host: 'Listening interface',
      port: 'Port',
      portsHint:
        'Standard ports: 514 (UDP / TCP) and 6514 (TLS) — administrator rights required on Linux for ports < 1024.',
      certificate: 'certificate {name}',
      connections: '{count} TCP / TLS connection(s)',
      cut: 'connections cut (injected fault)'
    },
    messages: {
      title: 'Messages ({count})',
      clear: 'Clear the messages',
      minSeverity: 'Minimum severity',
      allSeverities: 'All',
      search: 'Search (text, host, application)',
      pause: 'Pause the display',
      resume: 'Resume the display',
      paused: 'Display paused',
      received: 'Received',
      source: 'Source',
      facility: 'Facility',
      severity: 'Severity',
      host: 'Host',
      app: 'Application',
      message: 'Message',
      none: 'No message received.',
      noMatch: 'No message matches the filter.',
      stopped: 'Server stopped.',
      details: 'Details',
      timestamp: 'Message timestamp',
      format: 'Format',
      procId: 'Process',
      msgId: 'Message ID',
      structuredData: 'Structured data',
      raw: 'Raw message',
      shown: '{shown} of {count} shown'
    },
    stats: {
      title: 'Messages by severity',
      total: 'Total'
    },
    client: {
      title: 'Destination',
      host: 'Server (IP address or name)',
      useLocal: 'Local server',
      useLocalHint: 'Send to the Syslog server started in Sulfur',
      port: 'Port',
      transport: 'Transport',
      framing: 'Framing',
      rejectUnauthorized: 'Verify the server certificate',
      connected: 'Connected to {destination}',
      idle: 'Idle',
      repeating: 'Sending every {seconds} s',
      disconnect: 'Close the connection'
    },
    compose: {
      title: 'Message',
      format: 'Format',
      facility: 'Facility',
      severity: 'Severity',
      hostname: 'Host name',
      hostnameHint: 'Empty: name of this PC ({name})',
      appName: 'Application (APP-NAME / tag)',
      procId: 'Process (PROCID)',
      msgId: 'Message ID (MSGID)',
      structuredData: 'Structured data',
      structuredDataHint: 'RFC 5424 only, e.g. [origin ip="192.0.2.1"][meta sequenceId="1"]',
      message: 'Text',
      messageHint: '{n}: message number, {time}: time of sending',
      count: 'Messages per send',
      interval: 'Period (s)',
      preview: 'Preview',
      send: 'Send',
      startRepeat: 'Send continuously',
      stopRepeat: 'Stop'
    },
    history: {
      title: 'Sent ({count})',
      clear: 'Clear the history',
      empty: 'No message sent.',
      destination: 'Destination',
      count: 'Messages',
      message: 'Last message'
    },
    errors: {
      invalidPort: 'Invalid port (1 to 65535)',
      portPrivileged: 'Port {port} requires administrator rights: choose a port ≥ 1024',
      portInUse: 'Port {port} is already in use',
      noTransport: 'Enable at least one transport (UDP, TCP or TLS)',
      samePort: 'TCP and TLS cannot share port {port}',
      missingHost: 'Enter the server to send to',
      invalidTransport: 'Unknown transport',
      invalidFormat: 'Unknown message format',
      invalidFacility: 'Invalid facility (0 to 23)',
      invalidSeverity: 'Invalid severity (0 to 7)',
      invalidCount: 'Invalid number of messages (1 to {max})',
      minInterval: 'Minimum period: 0.1 s',
      connectTimeout: 'Connection timeout',
      refused: 'Connection refused by {destination}',
      readOnlyPoint: 'Point {id} is read only'
    }
  }
}
