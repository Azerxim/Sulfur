export default {
  http: {
    name: 'HTTP / REST',
    description: 'Simulated REST server (variables, routes, webhooks) and HTTP / HTTPS client',
    dataTypes: {
      Number: 'Number',
      Integer: 'Integer',
      Boolean: 'Boolean',
      String: 'Text',
      JSON: 'JSON'
    },
    server: {
      title: 'Server configuration',
      running: 'Running · {count} request(s)',
      host: 'Listening interface',
      port: 'Port',
      basePath: 'API path',
      https: 'HTTPS (self-signed certificate)',
      api: 'Variables REST API',
      cors: 'CORS headers',
      portsHint: 'Standard ports: 80 (HTTP) and 443 (HTTPS) — administrator rights required on Linux for ports < 1024.',
      certificate: 'certificate {name}'
    },
    auth: {
      title: 'Authentication',
      type: 'Method',
      types: {
        none: 'None',
        basic: 'Basic (users)',
        bearer: 'Bearer token',
        apiKey: 'API key'
      },
      hints: {
        none: 'Every request is accepted.',
        basic:
          'Authorization: Basic header. Passwords are hashed (scrypt) as soon as they are entered; only their hash is saved.',
        bearer: 'Authorization: Bearer <token> header.',
        apiKey: 'The key is expected in the chosen header.'
      },
      username: 'User name',
      password: 'Password',
      passwordSet: 'Password set (type to change it)',
      addUser: 'User',
      token: 'Token',
      headerName: 'Header name',
      apiKey: 'Key',
      generate: 'Generate'
    },
    variables: {
      title: 'Simulated variables ({count})',
      nameHint: 'Empty, duplicate or invalid name (letters, digits, _ and -, no space)',
      writableHint: 'Writable through the REST API and routes'
    },
    routes: {
      title: 'Routes ({count})',
      hint: 'Checked in order, after the variables API: the first route whose method and path match responds. Path with parameters: /api/devices/:id; “*” as the last segment accepts the rest.',
      anyMethod: 'Any',
      pathHint: 'Must start with “/”',
      status: 'HTTP status',
      contentType: 'Content type',
      delay: 'Delay (ms)',
      setVariable: 'Assign variable',
      source: 'Value taken from',
      body: 'Response body',
      templateHint:
        'Template: {{var.<name>}}, {{params.<name>}}, {{query.<name>}}, {{headers.<name>}}, {{body}}, {{body.<field>}}, {{now}}, {{timestamp}}, {{uuid}}. Assignment: body, body.<field>, query.<name> or params.<name>.',
      headers: 'Response headers'
    },
    webhooks: {
      title: 'Webhooks ({count})',
      hint: 'Outgoing JSON calls: at each change of the chosen variables (at most one call every “interval” seconds) or periodically. HTTPS certificates are not verified.',
      enabled: 'Enabled',
      method: 'Method',
      mode: 'Trigger',
      modes: {
        change: 'On change',
        interval: 'Periodic'
      },
      interval: 'Interval (s)',
      intervalHints: {
        change: 'Minimum time between two calls (0 = at each change)',
        interval: 'Period of the calls'
      },
      variables: 'Variables',
      allVariables: 'All variables'
    },
    log: {
      title: 'Log ({count})',
      onlyErrors: 'Errors only',
      clear: 'Clear the log',
      empty: 'No request.',
      remote: 'Client / target',
      method: 'Method',
      path: 'Path',
      duration: 'Duration',
      requestBody: 'Request body',
      responseBody: 'Response body',
      directions: {
        in: 'Request received',
        out: 'Webhook sent'
      },
      noResponse: 'no response (injected fault)',
      forced: 'forced status (injected fault)',
      unauthorized: 'authentication refused'
    },
    headers: {
      name: 'Header',
      value: 'Value',
      add: 'Header'
    },
    client: {
      title: 'Client configuration',
      baseUrl: 'Base address',
      useLocal: 'Local server',
      useLocalHint: 'Use the address of the HTTP server started in Sulfur',
      timeout: 'Timeout (ms)',
      allowInsecure: 'Accept unverified certificates',
      secretsHint: 'Client passwords, tokens and keys are not saved: enter them again at the next launch.',
      commonHeaders: 'Common headers ({count})',
      request: 'Request',
      send: 'Send',
      body: 'Body',
      headers: 'Headers ({count})',
      history: 'History ({count})',
      noHistory: 'No request sent.',
      restore: 'Reuse this request',
      noBodyForGet: 'No body for a GET request',
      responseHeaders: 'Response headers ({count})',
      truncated: 'truncated response',
      pollEvery: 'Poll every',
      label: 'Label',
      watchPath: 'Path or URL',
      jsonPath: 'JSON path',
      writeMethod: 'Write',
      watch: 'Monitor',
      watchHint:
        'Polls the URL with GET and publishes the value at the JSON path for the simulator and trends; with a write method, the simulator can write it (body { "value": … }).',
      noWatch: 'No monitored value.'
    },
    units: {
      bytes: '{n} B',
      kilobytes: '{n} kB',
      megabytes: '{n} MB'
    },
    errors: {
      invalidPort: 'Invalid port (1 to 65535)',
      portPrivileged: 'Port {port} requires administrator rights: choose a port ≥ 1024',
      portInUse: 'Port {port} is already in use',
      invalidName: 'Invalid variable name: “{name}”',
      unknownType: 'Unknown type: {type}',
      variableExists: 'Variable “{name}” already exists',
      unknownVariable: 'Unknown variable: {name}',
      invalidMethod: 'Invalid HTTP method: {method}',
      invalidPath: 'Invalid path: “{path}” (must start with “/”)',
      invalidStatus: 'Invalid HTTP status: {status}',
      invalidUrl: 'Invalid URL: “{url}”',
      userWithoutPassword: 'User {name} has no password',
      basicNeedsUser: 'Basic authentication needs at least one user',
      bearerNeedsToken: 'Bearer authentication needs a token',
      apiKeyNeedsKey: 'API key authentication needs a header and a key',
      notNumber: 'Non-numeric value: {value}',
      invalidJson: 'Invalid JSON',
      tooLarge: 'Request body too large',
      unauthorized: 'Authentication required',
      notFound: 'No route for {path}',
      methodNotAllowed: 'Method {method} not allowed',
      readOnly: 'Variable “{name}” is read only',
      missingValue: 'Value missing from the request ({source})',
      timeout: 'No response within the timeout ({timeout} ms)',
      refused: 'Connection refused by {host}',
      reset: 'Connection closed by the server',
      noBaseUrl: 'Enter the base address or a full URL',
      noPath: 'Enter a path or a URL',
      pathNotFound: 'JSON path not found in the response: {path}',
      minPoll: 'Minimum polling period: 100 ms',
      unknownWatch: 'Unknown monitored value',
      watchReadOnly: 'This monitored value has no write method'
    }
  }
}
