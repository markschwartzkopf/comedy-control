import fs from 'fs';
import path from 'path';

import { DeepPartial, Settings } from '../global-types';
import { sendServerMessage } from './http-server';
import { log } from './logger';
import { util } from './main';

let settings: Settings = {
  musicChannel: 15,
  xairAddress: '172.19.1.102',
  rundown: [
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
  ],
  currentRundownItem: 0,
  govees: { test: '172.19.1.42' },
  spotify: {
    clientId: null,
    clientSecret: null,
    refreshToken: null,
    accessToken: null,
    tokenExpiration: null,
    redirectUri: ''
  },
};
const settingsFile = path.join(__dirname, '..', '..', 'settings.json');

export function initializeData() {
  return fs.promises
    .readFile(settingsFile)
    .then((data) => {
      log('info', 'Reading settings file');
      return new Promise<void>((resolve, reject) => {
        try {
          const newSettings = JSON.parse(data.toString());
          setSettings(newSettings);
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    })
    .catch(async () => {
      log('warn', 'creating settings file');
      return saveSettings();
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
  updateObjectWithPartial(settings, newSettings);
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

function updateObjectWithPartial<T>(original: T, partial: DeepPartial<T>): T {
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
        updateObjectWithPartial(original[typedKey], typedValue);
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

  return original;
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
