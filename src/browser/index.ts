import {
  MinQLabCue,
  QLabCue,
  RundownItem,
  RundownItemComicSet,
  RundownItemPreset,
  SpotifyTrack,
} from '../global-types';
import {
  ClientMessage,
  LogData,
  LogType,
  Rundown,
  ServerMessage,
} from '../global-types';
const svgNS = 'http://www.w3.org/2000/svg'; // SVG namespace

const svgIcons = {
  trashSvg: `<path stroke="currentColor" stroke-width="0.8" fill="currentColor" d="M21.36 2.16a.96.96 0 0 1 .96.96v.48H1.68v-.48a.96.96 0 0 1 .96-.96zM9.84 2.16V.96a.24.24 0 0 1 .24-.24h3.84a.24.24 0 0 1 .24.24v1.2"/><path stroke="currentColor" stroke-width="0.8" fill="none" d="M17.82 22.68a1.44 1.44 0 0 0 1.43-1.24L21.6 4.68H2.4l2.35 16.76a1.44 1.44 0 0 0 1.43 1.24z"/><path stroke="currentColor" stroke-width="0.8" stroke-linecap="round" d="M12 7.2v12.96M7.2 7.2l.96 12.96M16.8 7.2l-.96 12.96"/>`,
  upSvg: `<polygon fill="currentColor" points="12 0 24 24 0 24"/>`,
  downSvg: `<polygon fill="currentColor" points="12 24 24 0 0 0"/>`,
  add: `<rect x="0.5" y="0.5" width="23" height="23" fill="none" stroke="currentColor" stroke-width="0.8" rx="4" ry="4"/><path d="M5 12h14M12 5v14" stroke="currentColor" stroke-linecap="round" stroke-width="2"/>`,
  remove: `<rect x="0.5" y="0.5" width="23" height="23" fill="none" stroke="currentColor" stroke-width="0.8" rx="4" ry="4"/><path d="M5 12h14" stroke="currentColor" stroke-linecap="round" stroke-width="2"/>`,
  edit: `<path fill="currentColor" d="m14.92 4.04 4.88 4.88L7.45 21.28 2.57 16.4 14.92 4.04zm8.59-1.17L21.33.69a2.16 2.16 0 0 0-3.05 0l-2.09 2.08 4.88 4.89 2.44-2.44c.65-.65.65-1.7 0-2.35zM0 23.26c-.09.4.28.76.68.66l5.43-1.32-4.87-4.88L0 23.26z"/>`,
} as const;

function getSvgIcon(
  name: keyof typeof svgIcons,
  options: { [key: string]: string } = {}
) {
  const icon = document.createElementNS(svgNS, 'svg');
  icon.classList.add('svg-icon');
  icon.setAttribute('viewBox', '0 0 24 24');
  Object.entries(options).forEach(([key, value]) => {
    icon.setAttribute(key, value);
  });
  icon.innerHTML = svgIcons[name];
  return icon;
}

let handleTracks: ((tracks: SpotifyTrack[]) => void) | null = null;
let handleQlab: ((cues: QLabCue[]) => void) | null = null;
const faderInput = document.getElementById('fader-input') as HTMLInputElement;
faderInput.oninput = throttle(() => {
  sendMessage({ type: 'f', l: parseFloat(faderInput.value) });
}, 100);

let activeTimeDiv: HTMLDivElement | null = null;

const warningsDiv = document.getElementById('warnings') as HTMLDivElement;
const spotifyWarning = document.createElement('a');
spotifyWarning.href = 'settings.html';
spotifyWarning.target = '_blank';
spotifyWarning.textContent = 'Spotify not connected';

