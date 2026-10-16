export default {
  trends: {
    name: 'Trends',
    description: 'Trends of the values of the other modules, data logging and CSV export',
    groups: {
      server: 'Server',
      client: 'Client',
      plc: 'PLC'
    },
    chart: {
      title: 'Trends',
      empty: 'Choose points then start the recording.',
      waiting: 'Waiting for the first samples…',
      windows: {
        60000: '1 min',
        300000: '5 min',
        900000: '15 min',
        3600000: '1 h',
        0: 'All'
      },
      window: 'Window',
      layout: 'Display',
      shared: 'One chart, one axis',
      split: 'One chart per point',
      hint: 'Drag horizontally to zoom. Points on very different scales are easier to read with one chart per point.',
      follow: 'Follow',
      paused: 'Paused (zoom): click Follow to resume',
      time: 'Time'
    },
    recording: {
      start: 'Record',
      stop: 'Stop',
      clear: 'Clear',
      export: 'Export CSV',
      interval: 'Sampling period (ms)',
      decimal: 'CSV decimal separator',
      decimalPoint: 'Point (1.5)',
      decimalComma: 'Comma (1,5)',
      running: 'Recording · {count} sample(s)',
      stopped: '{count} sample(s)',
      exported: 'Exported to {file}',
      limit: 'The last {count} samples are kept.'
    },
    series: {
      title: 'Points ({count})',
      add: 'Add a point',
      tooMany: '{count} points at most',
      point: 'Point',
      atCursor: 'At cursor',
      none: 'No point available: configure variables or points in the OPC UA and Modbus modules, or monitor values with their clients.',
      hide: 'Hide',
      show: 'Show',
      remove: 'Remove',
      last: 'Last value',
      min: 'Min',
      max: 'Max',
      unavailable: 'unavailable'
    },
    errors: {
      minInterval: 'Minimum period: {min} ms',
      noSeries: 'Choose at least one point',
      alreadyRecording: 'The recording is already running',
      noData: 'No sample to export'
    }
  }
}
