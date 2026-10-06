export default {
  opcua: {
    name: 'OPC UA',
    description: 'OPC UA server and client (Sign / SignAndEncrypt, certificates)',
    securityModes: {
      None: 'None',
      Sign: 'Sign',
      SignAndEncrypt: 'Sign and encrypt'
    },
    deprecated: '{name} (deprecated)',
    server: {
      title: 'Server configuration',
      running: 'Running · {count} session(s)',
      port: 'Port',
      resourcePath: 'Resource path',
      rootFolder: 'Root folder',
      variables: 'Simulated variables ({count})',
      certsTitle: 'OPC UA server certificates'
    },
    security: {
      modes: 'Modes',
      policies: 'Policies (signed modes)',
      auth: 'Authentication',
      anonymous: 'Anonymous access allowed',
      users: 'Users ({count})',
      user: 'User',
      username: 'Username',
      passwordSet: '•••••• (set, type to change)',
      passwordRequired: 'Password required',
      hashedHint: 'Passwords are hashed (scrypt): only their digest is kept.',
      problems: {
        noMode: 'at least one security mode is required',
        noPolicy: 'signed modes require at least one policy',
        noAuth: 'allow anonymous access or add a user',
        incompleteUser: 'every user needs a username and a password'
      }
    },
    client: {
      connectedWith: 'Connected · {security}',
      endpoint: 'Endpoint',
      mode: 'Security mode',
      policy: 'Policy',
      auth: 'Authentication',
      anonymous: 'Anonymous',
      usernamePassword: 'Username / password',
      username: 'Username',
      password: 'Password',
      discover: 'Discover endpoints',
      discovering: 'Discovering…',
      endpoints: 'Endpoints offered by the server ({count})',
      level: 'level {level}',
      selected: 'Selected',
      use: 'Use',
      certsTitle: 'OPC UA client certificates',
      addressSpace: 'Address space',
      reload: 'Reload',
      connectToBrowse: 'Connect to browse the nodes.',
      selectedNode: 'Selected node',
      selectNode: 'Select a node in the tree.',
      read: 'Read',
      monitor: 'Monitor',
      unmonitor: 'Stop monitoring',
      nodeClass: 'Class',
      newValue: 'New value',
      write: 'Write',
      noMonitored: 'No monitored variable.'
    },
    errors: {
      userNoName: 'A user has no username',
      userNoPassword: 'Missing password for user “{name}”',
      noMode: 'Select at least one security mode',
      noPolicy: 'Select at least one security policy for the Sign / Encrypt modes',
      noAuth: 'No possible authentication: allow anonymous access or add a user',
      duplicateNames: 'Duplicate variable names',
      emptyName: 'The variable name is empty',
      exists: 'Variable “{name}” already exists',
      unknownVariable: 'Unknown variable',
      unknownType: 'Unknown type: {type}',
      writeUnsupported: 'Writing is not supported for type {type}',
      choosePolicy: 'Choose a security policy for this mode',
      writeRefused: 'Write refused: {status}',
      authRefused: 'Authentication refused (wrong username or password, or mode not allowed). {details}',
      certRefused: 'Certificate refused: approve the certificate in the server and/or client store. {details}',
      noAnonymous: 'The server does not allow anonymous access: use a username / password.',
      noUsername: 'The server does not accept username / password authentication on this endpoint.',
      noEndpoint:
        'The server does not offer this security mode / policy pair (use “Discover” to list the available endpoints).'
    }
  }
}
