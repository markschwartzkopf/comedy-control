export type LogData =
  | { [k: string]: number | string | boolean | null | LogData }
  | (number | string | boolean | null | LogData)[];
export type LogType = 'info' | 'error' | 'warn';

type ServerMessageFader = {
  type: 'f';
  l: number;
};

type ServerMessageMeter = {
  type: 'm';
  l: number;
};

type ServerMessageRundown = {
  type: 'rundown';
  rundown: Rundown;
  currentItem: number;
};

export type ServerMessage =
  | ServerMessageFader
  | ServerMessageMeter
  | ServerMessageRundown;

type ClientMessageLog = {
  type: 'log';
  logType: LogType;
  description: string;
  data?: LogData;
};

type ClientMessageFader = {
  type: 'f';
  l: number;
};

type ClientMessageRundownItem = {
  type: 'set-rundown-item';
  item: number;
};

export type ClientMessage = ClientMessageLog | ClientMessageFader | ClientMessageRundownItem;

type RundownItemComicSet = {
  type: 'comic';
  name: string;
  social: string;
  bumperId: string | null;
  bumperTitle: string | null;
  time: number; //in minutes
};

type RundownItemPreset = {
  type: 'preset';
  name: string;
  endTime?: string;
};

type RundownItem = RundownItemComicSet | RundownItemPreset;
export type Rundown = RundownItem[];
