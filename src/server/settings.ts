import fs from 'fs';
import path from 'path';

import {
  DeepPartial,
  RundownItem,
  RundownItemComicSet,
  Settings,
} from '../global-types';
import { sendServerMessage } from './http-server';
import { log } from './logger';
import { util } from './main';
import { hasPropertyWithType } from './utils';
import { connectXair } from './xair';
import { setComicCard, setSlide } from './pignage';

let settings: Settings = {
  musicChannel: null,
  xairAddress: null,
  timerAddress: null,
  qlabAddress: null,
  pignage: {
    primary: {
      address: null,
    },
    secondary: {
      address: null,
    },
  },
  rundown: [],
  currentRundownItem: 0,
  govees: { test: '172.19.1.42' },
  spotify: {
    clientId: null,
    clientSecret: null,
    refreshToken: null,
    accessToken: null,
    tokenExpiration: null,
    redirectUri: '',
    defaultPlaylist: null,
    user: {
      id: null,
      name: null,
    },
  },
};
const settingsFile = path.join(__dirname, '..', '..', 'settings.json');
const oldSettingsFile = path.join(__dirname, '..', '..', 'settings.json.bad');

export function initializeData() {
  return fs.promises
    .readFile(settingsFile)
    .then((data) => {
      log('info', 'Reading settings file');
      return new Promise<void>((resolve, reject) => {
        try {
          const newSettings = JSON.parse(data.toString());
          if (isPartialSettings(newSettings)) {
            setSettings(newSettings);
            resolve();
          } else {
            log('error', 'Bad settings file format');
            reject(`Bad settings file format`);
          }
        } catch (err) {
          log('error', 'Error parsing settings file');
          reject(err);
        }
      });
    })
    .catch(async () => {
      log('warn', 'creating settings file');
      fs.promises
        .access(settingsFile)
        .then(() => {
          log(
            'info',
            'Old settings file exists, but failed. Backing it up to settings.json.bad'
          );
          return fs.promises
            .copyFile(settingsFile, oldSettingsFile)
            .catch((err) => {
              log('error', `Error backing up old settings file: ${err}`);
            });
        })
        .catch(() => {
          //old file did not exist. We don't care
        })
        .finally(() => {
          return saveSettings();
        })
        .catch((err) => {
          log('error', `Error saving new settings file: ${err}`);
        });
    })
    .catch((err) => {
      log('error', `Error initializing settings: ${err}`);
    });
}

function saveSettings() {
  return fs.promises.writeFile(settingsFile, JSON.stringify(settings));
}

function getSettings() {
  return JSON.parse(JSON.stringify(settings)) as Settings;
}

function setSettings(newSettings: DeepPartial<Settings>) {
  const oldMixerAddress = settings.xairAddress;
  updateObjectWithPartial(settings, newSettings);
  const currentItem = settings.rundown[settings.currentRundownItem];
  if (currentItem && currentItem.type === 'comic') {
    setComicCard(currentItem.name, currentItem.social || '');
  } else {
    if (currentItem && currentItem.slide.primary) {
      setSlide(currentItem.slide.primary, 'primary');
    }
    if (currentItem && currentItem.slide.secondary) {
      setSlide(currentItem.slide.secondary, 'secondary');
    }
  }
  if (oldMixerAddress !== settings.xairAddress) {
    log('info', `Xair address changed to ${newSettings.xairAddress}`);
    connectXair();
  }
  saveSettings().catch((err) => {
    log('error', `Error saving settings: ${err}`);
  });
  sendServerMessage({
    type: 'settings',
    settings: getSettings(),
  });
}
util.setSettings = setSettings;
util.getSettings = getSettings;

function updateObjectWithPartial<T>(original: T, partial: DeepPartial<T>) {
  Object.entries(partial).forEach(([key, value]) => {
    const typedKey = key as keyof T;
    const originalValue = original[typedKey];
    const typedValue = value as typeof originalValue;
    if (typedValue !== undefined) {
      if (
        typeof typedValue === 'object' &&
        typedValue !== null &&
        !(typedValue instanceof Array)
      ) {
        if (
          originalValue === undefined ||
          (originalValue === null && typedValue)
        ) {
          original[typedKey] = typedValue;
        } else updateObjectWithPartial(original[typedKey], typedValue);
      } else {
        if (
          typedValue instanceof Array &&
          originalValue instanceof Array &&
          originalValue.length === typedValue.length
        ) {
          updateArrayWithPartial(originalValue, typedValue);
        } else original[typedKey] = typedValue;
      }
    }
  });
}

function updateArrayWithPartial<T>(original: T[], partial: DeepPartial<T>[]) {
  partial.forEach((value, index) => {
    if (
      typeof value === 'object' &&
      value !== null &&
      !(value instanceof Array)
    ) {
      updateObjectWithPartial(original[index], value);
    } else {
      original[index] = value as T;
    }
  });
}

const grandparentDir = path.dirname(path.dirname(__dirname));
const filePath = path.join(grandparentDir, 'spotify-info.json');
fs.promises
  .readFile(filePath, 'utf-8')
  .then((data) => {
    try {
      const parsedData = JSON.parse(data);
      if (
        typeof parsedData !== 'object' ||
        parsedData === null ||
        !('id' in parsedData) ||
        !('secret' in parsedData) ||
        typeof parsedData.id !== 'string' ||
        typeof parsedData.secret !== 'string'
      ) {
        log('error', 'Missing or incorrect spotify-info.json');
      } else {
        setSettings({
          spotify: {
            clientId: parsedData.id,
            clientSecret: parsedData.secret,
          },
        });
        log('info', 'Spotify app credentials loaded');
      }
    } catch (err) {
      log('error', 'Error parsing spotify-info.json');
      log('error', JSON.stringify(err));
    }
  })
  .catch((err) => {
    log('error', err);
  });

