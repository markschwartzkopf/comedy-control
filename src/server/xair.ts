import dgram from 'dgram';
import { log } from './logger';
import { sendServerMessage } from './http-server';
import { util } from './main';

const MIXER_PORT = 10024; //10023 for X32, 10024 for XAir

let connected = false;
let mixerSocket: dgram.Socket | null = null;
let musicFaderLevel = 0;

export function getMusicFaderLevel() {
  return musicFaderLevel;
}

type oscArgument =
  | { type: 'i'; data: number }
  | { type: 'f'; data: number }
  | { type: 's'; data: string }
  | { type: 'b'; data: Buffer };

export function connectXair() {
  const settings = util.getSettings();
  if (!settings.xairAddress) {
    log('error', `Can't connect mixer, no address set in settings`);
    return;
  }
  if (mixerSocket) {
    mixerSocket.close();
    connected = false;
  }
  const address = settings.xairAddress;
  const thisSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  mixerSocket = thisSocket;
  thisSocket.bind(52361, '0.0.0.0', () => {
    thisSocket.connect(MIXER_PORT, address, () => {
      log('info', 'Connected to mixer');
      connected = true;
      subscribe();
      requestFaderLevel(util.getSettings().musicChannel || 0);
      thisSocket.on('message', (msg) => {
        let index = msg.indexOf(0x00);
        let command = msg.toString('utf-8', 0, index);
        index = index + 4 - (index % 4);
        let msg2 = msg.slice(index);
        switch (command) {
          case 'node':
            log('error', 'unexpected mixer node');
            break;
          case '/':
            log('error', 'unexpected mixer info');
            break;
          default: {
            //assume command is a leaf from /xremote subscription
            let mixerAddress = command.slice(1);
            index = msg2.indexOf(0x00);
            let oscFormat = msg2.toString('utf-8', 1, index); //starts at 1 to chop off leading comma
            index = index + 4 - (index % 4);
            msg2 = msg2.subarray(index);
            switch (mixerAddress) {
              /* case `ch/${getMusicChannel()
                .toString()
                .padStart(2, '0')}/mix/on`:
                if (oscFormat != 'i') {
                  log('error', 'Invalid mute info from mixer');
                } else {
                  let value = msg2.readInt32BE();
                  //console.log(msg2.length);
                  console.log('Music Channel "On" boolean:' + Boolean(value));
                }
                break; */
              case `ch/${(util.getSettings().musicChannel || 0)
                .toString()
                .padStart(2, '0')}/mix/fader`:
                if (oscFormat != 'f') {
                  log('error', 'Invalid fader info from mixer');
                } else {
                  musicFaderLevel =
                    Math.round(msg2.readFloatBE() * 1000) / 1000;
                  console.log('Music Fader Level:' + musicFaderLevel);
                  sendServerMessage({
                    type: 'f',
                    l: musicFaderLevel,
                  });
                }
                break;
              case 'meters/0': {
                if (oscFormat != 'b') {
                  log('error', 'Invalid meter info from mixer');
                }
                //console.log(msg);
                //msg2 0-4: length of blob in bytes, 5-8 Int32BE, number of Int16s Int32LE                
                const leftMeter = msg2.readInt16LE(8) / 32767;
                const rightMeter = msg2.readInt16LE(10) / 32767;
                const monoMeter =
                  Math.round(((leftMeter + rightMeter) / 2) * 1000) / 1000;
                sendServerMessage({
                  type: 'm',
                  l: monoMeter,
                });
                break;
              }
              default:
                console.log('non-pertinent info:' + mixerAddress);
                console.log(command);
                break;
            }
          }
        }
      });
    });
  });
}

