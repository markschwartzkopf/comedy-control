import {
  ClientMessage,
  LogData,
  LogType,
  ServerMessage,
} from '../global-types';


function addConnectSpotifyButton() {
  if (window.location.host !== 'localhost:9999') return;
  const button = document.createElement('button');
  button.textContent = 'Connect Spotify';
  button.onclick = () => {
    if (spotifyClientId && spotifyRedirectUri) {
      const scope = encodeURIComponent(
        'user-modify-playback-state app-remote-control user-read-playback-state user-read-currently-playing'
      );
      const state = generateRandomString(16); // Generate a random state value for security

      const url = `https://accounts.spotify.com/authorize?response_type=code&client_id=${spotifyClientId}&scope=${scope}&redirect_uri=${spotifyRedirectUri}&state=${state}`;

      console.log('Redirecting to:', url);
      //window.location.href = url;
      const spotifyAuthWindow = window.open(
        url,
        'SpotifyAuthWindow',
        'width=600,height=800'
      );
      const codeListener = (event: MessageEvent) => {
        console.log('Received message:', event.data);
        if (event.data.type === 'authorization_code') {
          console.log('Received code:', event.data.code);
          sendMessage({ type: 'spotify-code', code: event.data.code });
          if (spotifyAuthWindow) spotifyAuthWindow.close();
          window.removeEventListener('message', codeListener);
        }
      };
      window.addEventListener('message', codeListener);
    } else console.error('No Spotify client ID');
  };
  document.getElementById('app')!.appendChild(button);
}
addConnectSpotifyButton();

let spotifyClientId: string | null = null;
let spotifyRedirectUri = '';

let socket: WebSocket | null = null;
function connect() {
  console.log('Connecting to WebSocket:');
  socket = new WebSocket(`ws://${window.location.host}`);
  socket.onopen = () => {
    console.log('Control WebSocket opened');
  };
  socket.onmessage = (event) => {
    if (typeof event.data === 'string') {
      try {
        const message: ServerMessage = JSON.parse(event.data);
        switch (message.type) {
          case 'settings': {
            console.log('Settings:', message.settings);
            spotifyClientId = message.settings.spotify.clientId;            
            spotifyRedirectUri = message.settings.spotify.redirectUri;
            break;
          }
          case 'f': {
            break;
          }
          case 'm': {
            break;
          }
          default:
            log('error', 'Unknown message type:', message);
        }
      } catch (err) {
        log('error', `Error parsing message: ${err}`);
      }
    }
  };
  socket.onclose = () => {
    console.error('Socket closed');
    socket = null;
  };
}
setInterval(() => {
  if (!socket) connect();
}, 1000);

function sendMessage(message: ClientMessage) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  } else console.error(`Socket not open, can't send message`);
}

let localLogNumber = 0;
function log(type: LogType, description: string, data?: LogData) {
  localLogNumber++;
  console[type](`Local ${type} LocalLog#:${localLogNumber}, "${description}"`);
  if (data)
    console[type](
      `Local ${type} LocalLog#:${localLogNumber} data: "${JSON.stringify(
        data
      )}"`
    );
  sendMessage({ type: 'log', logType: type, description, data });
}

function generateRandomString(length: number) {
  let text = '';
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
