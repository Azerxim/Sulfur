export default {
  coap: {
    name: 'CoAP / LwM2M',
    description: 'CoAP server and client (observe, discovery), LwM2M server and simulated LwM2M device',
    tabs: {
      server: 'CoAP server',
      client: 'CoAP client',
      lwm2mServer: 'LwM2M server',
      device: 'LwM2M device'
    },
    address: 'Listen address',
    host: 'Host',
    port: 'Port (UDP)',
    since: 'Since',
    log: {
      title: 'Log ({count})',
      clear: 'Clear the log',
      empty: 'No exchange.'
    },
    server: {
      title: 'Simulated CoAP server',
      hint: 'Resources read with GET, changed with PUT when allowed, observed (RFC 7641) and announced by /.well-known/core. CoAP over UDP, without DTLS.',
      running: 'Running · {requests} request(s) · {observers} observer(s)',
      resources: 'Simulated resources ({count})',
      path: 'Path',
      resourceTitle: 'Title',
      format: 'Format',
      observable: 'Observable',
      writable: 'Writable',
      interval: 'Notif. (ms)',
      intervalHint: 'Observer notifications at most every N ms (0: on every change)',
      observers: 'Observers ({count})',
      observer: 'Client',
      notifications: 'Notifications',
      noObserver: 'No client observes a resource.',
      observe: {
        register: 'observe',
        cancel: 'observe cancelled'
      },
      faults: {
        noResponse: 'no response (fault)',
        exception: 'forced code (fault)'
      },
      log: {
        started: 'Server started on {endpoint}',
        stopped: 'Server stopped',
        observerGone: {
          reset: '{remote} no longer observes {path} (RST)',
          timeout: '{remote} does not answer: observation of {path} stopped'
        }
      }
    },
    client: {
      title: 'CoAP request',
      method: 'Method',
      query: 'Parameters (Uri-Query)',
      accept: 'Requested format (Accept)',
      noAccept: 'None',
      format: 'Content format',
      timeout: 'Timeout (s)',
      confirmable: 'Confirmable (CON)',
      useServer: 'Sulfur server (port {port})',
      payload: 'Payload',
      send: 'Send',
      observe: 'Observe',
      observeHint: 'GET with the Observe option: the following notifications are added to the history',
      discover: 'Discover',
      discoverHint: 'Resources announced by /.well-known/core',
      links: 'Discovered resources ({count})',
      useLink: 'Use this path',
      observableLink: 'observable',
      noLink: 'No resource announced.',
      observations: 'Observations ({count})',
      notifications: '{count} notification(s) since {since}',
      cancel: 'Stop',
      history: 'Exchanges ({count})',
      notification: 'NOTIFICATION',
      notObservable: 'resource not observable: single response',
      empty: 'No exchange. Send a request, observe or discover the resources of a server.',
      errors: {
        timeout: 'No response from {uri} within {timeout} s',
        reset: '{uri} rejected the message (RST)'
      }
    },
    lwm2m: {
      title: 'LwM2M server',
      hint: 'Devices register (POST /rd), update their registration before it expires and deregister. Operations on a registered device: read, write, execute, discover, observe.',
      running: 'Running · {count} registered device(s)',
      devices: 'Registered devices ({count})',
      registration: 'LwM2M {version} · binding {binding} · lifetime {lifetime} s · updated at {time}',
      operations: 'Operations',
      noDevice:
        'No registered device. Point an LwM2M device to this server (port {port}), for instance the simulated device of the next tab.',
      valuesCount: '{count} value(s)',
      path: 'Path (object / instance / resource)',
      invalidPath: 'Invalid path: /object[/instance[/resource]]',
      format: 'Read format',
      value: 'Value or arguments',
      ops: {
        read: 'Read',
        discover: 'Discover',
        observe: 'Observe',
        write: 'Write',
        execute: 'Execute',
        notify: 'Notification'
      },
      log: {
        started: 'LwM2M server started on {endpoint}',
        stopped: 'LwM2M server stopped',
        registered: '{endpoint} registered from {remote} (lifetime {lifetime} s)',
        updated: '{endpoint}: registration updated',
        deregistered: '{endpoint} deregistered',
        expired: '{endpoint}: registration expired (no update)'
      },
      errors: {
        unknownDevice: 'Unknown device or no longer registered',
        invalidPath: 'Invalid LwM2M path: {path}',
        writeResource: 'A write applies to a resource: /object/instance/resource',
        executeResource: 'An execute applies to a resource: /object/instance/resource',
        invalidValue: 'Invalid value for this resource: {value}',
        timeout: '{endpoint} does not answer',
        reset: '{endpoint} rejected the request (RST)'
      }
    },
    device: {
      title: 'Simulated LwM2M device',
      hint: 'Device (3), Temperature (3303) and Light Control (3311) objects, instance 0: read as text, TLV or SenML JSON, write, execute (reboot, min / max reset), observe. Registration updated before it expires; new attempt every 30 s after a failure.',
      endpoint: 'Device name (endpoint)',
      serverHost: 'LwM2M server',
      serverPort: 'Server port',
      lifetime: 'Lifetime (s)',
      useServer: 'Sulfur server (port {port})',
      manufacturer: 'Manufacturer',
      model: 'Model',
      serial: 'Serial number',
      objects: {
        temperature: 'Temperature (3303)',
        light: 'Light Control (3311)'
      },
      temperature: {
        min: 'Min temperature',
        max: 'Max temperature',
        period: 'Period (ms)'
      },
      update: 'Update',
      updateHint: 'Immediate registration update (POST to its location)',
      states: {
        stopped: 'Stopped',
        registering: 'Registering with {server}…',
        registered: 'Registered with {server}',
        error: 'Not registered'
      },
      resources: 'Resources ({count})',
      observed: 'observed',
      log: {
        started: 'Device {endpoint} started',
        registered: 'Registered with {server} ({location})',
        updated: 'Registration updated',
        deregistered: 'Deregistered',
        failed: 'Registration impossible: {message}; new attempt in {delay} s',
        observed: 'The server observes {path} ({label})',
        observerGone: 'The server no longer observes {path}',
        written: '{label} = {value} (written by the server)',
        executed: 'Execute: {label}'
      },
      errors: {
        invalidEndpoint: 'Invalid device name (no space, &, ? or /)',
        invalidLifetime: 'Invalid lifetime (10 to 86400 s)',
        running: 'The device is already started',
        refused: 'The server refused the registration ({code})',
        noServer: 'No response from {server}',
        unknownResource: 'Unknown resource: {path}'
      }
    },
    errors: {
      invalidBoolean: 'Invalid boolean value: {value}',
      invalidPath: 'Invalid path: {path}',
      reservedPath: 'The /.well-known path is reserved for discovery',
      duplicatePath: 'Duplicate path: {path}',
      invalidType: 'Invalid type',
      invalidFormat: 'Invalid format',
      invalidSimulation: 'Invalid simulation',
      invalidInterval: 'Invalid notification interval',
      invalidJson: 'Invalid JSON payload',
      serverRunning: 'The server is already started',
      serverStopped: 'Start the server to change a value',
      invalidPort: 'Invalid port (1 to 65535)',
      portInUse: 'UDP port {port} is already in use',
      portPrivileged: 'Port {port} requires administrator rights: choose a port above 1023',
      addressUnavailable: 'This address does not exist on this PC',
      missingHost: 'Enter the host',
      invalidMethod: 'Invalid method',
      invalidTimeout: 'Invalid timeout (1 to 300 s)',
      invalidHex: 'Invalid hexadecimal payload',
      readOnlyPoint: 'Point {id} is read-only'
    }
  }
}
