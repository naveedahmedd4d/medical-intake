import 'dotenv/config';
import { loadKeyVaultSecrets } from '../azure.js';
import debugObj from 'debug';
import http from 'http';
import WebSocket from 'ws';

const debug = debugObj('api:server');

function normalizePort(val) {
  // eslint-disable-next-line no-shadow
  const port = parseInt(val, 10);

  if (Number.isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
}

async function init() {
  await loadKeyVaultSecrets();

  const { default: app } = await import('./app.js');
  const { handleWsConnection } = await import('./utils/helper.js');
  const port = normalizePort(process.env.PORT || '3000');
  const address = process.env.SERVER_ADDRESS || '0.0.0.0';
  const server = http.createServer(app);

  const wss = new WebSocket.Server({ server });
  wss.on('connection', handleWsConnection);

  // eslint-disable-next-line no-console
  server.listen(port, address, () => console.log(`Server running on http://${address}:${port}`));
  server.on('error', (err) => onError(err, port));
  server.on('listening', () => onListening(server));
}

init().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', err);
  process.exit(1);
});
function onError(error, port) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof port === 'string' ? `Pipe ${port}` : `Port ${port}`;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      // eslint-disable-next-line no-console
      console.error(`${bind} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      // eslint-disable-next-line no-console
      console.error(`${bind} is already in use`);
      process.exit(1);
      break;
    default:
      throw error;
  }
}

function onListening(server) {
  const addr = server.address();
  const bind = typeof addr === 'string' ? `pipe ${addr}` : `port ${addr.port}`;
  debug(`Listening on ${bind}`);
}
