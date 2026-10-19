export default {
  mqtt: {
    name: 'MQTT',
    description: 'Simulated MQTT broker (simulated topics, authentication, TLS) and MQTT client',
    dataTypes: {
      Number: 'Number',
      Integer: 'Integer',
      Boolean: 'Boolean',
      String: 'Text'
    },
    formats: {
      plain: 'Value',
      json: 'JSON'
    },
    versions: {
      3: 'MQTT 3.1',
      4: 'MQTT 3.1.1',
      5: 'MQTT 5.0'
    },
    server: {
      title: 'Broker configuration',
      running: 'Running · {clients} client(s) · {count} message(s)',
      host: 'Listening interface',
      port: 'Port',
      tls: 'TLS (mqtts)',
      portsHint: 'Standard ports: 1883 (MQTT) and 8883 (TLS). MQTT 3.1 and 3.1.1 clients.',
      certificate: 'certificate {name}',
      cut: 'connections cut (injected fault)'
    },
    auth: {
      title: 'Authentication ({count} user(s))',
      anonymous: 'Accept connections without a user name',
      anonymousHint:
        'Unchecked: only the users below can connect (CONNACK code 5 otherwise, code 4 for a wrong password).',
      username: 'User',
      password: 'Password',
      passwordSet: 'Password set (type to change)',
      noUser: 'No user.'
    },
    topics: {
      title: 'Simulated topics ({count})',
      topic: 'Topic',
      interval: 'Publication (ms)',
      intervalHint: '0: published at each value change',
      qos: 'QoS',
      retain: 'Retain',
      retainHint: 'Retained message: sent to new subscribers',
      format: 'Content',
      writable: 'Settable',
      writableHint: 'A client can change the value by publishing it on <topic>/set',
      hint: 'Topics are published by the broker itself. Settable topics accept a new value published on <topic>/set (value alone, or JSON {"value": …}).',
      invalid: 'Invalid or duplicate topic'
    },
    clients: {
      title: 'Connected clients ({count})',
      id: 'Client ID',
      address: 'Address',
      user: 'User',
      version: 'Protocol',
      subscriptions: 'Subscriptions',
      since: 'Connected at',
      none: 'No client connected.',
      stopped: 'Broker stopped.'
    },
    log: {
      title: 'Messages ({count})',
      clear: 'Clear the messages and the topics',
      filter: 'Topic filter (+ and # wildcards)',
      events: 'Connection events',
      time: 'Time',
      topic: 'Topic',
      payload: 'Content',
      from: 'From',
      broker: 'broker',
      empty: 'No message.',
      noMatch: 'No message matches the filter.',
      bytes: '{size} bytes',
      eventText: {
        connect: '{clientId} connected',
        disconnect: '{clientId} disconnected',
        subscribe: '{clientId} subscribed to {topic}',
        unsubscribe: '{clientId} unsubscribed from {topic}',
        error: '{topic}: {message}'
      }
    },
    explorer: {
      title: 'Topics ({count})',
      topic: 'Topic',
      last: 'Last content',
      count: 'Messages',
      time: 'Last',
      empty: 'No topic published yet.'
    },
    client: {
      title: 'Connection',
      host: 'Broker (IP address or name)',
      useLocal: 'Local broker',
      useLocalHint: 'Connect to the MQTT broker started in Sulfur',
      port: 'Port',
      tls: 'TLS (mqtts)',
      rejectUnauthorized: 'Verify the broker certificate',
      version: 'Protocol',
      clientId: 'Client ID',
      clientIdHint: 'Empty: random identifier',
      username: 'User',
      password: 'Password',
      passwordHint: 'Saved with the configuration (in clear text)',
      clean: 'Clean session',
      keepalive: 'Keep alive (s)',
      autoReconnect: 'Reconnect automatically',
      connectedTo: 'Connected to {url} · {clientId}',
      connecting: 'Connecting…',
      will: 'Last will message',
      willHint: 'Published by the broker if the client disconnects abnormally.',
      willEnabled: 'Send a last will message'
    },
    subscriptions: {
      title: 'Subscriptions ({count})',
      topic: 'Topic filter',
      qos: 'QoS',
      field: 'JSON field',
      fieldHint: 'Path of the value in a JSON content (e.g. value or data.temp); empty: whole content',
      granted: 'Granted',
      refused: 'refused',
      pending: 'pending',
      last: 'Last value',
      hint: 'Each subscription is a data point for the simulator and the trends; writing a subscription without wildcard publishes the value on its topic.'
    },
    publish: {
      title: 'Publish',
      topic: 'Topic',
      payload: 'Content',
      qos: 'QoS',
      retain: 'Retain',
      send: 'Publish'
    },
    received: {
      title: 'Received messages ({count})',
      clear: 'Clear the messages',
      empty: 'No message received.'
    },
    errors: {
      invalidPort: 'Invalid port (1 to 65535)',
      portPrivileged: 'Port {port} requires administrator rights: choose a port ≥ 1024',
      portInUse: 'Port {port} is already in use',
      invalidTopic: 'Invalid topic: “{topic}” (not empty, without + or # wildcard)',
      invalidFilter: 'Invalid topic filter: “{topic}”',
      reservedTopic: 'Topics starting with $ are reserved for the broker',
      duplicateTopic: 'Topic {topic} is already simulated',
      invalidType: 'Unknown value type',
      invalidQos: 'Invalid QoS (0, 1 or 2)',
      invalidFormat: 'Unknown content format',
      invalidInterval: 'Invalid publication period (0, or at least 10 ms)',
      invalidBoolean: 'Invalid boolean value: {value}',
      unknownTopic: 'Unknown simulated topic',
      emptyUsername: 'A user has no name',
      duplicateUser: 'User {name} is defined twice',
      missingPassword: 'User {name} has no password',
      noUser: 'Add a user, or accept connections without a user name',
      missingHost: 'Enter the broker to connect to',
      invalidVersion: 'Unsupported protocol version',
      alreadyConnected: 'The client is already connected',
      badCredentials: 'Connection refused: wrong user name or password',
      notAuthorized: 'Connection refused: not authorized',
      refused: 'Connection refused (broker not reachable)',
      connectTimeout: 'No response from the broker',
      closed: 'Connection closed by the broker',
      readOnlyPoint: 'Point {id} is read only'
    }
  }
}
