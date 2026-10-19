/** Common application strings (English). */
export default {
  app: {
    tagline: 'Modular simulator',
    groups: {
      tools: 'Tools',
      automation: 'Industrial automation',
      it: 'IT and supervision'
    },
    noModule: 'No module loaded',
    moduleError: 'This page could not be displayed.',
    resetModuleConfig: 'Restore the module default configuration',
    retry: 'Retry',
    updateAvailable: 'Update available: v{version}',
    updateReady: 'Update ready: v{version}'
  },
  ui: {
    expand: 'Expand',
    collapse: 'Collapse',
    close: 'Close',
    copy: 'Copy',
    refresh: 'Refresh',
    remove: 'Delete',
    add: 'Add',
    start: 'Start',
    starting: 'Starting…',
    stop: 'Stop',
    stopped: 'Stopped',
    connect: 'Connect',
    connecting: 'Connecting…',
    disconnect: 'Disconnect',
    connected: 'Connected',
    disconnected: 'Disconnected',
    loading: 'Loading…',
    toggle: 'Toggle',
    server: 'Server',
    client: 'Client',
    name: 'Name',
    type: 'Type',
    value: 'Value',
    initialValue: 'Initial value',
    currentValue: 'Current value',
    simulation: 'Simulation',
    periodMs: 'Period (ms)',
    min: 'Min',
    max: 'Max',
    write: 'Write',
    read: 'Read',
    status: 'Status',
    timestamp: 'Timestamp',
    liveApplied: 'Changes applied live',
    lockedWhileRunning: 'Editable when the server is stopped',
    incomplete: 'Incomplete configuration: {problems}.',
    simulationRate: 'Simulation period (ms)',
    renameRecreates: 'Renaming recreates the node (its identifier changes)',
    typeRecreates: 'Changing the type recreates the node',
    certificates: 'Certificates',
    autoAcceptServerCert: 'Automatically accept the server certificate',
    autoAcceptUnknownCerts: 'Automatically accept unknown certificates',
    security: 'Security',
    connection: 'Connection',
    monitoring: 'Monitoring ({count})',
    remove2: 'Remove'
  },
  errors: {
    invalidNumber: 'Invalid numeric value: {value}',
    invalidInteger: 'Invalid integer value: {value}',
    alreadyStarted: 'The server is already running',
    notStarted: 'The server is not running',
    notConnected: 'Client not connected',
    minPeriod: 'Minimum period: {min} ms',
    unknownStore: 'Unknown certificate store: {name}',
    certNotFound: 'Certificate not found',
    emptyPassword: 'The password is empty',
    config: {
      notJson: 'The file is not valid JSON',
      notSulfur: 'The file is not a Sulfur configuration',
      unsupportedVersion: 'Configuration format version {version} is not supported by this version of Sulfur',
      noModule: 'The file contains no configuration for the modules of this version of Sulfur',
      busy: 'Stop the servers and disconnect the clients before importing a configuration'
    }
  },
  simulations: {
    none: 'Static',
    sine: 'Sine',
    ramp: 'Ramp',
    random: 'Random',
    toggle: 'Toggle'
  },
  certs: {
    rejected: 'Rejected',
    rejectedHint: 'Unknown certificates that were received and refused. Approve them to allow the connection.',
    trusted: 'Trusted',
    trustedHint: 'Certificates of peers allowed to connect.',
    own: 'Application certificate',
    ownHint: 'Generated automatically on first start.',
    none: 'No certificate',
    expired: 'expired',
    unreadable: 'Unreadable certificate',
    approve: 'Approve',
    reject: 'Reject',
    openFolder: 'Open folder',
    thumbprint: 'thumbprint',
    validUntil: 'valid until {date}',
    confirmRemove: 'Delete certificate “{name}”?'
  },
  home: {
    name: 'Home',
    description: 'Overview of Sulfur and its modules',
    headline: 'Modular simulator of industrial and IT protocols',
    intro:
      'Sulfur simulates the servers and clients of the protocols found in automation and supervision: OPC UA, Modbus, Siemens S7, MQTT, SNMP, HTTP, NTP, Syslog… Test devices, supervision software and integrations without the real installation, and reproduce faults on demand.',
    stepsTitle: 'Getting started',
    steps: {
      start: {
        title: 'Start a module',
        text: 'Choose a protocol, start its simulated server or connect its client to a real device.'
      },
      simulate: {
        title: 'Simulate',
        text: 'Inject faults (delay, cut, error codes) and build node flows that drive the values.'
      },
      record: {
        title: 'Record',
        text: 'Follow the values of every module on charts and export them to CSV.'
      },
      save: {
        title: 'Save and share',
        text: 'Settings are saved automatically; export them to JSON to share a test setup.'
      }
    },
    groups: {
      tools: 'Work on the data points of every protocol module.',
      automation: 'Industrial protocols and PLCs.',
      it: 'Network services, messaging and supervision.'
    },
    license: 'Apache License 2.0 — © 2026 Maxime MALLET',
    repository: 'Source code and documentation'
  },
  info: {
    name: 'Information',
    description: 'IP addresses and system information of this PC',
    system: 'System',
    hostname: 'Computer name',
    os: 'Operating system',
    appVersion: 'Sulfur version',
    runtime: 'Electron / Node',
    ips: 'IP addresses of this PC',
    noIp: 'No external IPv4 address (PC offline?)',
    interfaces: 'Network interfaces',
    showInternal: 'Show internal interfaces',
    internal: 'internal'
  },
  settings: {
    name: 'Settings',
    description: 'Language, appearance, configurations and updates',
    language: 'Language',
    languageHint: 'Applies to the whole interface and to server and client messages.',
    theme: 'Theme',
    themeHint: 'By default, the theme follows the operating system setting.',
    startPage: 'Startup page',
    startPageHint: 'Page shown when Sulfur starts. Each module also remembers its last tab (server or client).',
    lastPage: 'Last page viewed',
    modules: 'Modules',
    pages: 'Application',
    themes: {
      dark: 'Dark',
      light: 'Light',
      system: 'System'
    },
    themeDescriptions: {
      dark: 'Dark interface',
      light: 'Light interface',
      system: 'Follows the operating system setting (default)'
    },
    configurations: {
      title: 'Configurations',
      hint: 'Module settings are saved automatically. Export them to a JSON file to share a test setup, or import one (servers stopped and clients disconnected).',
      export: 'Export…',
      import: 'Import…',
      exportTitle: 'Export the Sulfur configuration',
      importTitle: 'Import a Sulfur configuration',
      exported: 'Configuration exported to {path}',
      imported: 'Configuration imported from {path}',
      ignored: 'Ignored modules (not available in this version): {modules}'
    },
    updates: {
      title: 'Updates',
      hint: 'New versions are published as GitHub releases.',
      autoCheck: 'Check for updates automatically',
      autoCheckHint: 'At startup, then every 6 hours.',
      current: 'Installed version: v{version}',
      unsupported: 'Updates are only available in the installed application.',
      check: 'Check now',
      checking: 'Checking for updates…',
      upToDate: 'Sulfur is up to date (last checked {time}).',
      available: 'Version {version} is available.',
      download: 'Download and install',
      openDownload: 'Open the download page',
      macHint: 'On macOS, download the new version from its release page and replace the application.',
      releaseNotes: 'Release notes',
      downloading: 'Downloading… {progress} %',
      downloaded: 'Version {version} is ready to install.',
      downloadedHint: 'Otherwise, it will be installed when Sulfur closes.',
      install: 'Restart and install'
    }
  }
}
