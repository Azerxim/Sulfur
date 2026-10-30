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
    updateReady: 'Update ready: v{version}',
    search: 'Search…',
    searchPlaceholder: 'Go to a module or a page…',
    noResult: 'No result for “{query}”',
    paletteKeys: {
      navigate: 'navigate',
      open: 'open',
      close: 'close'
    },
    activity: {
      sessions: 'Running · {count} session(s)',
      running: 'Running',
      client: 'Client connected',
      active: 'Active',
      stopped: 'Stopped'
    },
    statusBar: {
      active: '{count} active module(s)',
      sessions: '{count} session(s)'
    }
  },
  errors: {
    externalBusy: 'Stop the servers and clients of these modules before refreshing the external modules: {modules}',
    modulesBusy: 'Stop the servers and clients of these modules before disabling them: {modules}',
    modulePackage: 'Module package refused: {problem}',
    packageExpired: 'This package is no longer waiting to be installed: choose it again.',
    packageNotFound: 'No package installed for the module “{id}”',
    config: {
      notJson: 'The file is not valid JSON',
      notSulfur: 'The file is not a Sulfur configuration',
      unsupportedVersion: 'Configuration format version {version} is not supported by this version of Sulfur',
      noModule: 'The file contains no configuration for the modules of this version of Sulfur',
      busy: 'Stop the servers and disconnect the clients before importing a configuration'
    }
  },
  modules: {
    problems: {
      invalid: 'invalid manifest: “{field}” field missing or incorrect',
      reservedId: 'identifier “{id}” is reserved by Sulfur',
      duplicateId: 'another module already uses the identifier “{id}”',
      apiMajor: 'written for module API {required}, incompatible with the API {current} of this version of Sulfur',
      apiTooNew: 'requires module API {required}; this version of Sulfur provides {current}: update Sulfur',
      appTooOld: 'requires Sulfur {required} or later (this is {current}): update Sulfur',
      unreadable: 'package unreadable: {file} missing or invalid ({message})',
      mismatch: 'the code of the package does not match its module.json ({file})',
      loadFailed: 'the module code could not be loaded: {message}',
      activateFailed: 'the module failed to start: {message}',
      rendererFailed: 'the module interface could not be loaded: {message}',
      archive: 'invalid archive: {message}',
      missingFile: 'file “{file}” missing from the package'
    }
  },
  home: {
    name: 'Overview',
    description: 'What is running right now: servers, clients, sessions and endpoints',
    headline: 'Modular simulator of industrial and IT protocols',
    intro:
      'Sulfur simulates the servers and clients of the protocols found in automation and supervision: OPC UA, Modbus, Siemens S7, MQTT, SNMP, HTTP, NTP, Syslog… Test devices, supervision software and integrations without the real installation, and reproduce faults on demand.',
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
    stats: {
      active: 'Active modules',
      activeOf: 'of {count}',
      servers: 'Running servers',
      serversHint: '{count} client session(s)',
      clients: 'Connected clients',
      clientsHint: 'To servers or devices',
      tools: 'Active tools',
      toolsHint: 'Simulator, trends, serial terminal…'
    },
    activeTitle: 'Active modules',
    activeEmpty: 'No server or client running. Start a module: it will show up here with its endpoint.',
    columns: {
      module: 'Module',
      endpoint: 'Endpoint',
      activity: 'Activity'
    },
    open: 'Open {name}',
    statusTitle: 'Module status',
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
    description: 'Language, appearance, modules, configurations and updates',
    tabs: {
      general: 'General',
      modules: 'Modules',
      updates: 'Updates'
    },
    preferences: 'Preferences',
    language: 'Language',
    languageHint: 'Applies to the whole interface and to server and client messages.',
    theme: 'Theme',
    themeHint: 'By default, the theme follows the operating system setting.',
    startPage: 'Startup page',
    startPageHint: 'Page shown when Sulfur starts. Each module also remembers its last tab (server or client).',
    lastPage: 'Last page viewed',
    modules: 'Modules',
    moduleSwitch: {
      title: 'Enabled modules',
      hint: 'A disabled module disappears from the sidebar, is no longer loaded at startup and keeps its settings. A running module cannot be disabled: stop its servers and clients first.',
      summary: '{enabled} of {total} modules enabled',
      running: '{count} running',
      filter: 'Filter modules',
      show: 'Show',
      filters: {
        all: 'All',
        on: 'Enabled',
        off: 'Disabled'
      },
      noMatch: 'No module matches this filter.',
      disabled: 'Disabled',
      locked: 'Running: stop its servers and clients to disable it',
      enableAll: 'Enable all',
      disableAll: 'Disable all',
      additional: 'Additional',
      external: 'External',
      rejected: 'Modules not loaded ({count})',
      api: 'Module API {version}'
    },
    externalModules: {
      title: 'External modules',
      hint: 'Built with the Sulfur SDK, installed from a .sulfur-module package or copied into the packages folder; taken into account with Refresh or at the next start.',
      enable: 'Load the external modules',
      warning:
        'Packages are not signed: an external module runs with the rights of Sulfur. Only install modules you wrote yourself or from a source you trust.',
      folder: 'Packages folder:',
      open: 'Open',
      reload: 'Refresh',
      reloadHint:
        'Read the packages again (added, updated or removed) without restarting Sulfur; the interface is reloaded',
      reloadNeeded: 'Refresh the external modules to apply this choice.',
      install: 'Install a package…',
      installTitle: 'Install a module package',
      packageFiles: 'Sulfur module package',
      installed: 'Installed packages',
      none: 'No package installed.',
      notLoaded: 'Not loaded',
      loadedBadge: 'Loaded',
      unknownAuthor: 'author not specified',
      by: 'by {author}',
      remove: 'Remove',
      confirmRemove: 'Remove {name}',
      cancel: 'Cancel',
      installedOk: '{name} {version} installed. Check Load the external modules, then Refresh, to use it.',
      removedOk: '{name} removed.',
      confirm: {
        title: 'Install {name}?',
        id: 'Identifier',
        version: 'Version',
        author: 'Author',
        content: 'Content',
        files: '{count} file(s), {size}',
        current: 'Installed version',
        warning:
          'This package is not signed and Sulfur cannot check where it comes from. Once loaded, its code runs with the rights of Sulfur (files, network). Install it only if you wrote it yourself or trust its author.',
        install: 'Install',
        update: 'Update to {version}',
        replace: 'Replace version {version}'
      }
    },
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
      exportedKept: 'The file also contains the kept configurations of modules that are not installed: {modules}',
      kept: 'Configurations kept for modules that are not installed, applied once they are installed and loaded: {modules}',
      ignored: 'Ignored sections (invalid or reserved identifier, incorrect content): {modules}'
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
      upToDate: 'Sulfur is up to date',
      checkedAt: 'Version {version} · last checked {time}',
      errorTitle: 'Checking for updates failed',
      source: 'Source',
      openReleases: 'GitHub releases',
      available: 'Version {version} is available.',
      download: 'Download and install',
      openDownload: 'Open the download page',
      macHint: 'On macOS, download the new version from its release page and replace the application.',
      releaseNotes: 'Release notes',
      downloadingTitle: 'Downloading version {version}…',
      downloadingHint: 'You can keep using Sulfur during the download.',
      downloaded: 'Version {version} is ready to install.',
      downloadedHint: 'Otherwise, it will be installed when Sulfur closes.',
      install: 'Restart and install',
      notes: {
        title: 'Release notes',
        versions: 'Versions',
        refresh: 'Refresh',
        loading: 'Loading the GitHub releases…',
        empty: 'No published release.',
        installed: 'Installed',
        newer: 'New',
        github: 'Open the release on GitHub',
        unreachable: 'The GitHub releases could not be read: {message}',
        rateLimited: 'GitHub temporarily limits the requests: try again later.'
      }
    }
  }
}
