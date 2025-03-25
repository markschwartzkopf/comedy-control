import { LogData, LogType } from '../global-types';

let logNumber = 0;
export function log(type: LogType, description: string, data?: LogData) {
  genericLog('server', type, description, data);
}
export function logBrowser(source: string, type: LogType, description: string, data?: LogData) {
  genericLog(source, type, description, data);
}
function genericLog(
  source: string,
  type: LogType,
  description: string,
  data?: LogData
) {
  logNumber++;
  const now = new Date();
  const date = `${now.toLocaleTimeString()} ${now.toLocaleDateString()}`;
  console[type](`${source} ${type} Log#:${logNumber}, Time: ${date}, "${description}"`);
  if (data)
    console[type](
      `${source} ${type} Log#:${logNumber} data: "${JSON.stringify(data)}"`
    );
}