import dgram from 'dgram';
import { util } from './main';
import { OscMessage, oscMessageFromBuffer, oscMessageToBuffer } from './osc';
import { log } from './logger';
import { sendServerMessage } from './http-server';
import { QLabCue } from '../global-types';

let qlabSocket: dgram.Socket | null = null;
let qlabAddress: string | null = null;
let qlabQueueTheOtherQSoundingThing: OscMessage[] = [];
let inQueue = false;
let qlabConnected = false;
export function isQLabConnected(): boolean {
  return qlabConnected;
}

function setConnected(isConnected: boolean): void {
  if (isConnected === qlabConnected) return; // No change in connection state
  sendServerMessage({
    type: 'services-connected',
    qlab: isConnected,
  });
  qlabConnected = isConnected;
  if (!isConnected) {
    if (qlabSocket) {
      qlabSocket.close();
      qlabSocket = null;
    }
  }
}

setInterval(() => {
  const newQlabAddress = util.getSettings().qlabAddress;
  if (newQlabAddress !== qlabAddress || (!qlabSocket && newQlabAddress)) {
    if (qlabSocket) {
      qlabSocket.close();
      qlabSocket = null;
      return;
    }
    qlabAddress = newQlabAddress;
    const thisSocket = dgram.createSocket('udp4');
    thisSocket.on('close', () => {
      qlabSocket = null;
      log('warn', 'QLab socket closed');
    });
    thisSocket.on('error', (err) => {
      log('error', `Error with QLab socket: ${err}`);
      thisSocket.close();
      qlabSocket = null;
      setConnected(false);
    });
    qlabSocket = thisSocket;
    setTimeout(() => {
      if(!qlabConnected && qlabSocket) {        
        log('warn', 'QLab connection timed out, closing socket');
        qlabSocket.close();
        qlabSocket = null;
        setConnected(false);
      }
    }, 2000);
    thisSocket.on('message', (buf) => {
      setConnected(true);
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
      } /* else {
        console.log('Received message from QLab:');
        console.log(message);
      } */
    });
    thisSocket.bind(53001, () => {
      log('info', 'QLab socket bound to port 53001');
      processQLabMessages([]); // Send intial alwaysReply
    });
  }
}, 1000);

export function getQLabCues(): void {
  processQLabMessages([
    {
      address: ['cueLists', 'cues'],
      arguments: [],
    },
  ]);
}

export function fireQLabCues(cueIDs: string[]) {
  const messages = cueIDs.map((id) => {
    return {
      address: ['cue_id', id, 'start'],
      arguments: [],
    };
  });
  processQLabMessages(messages);
}

function processQLabMessages(messages: OscMessage[]): void {
  qlabQueueTheOtherQSoundingThing.push(...messages);
  if (inQueue) return;
  qlabQueueTheOtherQSoundingThing.unshift({
    address: ['alwaysReply'],
    arguments: [],
  });
  sendNextQLabMessage();
}

function sendNextQLabMessage(): void {
  inQueue = true;
  const nextMessage = qlabQueueTheOtherQSoundingThing.shift();
  if (!nextMessage) {
    inQueue = false;
    qlabQueueTheOtherQSoundingThing = [];
    return;
  }
  const buf = oscMessageToBuffer(nextMessage);
  const timeout = setTimeout(() => {
    log('error', `QLab message timed out: ${nextMessage}. Clearing queue`);
    inQueue = false;
    qlabQueueTheOtherQSoundingThing = [];
    setConnected(false);
  }, 2000);
  const onMessageReceived = (data: Buffer) => {
    const msg = oscMessageFromBuffer(data);
    if (msg.address.shift() !== 'reply') return;
    if (msg.address.length !== nextMessage.address.length) return;
    for (let i = 0; i < msg.address.length; i++) {
      if (msg.address[i] !== nextMessage.address[i]) return;
    }
    const reply = msg.arguments[0];
    if (!reply || reply.type !== 'string') return;
    try {
      const replyString = reply.value;
      const replyObj = JSON.parse(replyString);
      if (typeof replyObj !== 'object' || replyObj === null) {
        log('error', `QLab reply is not an object: ${replyString}`);
        return;
      }
      if (!('status' in replyObj)) {
        log('error', `QLab reply does not have a status field: ${replyString}`);
        return;
      }
      if (replyObj.status !== 'ok') {
        log('error', `QLab reply status is not "ok": ${replyString}`);
        return;
      }
    } catch {
      log('error', `Error parsing QLab reply: ${reply.value}`);
      return;
    }
    qlabSocket?.off('message', onMessageReceived);
    clearTimeout(timeout);
    sendNextQLabMessage();
  };
  qlabSocket?.on('message', onMessageReceived);
  if (!qlabSocket || !qlabAddress) {
    log(
      'error',
      'QLab socket not initialized, cannot send message. Clearing queue'
    );
    clearTimeout(timeout);
    inQueue = false;
    qlabQueueTheOtherQSoundingThing = [];
    setConnected(false);
    return;
  }
  qlabSocket.send(buf, 53000, qlabAddress, (err) => {
    if (err) {
      log('error', `Error sending QLab command: ${err}. Clearing queue`);
      clearTimeout(timeout);
      inQueue = false;
      qlabQueueTheOtherQSoundingThing = [];
      setConnected(false);
    }
  });
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
