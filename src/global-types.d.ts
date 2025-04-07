export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type LogData =
  | { [k: string]: number | string | boolean | null | LogData }
  | (number | string | boolean | null | LogData)[];
export type LogType = 'info' | 'error' | 'warn';

export type Settings = {
  musicChannel: number | null;
  xairAddress: string | null;
  timerAddress: string | null;
  qlabAddress: string | null;
  pignage: {
    primary: {
      address: string | null;
    };
    secondary: {
      address: string | null;
    };
  };
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
    defaultPlaylist: string | null;
    user: {
      id: string | null;
      name: string | null;
    };
  };
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

type ServerMessageSpotifyTracks = {
  type: 'spotify-tracks';
  tracks: SpotifyTrack[];
};

type ServerMessageSpotifyPlaylists = {
  type: 'spotify-playlists';
  playlists: SpotifyPlaylist[];
};

type ServerMessageTimerState = {
  type: 'timer';
  state: 'finished' | 'ready' | 'paused' | number;
};

type ServerMessageQLabCues = {
  type: 'qlab-cues';
  cues: QLabCue[];
};

type ServerMessageServicesConnected = {
  type: 'services-connected';
  xair?: boolean;
  timer?: boolean;
  qlab?: boolean;
};

export type ServerMessagePignageInfo = {
  type: 'pignage-info';
  primary: slideInfo;
  secondary: slideInfo;
};

export type ServerMessage =
  | ServerMessageFader
  | ServerMessageMeter
  | ServerMessageSettings
  | ServerMessageSpotifyTracks
  | ServerMessageSpotifyPlaylists
  | ServerMessageTimerState
  | ServerMessageQLabCues
  | ServerMessageServicesConnected
  | ServerMessagePignageInfo;

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

type ClientMessageSpotifySearch = {
  type: 'spotify-search';
  query?: string;
  offset?: number;
};

type ClientMessageGetSpotifyPlaylists = {
  type: 'get-spotify-playlists';
};

type ClientMessageSpotifyPlay = {
  type: 'spotify-play';
  id: string;
};

type ClientMessageSpotifyPause = {
  type: 'spotify-pause';
};

type ClientMessageTimerCommand =
  | {
      type: 'timer';
      command: 'start' | 'pause' | 'reset';
    }
  | {
      type: 'timer';
      command: 'reset';
      time: number;
    };

type ClientMessageGetQLabCues = {
  type: 'get-qlab-cues';
};

type ClientMessageFireQlabCues = {
  type: 'fire-qlab-cues';
  ids: string[];
};

export type ClientMessage =
  | ClientMessageLog
  | ClientMessageFader
  | ClientMessageSettings
  | ClientMessageSpotifyCode
  | ClientMessageSpotifySearch
  | ClientMessageGetSpotifyPlaylists
  | ClientMessageSpotifyPlay
  | ClientMessageSpotifyPause
  | ClientMessageTimerCommand
  | ClientMessageGetQLabCues
  | ClientMessageFireQlabCues;

export type RundownItemComicSet = {
  type: 'comic';
  name: string;
  social: string | null;
  bumper: { id: string; name: string; artist: string; art: string } | null;
  time: number; //in minutes
};

type RundownItemPreset = {
  type: 'preset';
  name: string;
  cueLabCues: MinQLabCue[];
  slide: {
    primary?: string | [string, string];
    secondary?: string | [string, string];
  },
  endTime?: number;
};

type RundownItem = RundownItemComicSet | RundownItemPreset;
export type Rundown = RundownItem[];

export type SpotifyTrack = {
  id: string;
  name: string;
  artist: string;
  album: string;
  duration_ms: number;
  art: string;
  popularity: number;
};

export type SpotifyPlaylist = {
  id: string;
  name: string;
  art: string;
};

export type MinQLabCue = {
  listName: string;
  uniqueID: string;
};

export type QLabCue = MinQLabCue & {
  type: string;
  cues: QLabCue[];
};

export type slideInfo = {
  groups: { name: string; files: string[] }[];
  pagesDir: string[];
};

declare global {
  interface JSON {
    parse(
      text: string,
      reviver?: (this: any, key: string, value: any) => any
    ): unknown;
  }
}
