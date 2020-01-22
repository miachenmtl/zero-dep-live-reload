const { createServer } = require('http');
const { createHash } = require('crypto');
const { moveCursor } = require('readline');
const fs = require('fs');

const PORT = 8888;
const WATCHED_FILENAME = 'index.html';
const DEBOUNCE_INTERVAL = 50;
const WEBSOCKET_MAGIC_STRING = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const SPINNER_CHARS = '|/—\\';
let spinnerCounter = 0;

let connection; // FIXME: Allow multiple connections
let intervalId;
let isConnected = false;
let lastModified = fs.statSync(WATCHED_FILENAME).mtimeMs;

const watcher = fs.watch('.', (eventType, filename) => {
  // `fs.watch` is finicky. Recommended solution from thisdavej.com/how-to-watch-for-files-changes-in-node-js/
  // suggests looking solely at time modified with debounce interval, but even that
  // was buggy if only watching a single file. When editing on gedit on ubuntu, saving
  // would trigger renames, temp file creations, etc...
  // Watching a directory, filtering by filename, debouncing by modified time seems to work.
  // No checking eventType since 'rename's happened just on save.
  if (filename === WATCHED_FILENAME) {
    const watchModified = fs.statSync(filename).mtimeMs;
    if (watchModified - lastModified > DEBOUNCE_INTERVAL) {
      lastModified = watchModified;

      if (isConnected) {
        /*
        WebSocket Data Frame Anatomy
        0x81 = 0b10000001
          bit 1 = FIN = 1 Final data frame
          bits 2-4 = RSV = 000 No extensions used
          bits 5-8 = opcode = 0001 Payload is text
        0x02 = 0b00000010
          bit 1 = MASK = 0 No data mask from server to client
          bits 2-8 = payload length = 0000010 Payload two bytes long
        0x3a = payload data = ':'
        0x29 = payload data = ')'
        */
        const message = Buffer.from([0x81, 0x02, 0x3a, 0x29]);
        connection.write(message, () => {
          console.log(`[${new Date().toLocaleTimeString()}]: Reload message sent to client.`);
        });
      } else {
        console.log(`[${new Date().toLocaleTimeString()}]: ${WATCHED_FILENAME} updated, but nothing is connected!`);
      }
    }
  }
});

const pingClient = () => {
  if (isConnected) {
    /*
      WebSocket Data Frame Anatomy
      0x89 = 0b10001001
        bit 1 = FIN = 1 Final data frame
        bits 2-4 = RSV = 000 No extensions used
        bits 5-8 = opcode = 1001 Ping
      0x04 = 0b00000100
        bit 1 = MASK = 0 No data mask from server to client
        bits 2-8 = payload length = 0000010 Payload 4 bytes long
      0x70 = 'p'
      0x69 = 'i'
      0x6e = 'n'
      0x67 = 'g'
    */
    const message = Buffer.from([0x89, 0x04, 0x70, 0x69, 0x6e, 0x67]);
    connection.write(message, () => {
      // poomoji will be replaced by spinner when pong received
      // the browser WebSocket API automatically responds to pings by
      // ponging the same payload (but masked).
      process.stdout.write('💩');
      moveCursor(process.stdout, -2, 0); // the emoji is 2 chars long
    });
  }
}

const server = createServer((request, response) => {
  if (request.url === '/') {
    fs.readFile(filePath = WATCHED_FILENAME, function(error, content) {
      if (error) {
        console.error(error);
        response.end(error.message);
      }
      else {
        console.log(`Serving ${WATCHED_FILENAME}`);
          response.writeHead(200, { 'Content-Type': 'text/html' });
          response.end(content, 'utf-8');
      }
    });
  } else if (request.url === '/favicon.ico') {
    // chrome makes separate request for favicon
    // see https://gist.github.com/kentbrew/763822
    response.writeHead(200, {'Content-Type': 'image/x-icon'} );
    response.end();
  } else {
    response.writeHead(404, { 'Content-Type': 'text/plain' });
    response.write(`${request.url} not found.`);
    response.end();
  }
});

server.on('upgrade', (req, socket) => {
  console.log('Client requesting connection upgrade...');
  socket.on('error', (event) => { console.error(`WebSocket error: ${event}`); });
  socket.on('data', (data) => {
    if (data[0] === 0x8a && data[1] === 0x84) {
      // pong received
      if (data.length !== 10) console.error('Incorrect pong payload length received!');
      else {
        const mask = data.subarray(2, 6);
        const payload = data.subarray(6, 10);
        const unmaskedText = Buffer
          .from(
            payload.map((byte, i) => byte ^ mask[i])
            )
          .toString();
        if (unmaskedText !== 'ping') console.error('Wrong pong!');
        else {
          process.stdout.write(SPINNER_CHARS.charAt(spinnerCounter % 4));
          moveCursor(process.stdout, -1, 0);
          spinnerCounter++;
        }
      }
    } else if (data[0] === 0x88 && data[1] === 0x80 && data.length === 6) {
      console.log('Client closing connection...');
      connection.destroy();
      isConnected = false;
      clearInterval(intervalId);
    } else {
      console.log(`Mysterious data received: ${data.toString()}`);
      console.log(data);
    }
  });
  socket.on('timeout', () => { console.log(`WebSocket timeout!`); });
  socket.on('close', (hadError) => {
    clearInterval(intervalId);
    console.log(hadError ? 'Connection closed due to transmission error!' : 'Connection closed.');
    console.log('=========================');
  });

  const secWebSocketKey = req.headers['sec-websocket-key'];
  const acceptKey = createHash('sha1')
    .update(secWebSocketKey + WEBSOCKET_MAGIC_STRING)
    .digest('base64');

  socket.write(
    'HTTP/1.1 101 Web Socket Protocol Handshake\r\n' +
    'Upgrade: WebSocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
    '\r\n',
    () => {
      console.log('Connection upgraded.\n');
      isConnected = true;
      intervalId = setInterval(pingClient, 5000);
      connection = socket;
      process.stdout.write('\x1B[?25l'); // hides cursor
    }
  );
});

server.listen(PORT, () => {
  console.log(`[${new Date().toLocaleTimeString()}]: Server ready on localhost:${PORT}.`);
  console.log('=========================');
});
