# TFTP module

[Documentation](../README.md) · [All modules](../README.md#modules) · **English** · [Français](../../fr/modules/tftp.md)

- **Multiple instances**: as many servers and clients as needed, each in its own tab, with its name
  and settings; none exists at first. A stopped instance can be renamed or removed. Those of an
  earlier version become "Server 1" and "Client 1".

- **Server** TFTP (default port 6969) serving a folder, to test firmware downloads and
  configuration backups of network devices:
  - octet and netascii modes, blksize, tsize and timeout options (RFC 2347 to 2349), block number
    rollover beyond 65535 blocks;
  - uploads allowed or not, existing files replaced or not; files written at once before the last
    acknowledgement; paths confined to the served folder;
  - timeout, retransmissions and maximum block size changed while running; log of transfers
    (size, rate, retransmissions); faults injected by the simulator (delay, no response, forced
    error).
- **Client**: download (GET) and upload (PUT) with a file dialog, block size and file size
  negotiation, progress, abort and history.
