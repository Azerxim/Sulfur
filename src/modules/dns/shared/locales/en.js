export default {
  dns: {
    name: 'DNS',
    description: 'Simulated DNS server (local zone, forwarding) and resolution client',
    server: {
      title: 'Server configuration',
      running: 'Running · {count} query(ies)',
      host: 'Listening interface',
      port: 'Port',
      domain: 'Zone domain',
      ttl: 'Default TTL (s)',
      tcp: 'Also listen on TCP',
      autoPtr: 'Reverse records (PTR) from A / AAAA',
      forward: 'Forward other names',
      upstreams: 'Upstream servers (address[:port], comma separated)',
      hint: 'The server is authoritative for the zone domain (NXDOMAIN for unknown names of the zone). Other names are forwarded to the upstream servers, or refused (REFUSED) if forwarding is disabled. Standard port 53 requires administrator rights on Linux.',
      counters: '{answered} answered · {nxdomain} NXDOMAIN · {forwarded} forwarded · {refused} refused'
    },
    records: {
      title: 'Zone records ({count})',
      hint: 'Relative names are attached to {domain}; @ is the domain itself, a name ending with a dot is absolute, *.name is a wildcard. Values: MX “10 mail”, SRV “priority weight port target”.',
      fqdn: 'Full name'
    },
    queries: {
      title: 'Received queries ({count})',
      clear: 'Clear',
      client: 'Client',
      name: 'Name',
      rcode: 'Response',
      answers: 'Answers',
      forwarded: 'forwarded',
      none: 'No query received yet.'
    },
    client: {
      title: 'Query',
      server: 'DNS server',
      name: 'Name or address',
      timeout: 'Timeout (ms)',
      query: 'Query',
      tcp: 'TCP',
      recursion: 'Recursion desired (RD)',
      ptrHint: 'PTR: enter an IP address, it is converted to its reverse name.',
      result: 'Response',
      summary: '{server} · {transport} · {duration} ms · {size} bytes',
      truncated: 'truncated UDP response, resent over TCP',
      answers: 'Answers',
      authorities: 'Authority',
      additionals: 'Additional',
      noData: 'The name exists but has no record of this type.',
      history: 'History ({count})',
      noHistory: 'No query sent yet.'
    },
    errors: {
      invalidName: 'Invalid name: {value}',
      invalidValue: 'Invalid value: {value}',
      invalidTarget: 'Invalid target name: {value}',
      invalidIPv4: 'Invalid IPv4 address: {value}',
      invalidIPv6: 'Invalid IPv6 address: {value}',
      invalidMx: 'MX: “preference name” expected ({value})',
      invalidSrv: 'SRV: “priority weight port target” expected ({value})',
      emptyTxt: 'Empty text',
      unknownType: 'Unknown record type: {type}',
      badRecord: 'Record {name} {type}: {problem}',
      invalidTtl: 'Invalid TTL for {name}',
      invalidUpstream: 'Invalid upstream server: {value}',
      noUpstream: 'Enter at least one upstream server, or disable forwarding',
      invalidPort: 'Invalid port (1 to 65535)',
      portPrivileged: 'Port {port} requires administrator rights: choose a port ≥ 1024',
      portInUse: 'Port {port} is already in use',
      invalidServer: 'Enter the IP address of the DNS server',
      missingName: 'Enter the name to resolve',
      timeout: 'No response within {timeout} ms',
      tcpRefused: 'TCP connection refused by {server}:{port}',
      readOnlyPoint: 'Point {id} is read-only'
    }
  }
}
