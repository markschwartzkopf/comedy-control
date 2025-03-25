import https from 'https';
import querystring from 'querystring';
import { log } from './logger';
import { util } from './main';
import { SpotifyPlaylist, SpotifyTrack } from '../global-types';
import { hasPropertyWithType } from './utils';

const spotifyRedirectUri = 'http://localhost:9999/spotify-callback.html';
const MARGIN = 1000 * 60 * 5; // 5 minutes
const MINIMUM_ART_SIZE = 100;

let refreshTokenTimeout: NodeJS.Timeout | null = null;

function initializeRefreshTokenTimeout() {
  if (
    !util.getSettings().spotify.user.id ||
    !util.getSettings().spotify.user.name
  ) {
    getSpotifyUserInfo();
  }
  if (refreshTokenTimeout) clearTimeout(refreshTokenTimeout);
  const spotifyCredentials = util.getSettings().spotify;
  if (
    spotifyCredentials.refreshToken &&
    spotifyCredentials.clientId &&
    spotifyCredentials.clientSecret
  ) {
    const timeTilRefresh = spotifyCredentials.tokenExpiration
      ? spotifyCredentials.tokenExpiration - Date.now() - MARGIN
      : 0;
    if (timeTilRefresh > 0) {
      refreshTokenTimeout = setTimeout(refreshSpotifyToken, timeTilRefresh);
    } else {
      refreshSpotifyToken().catch((err) => {
        log('error', `Error setting Spotify token refresh timeout: ${err}`);
        util.setSettings({
          spotify: {
            refreshToken: null,
            accessToken: null,
            tokenExpiration: null,
          },
        });
      });
    }
  }
}

function refreshSpotifyToken() {
  return new Promise<void>((resolve, reject) => {
    log('info', 'Refreshing Spotify token');
    const spotifyCredentials = util.getSettings().spotify;
    if (
      spotifyCredentials.tokenExpiration &&
      spotifyCredentials.tokenExpiration > Date.now() + MARGIN
    ) {
      log('info', 'Token still valid, not refreshing');
      initializeRefreshTokenTimeout();
      resolve();
      return;
    }
    if (
      !spotifyCredentials.clientId ||
      !spotifyCredentials.clientSecret ||
      !spotifyCredentials.refreshToken
    ) {
      log('error', `Spotify not connected, can't refresh token`);
      spotifyCredentials.refreshToken = null;
      spotifyCredentials.accessToken = null;
      spotifyCredentials.tokenExpiration = null;
      return;
    }
    const postData = querystring.stringify({
      grant_type: 'refresh_token',
      refresh_token: spotifyCredentials.refreshToken,
    });
    const options = {
      hostname: 'accounts.spotify.com',
      path: '/api/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(
          `${spotifyCredentials.clientId}:${spotifyCredentials.clientSecret}`
        ).toString('base64')}`,
        'Content-Length': postData.length,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const tokenData = JSON.parse(data);
            if (
              typeof tokenData === 'object' &&
              tokenData !== null &&
              'expires_in' in tokenData &&
              typeof tokenData.expires_in === 'number' &&
              'access_token' in tokenData &&
              typeof tokenData.access_token === 'string'
            ) {
              spotifyCredentials.accessToken = tokenData.access_token;
              spotifyCredentials.tokenExpiration =
                Date.now() + tokenData.expires_in * 1000;
              util.setSettings({
                spotify: spotifyCredentials,
              });
              initializeRefreshTokenTimeout();
              resolve();
            } else {
              reject(`Bad token data: ${data}`);
            }
          } catch (err) {
            log('error', `Error parsing Spotify response: ${err}`);
          }
        } else {
          reject(data);
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.write(postData);
    req.end();
  });
}

export function initializeSpotify() {
  util.setSettings({
    spotify: {
      redirectUri: spotifyRedirectUri,
    },
  });
  return refreshSpotifyToken().catch((err) => {
    log('error', `Error initializing Spotify: ${err}`);
    util.setSettings({
      spotify: {
        refreshToken: null,
        accessToken: null,
        tokenExpiration: null,
      },
    });
  });
}

export function exchangeSpotifyCodeForTokens(code: string) {
  const spotifyCredentials = util.getSettings().spotify;
  if (!spotifyCredentials.clientId || !spotifyCredentials.clientSecret) {
    log('error', `Spotify credentials not loaded, can't process code`);
    return;
  }
  const postData = querystring.stringify({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: spotifyRedirectUri,
    client_id: spotifyCredentials.clientId,
    client_secret: spotifyCredentials.clientSecret,
  });
  const options = {
    hostname: 'accounts.spotify.com',
    path: '/api/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization:
        'Basic ' +
        Buffer.from(
          spotifyCredentials.clientId + ':' + spotifyCredentials.clientSecret
        ).toString('base64'),
    },
  };
  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      if (res.statusCode === 200) {
        try {
          const response: unknown = JSON.parse(data);
          if (
            typeof response === 'object' &&
            response !== null &&
            'access_token' in response &&
            'refresh_token' in response &&
            'expires_in' in response &&
            typeof response.access_token === 'string' &&
            typeof response.refresh_token === 'string' &&
            typeof response.expires_in === 'number'
          ) {
            util.setSettings({
              spotify: {
                refreshToken: response.refresh_token,
                accessToken: response.access_token,
                tokenExpiration: Date.now() + response.expires_in * 1000,
              },
            });
            getSpotifyUserInfo();
          } else {
            log('error', `Bad token data: ${data}`);
          }
        } catch (err) {
          log('error', `Error parsing Spotify response: ${err}`);
        }
      } else {
        log(
          'error',
          `Failed to exchange code for tokens. Status code: "${res.statusCode}", data: ${data}`
        );
      }
    });
  });
  req.on('error', (e) => {
    log('error', `problem with request: ${e.message}`);
  });
  req.write(postData);
  req.end();
}

