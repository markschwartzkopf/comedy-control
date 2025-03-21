//import fs from 'fs';
//import path from 'path';

export const util = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setSettings: (newSettings: DeepPartial<Settings>) => {
  },
  getSettings: () => {
    return null as unknown as Settings;
  }
}

import { initializeData } from './settings.js';
import { log } from './logger.js';
import { DeepPartial, Settings } from '../global-types.js';


//import { initializeSpotify } from './spotify.js';
//import { connectXair } from './xair.js';
//import { connectGovees } from './govee.js';

//temp
//connectXair();
//connectGovees();
initializeData()
  .then(() => {
    return import('./http-server.js');
  })
  .catch((err) => {
    log('error', `Error in initialization: ${err}`);
  });
