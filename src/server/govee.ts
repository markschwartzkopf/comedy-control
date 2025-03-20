import dgram from 'dgram';
import { getSettings } from './settings';

const GOVEE_PORT = 4003;
const testGoveeIp = getSettings().govees.test;
const goveeSockets: { [k: string]: dgram.Socket } = {};

export function connectGovees() {
  goveeSockets.test = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  goveeSockets.test.on('message', (msg) => {
    console.log('Govee message:', msg.toString());
  });
  goveeSockets.test.bind(4002, '0.0.0.0');
  goveeSockets.test.on('listening', () => {
    console.log('Govee socket listening');
    const message = { msg: { cmd: 'devStatus', data: {} } };
    //const message = { msg: { cmd: 'brightness', data: { value: 100 } } };
    /* const message = {
      msg: {
        cmd: 'colorwc',
        data: { color: { r: 255, g: 255, b: 255 }, colorTemInKelvin: 0 },
      },
    }; */
    //const message = { msg: { cmd: 'turn', data: { value: 1 } } };
    const messageString = JSON.stringify(message);
    goveeSockets.test.send(messageString, GOVEE_PORT, testGoveeIp, (err) => {
      if (err) {
        console.error('Error sending message:', err);
      } else {
        console.log('Message sent to Govee device');
      }
    });
  });
}
