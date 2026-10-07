export default {
  simulator: {
    name: 'Simulator',
    description: 'Fault injection and scenarios on the servers and clients of the other modules',
    groups: {
      server: 'Server',
      client: 'Client'
    },
    faults: {
      title: 'Fault injection ({count})',
      hint: 'Faults apply to the servers of the other modules (and to their points for frozen values or forced status codes). Duration 0 = until stopped.',
      types: {
        delay: 'Response delay',
        noResponse: 'No response',
        cut: 'Connection cut',
        exception: 'Forced Modbus exception',
        badStatus: 'Forced status code',
        freeze: 'Frozen values'
      },
      typeHints: {
        delay: 'Every response is sent after the given delay.',
        noResponse: 'Requests are received but never answered: clients run into their timeout.',
        cut: 'Open connections are closed and new ones refused while the fault is active.',
        exception: 'Requests are answered with the chosen exception code.',
        badStatus:
          'The variables keep their value but report the chosen status code (all variables if none is chosen).',
        freeze: 'The simulation of the chosen points stops (all points if none is chosen).'
      },
      scopes: {
        all: 'All requests',
        read: 'Reads',
        write: 'Writes'
      },
      module: 'Module',
      type: 'Fault',
      settings: 'Settings',
      delayMs: 'Delay (ms)',
      code: 'Code',
      scope: 'Requests',
      points: 'Points',
      allPoints: 'All points',
      duration: 'Duration (s)',
      state: 'State',
      active: 'Active',
      remaining: 'Active · {seconds} s',
      inactive: 'Inactive',
      activate: 'Activate',
      deactivate: 'Stop',
      clearAll: 'Stop all',
      newName: 'Fault {n}'
    },
    scenarios: {
      title: 'Scenarios ({count})',
      hint: 'A scenario chains steps in time: write a value, ramp, wait, activate or stop a fault. Faults activated by a scenario are stopped at its end.',
      empty: 'No scenario. Create one, or record the changes of points to replay them.',
      newName: 'Scenario {n}',
      recordedName: 'Recording {time}',
      loop: 'Loop',
      play: 'Play',
      stop: 'Stop',
      steps: 'Steps ({count})',
      addStep: 'Step',
      running: 'Step {step} / {count}',
      iteration: 'loop {n}',
      record: 'Record',
      recording: 'Recording… {count} change(s)',
      stopRecording: 'Stop recording',
      recordPoints: 'Points to record',
      recordHint: 'The changes of the chosen points are recorded as a new scenario.',
      duplicate: 'Duplicate',
      moveUp: 'Move up',
      moveDown: 'Move down',
      noPoint: 'No point available: configure variables or points in the OPC UA and Modbus modules.'
    },
    steps: {
      set: 'Write',
      ramp: 'Ramp',
      wait: 'Wait',
      fault: 'Fault'
    },
    step: {
      point: 'Point',
      value: 'Value',
      from: 'From',
      fromCurrent: 'current',
      to: 'To',
      duration: 'Duration (s)',
      fault: 'Fault',
      on: 'Activate',
      off: 'Stop'
    },
    errors: {
      unknownModule: 'Unknown module: {id}',
      unsupportedFault: 'The module {module} does not support this fault',
      unknownFault: 'Unknown fault',
      invalidDuration: 'Invalid duration: {value}',
      notNumeric: 'The point {point} has no numeric value for the ramp',
      stepFailed: 'Step {step} ({type}): {message}',
      alreadyRunning: 'A scenario is already running',
      alreadyRecording: 'A recording is already running',
      noPoints: 'Choose at least one point',
      emptyScenario: 'The scenario has no step'
    }
  }
}
