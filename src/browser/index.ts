import {
  RundownItem,
  RundownItemComicSet,
  SpotifyTrack,
} from '../global-types';
import {
  ClientMessage,
  LogData,
  LogType,
  Rundown,
  ServerMessage,
} from '../global-types';

let handleTracks: ((tracks: SpotifyTrack[]) => void) | null = null;
const faderInput = document.getElementById('fader-input') as HTMLInputElement;
faderInput.oninput = throttle(() => {
  console.log('Fader input changed:', faderInput.value);
  sendMessage({ type: 'f', l: parseFloat(faderInput.value) });
}, 100);

const warningsDiv = document.getElementById('warnings') as HTMLDivElement;
const spotifyWarning = document.createElement('a');
spotifyWarning.href = 'settings.html';
spotifyWarning.target = '_blank';
spotifyWarning.textContent = 'Spotify not connected';

let localRundown: Rundown = [];
let localCurrentItem = 0;
let spotifyConnected = false;

let populateItemModal: () => void = () => {};

let makeActiveButton: HTMLButtonElement | null = null;
const rundownEl = document.getElementById('rundown') as HTMLDivElement;
rundownEl.onclick = (e) => {
  if (e.target === rundownEl) {
    if (makeActiveButton) {
      makeActiveButton.parentElement?.removeChild(makeActiveButton);
      makeActiveButton = null;
    }
  }
};
const modalSaveButton = document.getElementById(
  'modal-save'
) as HTMLButtonElement;
modalSaveButton.style.display = 'none';
const modalCancelButton = document.getElementById(
  'modal-cancel'
) as HTMLButtonElement;
modalCancelButton.onclick = hideModal;

