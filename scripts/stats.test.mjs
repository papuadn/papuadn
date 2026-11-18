import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderActivity, replaceSection } from './activity.mjs';
import { contributionsCard, esc, fit, languagesCard, spotifyCard } from './cards.mjs';
import { aggregateLanguages, intensityScale, summariseCalendar, timeAgo } from './stats.mjs';

const days = (counts, start = '2026-11-01') =>
  counts.map((count, i) => ({ date: new Date(Date.parse(`${start}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10), count }));

test('streaks: current streak survives a quiet today', () => {
  const s = summariseCalendar(days([1, 0, 2, 3, 4, 0]));
  assert.equal(s.current.length, 3);
  assert.equal(s.current.start, '2026-11-03');
});

test('streaks: current streak is zero once a full day is missed', () => {
  assert.equal(summariseCalendar(days([5, 5, 0, 0])).current.length, 0);
});

test('streaks: longest streak, best day and totals', () => {
  const s = summariseCalendar(days([1, 1, 1, 0, 9, 1, 0]));
  assert.deepEqual(s.longest, { length: 3, start: '2026-11-01', end: '2026-11-03' });
  assert.deepEqual(s.best, { count: 9, date: '2026-11-05' });
  assert.equal(s.total, 13);
  assert.equal(s.activeDays, 5);
});

test('streaks: empty calendar', () => {
  const s = summariseCalendar(days([0, 0, 0]));
  assert.equal(s.total, 0);
  assert.equal(s.current.length, 0);
  assert.equal(s.busiestWeekday, null);
});

test('intensity: zero is always level 0 and the max is level 4', () => {
  const scale = intensityScale(days([0, 1, 2, 3, 4, 5, 6, 7, 8]));
  assert.equal(scale(0), 0);
  assert.equal(scale(1), 1);
  assert.equal(scale(8), 4);
});

test('languages: weighted per repo, so one huge repo cannot dominate', () => {
  const now = Date.parse('2026-11-18');
  const { languages, repoCount } = aggregateLanguages(
    [
      { pushedAt: '2026-11-01', languages: [{ name: 'JavaScript', color: '#f1e05a', size: 10_000_000 }] },
      { pushedAt: '2026-11-01', languages: [{ name: 'TypeScript', color: '#3178c6', size: 1_000 }] },
      { pushedAt: '2026-11-01', languages: [{ name: 'TypeScript', color: '#3178c6', size: 1_000 }] },
    ],
    { now },
  );
  assert.equal(repoCount, 3);
  assert.equal(languages[0].name, 'TypeScript');
  assert.ok(Math.abs(languages[0].share - 2 / 3) < 1e-9);
});

test('languages: stale repos count for less and extras roll into Other', () => {
  const now = Date.parse('2026-11-18');
  const repo = (name, pushedAt) => ({ pushedAt, languages: [{ name, color: null, size: 100 }] });
  const { languages } = aggregateLanguages([repo('Old', '2020-01-01'), repo('New', '2026-10-01'), repo('Extra', '2026-10-01')], { now, top: 2 });
  assert.deepEqual(languages.map((l) => l.name), ['New', 'Extra', 'Other']);
  assert.equal(languages[2].color, '#8b949e');
});

test('timeAgo', () => {
  const now = Date.parse('2026-11-18T12:00:00Z');
  assert.equal(timeAgo('2026-11-18T11:58:00Z', now), '2 min ago');
  assert.equal(timeAgo('2026-11-18T09:00:00Z', now), '3 h ago');
  assert.equal(timeAgo('2026-11-17T10:00:00Z', now), 'yesterday');
});

test('text: escaping and truncation', () => {
  assert.equal(esc(`<a href="x">&'</a>`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(fit('short', 300, 14), 'short');
  const long = fit('x'.repeat(200), 100, 14);
  assert.ok(long.endsWith('…') && long.length < 20);
});

test('cards render valid-looking SVG in both themes and escape user content', () => {
  const weeks = [days([0, 1, 2, 3, 4, 5, 6], '2026-11-01'), days([7, 0, 0], '2026-11-08')];
  for (const theme of ['light', 'dark']) {
    for (const svg of [
      contributionsCard({ login: 'papuadn', weeks }, theme),
      languagesCard({ languages: [{ name: 'C++', color: '#f34b7d', share: 1 }], repoCount: 1 }, theme),
      spotifyCard({ state: 'playing', current: { title: 'Rock & <Roll>', artists: 'A', album: 'B', progressMs: 1, durationMs: 2 }, recent: [] }, theme),
      spotifyCard({ state: 'offline' }, theme),
    ]) {
      assert.match(svg, /^<svg [^>]*viewBox="0 0 800 \d+"/);
      assert.ok(svg.trimEnd().endsWith('</svg>'));
      assert.ok(!svg.includes('<Roll>'));
      assert.ok(!svg.includes('NaN') && !svg.includes('undefined'));
    }
  }
});

test('activity: collapses consecutive pushes and adds the private summary', () => {
  const push = { type: 'PushEvent', repo: { name: 'me/site' }, payload: { size: 2 } };
  const md = renderActivity([push, push, { type: 'WatchEvent', repo: { name: 'a/b' }, payload: {} }], { private: 1200, days: 30 });
  assert.equal(
    md,
    '1. ⬆️ Pushed 2 commits to [me/site](https://github.com/me/site)\n2. ⭐ Starred [a/b](https://github.com/a/b)\n\n🔒 Plus **1,200** contributions to private projects in the last 30 days.',
  );
});

test('activity: only private work', () => {
  assert.match(renderActivity([], { private: 5, days: 30 }), /^🔒 Mostly heads-down/);
});

test('replaceSection swaps only the marked block', () => {
  const out = replaceSection('a\n<!--START_SECTION:x-->\nold\n<!--END_SECTION:x-->\nb', 'x', 'new');
  assert.equal(out, 'a\n<!--START_SECTION:x-->\nnew\n<!--END_SECTION:x-->\nb');
  assert.throws(() => replaceSection('nothing', 'x', 'new'));
});
