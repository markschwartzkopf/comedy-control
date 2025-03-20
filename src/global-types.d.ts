export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type LogData =
  | { [k: string]: number | string | boolean | null | LogData }
  | (number | string | boolean | null | LogData)[];
export type LogType = 'info' | 'error' | 'warn';

export type Settings = {
  musicChannel: number;
  xairAddress: string;
  rundown: Rundown;
  currentRundownItem: number;
  govees: { [k: string]: string };
  spotify: {
    clientId: string | null;
    clientSecret: string | null;
    refreshToken: string | null;
    accessToken: string | null;
    tokenExpiration: number | null;
    redirectUri: string;
  }
};

type ServerMessageFader = {
  type: 'f';
  l: number;
};

type ServerMessageMeter = {
  type: 'm';
  l: number;
};

type ServerMessageSettings = {
  type: 'settings';
  settings: Settings;
};

export type ServerMessage =
  | ServerMessageFader
  | ServerMessageMeter
  | ServerMessageSettings;

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

type ClientMessageSettings = {
  type: 'settings';
  settings: DeepPartial<Settings>;
};

type ClientMessageSpotifyCode = {
  type: 'spotify-code';
  code: string;
};

export type ClientMessage =
  | ClientMessageLog
  | ClientMessageFader
  | ClientMessageSettings
  | ClientMessageSpotifyCode;

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