let localRundown: Rundown = [];
let localCurrentItem = 0;
let spotifyConnected = false;
let timerState: 'finished' | 'ready' | 'paused' | 'running' = 'ready';
let lastTimerTime: string | null = null;
let editMode = false;
const editToggle = document.getElementById('edit-toggle') as HTMLInputElement;
editToggle.onclick = () => {
  editMode = editToggle.checked;
  populateRundown();
};

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
            const height = Math.round((1 - Math.pow(message.l + 1, 3.5)) * 100);
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
          case 'timer': {
            if (typeof message.state === 'number') {
              let seconds = message.state;
              const minutes = Math.floor(seconds / 60);
              seconds -= minutes * 60;
              const timeString =
                minutes.toString() + ':' + seconds.toString().padStart(2, '0');
              if (activeTimeDiv) {
                activeTimeDiv.textContent = timeString;
                lastTimerTime = timeString;
              }
            }
            const newTimerState =
              typeof message.state === 'number' ? 'running' : message.state;
            if (newTimerState !== timerState) {
              timerState = newTimerState;
              populateRundown();
            }
            break;
          }
          case 'qlab-cues': {
            if (handleQlab) handleQlab(message.cues);
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
  activeTimeDiv = null;
  for (let i = 0; i < localRundown.length; i++) {
    const item = localRundown[i];
    const itemEl = document.createElement('div');
    itemEl.classList.add('rundown-item');
    if (i === localCurrentItem) itemEl.classList.add('current');
    const isActive = i === localCurrentItem;
    const nameEl = document.createElement('div');
    nameEl.classList.add('name');
    nameEl.textContent = item.name;
    itemEl.appendChild(nameEl);
    if (item.type === 'comic' && !editMode) {
      const socialEl = document.createElement('div');
      socialEl.classList.add('social');
      socialEl.textContent = item.social;
      itemEl.appendChild(socialEl);
      if (spotifyConnected) itemEl.appendChild(createTrackDiv(item.bumper));
      const timeEl = document.createElement('div');
      timeEl.classList.add('time');
      let timeString = minutesToTime(item.time);
      if (timerState !== 'ready' && isActive) {
        timeString = lastTimerTime || timeString;
      }
      timeEl.textContent = timeString;
      itemEl.appendChild(timeEl);
      if (isActive) activeTimeDiv = timeEl;
    }
    if (editMode) {
      const trashIcon = getSvgIcon('trashSvg');
      trashIcon.onclick = (e) => {
        e.stopPropagation();
        const newCurrentRundownItem =
          localCurrentItem <= i ? localCurrentItem : localCurrentItem - 1;
        const newRundown = JSON.parse(JSON.stringify(localRundown)) as Rundown;
        newRundown.splice(i, 1);
        sendMessage({
          type: 'settings',
          settings: {
            rundown: newRundown,
            currentRundownItem: newCurrentRundownItem,
          },
        });
      };
      itemEl.appendChild(trashIcon);
      const upIcon = getSvgIcon('upSvg');
      if (i === 0) upIcon.classList.add('disabled');
      upIcon.onclick = (e) => {
        e.stopPropagation();
        const newRundown = JSON.parse(JSON.stringify(localRundown)) as Rundown;
        const newCurrentRundownItem =
          localCurrentItem === i - 1
            ? localCurrentItem + 1
            : localCurrentItem === i
            ? i - 1
            : localCurrentItem;
        const itemToMove = newRundown.splice(i, 1)[0];
        newRundown.splice(i - 1, 0, itemToMove);
        sendMessage({
          type: 'settings',
          settings: {
            rundown: newRundown,
            currentRundownItem: newCurrentRundownItem,
          },
        });
      };
      itemEl.appendChild(upIcon);
      const downIcon = getSvgIcon('downSvg');
      if (i === localRundown.length - 1) downIcon.classList.add('disabled');
      downIcon.onclick = (e) => {
        e.stopPropagation();
        const newRundown = JSON.parse(JSON.stringify(localRundown)) as Rundown;
        const newCurrentRundownItem =
          localCurrentItem === i + 1
            ? localCurrentItem - 1
            : localCurrentItem === i
            ? i + 1
            : localCurrentItem;
        const itemToMove = newRundown.splice(i, 1)[0];
        newRundown.splice(i + 1, 0, itemToMove);
        sendMessage({
          type: 'settings',
          settings: {
            rundown: newRundown,
            currentRundownItem: newCurrentRundownItem,
          },
        });
      };
      itemEl.appendChild(downIcon);
    }
    itemEl.onclick = () => {
      if (editMode) {
        editItem();
        return;
      }
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
        if (item.type === 'comic') {
          sendMessage({
            type: 'timer',
            command: 'reset',
            time: item.time,
          });
        }
        if (makeActiveButton) {
          makeActiveButton.parentElement?.removeChild(makeActiveButton);
          makeActiveButton = null;
        }
      };
      rundownEl.appendChild(makeActiveButton);
    };
    function editItem() {
      const modal = displayModal();
      initItemEditModal(item, modal, (item) => {
        const newRundown = JSON.parse(JSON.stringify(localRundown)) as Rundown;
        newRundown[i] = item;
        sendMessage({ type: 'settings', settings: { rundown: newRundown } });
      });
    }
    itemEl.ondblclick = editItem;
    setLongPress(itemEl, editItem);
    rundownEl.appendChild(itemEl);
  }
  const currentRundownItem = localRundown[localCurrentItem];
  const buttonsEl = document.getElementById('buttons') as HTMLDivElement;
  buttonsEl.innerHTML = '';
  if (editMode) {
    function editNewItem(item: RundownItem) {
      const modal = displayModal();
      initItemEditModal(item, modal, (item) => {
        const newRundown = JSON.parse(JSON.stringify(localRundown)) as Rundown;
        newRundown.push(item);
        sendMessage({ type: 'settings', settings: { rundown: newRundown } });
        hideModal();
      });
    }
    const addItemEl = document.createElement('div');
    const addComicButton = document.createElement('button');
    addComicButton.textContent = 'Add Comic';
    addComicButton.onclick = () => {
      editNewItem({
        type: 'comic',
        name: '',
        social: null,
        bumper: null,
        time: 10,
      });
    };
    addItemEl.appendChild(addComicButton);
    const addPresetButton = document.createElement('button');
    addPresetButton.id = 'add-item-button';
    addPresetButton.textContent = 'Add Preset';
    addPresetButton.onclick = () => {
      editNewItem({
        type: 'preset',
        name: '',
        cueLabCues: [],
      });
    };
    addItemEl.appendChild(addPresetButton);
    buttonsEl.appendChild(addItemEl);
    return;
  } else
    switch (currentRundownItem.type) {
      case 'comic': {
        if (currentRundownItem.bumper) {
          const trackId = currentRundownItem.bumper.id;
          const bumperPLayEl = document.createElement('button');
          bumperPLayEl.textContent = 'Play Bumper';
          buttonsEl.appendChild(bumperPLayEl);
          bumperPLayEl.onclick = () => {
            sendMessage({
              type: 'spotify-play',
              id: trackId,
            });
          };
        }
        const bumperStopEl = document.createElement('button');
        bumperStopEl.textContent = 'Stop Spotify';
        bumperStopEl.onclick = () => {
          sendMessage({ type: 'spotify-pause' });
        };
        buttonsEl.appendChild(bumperStopEl);
        switch (timerState) {
          case 'ready': {
            const timerStartEl = document.createElement('button');
            timerStartEl.textContent = 'Start Timer';
            timerStartEl.onclick = () => {
              sendMessage({ type: 'timer', command: 'start' });
            };
            buttonsEl.appendChild(timerStartEl);
            break;
          }
          case 'running': {
            const timerStopEl = document.createElement('button');
            timerStopEl.textContent = 'Pause Timer';
            timerStopEl.onclick = () => {
              sendMessage({ type: 'timer', command: 'pause' });
            };
            buttonsEl.appendChild(timerStopEl);
            break;
          }
          case 'paused': {
            const timerResumeEl = document.createElement('button');
            timerResumeEl.textContent = 'Resume Timer';
            timerResumeEl.onclick = () => {
              sendMessage({ type: 'timer', command: 'start' });
            };
            buttonsEl.appendChild(timerResumeEl);
            const timerResetEl = document.createElement('button');
            timerResetEl.textContent = 'Reset Timer';
            timerResetEl.onclick = () => {
              sendMessage({ type: 'timer', command: 'reset' });
            };
            buttonsEl.appendChild(timerResetEl);
            break;
          }
          case 'finished': {
            const timerResetEl = document.createElement('button');
            timerResetEl.textContent = 'Reset Timer';
            timerResetEl.onclick = () => {
              sendMessage({ type: 'timer', command: 'reset' });
            };
            buttonsEl.appendChild(timerResetEl);
            break;
          }
        }
        break;
      }
      case 'preset': {
        const presetFireEl = document.createElement('button');
        presetFireEl.textContent = 'Fire Preset';
        buttonsEl.appendChild(presetFireEl);
        break;
      }
    }
  if (localCurrentItem < localRundown.length - 1) {
    const nextEl = document.createElement('button');
    nextEl.textContent = 'Go to Next';
    nextEl.onclick = () => {
      const nextItem = localRundown[localCurrentItem + 1];
      if (!nextItem) {
        log('error', 'Clicked next button that should not exist');
        return;
      }
      if (nextItem.type === 'comic') {
        sendMessage({
          type: 'timer',
          command: 'reset',
          time: nextItem.time,
        });
      }
      sendMessage({
        type: 'settings',
        settings: { currentRundownItem: localCurrentItem + 1 },
      });
    };
    buttonsEl.appendChild(nextEl);
  }
}

