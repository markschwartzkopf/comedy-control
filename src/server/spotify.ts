import https from 'https';
import querystring from 'querystring';
import { log } from './logger';
import { util } from './main';

const spotifyRedirectUri = 'http://localhost:9999/spotify-callback.html';
util.setSettings({
  spotify: {
    redirectUri: spotifyRedirectUri,
  },
});
let accessToken: string | null = null;

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
        console.log(data);
        try {
          const response = JSON.parse(data);
          //const expireTime = new Date(Date.now() + response.expires_in * 1000);
          console.log('Access Token:', response.access_token);
          console.log('Refresh Token:', response.refresh_token);
          accessToken = response.access_token;
          //playTrack('spotify:track:6rqhFgbbKwnb9MLmUQDhG6');
          playTrack('spotify:track:6I9VzXrHxO9rA9A5euc8Ak');
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

function playTrack(trackUri: string) {
  if (!accessToken) {
    log('error', 'No access token, cannot play track');
    return;
  }
  const data = JSON.stringify({
    uris: [trackUri],
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
    console.log(`STATUS: ${res.statusCode}`);
    res.on('data', (d) => {
      process.stdout.write(d);
    });
  });

  req.on('error', (e) => {
    console.error(`problem with request: ${e.message}`);
  });

  // Write data to request body
  req.write(data);
  req.end();
}
