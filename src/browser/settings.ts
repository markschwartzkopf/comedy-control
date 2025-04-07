import {
  ClientMessage,
  LogData,
  LogType,
  ServerMessage,
  Settings,
} from '../global-types';

let settings: Settings | null = null;

const timerAddress = document.getElementById(
  'timer-address'
) as HTMLInputElement;
const primaryPignageAddress = document.getElementById(
  'primary-pignage-address'
) as HTMLInputElement;
const secondaryPignageAddress = document.getElementById(
  'secondary-pignage-address'
) as HTMLInputElement;
const qlabAddress = document.getElementById('qlab-address') as HTMLInputElement;
const xairAddress = document.getElementById('xair-address') as HTMLInputElement;
const musicChannel = document.getElementById(
  'music-channel'
) as HTMLInputElement;
const defaultPlaylist = document.getElementById(
  'default-playlist'
) as HTMLInputElement;
timerAddress.oninput = setButtons;
primaryPignageAddress.oninput = setButtons;
secondaryPignageAddress.oninput = setButtons;
qlabAddress.oninput = setButtons;
xairAddress.oninput = setButtons;
musicChannel.oninput = setButtons;
defaultPlaylist.oninput = setButtons;
const buttons = document.getElementById('buttons') as HTMLDivElement;
const saveButton = document.getElementById('save') as HTMLButtonElement;
const resetButton = document.getElementById('reset') as HTMLButtonElement;
resetButton.onclick = populateValues;
saveButton.onclick = () => {
  sendMessage({
    type: 'settings',
    settings: {
      timerAddress: timerAddress.value || null,
      pignage: {
        primary: {
          address: primaryPignageAddress.value || null,
        },
        secondary: {
          address: secondaryPignageAddress.value || null,
        },
      },
      qlabAddress: qlabAddress.value || null,
      xairAddress: xairAddress.value || null,
      musicChannel: musicChannel.value ? parseInt(musicChannel.value) : null,
      spotify: {
        defaultPlaylist: defaultPlaylist.value || null,
      },
    },
  });
  setButtons();
};

function populateSpotifyFooter() {
  const footer = document.getElementById('spotify-footer') as HTMLDivElement;
  footer.innerHTML = '';
  if (settings && settings.spotify.refreshToken) {
    footer.innerHTML = `Connected to Spotify`;
    if (settings.spotify.user.name) {
      footer.innerHTML += ` as ${settings.spotify.user.name}`;
    }
    return;
  }
  if (window.location.host !== 'localhost:9999') {
    footer.innerHTML = `Spotify not connected, load this page from the host computer via "http://localhost:9999" to connect Spotify`;
    return;
  }
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
    } else {
      log('error', "Spotify credentials not loaded, can't connect");
      console.log(spotifyClientId, spotifyRedirectUri);
    }
  };
  footer.appendChild(button);
}

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
        const message = JSON.parse(event.data) as ServerMessage;
        switch (message.type) {
          case 'settings': {
            spotifyClientId = message.settings.spotify.clientId;
            spotifyRedirectUri = message.settings.spotify.redirectUri;
            let changed = false;
            if (
              !settings ||
              message.settings.spotify.user.name !== settings.spotify.user.name
            ) {
              changed = true;
            }
            if (
              !settings ||
              message.settings.spotify.refreshToken !==
                settings.spotify.refreshToken
            ) {
              changed = true;
            }
            settings = message.settings;
            if (changed || !settings) populateSpotifyFooter();
            populateValues();
            setButtons();
            break;
          }
          case 'spotify-tracks': {
            console.log('Spotify tracks:', message.tracks);
            break;
          }
          case 'spotify-playlists': {
            console.log('Spotify playlists:', message.playlists);
            break;
          }
          case 'f': {
            break;
          }
          case 'm': {
            break;
          }
          case 'timer': {
            break;
          }
          case 'qlab-cues': {
            break;
          }
          case 'services-connected': {
            break;
          }
          case 'pignage-info': {
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

function setButtons() {
  let changed = false;
  if (settings && timerAddress.value !== (settings.timerAddress || '')) {
    changed = true;
  }
  if (
    settings &&
    primaryPignageAddress.value !== (settings.pignage.primary.address || '')
  ) {
    changed = true;
  }
  if (
    settings &&
    secondaryPignageAddress.value !== (settings.pignage.secondary.address || '')
  ) {
    changed = true;
  }
  if (settings && qlabAddress.value !== (settings.qlabAddress || '')) {
    changed = true;
  }
  if (settings && xairAddress.value !== (settings.xairAddress || '')) {
    changed = true;
  }
  if (
    settings &&
    musicChannel.value !== (settings.musicChannel?.toString() || '')
  ) {
    changed = true;
  }
  if (
    settings &&
    defaultPlaylist.value !== (settings.spotify.defaultPlaylist || '')
  ) {
    changed = true;
  }
  if (changed) {
    buttons.style.display = '';
  } else {
    buttons.style.display = 'none';
  }
}

function populateValues() {
  timerAddress.value = settings ? settings.timerAddress || '' : '';
  primaryPignageAddress.value = settings
    ? settings.pignage.primary.address || ''
    : '';
  secondaryPignageAddress.value = settings
    ? settings.pignage.secondary.address || ''
    : '';
  qlabAddress.value = settings ? settings.qlabAddress || '' : '';
  xairAddress.value = settings ? settings.xairAddress || '' : '';
  musicChannel.value = settings ? settings.musicChannel?.toString() || '' : '';
  defaultPlaylist.value = settings
    ? settings.spotify.defaultPlaylist || ''
    : '';
  setButtons();
}
