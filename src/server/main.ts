import fs from 'fs';
import { initializeServer } from './http-server.js';
import path from 'path';

import { log } from './logger.js';
import { initializeSpotify } from './spotify.js';
import { connectXair } from './xair.js';
import { connectGovees } from './govee.js';

//temp
connectXair();
connectGovees();

const grandparentDir = path.dirname(path.dirname(__dirname));
const filePath = path.join(grandparentDir, 'spotify-info.json');
fs.promises
  .readFile(filePath, 'utf-8')
  .then((data) => {
    return new Promise<{ id: string; secret: string; code: string }>((resolve, reject) => {
      try {
        const parsedData = JSON.parse(data);
        if (
          typeof parsedData.id !== 'string' ||
          typeof parsedData.secret !== 'string' ||
          typeof parsedData.code !== 'string'
        ) {
          reject('Missing or incorrect spotify-info.json');
        } else resolve(parsedData);
      } catch (err) {
        reject(err);
      }
    });
  })
  /* .then((data) => {
    console.log(data);
    return initializeSpotify(data.id, data.secret, data.code);
  }) */
  .then(() => {
    initializeServer();
  })
  .catch((err) => {
    log('error', err);
  });