function getSpotifyUserInfo() {
  const accessToken = util.getSettings().spotify.accessToken;
  if (!accessToken) {
    log('error', 'No access token, cannot get user info');
    return;
  }
  const options = {
    hostname: 'api.spotify.com',
    path: '/v1/me',
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  };
  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      if (res.statusCode === 200) {
        try {
          const parsedData = JSON.parse(data);
          if (isUserProfile(parsedData)) {
            util.setSettings({
              spotify: {
                user: {
                  id: parsedData.id,
                  name: parsedData.display_name,
                },
              },
            });
            log(
              'info',
              `Received Spotify user info: ${parsedData.display_name} (${parsedData.id})`
            );
          } else {
            log('error', `Error parsing Spotify user info response`);
          }
        } catch (err) {
          log('error', `Error parsing Spotify user info response: ${err}`);
        }
      } else {
        log(
          'error',
          `Failed to get Spotify user info: ${res.statusCode} ${data}`
        );
      }
    });
  });

  req.on('error', (e) => {
    log('error', `Problem with Spotify user info request: ${e.message}`);
  });

  req.end();
}

export function playTrack(trackUri: string) {
  return new Promise<void>((resolve, reject) => {
    const accessToken = util.getSettings().spotify.accessToken;
    if (!accessToken) {
      reject('No access token, cannot play track');
      return;
    }
    const data = JSON.stringify({
      uris: ['spotify:track:' + trackUri],
    });

    const options = {
      hostname: 'api.spotify.com',
      path: '/v1/me/player/play',
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      res.on('end', () => {
        if (res.statusCode === 204) {
          resolve();
        } else {
          reject(new Error(`Failed to play track: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', (e) => {
      log('error', `Problem with playTrack request: ${e.message}`);
    });

    req.write(data);
    req.end();
  });
}

export function pauseTrack() {
  return new Promise<void>((resolve, reject) => {
    const accessToken = util.getSettings().spotify.accessToken;
    if (!accessToken) {
      reject('No access token, cannot pause track');
      return;
    }

    const options = {
      hostname: 'api.spotify.com',
      path: '/v1/me/player/pause',
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        console.log(data);
        if (res.statusCode === 200) {
          resolve();
        } else {
          reject(new Error(`Failed to pause: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', (e) => {
      log('error', `Problem with pause request: ${e.message}`);
    });

    req.end();
  });
}

export function searchForTrack(
  query: string,
  offset?: number
): Promise<SpotifyTrack[]> {
  return new Promise((resolve, reject) => {
    const accessToken = util.getSettings().spotify.accessToken;
    if (!accessToken) {
      reject('No access token, cannot search tracks');
      return;
    }
    const params = new URLSearchParams({
      q: query,
      type: 'track',
      limit: '20',
      offset: offset ? offset.toString() : '0',
    });

    const options = {
      hostname: 'api.spotify.com',
      path: `/v1/search?${params.toString()}`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const parsedData = JSON.parse(data);
            if (hasTracklist(parsedData)) {
              resolve(simplifyTracklist(parsedData.tracks.items));
            } else {
              reject(`Error parsing Spotify search response`);
            }
          } catch (err) {
            reject(`Error parsing Spotify search response: ${err}`);
          }
        } else {
          reject(
            new Error(`Failed to search Spotify: ${res.statusCode} ${data}`)
          );
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Problem with Spotify search request: ${e.message}`));
    });

    req.end();
  });
}

export function getPlaylistTracks(): Promise<SpotifyTrack[]> {
  return new Promise((resolve, reject) => {
    const accessToken = util.getSettings().spotify.accessToken;
    if (!accessToken) {
      reject('No access token, cannot get playlist tracks');
      return;
    }
    const playlistId = util.getSettings().spotify.defaultPlaylist;
    if (!playlistId) {
      reject('No default playlist, cannot get playlist tracks');
      return;
    }
    const options = {
      hostname: 'api.spotify.com',
      path: `/v1/playlists/${playlistId}/tracks`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const parsedData = JSON.parse(data);
            if (isPlaylistItems(parsedData)) {
              const tracks = parsedData.items.map((item) => item.track);
              resolve(simplifyTracklist(tracks));
            } else {
              reject(`Error parsing Spotify search response`);
            }
          } catch (err) {
            reject(`Error parsing Spotify search response: ${err}`);
          }
        } else {
          reject(
            new Error(`Failed to search Spotify: ${res.statusCode} ${data}`)
          );
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Problem with Spotify search request: ${e.message}`));
    });

    req.end();
  });
}

