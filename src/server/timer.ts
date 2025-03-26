import dgram from 'dgram';
import { util } from './main';
import { oscMessageFromBuffer, oscMessageToBuffer } from './osc';
import { log } from './logger';
import { sendServerMessage } from './http-server';

const OSC_PORT = 8000;

let subscriber: NodeJS.Timeout | null = null;

let timerSocket: dgram.Socket | null = null;
let timerAddress: string | null = null;
let timerState: 'finished' | 'ready' | 'paused' | number = 'ready';

export function getTimerState() {
  return timerState;
}

export function sendTimerCommand(
  command: 'start' | 'pause' | 'reset',
  time?: number
) {
  if (timerSocket && timerAddress) {
    const message =
      command === 'reset' && time
        ? oscMessageToBuffer({
            address: [command],
            arguments: [{ type: 'float', value: time }],
          })
        : oscMessageToBuffer({
            address: [command],
            arguments: [],
          });
    timerSocket.send(message, OSC_PORT, timerAddress, (err) => {
      if (err) {
        log('error', `Error sending timer command: ${err}`);
      }
    });
  } else {
    log('error', 'Timer socket not connected, command not sent');
  }
}

setInterval(() => {
  const newTimerAddress = util.getSettings().timerAddress;
  if (newTimerAddress !== timerAddress || (!timerSocket && newTimerAddress)) {
    timerAddress = newTimerAddress;
    if (timerSocket) {
      timerSocket.close();
    }
    if (subscriber) {
      clearInterval(subscriber);
    }
    if (timerAddress) {
      const thisAddress = timerAddress;
      const thisSocket = dgram.createSocket('udp4');
      thisSocket.on('close', () => {
        timerSocket = null;
        log('warn', 'Timer socket closed');
      });
      thisSocket.on('error', (err) => {
        log('error', `Error with timer socket: ${err}`);
        thisSocket.close();
      });
      timerSocket = thisSocket;
      thisSocket.on('message', (buf) => {
        const message = oscMessageFromBuffer(buf);
        switch (message.address[0]) {
          case 'state': {
            const argument = message.arguments[0];
            switch (argument.type) {
              case 'int': {
                sendServerMessage({
                  type: 'timer',
                  state: argument.value,
                });
                timerState = argument.value;
                break;
              }
              case 'string': {
                sendServerMessage({
                  type: 'timer',
                  state: argument.value as 'finished' | 'ready' | 'paused',
                });
                timerState = argument.value as 'finished' | 'ready' | 'paused';
                break;
              }
            }
            break;
          }
          default: {
            log('warn', 'Unknown timer message:', message);
          }
        }
      });
      thisSocket.bind(61616, () => {
        function subscribe() {
          thisSocket.send(
            oscMessageToBuffer({ address: ['subscribe'], arguments: [] }),
            OSC_PORT,
            thisAddress,
            (err) => {
              if (err) {
                log('error', `Error sending timer subscribe message: ${err}`);
              }
            }
          );
        }
        subscriber = setInterval(() => {
          subscribe();
        }, 8000);
        subscribe();
      });
    }
  }
}, 1000);
