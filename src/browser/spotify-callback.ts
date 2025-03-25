const params = new URLSearchParams(window.location.search);
const code = params.get('code');

if (code) {
  window.opener.postMessage({ type: 'authorization_code', code: code }, '*');
} else {
  window.opener.postMessage({ type: 'error', error: 'No code received' }, '*');
}
console.log(params)
window.close();
