export default {
  explorer: {
    name: 'Network explorer',
    description: 'Discovery and identification of the industrial and IT devices of the network',
    targets: {
      title: 'Targets',
      label: 'Addresses, networks or host names',
      local: 'Private networks of this PC:',
      noLocal: 'none',
      hint: 'Private networks only ({networks}). Examples: 192.168.1.0/24, 10.0.0.10-50, plc1.local — {max} addresses at most.',
      later: 'Searching for and identifying the devices at these addresses is planned for a later version.'
    },
    preview: {
      title: 'Addresses ({count})',
      range: 'From {first} to {last}',
      more: '… and {count} more',
      empty: 'Enter a target to see the addresses it covers.'
    },
    errors: {
      noTarget: 'Enter at least one address, network or host name',
      tooManyHosts: 'Too many addresses: {max} at most',
      invalidTarget: 'Invalid target: {value}',
      ipv6: 'IPv6 addresses are not supported: {value}',
      unknownHost: 'Unknown host name: {value}',
      notPrivate: 'Target outside the private networks refused: {value} (allowed networks: {networks})'
    }
  }
}