export function getPlaylists(): Promise<SpotifyPlaylist[]> {
  return new Promise((resolve, reject) => {
    const accessToken = util.getSettings().spotify.accessToken;
    if (!accessToken) {
      reject('No access token, cannot get playlists');
      return;
    }
    const options = {
      hostname: 'api.spotify.com',
      path: '/v1/me/playlists',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const parsedData = JSON.parse(data);
            if (hasPlaylistList(parsedData)) {
              resolve(simplifyPlaylistList(parsedData.items));
            } else {
              reject(`Error parsing Spotify playlists response`);
            }
          } catch (err) {
            reject(`Error parsing Spotify playlists response: ${err}`);
          }
        } else {
          reject(
            new Error(
              `Failed to retrieve Spotify playlists: ${res.statusCode} ${data}`
            )
          );
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Problem with Spotify playlists request: ${e.message}`));
    });

    req.end();
  });
}

// Spotify simplifying

function simplifyTracklist(tracklist: Track[]): SpotifyTrack[] {
  return tracklist.map((track) => ({
    id: track.id,
    name: track.name,
    artist: track.artists.map((artist) => artist.name).join(', '),
    album: track.album.name,
    duration_ms: track.duration_ms,
    art: pickSpotifyArt(track.album.images),
    popularity: track.popularity,
  }));
}

function simplifyPlaylistList(playlistList: Playlist[]): SpotifyPlaylist[] {
  return playlistList.map((playlist) => ({
    id: playlist.id,
    name: playlist.name,
    art: pickSpotifyArt(playlist.images),
    uri: playlist.uri,
  }));
}

function pickSpotifyArt(images: Image[]): string {
  const sortedImages = images.sort(
    (a, b) => (b.width ? b.width : 0) - (a.width ? a.width : 0)
  );
  let rtn = sortedImages[0].url;
  sortedImages.forEach((image) => {
    if ((image.width ? image.width : 0) >= MINIMUM_ART_SIZE) rtn = image.url;
  });
  return rtn;
}

// Spotify typing

type Image = {
  url: string;
  height: number | null;
  width: number | null;
};

type Album = {
  id: string;
  images: Image[];
  name: string;
  uri: string;
};

type Artist = {
  id: string;
  name: string;
  uri: string;
};

type Track = {
  album: Album;
  artists: Artist[];
  duration_ms: number;
  id: string;
  name: string;
  uri: string;
  popularity: number;
};

type Playlist = {
  id: string;
  name: string;
  uri: string;
  images: Image[];
};

function isImage(input: unknown): input is Image {
  const rtn =
    typeof input === 'object' &&
    input !== null &&
    hasPropertyWithType(input, 'url', ['string']) &&
    hasPropertyWithType(input, 'height', ['number', 'null']) &&
    hasPropertyWithType(input, 'width', ['number', 'null']);
  if (!rtn)
    log('error', `Spotify image object failed: ${JSON.stringify(input)}`);
  return rtn;
}

function isAlbum(input: unknown): input is Album {
  const rtn =
    typeof input === 'object' &&
    input !== null &&
    hasPropertyWithType(input, 'id', ['string']) &&
    hasPropertyWithType(input, 'name', ['string']) &&
    hasPropertyWithType(input, 'uri', ['string']) &&
    'images' in input &&
    Array.isArray(input.images) &&
    input.images.every(isImage);
  if (!rtn)
    log('error', `Spotify album object failed: ${JSON.stringify(input)}`);
  return rtn;
}

function isArtist(input: unknown): input is Artist {
  const rtn =
    typeof input === 'object' &&
    input !== null &&
    hasPropertyWithType(input, 'id', ['string']) &&
    hasPropertyWithType(input, 'name', ['string']) &&
    hasPropertyWithType(input, 'uri', ['string']);
  if (!rtn)
    log('error', `Spotify artist object failed: ${JSON.stringify(input)}`);
  return rtn;
}

function isTrack(input: unknown): input is Track {
  const rtn =
    typeof input === 'object' &&
    input !== null &&
    'album' in input &&
    'artists' in input &&
    isAlbum(input.album) &&
    Array.isArray(input.artists) &&
    input.artists.every(isArtist) &&
    hasPropertyWithType(input, 'duration_ms', ['number']) &&
    hasPropertyWithType(input, 'id', ['string']) &&
    hasPropertyWithType(input, 'name', ['string']) &&
    hasPropertyWithType(input, 'uri', ['string']) &&
    hasPropertyWithType(input, 'popularity', ['number']);
  if (!rtn)
    log('error', `Spotify track object failed: ${JSON.stringify(input)}`);
  return rtn;
}

function isPlaylist(input: unknown): input is Playlist {
  const rtn =
    typeof input === 'object' &&
    input !== null &&
    hasPropertyWithType(input, 'id', ['string']) &&
    hasPropertyWithType(input, 'name', ['string']) &&
    hasPropertyWithType(input, 'uri', ['string']) &&
    'images' in input &&
    Array.isArray(input.images) &&
    input.images.every(isImage);
  if (!rtn)
    log('error', `Spotify playlist object failed: ${JSON.stringify(input)}`);
  return rtn;
}

function hasTracklist(input: unknown): input is { tracks: { items: Track[] } } {
  const rtn =
    typeof input === 'object' &&
    input !== null &&
    'tracks' in input &&
    typeof input.tracks === 'object' &&
    input.tracks !== null &&
    'items' in input.tracks &&
    Array.isArray(input.tracks.items) &&
    input.tracks.items.every(isTrack);
  if (!rtn)
    log('error', `Spotify tracklist object failed: ${JSON.stringify(input)}`);
  return rtn;
}

function isPlaylistItems(
  input: unknown
): input is { items: { track: Track }[] } {
  const rtn =
    typeof input === 'object' &&
    input !== null &&
    'items' in input &&
    Array.isArray(input.items) &&
    input.items.every((item) => {
      return (
        typeof item === 'object' &&
        item !== null &&
        'track' in item &&
        isTrack(item.track)
      );
    });
  if (!rtn)
    log(
      'error',
      `Spotify playlist items object failed: ${JSON.stringify(input)}`
    );
  return rtn;
}

function hasPlaylistList(input: unknown): input is { items: Playlist[] } {
  const rtn =
    typeof input === 'object' &&
    input !== null &&
    'items' in input &&
    Array.isArray(input.items) &&
    input.items.every(isPlaylist);
  if (!rtn)
    log(
      'error',
      `Spotify playlist list object failed: ${JSON.stringify(input)}`
    );
  return rtn;
}

function isUserProfile(
  input: unknown
): input is { display_name: string; id: string } {
  const rtn =
    typeof input === 'object' &&
    input !== null &&
    hasPropertyWithType(input, 'display_name', ['string']) &&
    hasPropertyWithType(input, 'id', ['string']);
  if (!rtn)
    log(
      'error',
      `Spotify user profile object failed: ${JSON.stringify(input)}`
    );
  return rtn;
}
