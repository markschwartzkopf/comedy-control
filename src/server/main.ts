export const util = {
  // These will be replaced by settings.ts
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setSettings: (newSettings: DeepPartial<Settings>) => {},
  getSettings: () => {
    return null as unknown as Settings;
  },
};

import { initializeData } from './settings.js';
import { log } from './logger.js';
import { DeepPartial, Settings } from '../global-types.js';
import { initializeSpotify } from './spotify.js';
import { connectXair } from './xair.js';

initializeData()
  .then(() => {
    return initializeSpotify()
  })
  .then(() => {
    return import('./http-server.js');
  })
  .then(() => {
    return import('./timer.js');
  })
  .then(() => {
    connectXair();
    return import('./qlab.js');
  }).then(() => {
    return import('./pignage.js');
  })
  .catch((err) => {
    log('error', `Error in initialization: ${err}`);
  });
