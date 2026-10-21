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
  errors: {
    externalBusy: 'Stop the servers and clients of these modules before refreshing the external modules: {modules}',
    modulesBusy: 'Stop the servers and clients of these modules before disabling them: {modules}',
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
      rendererFailed: 'the module interface could not be loaded: {message}'
    }
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
    description: 'Language, appearance, modules, configurations and updates',
    tabs: {
      general: 'General',
      modules: 'Modules',
      updates: 'Updates'
    },
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
      hint: 'A disabled module is hidden from the sidebar and the home page, stopped, and no longer loaded at startup. Its settings are kept. Stop its servers and clients before disabling it.',
      summary: '{enabled} of {total} modules enabled',
      enableAll: 'Enable all',
      disableAll: 'Disable all',
      premium: 'Premium',
      external: 'External',
      rejected: 'Modules not loaded ({count})',
      api: 'Module API {version}'
    },
    externalModules: {
      title: 'External modules',
      hint: 'Modules developed outside Sulfur with its SDK, installed as packages (one folder per module) in the packages folder. Taken into account at the next start of Sulfur, or right away with Refresh.',
      enable: 'Load the external modules',
      warning:
        'Packages are not signed yet: an external module runs with the rights of Sulfur. Only install modules from a source you trust.',
      folder: 'Packages folder:',
      open: 'Open',
      loaded: '{count} external module(s) loaded',
      reload: 'Refresh',
      reloadHint:
        'Read the packages again (added, updated or removed) without restarting Sulfur; the interface is reloaded',
      reloadNeeded: 'Refresh the external modules to apply this choice.'
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
      install: 'Restart and install',
      notes: {
        title: 'Release notes',
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