function initItemEditModal(
  item: RundownItem,
  modal: HTMLDivElement,
  cb: (rundownItem: RundownItem) => void
) {
  let workingItem = JSON.parse(JSON.stringify(item)) as RundownItem;
  function setSaveButtonState() {
    if (JSON.stringify(item) !== JSON.stringify(workingItem)) {
      modalSaveButton.style.display = '';
    } else {
      modalSaveButton.style.display = 'none';
    }
  }
  modalSaveButton.onclick = () => {
    cb(workingItem);
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
      };
      socialDiv.appendChild(socialEl);
      modal.appendChild(socialDiv);
      const bumperDiv = document.createElement('div');
      bumperDiv.textContent = 'Bumper:';
      const pickBumper = document.createElement('button');
      pickBumper.appendChild(createTrackDiv(comicItem.bumper));
      pickBumper.onclick = () => {
        const modalNodes: Node[] = [];
        modal.childNodes.forEach((node) => {
          modalNodes.push(node);
        });
        initBumperPickModal(comicItem, (track) => {
          modalCancelButton.onclick = hideModal;
          if (track !== undefined) {
            comicItem.bumper = track;
            pickBumper.innerHTML = '';
            pickBumper.appendChild(createTrackDiv(track));
          }
          workingItem = comicItem;
          modal.innerHTML = '';
          modal.append(...modalNodes);
          setSaveButtonState();
        });
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
      nameEl.value = comicItem.name;
      socialEl.value = comicItem.social || '';
      timeEl.value = comicItem.time.toString();
      break;
    }
    case 'preset': {
      let presetItem = workingItem as RundownItemPreset;
      const nameEl = document.createElement('input');
      nameEl.type = 'text';
      modal.appendChild(nameEl);
      nameEl.value = item.name;
      const qlabDiv = document.createElement('div');
      const qlabHeader = document.createElement('div');
      qlabHeader.textContent = `QLab Cues:`;
      const editIcon = document.createElement('input');
      editIcon.type = 'checkbox';
      editIcon.style.fontSize = '0.3em';
      editIcon.style.float = 'right';
      qlabHeader.appendChild(editIcon);
      qlabDiv.appendChild(qlabHeader);
      const qlabListDiv = document.createElement('div');
      function updateQlabList() {
        if (editIcon.checked) {
          function populateDetails(
            el: HTMLElement,
            cues: QLabCue[],
            level: number
          ): boolean {
            if (level === 0 && cues.length === 1) {
              return populateDetails(el, cues[0].cues, level + 1);
            }
            let rtn = false;
            cues.forEach((cue) => {
              let cueEl: HTMLElement;
              if (cue.cues.length) {
                const cueDetails = document.createElement('details');
                cueEl = document.createElement('summary');
                cueDetails.appendChild(cueEl);
                rtn = populateDetails(cueDetails, cue.cues, level + 1) || rtn;
                el.appendChild(cueDetails);
              } else {
                cueEl = document.createElement('div');
                el.appendChild(cueEl);
              }
              cueEl.classList.add('qlab-cue');
              cueEl.textContent = cue.listName;              
              let btn: SVGSVGElement;
              if (presetItem.cueLabCues.map((cue) => cue.uniqueID).includes(cue.uniqueID)) {
                btn = getSvgIcon('remove');
                cueEl.classList.add('selected');
                rtn = true;
              } else {
                btn = getSvgIcon('add');
              }
              btn.style.height = '1em';
              btn.style.margin = '0 0 0 1em';
              btn.style.float = 'right';
              btn.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                const newCues = [...presetItem.cueLabCues];
                if (newCues.map((cue) => cue.uniqueID).includes(cue.uniqueID)) {
                  newCues.splice(newCues.indexOf(cue), 1);
                  cueEl.classList.remove('selected');
                  btn.innerHTML = getSvgIcon('add').innerHTML;
                } else {
                  newCues.push(cue);
                  btn.innerHTML = getSvgIcon('remove').innerHTML;
                  cueEl.classList.add('selected');
                }
                presetItem.cueLabCues = newCues;
                workingItem = presetItem;
                setSaveButtonState();
              };
              cueEl.appendChild(btn);
            });
            if (rtn && 'open' in el) el.open = true;
            return rtn;
          }
          handleQlab = (cues: QLabCue[]) => {
            qlabListDiv.innerHTML = '';
            populateDetails(qlabListDiv, cues, 0);        
            handleQlab = null;
          };
          sendMessage({ type: 'get-qlab-cues' });
        } else {
          if (presetItem.cueLabCues.length) {
            qlabListDiv.innerHTML = presetItem.cueLabCues.map((cue) => cue.listName).join(', ');
          } else {
            qlabListDiv.innerHTML = 'none';
          }
        }
      }
      editIcon.onchange = updateQlabList;
      updateQlabList();
      qlabDiv.appendChild(qlabListDiv);
      modal.appendChild(qlabDiv);
      break;
    }
  }
}

