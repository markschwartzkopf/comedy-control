import { Rundown } from '../global-types';
import { sendServerMessage } from './http-server';
import { log } from './logger';

let musicChannel = 15;
let xairAddress = '172.19.1.102';
let rundown: Rundown = [
  {
    type: 'preset',
    name: 'Pre-show',
  },
  {
    type: 'comic',
    name: 'Hosty Hosterson',
    social: '@hosterson_with_the_mosterson',
    bumperTitle: 'Buddy Holly',
    bumperId: 'spotify_id_buddy_holly',
    time: 5,
  },
  {
    type: 'comic',
    name: 'Funny McFunnyFace',
    social: '@funny_face',
    bumperTitle: 'Boo Thang',
    bumperId: 'spotify_id_boo_thang',
    time: 15,
  },
  {
    type: 'comic',
    name: 'Big Chungus',
    social: '@big_chungus',
    bumperTitle: null,
    bumperId: null,
    time: 45,
  },
  {
    type: 'preset',
    name: 'Post-show',
  },
];
let currentRundownItem = 0;
let govees: { [k: string]: string } = { test: '172.19.1.42' };

musicChannel = 9;

export function getMusicChannel() {
  return musicChannel;
}

export function getXairAddress() {
  return xairAddress;
}

export function getRundown(): Rundown {
  return JSON.parse(JSON.stringify(rundown));
}

export function getCurrentRundownItem() {
  return currentRundownItem;
}

export function setCurrentRundownItem(item: number) {
  if (item === currentRundownItem) return;
  if (item < 0 || item >= rundown.length) {
    log('error', `Invalid rundown item: ${item}`);
    return;
  }
  currentRundownItem = item;
  sendServerMessage({
    type: 'rundown',
    rundown: rundown,
    currentItem: currentRundownItem,
  });
}

export function getGovees() {
  return govees;
}
