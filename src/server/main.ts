//import fs from 'fs';
//import path from 'path';

export const util = {
  setSettings: (newSettings: DeepPartial<Settings>) => {
    //replaced by settings.ts
  },
  getSettings: () => {
    return null as unknown as Settings;
  }
}

import { initializeData } from './settings.js';
import { log } from './logger.js';
import { DeepPartial, Settings } from '../global-types.js';
import { initializeSpotify } from './spotify.js';

//import { connectXair } from './xair.js';
//import { connectGovees } from './govee.js';

//temp
//connectXair();
//connectGovees();
initializeData()
  .then(() => {
    return initializeSpotify();
  })
  .then(() => {
    return import('./http-server.js');
  })
  .catch((err) => {
    log('error', `Error in initialization: ${err}`);
  });
