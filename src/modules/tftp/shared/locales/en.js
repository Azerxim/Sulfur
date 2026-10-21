export default {
  tftp: {
    name: 'TFTP',
    description: 'Simulated TFTP server (firmware, device configurations) and client',
    modes: {
      octet: 'Binary (octet)',
      netascii: 'Text (netascii)'
    },
    errorCodes: {
      0: '0 – Undefined error',
      1: '1 – File not found',
      2: '2 – Access violation',
      3: '3 – Disk full'
    },
    server: {
      title: 'Server configuration',
      running: 'Running · {count} transfer(s)',
      host: 'Listening interface',
      port: 'Port',
      root: 'Served folder',
      choose: 'Choose…',
      pickRoot: 'Folder served by the TFTP server',
      openRoot: 'Open the folder',
      timeout: 'Timeout (s)',
      retries: 'Retransmissions',
      maxBlockSize: 'Max block size',
      allowWrite: 'Accept uploads (WRQ)',
      allowOverwrite: 'Replace existing files',
      hint: 'TFTP has no authentication: any client can read the served folder. Supported options: blksize, tsize, timeout. Standard port 69 requires administrator rights on Linux.',
      counters: '{reads} file(s) sent, {writes} received, {errors} failed · {bytesOut} bytes sent, {bytesIn} received',
      transfers: 'Transfers in progress ({count})',
      noTransfer: 'No transfer in progress.',
      log: 'Log ({count})',
      clearLog: 'Clear',
      noLog: 'No event yet.'
    },
    client: {
      title: 'Transfer',
      host: 'Server (IP address or name)',
      remoteFile: 'Remote file',
      mode: 'Mode',
      blockSize: 'Block size',
      tsize: 'Ask for the file size (tsize)',
      get: 'Download (GET)',
      put: 'Upload (PUT)…',
      abort: 'Abort',
      saveAs: 'Save the downloaded file',
      hint: 'A block size other than 512, or the file size, is negotiated with the server (RFC 2347). A server that does not support the options answers with 512-byte blocks.',
      summary:
        '{size} in {duration} ms ({rate}/s) · {blocks} block(s) of {blockSize} bytes · {retransmissions} retransmission(s)',
      history: 'History ({count})',
      noHistory: 'No transfer yet.'
    },
    log: {
      started: 'Server started on {endpoint} — folder {root}',
      stopped: 'Server stopped',
      faultNoResponse: 'Request for {file} ignored: simulated no response',
      unknownTid: 'Packet from an unknown transfer ID ({other}) rejected',
      sent: 'Sent {file}: {bytes} bytes, {blocks} block(s) of {blockSize} bytes, {rate} KiB/s, {retransmissions} retransmission(s)',
      received:
        'Received {file}: {bytes} bytes, {blocks} block(s) of {blockSize} bytes, {rate} KiB/s, {retransmissions} retransmission(s)',
      timeout: 'Transfer of {file} abandoned: the client no longer answers',
      clientError: 'Transfer of {file} aborted by the client: {message}',
      outside: 'Access outside the served folder refused ({file})',
      refused: '{direction} {file} refused: error {code} ({message})'
    },
    errors: {
      invalidPort: 'Invalid port (1 to 65535)',
      invalidTimeout: 'Invalid timeout (1 to 255 seconds)',
      invalidRetries: 'Invalid number of retransmissions (0 to 50)',
      invalidBlockSize: 'Invalid block size ({min} to {max} bytes)',
      invalidRoot: 'The served folder is not a folder: {path}',
      portPrivileged: 'Port {port} requires administrator rights: choose a port ≥ 1024',
      portInUse: 'Port {port} is already in use',
      remote: 'Error {code} from the server: {message}',
      timeout: 'No answer from the server (timeout)',
      missingHost: 'Enter the server address',
      missingFile: 'Enter the remote file name',
      invalidMode: 'Unknown transfer mode',
      unknownHost: 'Unknown host: {host}',
      busy: 'A transfer is already in progress',
      unexpectedOption: 'The server accepted an option that was not requested: {name}',
      badOption: 'Invalid value of option {name} from the server: {value}',
      readOnlyPoint: 'Point {id} is read-only'
    }
  }
}
