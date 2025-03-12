import { RundownItem } from '../global-types';
import {
  ClientMessage,
  LogData,
  LogType,
  Rundown,
  ServerMessage,
} from '../global-types';
const svgNS = 'http://www.w3.org/2000/svg'; // SVG namespace
const playIconSvg = `<polygon points="5 3 35 20 5 37 5 3"></polygon>`;
const pauseIconSvg = `<rect x="3" y="3" width="12" height="34"></rect><rect x="25" y="3" width="12" height="34"></rect>`;
const trashSvg = `<path d="M89 9a4 4 0 0 1 4 4v2h-86v-2a4 4 0 0 1 4 -4z" fill="white"/><path d="M41 9v-5a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v5"/><path d="M74.25 94.5a6 6 0 0 0 5.95 -5.15l9.8 -69.85h-80l9.8 69.85a6 6 0 0 0 5.95 5.15z" fill="black"/><path d="M50 30v54" stroke-linecap="round"/><path d="M30 30l4 54" stroke-linecap="round"/><path d="M70 30l-4 54" stroke-linecap="round"/>`;

const faderInput = document.getElementById('fader-input') as HTMLInputElement;
faderInput.oninput = throttle(() => {
  console.log('Fader input changed:', faderInput.value);
  sendMessage({ type: 'f', l: parseFloat(faderInput.value) });
}, 100);

let populateItemModal: (
  rundown: Rundown,
  currentItem: number
) => void = () => {};

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
        const message: ServerMessage = JSON.parse(event.data);
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
          case 'rundown': {
            populateRundown(message.rundown, message.currentItem);
            populateItemModal(message.rundown, message.currentItem);
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

function populateRundown(rundown: Rundown, currentItem: number) {
  rundownEl.innerHTML = '';
  for (let i = 0; i < rundown.length; i++) {
    const item = rundown[i];
    const itemEl = document.createElement('div');
    itemEl.classList.add('rundown-item');
    if (i === currentItem) itemEl.classList.add('current');
    if (item.type === 'comic') {
      const nameEl = document.createElement('div');
      nameEl.classList.add('name');
      nameEl.textContent = item.name;
      itemEl.appendChild(nameEl);
      const socialEl = document.createElement('div');
      socialEl.classList.add('social');
      socialEl.textContent = item.social;
      itemEl.appendChild(socialEl);
      const timeEl = document.createElement('div');
      timeEl.classList.add('time');
      timeEl.textContent = minutesToTime(item.time);
      itemEl.appendChild(timeEl);
      if (item.bumperId && item.bumperTitle) {
        const bumperEl = document.createElement('div');
        bumperEl.classList.add('bumper');
        bumperEl.textContent = item.bumperTitle;
        itemEl.appendChild(bumperEl);
      }
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
      if (i === currentItem) return;
      makeActiveButton = document.createElement('button');
      makeActiveButton.id = 'make-active-button';
      makeActiveButton.textContent = `Make "${item.name}" Active Rundown Item`;
      makeActiveButton.onclick = () => {
        sendMessage({ type: 'set-rundown-item', item: i });
        if (makeActiveButton) {
          makeActiveButton.parentElement?.removeChild(makeActiveButton);
          makeActiveButton = null;
        }
      };
      rundownEl.appendChild(makeActiveButton);
    };
    function editItem() {
      const modal = displayModal();
      initItemEditModal(rundown, currentItem, i, modal);
    }
    itemEl.ondblclick = editItem;
    setLongPress(itemEl, editItem);
    rundownEl.appendChild(itemEl);
  }
  const currentRundownItem = rundown[currentItem];
  const buttonsEl = document.getElementById('buttons') as HTMLDivElement;
  switch (currentRundownItem.type) {
    case 'comic': {
      buttonsEl.innerHTML = '';
      if (currentRundownItem.bumperId) {
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
  if (currentItem < rundown.length - 1) {
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
  const item = rundown[itemno];
  switch (item.type) {
    case 'comic': {
      const nameDiv = document.createElement('div');
      nameDiv.textContent = 'Name:';
      const nameEl = document.createElement('input');
      nameEl.type = 'text';
      nameDiv.appendChild(nameEl);
      modal.appendChild(nameDiv);
      const socialDiv = document.createElement('div');
      socialDiv.textContent = 'Social:';
      const socialEl = document.createElement('input');
      socialEl.type = 'text';
      socialDiv.appendChild(socialEl);
      modal.appendChild(socialDiv);
      const timeDiv = document.createElement('div');
      timeDiv.textContent = 'Minutes:';
      const timeEl = document.createElement('input');
      timeEl.type = 'number';
      timeDiv.appendChild(timeEl);
      modal.appendChild(timeDiv);
      populateItemModal = (newRundown: Rundown) => {
        const item = newRundown[itemno];
        if (item.type !== 'comic' || newRundown.length !== rundown.length) {
          hideModal();
          return;
        }
        nameEl.value = item.name;
        socialEl.value = item.social;
        timeEl.value = item.time.toString();
      };
      break;
    }
    case 'preset': {
      const nameEl = document.createElement('input');
      nameEl.type = 'text';
      modal.appendChild(nameEl);
      populateItemModal = (newRundown: Rundown) => {
        const item = newRundown[itemno];
        if (item.type !== 'preset' || newRundown.length !== rundown.length) {
          hideModal();
          return;
        }
        nameEl.value = item.name;
      };
      break;
    }
  }
  populateItemModal(rundown, currentItem);
}

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

function displayModal(save?: () => void) {
  const modalContent = document.getElementById(
    'modal-content'
  ) as HTMLDivElement;
  modalContent.innerHTML = '';
  const modal = document.getElementById('modal') as HTMLDivElement;
  modal.style.display = 'flex';
  modal.onclick = (e) => {
    if (e.target === modal) hideModal();
  };

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
