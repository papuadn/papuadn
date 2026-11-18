#!/usr/bin/env node
// Builds the profile cards (and optionally the README activity list).
//
//   node scripts/generate.mjs --out dist [--only github|spotify] [--readme README.md]
//
// Env:
//   GITHUB_TOKEN / STATS_TOKEN   STATS_TOKEN (a PAT) lets the languages card see private repos.
//   PROFILE_LOGIN                defaults to the repo owner.
//   SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REFRESH_TOKEN
//
// Each card is independent: if one source fails, the others still render and
// the previous version of the failed card is left in place.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { renderActivity, replaceSection } from './activity.mjs';
import { contributionsCard, heroCard, languagesCard, spotifyCard } from './cards.mjs';
import { fetchContributionWeeks, fetchPublicEvents, fetchRecentTotals, fetchRepoLanguages, fetchSpotify } from './sources.mjs';
import { heroProfile } from './profile.mjs';
import { aggregateLanguages, countActiveProjects } from './stats.mjs';

const { values: args } = parseArgs({
  options: {
    out: { type: 'string', default: 'dist' },
    only: { type: 'string' },
    readme: { type: 'string' },
  },
});

const env = process.env;
const login = env.PROFILE_LOGIN || env.GITHUB_REPOSITORY_OWNER || 'papuadn';
const token = env.STATS_TOKEN || env.GITHUB_TOKEN;
const wants = (name) => !args.only || args.only === name;

const warn = (msg) => console.log(env.GITHUB_ACTIONS ? `::warning::${msg}` : `⚠️  ${msg}`);
let failures = 0;
let successes = 0;

async function writeThemed(name, render) {
  for (const theme of ['light', 'dark']) {
    const file = join(args.out, `${name}-${theme}.svg`);
    await writeFile(file, render(theme));
    console.log(`✓ ${file}`);
  }
}

async function step(name, fn) {
  try {
    await fn();
    successes += 1;
  } catch (error) {
    failures += 1;
    warn(`${name} failed, keeping the previous version: ${error.message}`);
  }
}

await mkdir(args.out, { recursive: true });

if (wants('github')) {
  if (!token) throw new Error('Set GITHUB_TOKEN (or STATS_TOKEN) to build the GitHub cards');
  if (!env.STATS_TOKEN && env.GITHUB_ACTIONS) warn('STATS_TOKEN not set: the languages card can only see public repos');

  let weeks;
  let repos;

  await step('Contributions card', async () => {
    weeks = await fetchContributionWeeks(token, login);
    await writeThemed('contributions', (theme) => contributionsCard({ login, weeks }, theme));
  });

  await step('Languages card', async () => {
    repos = await fetchRepoLanguages(token, login);
    const summary = aggregateLanguages(repos);
    if (summary.languages.length === 0) throw new Error('no language data');
    await writeThemed('languages', (theme) => languagesCard(summary, theme));
  });

  await step('Hero card', async () => {
    if (!weeks || !repos) throw new Error('needs the contributions and repo data');
    const profile = heroProfile({
      contributions: weeks.flat().reduce((sum, d) => sum + d.count, 0),
      activeProjects: countActiveProjects(repos),
    });
    await writeThemed('hero', (theme) => heroCard({ login, ...profile }, theme));
  });

  if (args.readme) {
    await step('README activity', async () => {
      const [events, totals] = await Promise.all([fetchPublicEvents(token, login), fetchRecentTotals(token, login)]);
      const readme = await readFile(args.readme, 'utf8');
      await writeFile(args.readme, replaceSection(readme, 'activity', renderActivity(events, totals)));
      console.log(`✓ ${args.readme} activity section`);
    });
  }
}

if (wants('spotify')) {
  const credentials = {
    clientId: env.SPOTIFY_CLIENT_ID,
    clientSecret: env.SPOTIFY_CLIENT_SECRET,
    refreshToken: env.SPOTIFY_REFRESH_TOKEN,
  };
  if (Object.values(credentials).every(Boolean)) {
    await step('Spotify card', async () => {
      const data = await fetchSpotify(credentials);
      await writeThemed('spotify', (theme) => spotifyCard(data, theme));
    });
  } else {
    warn('Spotify secrets not set (run scripts/spotify-auth.mjs); drawing the idle card');
    await writeThemed('spotify', (theme) => spotifyCard({ state: 'offline' }, theme));
  }
}

if (failures > 0 && successes === 0) process.exit(1);
