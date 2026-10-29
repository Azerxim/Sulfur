# Simulator module

[Documentation](../README.md) · [All modules](../README.md#modules) · **English** · [Français](../../fr/modules/simulator.md)

Acts on the servers and clients of the other modules through the points they publish.

- **Fault injection**: response delay, no response, connection cut (open connections closed, new
  ones refused), forced Modbus exception or S7 return code (all requests, reads or writes), forced OPC UA status code
  (BadSensorFailure, BadCommunicationError…) and frozen values on chosen points. A fault is
  activated by hand or by a flow, until it is stopped or for a given duration; editing an active
  fault applies it immediately.
- **Flows** (as in Node-RED): nodes linked by wires pass messages (`msg.payload`) to each other,
  edited on a canvas (drag from the palette, link an output to an input, Delete removes the
  selection). **Deploy** sends all flows to the main process, where they run continuously; deployed
  flows are restarted at launch, and **Stop** / **Restart** pause them. A flow can be disabled.
  Nodes:
  - triggers: *Trigger* (by hand, at deployment and/or every n seconds), *Point change*;
  - points: *Read a point*, *Write a point* (`msg.payload` or a fixed value);
  - time and faults: *Wait*, *Ramp* (linear, from the current value or a given one), *Fault*
    (activate / stop a fault of the table, or from `msg.payload`); faults activated by flows are
    stopped at redeployment;
  - logic: *Switch* (one output per rule: =, ≠, <, ≤, >, ≥, between, true, false, otherwise),
    *Scale*, *Counter*, *Change filter* (with deadband);
  - *Function*: JavaScript run for each message in an isolated context (`vm`), limited to 1 s, with
    `msg`, `node`, `context`, `flow` and `global`; one or more outputs;
  - *Generator*: sine, ramp, random or toggle values, paused / restarted by a message;
  - *Debug*: messages shown in the Debug tab, with node warnings and errors.
  Each node shows its status under it (last value, pending messages, error). Linking a *Point change*
  of a module to a *Write a point* of another simulates a gateway between protocols.
- **Recording**: the changes of chosen points (servers or values monitored by the clients) are
  recorded as a new flow (writes and waits), which can be edited and replayed.
- Scenarios saved by an earlier version (or found in an imported configuration) are converted into
  flows: a manual trigger followed by one node per step, looped back for a looping scenario.
