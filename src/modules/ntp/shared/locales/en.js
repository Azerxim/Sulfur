export default {
  ntp: {
    name: 'NTP',
    description: 'Simulated time server (shifted time, drift, stratum) and NTP client',
    server: {
      title: 'Server configuration',
      running: 'Running · {count} request(s)',
      host: 'Listening interface',
      port: 'Port (UDP)',
      portsHint: 'Standard port: 123 — administrator rights required on Linux for ports < 1024.'
    },
    clock: {
      title: 'Simulated clock',
      simulated: 'Time given to clients',
      preview: 'Time given at start',
      real: 'Real time',
      offset: 'Offset',
      frozen: 'frozen (injected fault)',
      mode: 'Mode',
      modes: {
        offset: 'Offset from real time',
        fixed: 'Fixed time'
      },
      offsetSeconds: 'Offset (s)',
      reset: 'Real time',
      resetHint: 'Reset the offset to zero',
      fixedTime: 'Start time (local time)',
      apply: 'Apply',
      applyHint: 'The clock restarts from this time',
      drift: 'Drift (ppm)',
      driftHint: 'Positive: the clock runs faster than real time; 1,000 ppm = 3.6 s per hour',
      jump: 'Time jump:',
      shift: 'Shift:',
      hint: 'A shifted time lets you test the timestamps of devices and the validity of their certificates (start and end dates). Settings apply immediately to the running server.'
    },
    settings: {
      title: 'Server announcements',
      stratum: 'Stratum',
      stratum1: '1 (primary reference)',
      stratum16: '16 (unsynchronized)',
      leap: 'Leap second',
      refId: 'Reference identifier',
      refIdHint: 'Stratum 1: 4-character source (GPS, PPS, DCF…); higher strata: IPv4 address of the upstream server',
      precision: 'Precision (log₂ s)',
      precisionHint: '−20 ≈ 1 µs, −10 ≈ 1 ms',
      hint: 'Values announced in every response. Stratum 16 or indicator 3: clients consider the server unsynchronized.'
    },
    leap: {
      0: 'none',
      1: '+1 s at the end of the day',
      2: '−1 s at the end of the day',
      3: 'clock unsynchronized'
    },
    presets: {
      '-31536000': '−1 year',
      '-86400': '−1 day',
      '-3600': '−1 h',
      '-60': '−1 min',
      60: '+1 min',
      3600: '+1 h',
      86400: '+1 day',
      31536000: '+1 year'
    },
    activity: {
      clients: 'Recent clients ({count})',
      address: 'Address',
      version: 'Version',
      requests: 'Requests',
      last: 'Last',
      noClient: 'No request received.',
      stopped: 'Server stopped.',
      log: 'Log',
      clear: 'Clear the log',
      empty: 'No event.'
    },
    client: {
      title: 'NTP client',
      host: 'Server (IP address or name)',
      useLocal: 'Local server',
      useLocalHint: 'Query the NTP server started in Sulfur',
      version: 'Version',
      timeout: 'Timeout (ms)',
      pollInterval: 'Period (s)',
      query: 'Query',
      startPolling: 'Query continuously',
      stopPolling: 'Stop',
      polling: 'Querying every {seconds} s',
      idle: 'Idle',
      result: 'Last result · {server} · {time}',
      serverTime: 'Server time',
      offset: 'Clock offset',
      delay: 'Round-trip delay',
      rootDelay: 'Root delay',
      rootDispersion: 'Root dispersion',
      reference: 'Last synchronization',
      server: 'Server',
      kiss: 'Kiss-o’-Death received: {code} (the server asks to stop or slow down queries)',
      history: 'History ({count})',
      clearHistory: 'Clear the history',
      noHistory: 'No query.'
    },
    units: {
      days: '{n} d',
      hours: '{n} h',
      minutes: '{n} min',
      seconds: '{n} s'
    },
    log: {
      started: 'Server started on {address} — simulated time {time}',
      stopped: 'Server stopped',
      clockSet: 'Clock set — simulated time {time}',
      kiss: 'Kiss-o’-Death {code} sent to {client} (injected fault)',
      socketError: 'Network error: {message}'
    },
    errors: {
      invalidPort: 'Invalid port (1 to 65535)',
      portPrivileged: 'Port {port} requires administrator rights: choose a port ≥ 1024',
      portInUse: 'Port {port} is already in use',
      invalidStratum: 'Invalid stratum (1 to 16)',
      invalidLeap: 'Invalid leap indicator (0 to 3)',
      invalidRefId: 'The stratum 1 reference identifier has at most 4 ASCII characters',
      invalidOffset: 'Invalid offset: {value}',
      invalidTime: 'Invalid time: {value}',
      invalidDrift: 'Invalid drift: {value} ppm',
      shortPacket: 'Packet too short ({size} bytes)',
      missingHost: 'Enter the server to query',
      invalidVersion: 'Unsupported NTP version (3 or 4)',
      timeout: 'No response within the timeout ({timeout} ms)',
      unexpectedMode: 'Unexpected response (mode {mode})',
      minPoll: 'Minimum polling period: 1 s',
      readOnlyPoint: 'Point {id} is read only'
    }
  }
}
