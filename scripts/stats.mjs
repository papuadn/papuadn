// Pure data shaping: no network, no SVG. Everything here is unit tested.

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

/**
 * Summarise a GitHub contribution calendar.
 * @param {{date: string, count: number}[]} days sorted oldest → newest, ending today
 */
export function summariseCalendar(days) {
  let total = 0;
  let activeDays = 0;
  let best = { count: 0, date: null };
  let longest = { length: 0, start: null, end: null };
  let run = { length: 0, start: null };
  const weekdayTotals = Array(7).fill(0);

  for (const day of days) {
    total += day.count;
    weekdayTotals[new Date(`${day.date}T00:00:00Z`).getUTCDay()] += day.count;
    if (day.count > 0) {
      activeDays += 1;
      if (day.count > best.count) best = { count: day.count, date: day.date };
      run = run.length === 0 ? { length: 1, start: day.date } : { length: run.length + 1, start: run.start };
      if (run.length > longest.length) longest = { length: run.length, start: run.start, end: day.date };
    } else {
      run = { length: 0, start: null };
    }
  }

  // Today without contributions yet doesn't break the streak; the day isn't over.
  let end = days.length - 1;
  if (end >= 0 && days[end].count === 0) end -= 1;
  let current = { length: 0, start: null };
  for (let i = end; i >= 0 && days[i].count > 0; i -= 1) {
    current = { length: current.length + 1, start: days[i].date };
  }

  const busiest = weekdayTotals.indexOf(Math.max(...weekdayTotals));
  return {
    total,
    activeDays,
    activeRatio: days.length ? activeDays / days.length : 0,
    best,
    longest,
    current,
    busiestWeekday: total > 0 ? WEEKDAYS[busiest] : null,
  };
}

/** Five-step intensity scale based on quartiles of the non-zero days, like GitHub's own graph. */
export function intensityScale(days) {
  const counts = days.map((d) => d.count).filter((c) => c > 0).sort((a, b) => a - b);
  if (counts.length === 0) return () => 0;
  const q = (p) => counts[Math.min(counts.length - 1, Math.floor(p * counts.length))];
  const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
  return (count) => {
    if (count <= 0) return 0;
    if (count <= q1) return 1;
    if (count <= q2) return 2;
    if (count <= q3) return 3;
    return 4;
  };
}

/**
 * Rank languages by how much of each repository they make up, not raw bytes,
 * so one repo with a vendored bundle can't drown out everything else.
 * Repos pushed in the last year count fully; older ones count for less.
 */
export function aggregateLanguages(repos, { now = Date.now(), top = 8 } = {}) {
  const scores = new Map();
  let counted = 0;

  for (const repo of repos) {
    const repoTotal = repo.languages.reduce((sum, l) => sum + l.size, 0);
    if (repoTotal === 0) continue;
    counted += 1;
    const ageDays = (now - new Date(repo.pushedAt).getTime()) / DAY_MS;
    const weight = ageDays <= 365 ? 1 : 0.35;
    for (const lang of repo.languages) {
      const entry = scores.get(lang.name) ?? { name: lang.name, color: lang.color, score: 0 };
      entry.score += (weight * lang.size) / repoTotal;
      scores.set(lang.name, entry);
    }
  }

  const sum = [...scores.values()].reduce((s, l) => s + l.score, 0);
  if (sum === 0) return { languages: [], repoCount: 0 };

  const ranked = [...scores.values()]
    .map((l) => ({ name: l.name, color: l.color ?? '#8b949e', share: l.score / sum }))
    .sort((a, b) => b.share - a.share);

  const shown = ranked.slice(0, top);
  const rest = ranked.slice(top).reduce((s, l) => s + l.share, 0);
  if (rest > 0.0005) shown.push({ name: 'Other', color: '#8b949e', share: rest });
  return { languages: shown, repoCount: counted };
}

/** "3 min ago", "2 h ago", "4 days ago" */
export function timeAgo(iso, now = Date.now()) {
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export function formatDate(iso, { year = false } = {}) {
  if (!iso) return '';
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    ...(year ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}

export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}
