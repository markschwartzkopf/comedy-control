import { slideInfo } from '../global-types';
import { sendServerMessage } from './http-server';
import { log } from './logger';
import { util } from './main';
import { WebSocket } from 'ws';

let primaryAddress: string | null = null;
let primarySocket: WebSocket | null = null;
let primaryGroups: FileGroup[] = [];
let primaryPagesDir: PagesDir = [];
let primaryActiveSlide: string | [string, string] | null = null;
let primaryPlayingGroup: string | null = null;

function getPrimaryInfo(): slideInfo {
  return {
    groups: primaryGroups.map((group) => {
      return {
        name: group.name,
        files: group.files.map((file) => file.name),
      };
    }),
    pagesDir: primaryPagesDir
      .filter((file) => {
        return file.isHtml;
      })
      .map((file) => file.name),
  };
}

let secondaryAddress: string | null = null;
let secondarySocket: WebSocket | null = null;
let secondaryGroups: FileGroup[] = [];
let secondaryPagesDir: PagesDir = [];
let secondaryActiveSlide: string | [string, string] | null = null;
let secondaryPlayingGroup: string | null = null;

function getSecondaryInfo(): slideInfo {
  return {
    groups: secondaryGroups.map((group) => {
      return {
        name: group.name,
        files: group.files.map((file) => file.name),
      };
    }),
    pagesDir: secondaryPagesDir
      .filter((file) => {
        return file.isHtml;
      })
      .map((file) => file.name),
  };
}

export function getPignageInfo() {
  return {
    primary: getPrimaryInfo(),
    secondary: getSecondaryInfo(),
  };
}

setInterval(() => {
  const newPrimaryAddress = util.getSettings().primaryPignageAddress;
  if (
    newPrimaryAddress &&
    (newPrimaryAddress !== primaryAddress || !primarySocket)
  ) {
    if (primarySocket) {
      primarySocket.close();
      primarySocket = null;
      return;
    }
    primaryAddress = newPrimaryAddress;
    const thisSocket = new WebSocket(`ws://${newPrimaryAddress}/`);
    primarySocket = thisSocket;
    thisSocket.on('open', () => {
      console.log('Connected to primary Pignage server at', newPrimaryAddress);
    });
    thisSocket.on('close', () => {
      log('warn', 'Primary Pignage socket closed');
      primarySocket = null;
    });
    thisSocket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString()) as PignageServerMessage;
        switch (message.type) {
          case 'groups': {
            primaryGroups = message.groups;
            sendServerMessage({
              type: 'pignage-info',
              ...getPignageInfo(),
            });
            break;
          }
          case 'pagesDir': {
            primaryPagesDir = message.files;
            sendServerMessage({
              type: 'pignage-info',
              ...getPignageInfo(),
            });
            break;
          }
          case 'activeSlide': {
            primaryActiveSlide = message.slide;
            break;
          }
          case 'playingGroup': {
            primaryPlayingGroup = message.group;
            break;
          }
          default: {
            break;
          }
        }
      } catch {
        log(
          'error',
          `Error parsing message from primary Pignage server: ${data.toString()}`
        );
      }
    });
  }
}, 1000);

export function setComicCard(name: string, social: string) {
  let args = '';
  if (name) args += `name=${encodeURIComponent(name)}`;
  if (social)
    args += (args ? '&' : '') + `social=${encodeURIComponent(social)}`;
  if (args) args = '?' + args;
  const newSlide = `card.html${args}`;
  if (primaryActiveSlide !== newSlide) {
    sendMessage('primary', {
      type: 'activeSlide',
      slide: `card.html${args}`,
    });
  }
}

export function setPrimarySlide(slide: string | [string, string]) {
  if (
    typeof slide === 'string' &&
    primaryGroups.map((group) => group.name).includes(slide as string)
  ) {
    if (primaryPlayingGroup !== slide) {
      sendMessage('primary', {
        type: 'playGroup',
        group: slide,
      });
      primaryPlayingGroup = slide as string;
    }
  } else if (
    !primaryActiveSlide ||
    !slidesAreEqual(slide, primaryActiveSlide)
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
  pignage: 'primary' | 'secondary',
  message: PignageClientMessage
) {
  const socket = pignage === 'primary' ? primarySocket : secondarySocket;
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  } else {
    const address = pignage === 'primary' ? primaryAddress : secondaryAddress;
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