/* nodecg.listenFor('x32adjust', (value, ack) => {
  let newReplicant = value as x32settings;
  if (newReplicant.commentary[0].on != x32replicant.value!.commentary[0].on) {
    let data = 0;
    if (newReplicant.commentary[0].on) data = 1;
    let cmdBuf = strToBuf('/ch/' + commentaryChannels[0] + '/mix/on');
    let typeBuf = strToBuf(',i');
    let dataBuf = Buffer.allocUnsafe(4);
    dataBuf.writeInt32BE(data);
    let toX32 = Buffer.concat([cmdBuf, typeBuf, dataBuf]);
    send(toX32);
  }
  if (newReplicant.commentary[1].on != x32replicant.value!.commentary[1].on) {
    let data = 0;
    if (newReplicant.commentary[1].on) data = 1;
    let cmdBuf = strToBuf('/ch/' + commentaryChannels[1] + '/mix/on');
    let typeBuf = strToBuf(',i');
    let dataBuf = Buffer.allocUnsafe(4);
    dataBuf.writeInt32BE(data);
    let toX32 = Buffer.concat([cmdBuf, typeBuf, dataBuf]);
    send(toX32);
  }
  if (
    newReplicant.commentary[0].level != x32replicant.value!.commentary[0].level
  ) {
    let cmdBuf = strToBuf('/bus/' + commentaryBusses[0] + '/mix/fader');
    let typeBuf = strToBuf(',f');
    let dataBuf = Buffer.allocUnsafe(4);
    dataBuf.writeFloatBE(newReplicant.commentary[0].level);
    let toX32 = Buffer.concat([cmdBuf, typeBuf, dataBuf]);
    send(toX32);
  }
  if (
    newReplicant.commentary[1].level != x32replicant.value!.commentary[1].level
  ) {
    let cmdBuf = strToBuf('/bus/' + commentaryBusses[1] + '/mix/fader');
    let typeBuf = strToBuf(',f');
    let dataBuf = Buffer.allocUnsafe(4);
    dataBuf.writeFloatBE(newReplicant.commentary[1].level);
    let toX32 = Buffer.concat([cmdBuf, typeBuf, dataBuf]);
    send(toX32);
  }
  x32replicant.value = value;
}); */

function subscribe() {
  if (connected && mixerSocket) {
    send('/xremote');
    const meterSubscribe: oscArgument[] = [
      { type: 's', data: '/meters/0' },
      { type: 'i', data: (util.getSettings().musicChannel || 0) - 1 },
    ];
    send('/meters', meterSubscribe);
  }
}
setInterval(subscribe, 9000);

function send(cmd: string, args?: oscArgument[]) {
  if (args == undefined) args = [];
  const cmdBuf = strToBuf(cmd);
  let argTypes = ',';
  const argBufs: Buffer[] = [];
  if (args.length > 0) {
    for (let i = 0; i < args.length; i++) {
      argTypes += args[i].type[0];
      argBufs.push(oscArgumentToBuffer(args[i]));
    }
  }
  const typesBuf = strToBuf(argTypes);
  const argsBuf = Buffer.concat(argBufs);
  const bufferToSend = Buffer.concat([cmdBuf, typesBuf, argsBuf]);
  if (mixerSocket && connected) {
    mixerSocket.send(bufferToSend, (err) => {
      if (err) log('error', JSON.stringify(err));
    });
  } else log('error', `can't send data to mixer unless connected`);
}

function oscArgumentToBuffer(arg: oscArgument): Buffer {
  switch (arg.type) {
    case 'b':
      return arg.data;
    case 'f': {
      const floatBuf = Buffer.allocUnsafe(4);
      floatBuf.writeFloatBE(arg.data, 0);
      return floatBuf;
    }
    case 'i': {
      const intBuf = Buffer.allocUnsafe(4);
      intBuf.writeInt32BE(arg.data, 0);
      return intBuf;
    }
    case 's': {
      const unpaddedBuf = Buffer.from(arg.data);
      let newBufLength = unpaddedBuf.length + 1;
      while (newBufLength % 4 !== 0) newBufLength++;
      const paddedBuf = Buffer.alloc(newBufLength);
      paddedBuf.write(arg.data);
      return paddedBuf;
    }
  }
}

function strToBuf(str: string): Buffer {
  let buf = Buffer.from(str);
  let bufPad = Buffer.alloc(4 - (buf.length % 4));
  return Buffer.concat([buf, bufPad]);
}

function requestFaderLevel(channel: number) {
  if (mixerSocket && connected) {
    send(`/ch/${channel.toString().padStart(2, '0')}/mix/fader`);
  } else {
    log('error', `Can't send data to mixer unless connected`);
  }
}

export function setFaderLevel(channel: number, level: number) {
  if (mixerSocket && connected) {
    send(`/ch/${channel.toString().padStart(2, '0')}/mix/fader`, [
      { type: 'f', data: level },
    ]);
    if (channel == util.getSettings().musicChannel) {
      musicFaderLevel = level;
      sendServerMessage({
        type: 'f',
        l: musicFaderLevel,
      });
    }
  } else {
    log('error', `Can't send data to mixer unless connected`);
  }
}