function initBumperPickModal(
  item: RundownItem,
  cb: (track: SpotifyTrack | null | undefined) => void
) {
  const modal = displayModal();
  modal.style.display = 'flex';
  modal.style.flexDirection = 'column';
  modalCancelButton.onclick = () => {
    const modal = displayModal();
    initItemEditModal(item, modal, () => {
      cb(undefined);
    });
  };
  const trackListDiv = document.createElement('div');
  trackListDiv.classList.add('tracklist');
  modal.appendChild(trackListDiv);
  handleTracks = (tracksIn: SpotifyTrack[]) => {
    const tracks = [...tracksIn, null];
    if (!modal.contains(trackListDiv)) {
      console.log('Song select modal no longer active, resetting handleTracks');
      handleTracks = null;
      return;
    }
    trackListDiv.innerHTML = '';
    tracks.forEach((track) => {
      const trackDiv = createTrackDiv(track);
      trackDiv.onclick = () => {
        cb(track);
      };
      trackListDiv.appendChild(trackDiv);
    });
  };
  const searchDiv = document.createElement('div');
  searchDiv.textContent = 'Search:';
  const searchEl = document.createElement('input');
  searchEl.type = 'text';
  searchEl.onkeyup = (e) => {
    if (e.key === 'Enter' || !searchEl.value) {
      if (!searchEl.value) {
        sendMessage({ type: 'spotify-search' });
        return;
      } else
        sendMessage({
          type: 'spotify-search',
          query: searchEl.value,
        });
    }
  };
  searchDiv.appendChild(searchEl);
  modal.appendChild(searchDiv);
  sendMessage({ type: 'spotify-search' });
}

