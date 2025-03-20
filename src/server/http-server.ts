import http from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocket } from 'ws';
import { ClientMessage, ServerMessage } from '../global-types';
import { log, logBrowser } from './logger';
import { getMusicFaderLevel, setFaderLevel } from './xair';
import { exchangeSpotifyCodeForTokens } from './spotify';
import { util } from './main';

const PORT = 9999;

const connections: WebSocket[] = [];

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.woff': 'application/font-woff',
  '.ttf': 'application/font-ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.otf': 'application/font-otf',
  '.wasm': 'application/wasm',
  '.zip': 'application/zip',
};

const STATIC_PATH = path.join(__dirname, '../../dist/browser/');

export function sendServerMessage(message: ServerMessage, socket?: WebSocket) {
  const msg = JSON.stringify(message);
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(msg);
  } else {
    connections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    });
  }
}

log('info', 'Starting server on port ' + PORT);
const httpServer = http
  .createServer((req, res) => {
    switch (req.method) {
      case 'GET': {
        let filePath = '.' + req.url;
        if (filePath == './') {
          filePath = './index.html';
        }
        const queryIndex = filePath.indexOf('?');
        if (queryIndex > -1) {
          filePath = filePath.substring(0, queryIndex);
        }
        const fileExtention = String(path.extname(filePath)).toLowerCase();
        let contentType = 'text/html';
        if (fileExtention in mimeTypes)
          contentType = mimeTypes[fileExtention as keyof typeof mimeTypes];
        const localPath = path.join(STATIC_PATH, filePath);
        fs.promises
          .readFile(localPath)
          .then((buf) => {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(buf, 'utf-8');
          })
          .catch((err) => {
            if (err.code && err.code === 'ENOENT') {
              log('error', `Missing file requested at ${localPath}`);
              res.writeHead(404, { 'Content-Type': 'text/html' });
              res.end('File not found', 'utf-8');
            } else {
              res.writeHead(500, { 'Content-Type': 'text/html' });
              res.end('Unknown error: ' + JSON.stringify(err), 'utf-8');
            }
          });
        break;
      }
    }
  })
  .listen(PORT, () => {
    log('info', `Http server started on port ${PORT}`);

    const wss = new WebSocket.Server({ server: httpServer });

    wss.on('connection', (ws, req) => {
      connections.push(ws);
      const ip = req.socket.remoteAddress
        ? req.socket.remoteAddress
        : 'unknown';
      log(
        'info',
        `Websocket connection established to ${ip}. Active connections: ${connections.length}`
      );
      sendServerMessage({ type: 'f', l: getMusicFaderLevel() }, ws);      
      sendServerMessage(
        {
          type: 'settings',
          settings: util.getSettings()
        },
        ws
      );

      ws.on('message', (message) => {
        try {
          const msg = JSON.parse(message.toString()) as ClientMessage;
          switch (msg.type) {
            case 'log': {
              logBrowser(
                `Client #${connections.indexOf(ws)}, address: "${ip}"`,
                msg.logType,
                msg.description,
                msg.data
              );
              break;
            }
            case 'f': {
              setFaderLevel(util.getSettings().musicChannel, msg.l);
              break;
            }
            case 'settings': {
              util.setSettings(msg.settings);
              break;
            }
            case 'spotify-code': {
              log('info', `Received Spotify code from client`);
              exchangeSpotifyCodeForTokens(msg.code);
              break;
            }
            default:
              log('error', `Unknown message type: ${JSON.stringify(msg)})`);
          }
        } catch (err) {
          log('error', `Error parsing message from client: ${err}`);
        }
      });
      ws.on('close', () => {
        log(
          'info',
          `Websocket connection closed. Active connections: ${connections.length}`
        );
        const index = connections.indexOf(ws);
        if (index > -1) {
          connections.splice(index, 1);
        }
      });
    });
  });


