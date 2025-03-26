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

export type ServerMessage =
  | ServerMessageFader
  | ServerMessageMeter
  | ServerMessageSettings
  | ServerMessageSpotifyTracks
  | ServerMessageSpotifyPlaylists
  | ServerMessageTimerState;

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

export type ClientMessage =
  | ClientMessageLog
  | ClientMessageFader
  | ClientMessageSettings
  | ClientMessageSpotifyCode
  | ClientMessageSpotifySearch
  | ClientMessageGetSpotifyPlaylists
  | ClientMessageSpotifyPlay
  | ClientMessageSpotifyPause
  | ClientMessageTimerCommand;

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

/* 
function simplifyTracklist(tracklist: Track[]) {
  return tracklist.map((track) => ({
    id: track.id,
    name: track.name,
    artist: track.artists.map((artist) => artist.name).join(', '),
    album: track.album.name,
    duration_ms: track.duration_ms,
    art: pickAlbumArt(track.album),
    popularity: track.popularity,
  }));
}

*/

declare global {
  interface JSON {
    parse(
      text: string,
      reviver?: (this: any, key: string, value: any) => any
    ): unknown;
  }
}
