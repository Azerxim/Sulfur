# FTP / SFTP module

[Documentation](../README.md) · [All modules](../README.md#modules) · **English** · [Français](../../fr/modules/ftp.md)

One module for the two file transfer protocols, in four tabs (FTP server and client, SFTP server
and client). Both servers serve the same folder by default (`<userData>/modules/ftp/files`) and can
run at the same time; the simulator faults apply to both. The module opens on the SFTP server tab.

## FTP / FTPS

- **Server** FTP (default port 2121) serving a folder, to test PLC backups, recipes and logs:
  - plain FTP, explicit FTPS (AUTH TLS, optionally required) or implicit FTPS, with the server
    self-signed certificate;
  - passive mode (port range and announced address configurable) and active mode, which only
    connects back to the client address; resume (REST), append, MLSD / MLST, SIZE, MDTM, ASCII
    and binary types;
  - users authenticated by password (only the scrypt hash is kept), read-only users, optional
    read-only anonymous login; clients confined to the served folder, symbolic links included;
  - log of logins and transfers, optional command log (passwords masked); counters; faults injected
    by the simulator (delay, no response, connection cut, forced reply on transfers).
- **Client** (basic-ftp library, passive mode): plain FTP or FTPS, optional certificate check,
  folder browsing, transfers, folder creation, rename and delete, and display of the command
  dialog. The password is not saved.

## SFTP

- **Server** SFTP (ssh2 library, default port 2222) serving a folder, to test firmware updates and
  configuration backups of devices:
  - SFTP subsystem only (no shell or command); clients confined to the served folder, symbolic
    links included;
  - users authenticated by password (only the scrypt hash is kept) and/or authorized public keys
    (OpenSSH format), read-only users; users edited while the server is running;
  - Ed25519 host key generated on the first start (`<userData>/modules/ftp/hostkey`), SHA256
    fingerprint displayed to check or pin it on the clients;
  - log of logins, transfers (path and size), folder creations, deletions and renames; counters;
    faults injected by the simulator (delay, connection cut).
- **Client**: password or private key (OpenSSH / PEM, passphrase), expected host key fingerprint
  (connection refused if it changed), folder browsing, download and upload with a file dialog,
  folder creation, rename and delete. Passwords and keys are not saved.