export function isPartialSettings(input: unknown): input is Partial<Settings> {
  const rtn =
    typeof input === 'object' &&
    input !== null &&
    hasPropertyWithType(input, 'musicChannel', ['number', 'null', 'partial']) &&
    hasPropertyWithType(input, 'xairAddress', ['string', 'null', 'partial']) &&
    hasPropertyWithType(input, 'timerAddress', ['string', 'null', 'partial']) &&
    hasPropertyWithType(input, 'qlabAddress', ['string', 'null', 'partial']) &&
    (!('pignage' in input) || (
      'pignage' in input && isPignage(input.pignage)
    )) &&
    hasPropertyWithType(input, 'currentRundownItem', ['number', 'partial']) &&
    (!('rundown' in input) ||
      ('rundown' in input &&
        Array.isArray(input.rundown) &&
        input.rundown.every(isPartialRundownItem))) &&
    (!('govees' in input) || ('govees' in input && isGovees(input.govees))) &&
    (!('spotify' in input) ||
      ('spotify' in input && isPartialSpotify(input.spotify)));
  if (!rtn) {
    log('error', 'Invalid settings data');
  }
  return rtn;
}

function isPignage(input: unknown): input is Settings['pignage'] {
  const rtn =
    typeof input === 'object' &&
    input !== null &&
    (!('primary' in input) || ('primary' in input && isPignageInstance(input.primary))) &&
    (!('secondary' in input) || ('secondary' in input && isPignageInstance(input.secondary)));
  if (!rtn) {
    log('error', 'Invalid Pignage data');
  }
  return rtn;
}

function isPignageInstance(input: unknown): input is Settings['pignage']['primary'] {
  const rtn =
    typeof input === 'object' &&
    input !== null &&
    hasPropertyWithType(input, 'address', ['string', 'null', 'partial']);
  if (!rtn) {
    log('error', 'Invalid Pignage instance data');
  }
  return rtn;
}

function isPartialRundownItem(input: unknown): input is Partial<RundownItem> {
  const rtn =
    typeof input === 'object' &&
    input !== null &&
    'type' in input &&
    'name' in input &&
    typeof input.type === 'string' &&
    typeof input.name === 'string' &&
    ((input.type === 'preset' &&
      hasPropertyWithType(input, 'endTime', ['number', 'partial']) &&
      (!('primarySlide' in input) ||
        ('primarySlide' in input && isSlide(input.primarySlide)))) ||
      (input.type === 'comic' &&
        hasPropertyWithType(input, 'social', ['string', 'null', 'partial']) &&
        (!('bumper' in input) ||
          ('bumper' in input && isBumper(input.bumper))) &&
        hasPropertyWithType(input, 'bumperId', ['string', 'null', 'partial']) &&
        hasPropertyWithType(input, 'time', ['number', 'partial'])));
  if (!rtn) {
    log('error', 'Invalid RundownItem data');
  }
  return rtn;
}

function isSlide(input: unknown): input is string | [string, string] {
  if (typeof input === 'string') {
    return true;
  }
  if (Array.isArray(input) && input.length === 2) {
    return typeof input[0] === 'string' && typeof input[1] === 'string';
  }
  log('error', 'Invalid slide data');
  return false;
}

function isBumper(input: unknown): input is RundownItemComicSet['bumper'] {
  const rtn =
    typeof input === 'object' &&
    (input === null ||
      (hasPropertyWithType(input, 'id', ['string']) &&
        hasPropertyWithType(input, 'name', ['string']) &&
        hasPropertyWithType(input, 'artist', ['string']) &&
        hasPropertyWithType(input, 'art', ['string'])));
  if (!rtn) {
    log('error', 'Invalid RundownItem bumper data');
  }
  return rtn;
}

function isGovees(input: unknown): input is Settings['govees'] {
  const rtn =
    typeof input === 'object' &&
    input !== null &&
    Object.values(input).every((value) => typeof value === 'string');
  if (!rtn) {
    log('error', 'Invalid Govee data');
  }
  return rtn;
}

function isPartialSpotifyUser(
  input: unknown
): input is Partial<Settings['spotify']['user']> {
  const rtn =
    typeof input === 'object' &&
    input !== null &&
    hasPropertyWithType(input, 'id', ['string', 'null', 'partial']) &&
    hasPropertyWithType(input, 'name', ['string', 'null', 'partial']);
  if (!rtn) {
    log('error', 'Invalid Spotify user data');
  }
  return rtn;
}

function isPartialSpotify(
  input: unknown
): input is Partial<Settings['spotify']> {
  const rtn =
    typeof input === 'object' &&
    input !== null &&
    hasPropertyWithType(input, 'clientId', ['string', 'null', 'partial']) &&
    hasPropertyWithType(input, 'clientSecret', ['string', 'null', 'partial']) &&
    hasPropertyWithType(input, 'refreshToken', ['string', 'null', 'partial']) &&
    hasPropertyWithType(input, 'accessToken', ['string', 'null', 'partial']) &&
    hasPropertyWithType(input, 'tokenExpiration', [
      'number',
      'null',
      'partial',
    ]) &&
    hasPropertyWithType(input, 'redirectUri', ['string', 'partial']) &&
    hasPropertyWithType(input, 'defaultPlaylist', [
      'string',
      'null',
      'partial',
    ]) &&
    (!('user' in input) ||
      ('user' in input && isPartialSpotifyUser(input.user)));
  if (!rtn) {
    log('error', 'Invalid Spotify data');
  }
  return rtn;
}
