import { RundownItem, RundownItemComicSet } from '../global-types';
import {
  ClientMessage,
  LogData,
  LogType,
  Rundown,
  ServerMessage,
} from '../global-types';

const faderInput = document.getElementById('fader-input') as HTMLInputElement;
faderInput.oninput = throttle(() => {
  console.log('Fader input changed:', faderInput.value);
  sendMessage({ type: 'f', l: parseFloat(faderInput.value) });
}, 100);


let localRundown: Rundown = [];
let localCurrentItem = 0;

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
          case 'settings': {
            localRundown = message.settings.rundown;
            localCurrentItem = message.settings.currentRundownItem;            
            populateRundown();
            populateItemModal();
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
  }
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
        setSaveButtonState();
        console.log('Name changed:', nameEl.value);
      }
      nameDiv.appendChild(nameEl);
      modal.appendChild(nameDiv);
      const socialDiv = document.createElement('div');
      socialDiv.textContent = 'Social:';
      const socialEl = document.createElement('input');
      socialEl.type = 'text';
      socialEl.oninput = () => {
        comicItem.social = socialEl.value;
        setSaveButtonState();
        console.log('Social changed:', socialEl.value);
      }
      socialDiv.appendChild(socialEl);
      modal.appendChild(socialDiv);
      const timeDiv = document.createElement('div');
      timeDiv.textContent = 'Minutes:';
      const timeEl = document.createElement('input');
      timeEl.type = 'number';
      timeEl.oninput = () => {
        comicItem.time = parseFloat(timeEl.value);
        setSaveButtonState();
        console.log('Time changed:', timeEl.value);
      }
      timeDiv.appendChild(timeEl);
      modal.appendChild(timeDiv);
      populateItemModal = () => {
        const item = localRundown[itemno];
        if (item.type !== 'comic' || localRundown.length !== rundown.length) {
          hideModal();
          return;
        }
        console.log('change')
        comicItem = JSON.parse(JSON.stringify(rundown[itemno])) as RundownItemComicSet;
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
