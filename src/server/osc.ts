import { log } from './logger';

type OscInt = {
  type: 'int';
  value: number;
};
type OscFloat = {
  type: 'float';
  value: number;
};
type OscString = {
  type: 'string';
  value: string;
};
type OscArgument = OscInt | OscFloat | OscString;
type OscMessage = { address: string[]; arguments: OscArgument[] };

export function oscMessageToBuffer(message: OscMessage): Buffer {
  const addressBuf = strToBuf('/' + message.address.join('/'));
  let argTypes = ',';
  const argBufs: Buffer[] = [];
  const args = message.arguments;
  if (args.length > 0) {
    for (let i = 0; i < args.length; i++) {
      argTypes += args[i].type[0];
      argBufs.push(oscArgumentToBuffer(args[i]));
    }
  }
  const typesBuf = strToBuf(argTypes);
  const argsBuf = Buffer.concat(argBufs);
  const bufferToSend = Buffer.concat([addressBuf, typesBuf, argsBuf]);
  return bufferToSend;
}

function oscArgumentToBuffer(arg: OscArgument): Buffer {
  switch (arg.type) {
    case 'float': {
      const floatBuf = Buffer.allocUnsafe(4);
      floatBuf.writeFloatBE(arg.value, 0);
      return floatBuf;
    }
    case 'int': {
      const intBuf = Buffer.allocUnsafe(4);
      intBuf.writeInt32BE(arg.value, 0);
      return intBuf;
    }
    case 'string': {
      const unpaddedBuf = Buffer.from(arg.value);
      let newBufLength = unpaddedBuf.length + 1;
      while (newBufLength % 4 !== 0) newBufLength++;
      const paddedBuf = Buffer.alloc(newBufLength);
      paddedBuf.write(arg.value);
      return paddedBuf;
    }
  }
}

function strToBuf(str: string): Buffer {
  const buf = Buffer.from(str);
  const bufPad = Buffer.alloc(4 - (buf.length % 4));
  return Buffer.concat([buf, bufPad]);
}

export function oscMessageFromBuffer(buf: Buffer) {
  let offset = 0;
  function skipToNextBlock() {
    if (offset % 4 === 0) offset += 4;
    while (offset % 4 !== 0) offset++;
  }
  let address = '';
  while (buf[offset] !== 0) {
    address += String.fromCharCode(buf[offset]);
    offset++;
  }
  skipToNextBlock();
  if (String.fromCharCode(buf[offset]) === ',') offset++;
  const types: ('int' | 'float' | 'string')[] = [];
  let canReadPast = true;
  while (buf[offset] !== 0) {
    const type = String.fromCharCode(buf[offset]);
    switch (type) {
      case 'i':
        if (canReadPast) types.push('int');
        break;
      case 'f':
        if (canReadPast) types.push('float');
        break;
      case 's':
        if (canReadPast) types.push('string');
        break;
      default:
        canReadPast = false;
        log(
          'error',
          `OSC message with unknown type: ${type} in address: ${address}`
        );
        break;
    }
    offset++;
  }
  skipToNextBlock();
  const args: OscArgument[] = [];
  types.forEach((type) => {
    switch (type) {
      case 'int':
        args.push({ type: 'int', value: buf.readInt32BE(offset) });
        offset += 4;
        break;
      case 'float':
        args.push({ type: 'float', value: buf.readFloatBE(offset) });
        offset += 4;
        break;
      case 'string': {
        let str = '';
        while (buf[offset] !== 0) {
          str += String.fromCharCode(buf[offset]);
          offset++;
        }
        skipToNextBlock();
        args.push({ type: 'string', value: str });
        break;
      }
    }
  });
  skipToNextBlock();
  offset -= 4;
  if (offset !== buf.length) {
    const hexString = buf.toString('hex');
    log(
      'warn',
      `OSC message data does not match buffer length. Expected length ${offset} not ${buf.length}`
    );
    log('warn', `Buffer content in hex: ${hexString}`);
  }
  if (address.startsWith('/')) {
    address = address.slice(1);
  } else {
    log('warn', `OSC message with invalid address: ${address}`);
  }
  if (address.endsWith('/')) {
    address = address.slice(0, -1);
    log('warn', `OSC message with invalid address: ${address}`);
  }
  const message: OscMessage = { address: address.split('/'), arguments: args };
  if (!canReadPast) {
    log('warn', `OSC message with unknown type: ${JSON.stringify(message)}`);
  }
  if (!message.address) {
    log('warn', `OSC message with empty address: ${message}`);
  }
  return message;
}
