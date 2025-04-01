import dgram from 'dgram';
import { util } from './main';
import { oscMessageFromBuffer, oscMessageToBuffer } from './osc';
import { log } from './logger';
import { sendServerMessage } from './http-server';
import { QLabCue } from '../global-types';

let qlabSocket: dgram.Socket | null = null;
let qlabAddress: string | null = null;

setInterval(() => {
  const newQlabAddress = '172.19.1.84'; //util.getSettings().qlabAddress;
  if (newQlabAddress !== qlabAddress || (!qlabSocket && newQlabAddress)) {
    qlabAddress = newQlabAddress;
    if (qlabSocket) {
      qlabSocket.close();
    }
    const thisSocket = dgram.createSocket('udp4');
    thisSocket.on('close', () => {
      qlabSocket = null;
      log('warn', 'QLab socket closed');
    });
    thisSocket.on('error', (err) => {
      log('error', `Error with QLab socket: ${err}`);
      thisSocket.close();
    });
    qlabSocket = thisSocket;
    thisSocket.on('message', (buf) => {
      const message = oscMessageFromBuffer(buf);
      if (
        message.address[0] === 'reply' &&
        message.address[1] === 'cueLists' &&
        message.address[2] === 'cues'
      ) {
        const cues = message.arguments[0];
        if (cues.type === 'string') {
          try {
            const reply = JSON.parse(cues.value);
            if (
              typeof reply === 'object' &&
              reply !== null &&
              'data' in reply &&
              isQLabCueArray(reply.data)
            ) {
              const qlabCues: QLabCue[] = reply.data;
              sendServerMessage({
                type: 'qlab-cues',
                cues: qlabCues,
              });
            }
          } catch {
            log('error', `Error parsing QLab cues: ${cues.value}`);
          }
        } else {
          log(
            'error',
            `Received unexpected data from QLab: ${JSON.stringify(cues)}`
          );
        }
      }
    });
    thisSocket.bind(53001, () => {
      //getQLabCues();
    });
  }
}, 1000);

export function getQLabCues(): void {
  if (!qlabSocket || !qlabAddress) {
    log('warn', 'QLab socket not initialized');
    return;
  }

  qlabSocket.send(
    oscMessageToBuffer({
      address: ['cueLists', 'cues'],
      arguments: [],
    }),
    53000,
    qlabAddress,
    (err) => {
      if (err) {
        log('error', `Error sending QLab command: ${err}`);
      }
    }
  );
}

function isQLabCueArray(obj: unknown): obj is QLabCue[] {
  const rtn = Array.isArray(obj) && obj.every((item) => isQLabCue(item));
  if (!rtn) {
    log('error', `Received unexpected array from QLab: ${JSON.stringify(obj)}`);
  }
  return rtn;
}

function isQLabCue(obj: unknown): obj is QLabCue {
  const rtn =
    typeof obj === 'object' &&
    obj !== null &&
    'listName' in obj &&
    typeof obj.listName === 'string' &&
    'uniqueID' in obj &&
    typeof obj.uniqueID === 'string' &&
    'type' in obj &&
    typeof obj.type === 'string' &&
    'cues' in obj &&
    isQLabCueArray(obj.cues);
  if (!rtn) {
    log(
      'error',
      `Received unexpected object from QLab: ${JSON.stringify(obj)}`
    );
  }
  return rtn;
}
