import { slideInfo } from '../global-types';
import { sendServerMessage } from './http-server';
import { log } from './logger';
import { util } from './main';
import { WebSocket } from 'ws';

const pignage = {
  primary: {
    address: null as string | null,
    socket: null as WebSocket | null,
    groups: [] as FileGroup[],
    pagesDir: [] as PagesDir,
    activeSlide: null as string | [string, string] | null,
    playingGroup: null as string | null,
  },
  secondary: {
    address: null as string | null,
    socket: null as WebSocket | null,
    groups: [] as FileGroup[],
    pagesDir: [] as PagesDir,
    activeSlide: null as string | [string, string] | null,
    playingGroup: null as string | null,
  },
};

function getInfo(instance: keyof typeof pignage): slideInfo {
  return {
    groups: pignage[instance].groups.map((group) => {
      return {
        name: group.name,
        files: group.files.map((file) => file.name),
      };
    }),
    pagesDir: pignage[instance].pagesDir
      .filter((file) => {
        return file.isHtml;
      })
      .map((file) => file.name),
  };
}

export function getPignageInfo() {
  return {
    primary: getInfo('primary'),
    secondary: getInfo('secondary'),
  };
}

function repeater(instance: keyof typeof pignage) {
  const newAddress = util.getSettings().pignage[instance].address;
  if (
    newAddress &&
    (newAddress !== pignage[instance].address || !pignage[instance].socket)
  ) {
    if (pignage[instance].socket) {
      pignage[instance].socket.close();
      pignage[instance].socket = null;
      return;
    }
    pignage[instance].address = newAddress;
    const thisSocket = new WebSocket(`ws://${newAddress}/`);
    pignage[instance].socket = thisSocket;
    thisSocket.on('open', () => {
      console.log(`Connected to ${instance} Pignage server at ${newAddress}`);
    });
    thisSocket.on('close', () => {
      log('warn', `${instance} Pignage socket closed`);
      pignage[instance].socket = null;
    });
    thisSocket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as PignageServerMessage;
        switch (message.type) {
          case 'groups': {
            pignage[instance].groups = message.groups;
            sendServerMessage({
              type: 'pignage-info',
              ...getPignageInfo(),
            });
            break;
          }
          case 'pagesDir': {
            pignage[instance].pagesDir = message.files;
            sendServerMessage({
              type: 'pignage-info',
              ...getPignageInfo(),
            });
            break;
          }
          case 'activeSlide': {
            pignage[instance].activeSlide = message.slide;
            break;
          }
          case 'playingGroup': {
            pignage[instance].playingGroup = message.group;
            break;
          }
          default: {
            break;
          }
        }
      } catch {
        log(
          'error',
          `Error parsing message from ${instance} Pignage server: ${data.toString()}`
        );
      }
    });
  }
}

setInterval(() => {
  repeater('primary');
  repeater('secondary');
}, 1000);

export function setComicCard(name: string, social: string) {
  let args = '';
  if (name) args += `name=${encodeURIComponent(name)}`;
  if (social)
    args += (args ? '&' : '') + `social=${encodeURIComponent(social)}`;
  if (args) args = '?' + args;
  const newSlide = `card.html${args}`;
  if (pignage.primary.activeSlide !== newSlide) {
    sendMessage('primary', {
      type: 'activeSlide',
      slide: `card.html${args}`,
    });
  }
  if (pignage.secondary.activeSlide !== newSlide) {
    sendMessage('secondary', {
      type: 'activeSlide',
      slide: `card.html${args}`,
    });
  }
}

export function setSlide(slide: string | [string, string], instance: 'primary' | 'secondary') {  
  if (
    typeof slide === 'string' &&
    pignage[instance].groups.map((group) => group.name).includes(slide as string)
  ) {
    if (pignage[instance].playingGroup !== slide) {
      sendMessage(instance, {
        type: 'playGroup',
        group: slide,
      });
      pignage[instance].playingGroup = slide as string;
    }
  } else if (
    !pignage[instance].activeSlide ||
    !slidesAreEqual(slide, pignage[instance].activeSlide)
  ) {
    sendMessage('primary', {
      type: 'activeSlide',
      slide: slide,
    });
  }
}

function slidesAreEqual(
  slide1: string | [string, string],
  slide2: string | [string, string]
): boolean {
  if (typeof slide1 === 'string' && typeof slide2 === 'string') {
    return slide1 === slide2;
  } else if (Array.isArray(slide1) && Array.isArray(slide2)) {
    return slide1[0] === slide2[0] && slide1[1] === slide2[1];
  }
  return false;
}

function sendMessage(
  instance: 'primary' | 'secondary',
  message: PignageClientMessage
) {
  const socket = pignage[instance].socket;
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  } else {
    const address = pignage[instance].address;
    if (address) log('warn', `Pignage socket not open, can't send message`);
  }
}

type ServerMessageGroups = { type: 'groups'; groups: FileGroup[] };
type ServerMessageActiveSlide = {
  type: 'activeSlide';
  slide: [string, string] | string;
};
type ServerMessagePlayingGroup = {
  type: 'playingGroup';
  group: string | null;
};
type ServerIpAddress = {
  type: 'ipAddress';
  address: string;
};
type ServerMessageCanReboot = {
  type: 'canReboot';
  canReboot: boolean;
};
type ServerMessagePagesDir = {
  type: 'pagesDir';
  files: PagesDir;
};

type PignageServerMessage =
  | ServerMessageGroups
  | ServerMessageActiveSlide
  | ServerMessagePlayingGroup
  | ServerIpAddress
  | ServerMessageCanReboot
  | ServerMessagePagesDir;

type ClientMessageActiveSlide = ServerMessageActiveSlide;
type ClientMessagePlayGroup = {
  type: 'playGroup';
  group: string | null;
};
type ClientMessageRenameGroup = {
  type: 'renameGroup';
  oldName: string;
  newName: string;
};
type ClientMessageSetSlideDelay = {
  type: 'setSlideDelay';
  group: string;
  delay: number;
};
type ClientMessageAddGroup = {
  type: 'addGroup';
  name: string;
};
type ClientMessageRemoveSlide = {
  type: 'removeSlide';
  group: string;
  slide: string;
};
type ClientMessageRemoveGroup = {
  type: 'removeGroup';
  group: string;
};
type ClientMessageShowColor = { type: 'showColor'; color: string };
type ClientMessageReboot = { type: 'reboot' };
type ClientMessageRemovePagesFile = {
  type: 'removePagesFile';
  index: number;
  filename: string;
};

type PignageClientMessage =
  | ClientMessageActiveSlide
  | ClientMessagePlayGroup
  | ClientMessageRenameGroup
  | ClientMessageSetSlideDelay
  | ClientMessageAddGroup
  | ClientMessageRemoveSlide
  | ClientMessageRemoveGroup
  | ClientMessageShowColor
  | ClientMessageReboot
  | ClientMessageRemovePagesFile;

type PagesDir = {
  name: string;
  path: string;
  isHtml: boolean;
}[];

type FileGroup = {
  name: string;
  files: file[];
  thumbnail: string;
  thumbnailWidth: number;
  slideDelay: number;
};

type file = {
  name: string;
  url: string;
};