function createTrackDiv(
  track: {
    id: string;
    name: string;
    artist: string;
    album?: string;
    duration_ms?: number;
    popularity?: number;
    art: string;
  } | null
) {
  const trackDiv = document.createElement('div');
  trackDiv.classList.add('track');
  if (track) {
    const artEl = document.createElement('img');
    artEl.classList.add('art');
    artEl.src = track.art;
    trackDiv.appendChild(artEl);
  } else {
    const artEl = document.createElement('div');
    artEl.classList.add('art');
    trackDiv.appendChild(artEl);
  }
  const infoSpan = document.createElement('span');
  const nameEl = document.createElement('div');
  nameEl.classList.add('name');
  nameEl.textContent = track ? track.name : 'No track';
  infoSpan.appendChild(nameEl);
  const artistEl = document.createElement('div');
  artistEl.classList.add('artist');
  artistEl.textContent = track ? track.artist : '';
  infoSpan.appendChild(artistEl);
  trackDiv.appendChild(infoSpan);
  if (track && track.album && track.duration_ms && track.popularity)
    trackDiv.title = `Album: ${track.album}\nDuration: ${msToTimeString(
      track.duration_ms
    )}\nPopularity: ${track.popularity}%`;
  return trackDiv;
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
  modalContent.style.display = '';
  const modal = document.getElementById('modal') as HTMLDivElement;
  modal.style.display = 'flex';
  modal.onclick = (e) => {
    if (e.target === modal) hideModal();
  };
  modalCancelButton.onclick = hideModal;
  return modalContent;
}

function hideModal() {
  (document.getElementById('modal') as HTMLDivElement).style.display = 'none';
  handleTracks = null;
  handleQlab = null;
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
