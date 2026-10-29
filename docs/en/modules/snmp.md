# SNMP module

[Documentation](../README.md) · [All modules](../README.md#modules) · **English** · [Français](../../fr/modules/snmp.md)

- **Agent** (net-snmp, UDP, default port 1161; standard port 161 needs administrator rights on
  Linux): SNMPv1, v2c and v3. Read community and read / write community, SNMPv3 users (USM: MD5 or
  SHA-1 / SHA-2 authentication, DES or AES encryption), engine ID chosen or generated. System group
  of MIB-II (sysDescr, sysObjectID, sysUpTime, sysContact, sysName, sysLocation, sysServices) and
  **simulated objects** (Integer, Counter32, Gauge32, TimeTicks, OctetString, IpAddress, OID;
  sine, ramp, random or toggle generator), writable by SetRequest if declared so. Get, GetNext,
  GetBulk and Set requests, request log.
- **Notifications**: the agent sends a notification (chosen OID, chosen objects attached) to
  destinations in SNMPv1 (trap), SNMPv2c or SNMPv3 (trap or acknowledged inform); an SNMPv3
  notification uses one of the agent users and the agent engine ID.
- **Manager**: Get, GetNext, GetBulk, Walk and Set requests in v1, v2c or v3 (several OIDs at once,
  typed values for Set); monitored OIDs read periodically; **notification receiver** (default port
  1162; all communities accepted, SNMPv3 traps and informs with the manager user) with the list of received traps
  and informs.
- Points for the simulator and trends: simulated objects (writable), request count, notifications
  sent (writing sends the notification); monitored OIDs (writable: sends a SetRequest with the type of
  the last read), notifications received.
- Simulator faults: delay, no response, forced error (genErr, tooBig, noSuchName, badValue,
  noAccess, resourceUnavailable, authorizationError — on all requests, reads or writes), frozen
  values.