let socket: WebSocket | null = null;
function connect() {
  console.log('Connecting to WebSocket:');
  socket = new WebSocket(window.location.href.replace(/^http/, 'ws'));
  socket.onopen = () => {
    console.log('Control WebSocket opened');
  };
  socket.onmessage = (event) => {
    if (typeof event.data === 'string') {
      try {
        const message = JSON.parse(event.data) as ServerMessage;
        switch (message.type) {
          case 'm': {
            const height = Math.round((1 - Math.pow(message.l, 0.24)) * 100);
            document.getElementById('vu-level')!.style.height = `${height}%`;
            break;
          }
          case 'f': {
            faderInput.value = message.l.toString();
            break;
          }
          case 'settings': {
            localRundown = message.settings.rundown;
            localCurrentItem = message.settings.currentRundownItem;
            spotifyConnected = Boolean(message.settings.spotify.accessToken);
            populateRundown();
            populateItemModal();
            if (spotifyConnected) {
              if (warningsDiv.contains(spotifyWarning)) {
                warningsDiv.removeChild(spotifyWarning);
              }
            } else {
              if (!warningsDiv.contains(spotifyWarning)) {
                warningsDiv.appendChild(spotifyWarning);
              }
            }
            break;
          }
          case 'spotify-tracks': {
            if (handleTracks) handleTracks(message.tracks);
            break;
          }
          case 'spotify-playlists': {
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

function populateRundown() {
  rundownEl.innerHTML = '';
  for (let i = 0; i < localRundown.length; i++) {
    const item = localRundown[i];
    const itemEl = document.createElement('div');
    itemEl.classList.add('rundown-item');
    if (i === localCurrentItem) itemEl.classList.add('current');
    if (item.type === 'comic') {
      const nameEl = document.createElement('div');
      nameEl.classList.add('name');
      nameEl.textContent = item.name;
      itemEl.appendChild(nameEl);
      const socialEl = document.createElement('div');
      socialEl.classList.add('social');
      socialEl.textContent = item.social;
      itemEl.appendChild(socialEl);
      if (item.bumper && spotifyConnected) {
        itemEl.appendChild(createTrackDiv(item.bumper));
      }
      const timeEl = document.createElement('div');
      timeEl.classList.add('time');
      timeEl.textContent = minutesToTime(item.time);
      itemEl.appendChild(timeEl);
    } else {
      const nameEl = document.createElement('div');
      nameEl.classList.add('name');
      nameEl.textContent = item.name;
      itemEl.appendChild(nameEl);
    }
    itemEl.onclick = () => {
      if (makeActiveButton) {
        makeActiveButton.parentElement?.removeChild(makeActiveButton);
        makeActiveButton = null;
      }
      if (i === localCurrentItem) return;
      makeActiveButton = document.createElement('button');
      makeActiveButton.id = 'make-active-button';
      makeActiveButton.textContent = `Make "${item.name}" Active Rundown Item`;
      makeActiveButton.onclick = () => {
        sendMessage({ type: 'settings', settings: { currentRundownItem: i } });
        if (makeActiveButton) {
          makeActiveButton.parentElement?.removeChild(makeActiveButton);
          makeActiveButton = null;
        }
      };
      rundownEl.appendChild(makeActiveButton);
    };
    function editItem() {
      const modal = displayModal();
      initItemEditModal(localRundown, localCurrentItem, i, modal);
    }
    itemEl.ondblclick = editItem;
    setLongPress(itemEl, editItem);
    rundownEl.appendChild(itemEl);
  }
  const currentRundownItem = localRundown[localCurrentItem];
  const buttonsEl = document.getElementById('buttons') as HTMLDivElement;
  switch (currentRundownItem.type) {
    case 'comic': {
      buttonsEl.innerHTML = '';
      if (currentRundownItem.bumper) {
        const bumperPLayEl = document.createElement('button');
        bumperPLayEl.textContent = 'Play Bumper';
        buttonsEl.appendChild(bumperPLayEl);
      }
      const bumperStopEl = document.createElement('button');
      bumperStopEl.textContent = 'Stop Spotify';
      buttonsEl.appendChild(bumperStopEl);
      const timerStartEl = document.createElement('button');
      timerStartEl.textContent = 'Start Timer';
      buttonsEl.appendChild(timerStartEl);
      break;
    }
    case 'preset': {
      const buttonsEl = document.getElementById('buttons') as HTMLDivElement;
      buttonsEl.innerHTML = '';
      const presetFireEl = document.createElement('button');
      presetFireEl.textContent = 'Fire Preset';
      buttonsEl.appendChild(presetFireEl);
      break;
    }
  }
  if (localCurrentItem < localRundown.length - 1) {
    const nextEl = document.createElement('button');
    nextEl.textContent = 'Go to Next';
    buttonsEl.appendChild(nextEl);
  }
}

function initItemEditModal(
  rundown: Rundown,
  currentItem: number,
  itemno: number,
  modal: HTMLDivElement
) {
  let workingItem = JSON.parse(JSON.stringify(rundown[itemno])) as RundownItem;
  function setSaveButtonState() {
    if (JSON.stringify(rundown[itemno]) !== JSON.stringify(workingItem)) {
      modalSaveButton.style.display = '';
    } else {
      modalSaveButton.style.display = 'none';
    }
  }
  modalSaveButton.onclick = () => {
    const newRundown = JSON.parse(JSON.stringify(rundown)) as Rundown;
    newRundown[itemno] = workingItem;
    sendMessage({ type: 'settings', settings: { rundown: newRundown } });
    hideModal();
  };
  modalSaveButton.style.display = 'none';
  switch (workingItem.type) {
    case 'comic': {
      let comicItem = workingItem as RundownItemComicSet;
      const nameDiv = document.createElement('div');
      nameDiv.textContent = 'Name:';
      const nameEl = document.createElement('input');
      nameEl.type = 'text';
      nameEl.oninput = () => {
        comicItem.name = nameEl.value;
        workingItem = comicItem;
        setSaveButtonState();
        console.log('Name changed:', nameEl.value);
      };
      nameDiv.appendChild(nameEl);
      modal.appendChild(nameDiv);
      const socialDiv = document.createElement('div');
      socialDiv.textContent = 'Social:';
      const socialEl = document.createElement('input');
      socialEl.type = 'text';
      socialEl.oninput = () => {
        comicItem.social = socialEl.value;
        workingItem = comicItem;
        setSaveButtonState();
        console.log('Social changed:', socialEl.value);
      };
      socialDiv.appendChild(socialEl);
      modal.appendChild(socialDiv);
      const bumperDiv = document.createElement('div');
      bumperDiv.textContent = 'Bumper:';
      const pickBumper = document.createElement('button');
      pickBumper.textContent = 'Pick Bumper';
      pickBumper.onclick = () => {
        initBumperPickModal(rundown, currentItem, itemno);
      };
      bumperDiv.appendChild(pickBumper);
      modal.appendChild(bumperDiv);
      const timeDiv = document.createElement('div');
      timeDiv.textContent = 'Minutes:';
      const timeEl = document.createElement('input');
      timeEl.type = 'number';
      timeEl.oninput = () => {
        comicItem.time = parseFloat(timeEl.value);
        workingItem = comicItem;
        setSaveButtonState();
      };
      timeDiv.appendChild(timeEl);
      modal.appendChild(timeDiv);
      populateItemModal = () => {
        const item = localRundown[itemno];
        if (item.type !== 'comic' || localRundown.length !== rundown.length) {
          hideModal();
          return;
        }
        comicItem = JSON.parse(
          JSON.stringify(rundown[itemno])
        ) as RundownItemComicSet;
        nameEl.value = item.name;
        socialEl.value = item.social || '';
        timeEl.value = item.time.toString();
      };
      break;
    }
    case 'preset': {
      const nameEl = document.createElement('input');
      nameEl.type = 'text';
      modal.appendChild(nameEl);
      populateItemModal = () => {
        const item = localRundown[itemno];
        if (item.type !== 'preset' || localRundown.length !== rundown.length) {
          hideModal();
          return;
        }
        nameEl.value = item.name;
      };
      break;
    }
  }
  populateItemModal();
}

function initBumperPickModal(
  rundown: Rundown,
  currentItem: number,
  itemno: number
) {
  const modal = displayModal();
  modalCancelButton.onclick = () => {
    const modal = displayModal();
    initItemEditModal(rundown, currentItem, itemno, modal);
  };
  const trackListDiv = document.createElement('div');
  modal.appendChild(trackListDiv);
  handleTracks = (tracks: SpotifyTrack[]) => {
    if (!modal.contains(trackListDiv)) {
      console.log('Song select modal no longer active, resetting handleTracks');
      handleTracks = null;
      return;
    }
    trackListDiv.innerHTML = '';
    tracks.forEach((track) => {
      const trackDiv = createTrackDiv(track);
      trackDiv.onclick = () => {
        const item = localRundown[itemno];
        hideModal();
        if (item.type !== 'comic') {
          console.error('Item is not a comic, cannot set bumper');
          return;
        }
        item.bumper = {
          id: track.id,
          name: track.name,
          artist: track.artist,
          art: track.art,
        };
        sendMessage({
          type: 'settings',
          settings: { rundown: localRundown },
        });
      };
      trackListDiv.appendChild(trackDiv);
    });
  };
  sendMessage({ type: 'spotify-search' });
}

function createTrackDiv(track: {
  id: string;
  name: string;
  artist: string;
  album?: string;
  duration_ms?: number;
  popularity?: number;
  art: string;
}) {
  const trackDiv = document.createElement('div');
  trackDiv.classList.add('track');
  const artEl = document.createElement('img');
  artEl.classList.add('art');
  artEl.src = track.art;
  trackDiv.appendChild(artEl);
  const infoSpan = document.createElement('span');
  const nameEl = document.createElement('div');
  nameEl.classList.add('name');
  nameEl.textContent = track.name;
  infoSpan.appendChild(nameEl);
  const artistEl = document.createElement('div');
  artistEl.classList.add('artist');
  artistEl.textContent = track.artist;
  infoSpan.appendChild(artistEl);
  trackDiv.appendChild(infoSpan);
  if (track.album && track.duration_ms && track.popularity)
    trackDiv.title = `Album: ${track.album}\nDuration: ${msToTimeString(
      track.duration_ms
    )}\nPopularity: ${track.popularity}%`;
  return trackDiv;
}

function sendMessage(message: ClientMessage) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    console.log('Sending message:', message);
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

function throttle(func: (...args: any[]) => any, limit: number) {
  let lastFunc: ReturnType<typeof setTimeout> | null = null;
  let lastRan: number;

  return function (...args: any[]) {
    if (!lastRan) {
      func(...args);
      lastRan = Date.now();
    } else {
      clearTimeout(lastFunc!);
      lastFunc = setTimeout(() => {
        if (Date.now() - lastRan >= limit) {
          func(...args);
          lastRan = Date.now();
        }
      }, limit - (Date.now() - lastRan));
    }
  };
}

function minutesToTime(minutes: number) {
  const mins = Math.floor(minutes);
  const seconds = Math.round((minutes - mins) * 60);
  return `${mins}:${seconds.toString().padStart(2, '0')}`;
}

function displayModal() {
  const modalContent = document.getElementById(
    'modal-content'
  ) as HTMLDivElement;
  modalContent.innerHTML = '';
  const modal = document.getElementById('modal') as HTMLDivElement;
  modal.style.display = 'flex';
  modal.onclick = (e) => {
    if (e.target === modal) hideModal();
  };
  modalCancelButton.onclick = hideModal;
  return modalContent;
}

function hideModal() {
  populateItemModal = () => {};
  (document.getElementById('modal') as HTMLDivElement).style.display = 'none';
}

function setLongPress(element: HTMLElement, callback: () => void) {
  const duration = 500;
  let timer: ReturnType<typeof setTimeout> | null = null;

  element.addEventListener('touchstart', start);
  element.addEventListener('mousedown', start);
  element.addEventListener('touchend', cancel);
  element.addEventListener('mouseup', cancel);
  element.addEventListener('mouseleave', cancel);

  function start(event: MouseEvent | TouchEvent) {
    if (event.type === 'touchstart') {
      event.preventDefault();
    }
    timer = setTimeout(() => {
      timer = null;
      callback(); // Execute the callback function if the time threshold is met
    }, duration);
  }

  function cancel(event: MouseEvent | TouchEvent) {
    if (event.type === 'touchend') {
      if (timer && element.onclick) element.onclick(event as MouseEvent); //probably ok
    }
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }
}

function msToTimeString(ms: number) {
  let seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  seconds = seconds % 60;
  return minutes.toString() + ':' + seconds.toString().padStart(2, '0');
}
