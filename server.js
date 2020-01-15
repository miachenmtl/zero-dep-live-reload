const { createServer } = require('http');
const { createHash } = require('crypto');
const fs = require('fs');

const PORT = 8888;
const WEBSOCKET_MAGIC_STRING = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

let connection;
let lastModified = fs.statSync('index.html').mtimeMs;

const watcher = fs.watch('index.html', (eventType, filename) => {
  if (eventType === 'change') {
    // change event fired twice on Linux, needs debouncing
    const watchModified = fs.statSync(filename).mtimeMs;
    if (lastModified !== watchModified) {
      lastModified = watchModified;
      /*
        WebSocket Data Frame Anatomy
        0x81 = 0b10000001
          bit 1 = FIN = 1 Final data frame
          bits 2-4 = RSV = 000 No extensions used
          bits 5-8 = opcode = 0001 Payload is text
        0x82 = 0b00000010
          bit 1 = MASK = 0 No data mask from server to client
          bits 2-8 = payload length = 0000010 Payload two bytes long
        0x3a = payload data = ':'
        0x29 = payload data = ')'
      */
      const message = Buffer.from([0x81, 0x02, 0x3a, 0x29]);
      connection.write(message, () => { console.log('Reload message sent to client.'); });
    }
  }
});

const server = createServer((request, response) => {
  if (request.url === '/') {
    fs.readFile(filePath = 'index.html', function(error, content) {
      if (error) {
        console.error(error);
        response.end(error.message);
      }
      else {
        console.log('Serving index.html');
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
  const secWebSocketKey = req.headers['sec-websocket-key'];
  const acceptKey = createHash('sha1')
    .update(secWebSocketKey + WEBSOCKET_MAGIC_STRING)
    .digest('base64');

  socket.write(
    'HTTP/1.1 101 Web Socket Protocol Handshake\r\n' +
    'Upgrade: WebSocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
    '\r\n'
  );

  connection = socket;
});

server.listen(PORT, () => {
  console.log(`index.html is being served on localhost:${PORT}.`);
});
