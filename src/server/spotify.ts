import { SpotifyApi } from '@spotify/web-api-ts-sdk';

//const sdk = SpotifyApi.withUserAuthorization("client-id", "https://localhost:3000", ["scope1", "scope2"]);
export function initializeSpotify(
  id: string,
  secret: string,
  code: string
): Promise<void> {
  const authUrl = `https://accounts.spotify.com/en/authorize?client_id=${id}&response_type=code&redirect_uri=http://localhost:9999/index.html&scope=user-modify-playback-state%20user-read-playback-state`;
  return new Promise((resolve, reject) => {
    const api = SpotifyApi.withUserAuthorization(
      id,
      'http://localhost:9999/index.html'
    );
    api.player
      .getPlaybackState()
      .then((state) => {
        console.log(state);
        resolve();
      })
      .catch((err) => {
        reject(err);
      });
  });
}
