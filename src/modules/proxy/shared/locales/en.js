export default {
  proxy: {
    name: 'TCP / UDP proxy',
    description: 'TCP / UDP relay between a real client and device: hexadecimal log and faults on the traffic',
    protocols: {
      tcp: 'TCP',
      udp: 'UDP'
    },
    directions: {
      both: 'Both directions',
      up: 'Client → device',
      down: 'Device → client'
    },
    rules: {
      title: 'Redirections ({count})',
      hint: 'The client connects to the local port of the proxy instead of the device; the proxy relays all the traffic, both ways, and can disturb it. Addresses can be changed while a redirection is stopped, faults at any time.',
      running: '{count} started',
      startAll: 'Start all',
      stopAll: 'Stop all',
      listen: 'Listen',
      target: 'Device',
      listenHost: 'Local address',
      listenPort: 'Local port',
      targetHost: 'Device host',
      targetPort: 'Device port',
      protocol: 'Protocol',
      empty: 'No redirection. Add one to relay the traffic to a device.',
      traffic: '↑ {up} · ↓ {down}',
      trafficHint: 'Bytes relayed: client → device (↑) and device → client (↓)',
      connections: '{count} connection(s)',
      sessions: '{count} session(s)',
      faults: 'Faults',
      activeFaults: '{count} active fault(s)'
    },
    faults: {
      title: 'Faults on the traffic',
      latency: 'Latency (ms)',
      jitter: 'Jitter (ms)',
      jitterHint: 'Random delay added between 0 and this value; the order of the sends is kept.',
      loss: 'Loss (%)',
      lossTcp: 'UDP only: over TCP, a loss would make the stream inconsistent.',
      corrupt: 'Corruption (%)',
      corruptHint: 'Share of the sends where one bit of a random byte is flipped.',
      direction: 'Direction',
      block: 'Block the traffic',
      blockHint: 'Data is ignored; in both directions, new connections are refused too.',
      cut: 'Cut the connections',
      cutHint: 'Closes all the current connections right away (UDP sessions included).',
      reset: 'No fault',
      simulator: 'Simulator faults active on all redirections: {types}',
      simulatorTypes: {
        delay: 'delay',
        noResponse: 'no response',
        cut: 'cut'
      }
    },
    connections: {
      title: 'Connections ({count})',
      none: 'No current connection.',
      client: 'Client',
      since: 'Since',
      traffic: 'Traffic'
    },
    log: {
      title: 'Log ({count})',
      empty: 'No exchange. Relayed data, connections and errors are shown here.',
      allRules: 'All redirections',
      capture: 'Record the data',
      captureHint: 'Unchecked: only connections, cuts and errors are recorded (heavy traffic).',
      timestamps: 'Time',
      pause: 'Freeze the display',
      resume: 'Resume the display',
      paused: 'Display frozen',
      export: 'Export the log',
      exportTitle: 'Export the proxy log',
      exportFilter: 'Log',
      exported: 'Log exported to {file}',
      clear: 'Clear the log',
      truncated: 'Last {shown} entries shown out of {count}',
      views: {
        both: 'Hexadecimal and text',
        hex: 'Hexadecimal',
        text: 'Text'
      },
      dirs: {
        up: 'Client → device',
        down: 'Device → client'
      },
      faults: {
        blocked: 'blocked',
        lost: 'lost',
        corrupted: 'corrupted'
      },
      delay: '+{ms} ms',
      partial: '{shown} of {size} bytes kept',
      started: 'Redirection started: {endpoint} → {target}',
      stopped: 'Redirection stopped ({endpoint})',
      error: 'Error: {message}',
      refused: 'Connection from {remote} refused (traffic blocked)',
      connected: 'Connection from {remote}, relayed to {target}',
      closed: 'Connection from {remote} closed by {by} (↑ {up} B, ↓ {down} B)',
      by: {
        client: 'the client',
        target: 'the device',
        idle: 'inactivity',
        cut: 'a cut',
        stop: 'the stop'
      },
      targetRefused: 'Connection from {remote}: {target} refuses the connection',
      targetError: 'Device {target}: {message}',
      udpSession: 'UDP session from {remote}, relayed to {target}',
      cut: 'Connections cut ({count})',
      simulatorCut: 'Connections cut by the simulator'
    },
    errors: {
      invalidProtocol: 'Invalid protocol (TCP or UDP)',
      invalidListenPort: 'Invalid local port (1 to 65535)',
      invalidTargetPort: 'Invalid device port (1 to 65535)',
      missingTarget: 'Enter the device host',
      loop: 'The redirection points to its own local port',
      invalidDelay: 'Latency and jitter: 0 to {max} ms',
      invalidPercent: 'Loss and corruption: 0 to 100 %',
      invalidDirection: 'Invalid direction',
      alreadyRunning: 'The redirection “{name}” is already started',
      stopToChange: 'Stop the redirection to change its addresses',
      portInUse: 'Port {port} is already in use on {host}',
      portPrivileged: 'Port {port} requires administrator rights: choose a port above 1023',
      addressUnavailable: 'Address {host} does not exist on this PC',
      readOnlyPoint: 'Point {id} is read-only'
    }
  }
}
