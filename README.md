# Zero-Dependency Live Reload

Minimalist node server for prototyping from scratch with live reload (browser refreshes when `index.html` is updated).

## Usage

Run `npm start` (or `node server`) and set your browser to `localhost:8888`. Edit `index.html`. When you update the file, the browser will reload the page.

## Technical Details

- `server.js` uses Node's built-in `http` library to serve `index.html`.
- After `index.html` loads, it requests a two-way connection to the server using the [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) API.
- The server responds by upgrading the `http` connection to a WebSocket connection. This completes the "handshake" stage of the connection.
- Every 5 seconds the server pings the client (literally sending "ping"), which responds with a pong if everything is normal. (Actually, it just sends the same "ping" message by default.)
- `server.js` has watches `index.html` for changes. When it updates, the server sends a message to the browser with the payload ":)".
- When the correct payload is received by the client, the page is reloaded using `window.location.reload`.
- People use libraries for this because the messages need to be encoded, which involves bit manipulation and hashing. Not fun!
