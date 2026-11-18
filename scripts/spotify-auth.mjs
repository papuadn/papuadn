#!/usr/bin/env node
// One-off helper to get a Spotify refresh token for the profile workflow.
//
// 1. Create an app at https://developer.spotify.com/dashboard
//    and add the redirect URI  http://127.0.0.1:8888/callback
// 2. SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... node scripts/spotify-auth.mjs
// 3. Approve in the browser. With --save, the three secrets are written to
//    this repo via `gh secret set`; otherwise they're printed for you to add.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

const { SPOTIFY_CLIENT_ID: clientId, SPOTIFY_CLIENT_SECRET: clientSecret } = process.env;
if (!clientId || !clientSecret) {
  console.error('Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET first.');
  process.exit(1);
}

const redirectUri = 'http://127.0.0.1:8888/callback';
const state = randomUUID();
const authUrl = `https://accounts.spotify.com/authorize?${new URLSearchParams({
  client_id: clientId,
  response_type: 'code',
  redirect_uri: redirectUri,
  scope: 'user-read-currently-playing user-read-recently-played',
  state,
})}`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, redirectUri);
  if (url.pathname !== '/callback') return res.writeHead(404).end();
  if (url.searchParams.get('state') !== state || !url.searchParams.get('code')) {
    res.writeHead(400).end('Authorisation failed or was cancelled.');
    return;
  }

  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: url.searchParams.get('code'), redirect_uri: redirectUri }),
  });
  const body = await tokenRes.json();
  res.writeHead(tokenRes.ok ? 200 : 500, { 'Content-Type': 'text/plain' }).end(tokenRes.ok ? 'Done — you can close this tab.' : 'Token exchange failed, check the terminal.');
  server.close();

  if (!tokenRes.ok) {
    console.error('Token exchange failed:', body);
    process.exit(1);
  }

  const secrets = { SPOTIFY_CLIENT_ID: clientId, SPOTIFY_CLIENT_SECRET: clientSecret, SPOTIFY_REFRESH_TOKEN: body.refresh_token };
  if (process.argv.includes('--save')) {
    for (const [name, value] of Object.entries(secrets)) {
      execFileSync('gh', ['secret', 'set', name], { input: value, stdio: ['pipe', 'inherit', 'inherit'] });
    }
    console.log('\nSaved the Spotify secrets to this repository.');
  } else {
    console.log('\nAdd these as repository secrets (Settings → Secrets and variables → Actions):\n');
    for (const [name, value] of Object.entries(secrets)) console.log(`${name}=${value}`);
  }
});

server.listen(8888, '127.0.0.1', () => {
  console.log(`Open this URL to authorise:\n\n${authUrl}\n`);
  if (process.platform === 'darwin') execFileSync('open', [authUrl]);
});
