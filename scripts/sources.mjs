// Network access: GitHub (GraphQL + REST) and Spotify.
const UA = 'profile-readme-cards';

async function request(url, init = {}, label = url) {
  const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...init.headers }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok && res.status !== 204) {
    throw new Error(`${label} → HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return res;
}

// ---------------------------------------------------------------------------
// GitHub
// ---------------------------------------------------------------------------

async function graphql(token, query, variables = {}) {
  const res = await request(
    'https://api.github.com/graphql',
    { method: 'POST', headers: { Authorization: `bearer ${token}` }, body: JSON.stringify({ query, variables }) },
    'GitHub GraphQL',
  );
  const json = await res.json();
  if (json.errors) throw new Error(`GitHub GraphQL: ${json.errors.map((e) => e.message).join('; ')}`);
  return json.data;
}

/** Full-year calendar. Includes private contributions when the profile setting is on. */
export async function fetchContributionWeeks(token, login) {
  const data = await graphql(
    token,
    `query($login: String!) { user(login: $login) { contributionsCollection { contributionCalendar {
       weeks { contributionDays { date contributionCount } } } } } }`,
    { login },
  );
  return data.user.contributionsCollection.contributionCalendar.weeks.map((w) =>
    w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount })),
  );
}

/** Owned, non-fork repos with language byte counts. Private repos need a token that can see them. */
export async function fetchRepoLanguages(token, login) {
  const repos = [];
  let after = null;
  do {
    const data = await graphql(
      token,
      `query($login: String!, $after: String) { user(login: $login) {
         repositories(first: 100, after: $after, ownerAffiliations: OWNER, isFork: false) {
           pageInfo { hasNextPage endCursor }
           nodes { name pushedAt languages(first: 20) { edges { size node { name color } } } } } } }`,
      { login, after },
    );
    const page = data.user.repositories;
    for (const repo of page.nodes) {
      if (repo.name.toLowerCase() === login.toLowerCase()) continue; // this profile repo
      repos.push({
        name: repo.name,
        pushedAt: repo.pushedAt,
        languages: repo.languages.edges.map((e) => ({ name: e.node.name, color: e.node.color, size: e.size })),
      });
    }
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  return repos;
}

/** Contributions in the last N days, split into public vs private (restricted). */
export async function fetchRecentTotals(token, login, days = 30) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  const data = await graphql(
    token,
    `query($login: String!, $from: DateTime!, $to: DateTime!) { user(login: $login) {
       contributionsCollection(from: $from, to: $to) {
         restrictedContributionsCount contributionCalendar { totalContributions } } } }`,
    { login, from: from.toISOString(), to: to.toISOString() },
  );
  const c = data.user.contributionsCollection;
  return { total: c.contributionCalendar.totalContributions, private: c.restrictedContributionsCount, days };
}

/** Public events only: private repo names never leave GitHub. */
export async function fetchPublicEvents(token, login) {
  const res = await request(
    `https://api.github.com/users/${encodeURIComponent(login)}/events/public?per_page=100`,
    { headers: { Authorization: `bearer ${token}`, Accept: 'application/vnd.github+json' } },
    'GitHub events',
  );
  return (await res.json()).filter((e) => e.public);
}

// ---------------------------------------------------------------------------
// Spotify
// ---------------------------------------------------------------------------

async function spotifyAccessToken({ clientId, clientSecret, refreshToken }) {
  const res = await request(
    'https://accounts.spotify.com/api/token',
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    },
    'Spotify token refresh',
  );
  return (await res.json()).access_token;
}

/** Inline artwork as a data URI: GitHub's image proxy won't load external images inside an SVG. */
async function inlineImage(images, preferredSize) {
  if (!images?.length) return null;
  const pick = [...images].sort((a, b) => Math.abs(a.width - preferredSize) - Math.abs(b.width - preferredSize))[0];
  try {
    const res = await request(pick.url, {}, 'Spotify artwork');
    const type = res.headers.get('content-type') ?? 'image/jpeg';
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
  } catch {
    return null;
  }
}

async function toTrack(item, artSize) {
  const isEpisode = item.type === 'episode';
  return {
    id: item.id,
    title: item.name,
    artists: isEpisode ? item.show?.name ?? '' : item.artists.map((a) => a.name).join(', '),
    album: isEpisode ? 'Podcast' : item.album?.name ?? '',
    durationMs: item.duration_ms,
    art: await inlineImage(isEpisode ? item.images ?? item.show?.images : item.album?.images, artSize),
  };
}

export async function fetchSpotify(credentials) {
  const accessToken = await spotifyAccessToken(credentials);
  const api = async (path) => {
    const res = await request(`https://api.spotify.com/v1${path}`, { headers: { Authorization: `Bearer ${accessToken}` } }, `Spotify ${path}`);
    return res.status === 204 ? null : res.json();
  };

  const [playing, history] = await Promise.all([
    api('/me/player/currently-playing?additional_types=track,episode'),
    api('/me/player/recently-played?limit=20'),
  ]);

  const seen = new Set();
  const played = (history?.items ?? []).filter((h) => h.track && !seen.has(h.track.id) && seen.add(h.track.id));

  if (playing?.is_playing && playing.item) {
    const current = { ...(await toTrack(playing.item, 300)), progressMs: playing.progress_ms ?? 0 };
    const recent = await Promise.all(played.filter((h) => h.track.id !== current.id).slice(0, 3).map((h) => toTrack(h.track, 64)));
    return { state: 'playing', current, recent };
  }
  if (played.length) {
    const [last, ...rest] = played;
    const current = { ...(await toTrack(last.track, 300)), playedAt: last.played_at };
    const recent = await Promise.all(rest.slice(0, 3).map((h) => toTrack(h.track, 64)));
    return { state: 'recent', current, recent };
  }
  return { state: 'offline', current: null, recent: [] };
}
