// SVG renderers. Each card is drawn twice (light + dark) so the README can
// swap them with <picture> and prefers-color-scheme.
import { formatDate, formatDuration, intensityScale, summariseCalendar, timeAgo } from './stats.mjs';

const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif`;
const WIDTH = 800;
const PAD = 24;

export const THEMES = {
  light: {
    bg: '#ffffff',
    border: '#d0d7de',
    text: '#1f2328',
    muted: '#59636e',
    track: '#eaeef2',
    heat: ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'],
    spotify: '#1a9e4b',
  },
  dark: {
    bg: '#0d1117',
    border: '#30363d',
    text: '#e6edf3',
    muted: '#9198a1',
    track: '#21262d',
    heat: ['#161b22', '#0e4429', '#006d32', '#26a641', '#39d353'],
    spotify: '#1ed760',
  },
};

export const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** SVG text can't ellipsise itself, so approximate from the font size. */
export function fit(text, widthPx, fontSize, bold = false) {
  const maxChars = Math.floor(widthPx / (fontSize * (bold ? 0.56 : 0.5)));
  const chars = [...String(text ?? '')];
  return chars.length <= maxChars ? chars.join('') : `${chars.slice(0, maxChars - 1).join('').trimEnd()}…`;
}

const plural = (n, word) => `${n.toLocaleString('en-AU')} ${word}${n === 1 ? '' : 's'}`;

function frame({ height, theme, title, desc, body, style = '' }) {
  const t = THEMES[theme];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-labelledby="title desc">
<title id="title">${esc(title)}</title>
<desc id="desc">${esc(desc)}</desc>
<style>
  text { font-family: ${FONT}; fill: ${t.text}; }
  .label { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; fill: ${t.muted}; }
  .muted { fill: ${t.muted}; }
  .fade { animation: fade 0.6s ease-out both; }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
  ${style}
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } }
</style>
<rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${height - 1}" rx="12" fill="${t.bg}" stroke="${t.border}"/>
${body}
</svg>
`;
}

// ---------------------------------------------------------------------------
// Contributions: headline numbers + a full-year heatmap
// ---------------------------------------------------------------------------

export function contributionsCard({ login, weeks }, theme) {
  const t = THEMES[theme];
  const days = weeks.flat();
  const s = summariseCalendar(days);
  const level = intensityScale(days);

  const stats = [
    {
      label: 'STREAK',
      value: plural(s.current.length, 'day'),
      sub: s.current.length ? `since ${formatDate(s.current.start)}` : 'start one today',
    },
    {
      label: 'LONGEST',
      value: plural(s.longest.length, 'day'),
      sub: s.longest.length ? `${formatDate(s.longest.start)} – ${formatDate(s.longest.end)}` : '—',
    },
    { label: 'BEST DAY', value: s.best.count.toLocaleString('en-AU'), sub: formatDate(s.best.date, { year: true }) || '—' },
    { label: 'ACTIVE DAYS', value: s.activeDays.toLocaleString('en-AU'), sub: `${Math.round(s.activeRatio * 100)}% of the year` },
  ];
  const colW = 118;
  const colX = WIDTH - PAD - colW * stats.length;
  const statsSvg = stats
    .map((st, i) => {
      const x = colX + i * colW;
      return `<g class="fade" style="animation-delay:${i * 80}ms">
  <text x="${x}" y="40" class="label">${st.label}</text>
  <text x="${x}" y="70" font-size="20" font-weight="700">${esc(st.value)}</text>
  <text x="${x}" y="90" font-size="12" class="muted">${esc(st.sub)}</text>
</g>`;
    })
    .join('\n');

  // Heatmap
  const cell = 11;
  const pitch = 14;
  const gridW = weeks.length * pitch - (pitch - cell);
  const gx = Math.round((WIDTH - gridW) / 2);
  const gy = 146;
  let lastLabelX = -Infinity;
  let lastMonth = null;
  const months = [];
  weeks.forEach((week, i) => {
    const month = week[0].date.slice(0, 7);
    if (month !== lastMonth) {
      const x = gx + i * pitch;
      // Skip a label that would collide with the previous one (e.g. a partial first week).
      if (x - lastLabelX >= 30 && i < weeks.length - 1) {
        const name = new Date(`${week[0].date}T00:00:00Z`).toLocaleDateString('en-AU', { month: 'short', timeZone: 'UTC' });
        months.push(`<text x="${x}" y="${gy - 8}" font-size="11" class="muted">${name}</text>`);
        lastLabelX = x;
      }
      lastMonth = month;
    }
  });
  const grid = weeks
    .map((week, i) => {
      const cells = week
        .map((d) => {
          const row = new Date(`${d.date}T00:00:00Z`).getUTCDay();
          return `<rect x="${gx + i * pitch}" y="${gy + row * pitch}" width="${cell}" height="${cell}" rx="2" fill="${t.heat[level(d.count)]}"/>`;
        })
        .join('');
      return `<g class="fade" style="animation-delay:${200 + i * 12}ms">${cells}</g>`;
    })
    .join('\n');

  const legendY = gy + 7 * pitch + 22;
  const legendCells = t.heat
    .map((c, i) => `<rect x="${WIDTH - PAD - 30 - (5 - i) * pitch}" y="${legendY - 10}" width="${cell}" height="${cell}" rx="2" fill="${c}"/>`)
    .join('');
  const footnote = s.busiestWeekday ? `Most active on ${s.busiestWeekday} · private work included` : 'Private work included';

  const height = legendY + 20;
  return frame({
    height,
    theme,
    title: `${login}'s GitHub contributions`,
    desc: `${s.total} contributions in the last year. Current streak ${s.current.length} days, longest ${s.longest.length} days.`,
    body: `<g class="fade">
  <text x="${PAD}" y="40" class="label">CONTRIBUTIONS · LAST 12 MONTHS</text>
  <text x="${PAD}" y="80" font-size="36" font-weight="700">${s.total.toLocaleString('en-AU')}</text>
  <text x="${PAD}" y="102" font-size="12" class="muted">${esc(`@${login}`)}</text>
</g>
${statsSvg}
<line x1="${PAD}" y1="114" x2="${WIDTH - PAD}" y2="114" stroke="${t.border}" stroke-dasharray="2 4"/>
${months.join('\n')}
${grid}
<text x="${gx}" y="${legendY}" font-size="11" class="muted">${esc(footnote)}</text>
<text x="${WIDTH - PAD - 30 - 5 * pitch - 6}" y="${legendY}" font-size="11" class="muted" text-anchor="end">Less</text>
${legendCells}
<text x="${WIDTH - PAD - 30 + 2}" y="${legendY}" font-size="11" class="muted">More</text>`,
  });
}

// ---------------------------------------------------------------------------
// Languages: stacked bar + legend
// ---------------------------------------------------------------------------

export function languagesCard({ languages, repoCount }, theme) {
  const t = THEMES[theme];
  const barW = WIDTH - PAD * 2;
  const barY = 58;
  let x = PAD;
  const segments = languages
    .map((l) => {
      const w = Math.max(2, l.share * barW);
      const seg = `<rect x="${x.toFixed(1)}" y="${barY}" width="${w.toFixed(1)}" height="10" fill="${l.color}" stroke="${t.bg}" stroke-width="1.5"/>`;
      x += w;
      return seg;
    })
    .join('');

  const cols = 4;
  const colW = barW / cols;
  const rowH = 28;
  const legendY = barY + 46;
  const legend = languages
    .map((l, i) => {
      const lx = PAD + (i % cols) * colW;
      const ly = legendY + Math.floor(i / cols) * rowH;
      const pct = l.share >= 0.1 ? `${(l.share * 100).toFixed(0)}%` : `${(l.share * 100).toFixed(1)}%`;
      return `<g class="fade" style="animation-delay:${300 + i * 50}ms">
  <circle cx="${lx + 5}" cy="${ly - 4}" r="5" fill="${l.color}"/>
  <text x="${lx + 18}" y="${ly}" font-size="13" font-weight="600">${esc(fit(l.name, colW - 70, 13, true))}</text>
  <text x="${lx + colW - 16}" y="${ly}" font-size="13" class="muted" text-anchor="end">${pct}</text>
</g>`;
    })
    .join('\n');

  const rows = Math.max(1, Math.ceil(languages.length / cols));
  const height = legendY + (rows - 1) * rowH + 22;
  return frame({
    height,
    theme,
    title: 'Most used languages',
    desc: languages.map((l) => `${l.name} ${(l.share * 100).toFixed(1)}%`).join(', '),
    style: `.grow { transform-box: fill-box; transform-origin: left; animation: grow 0.9s cubic-bezier(.2,.8,.2,1) both; }
  @keyframes grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }`,
    body: `<text x="${PAD}" y="40" class="label">LANGUAGES · WEIGHTED ACROSS ${repoCount} ${repoCount === 1 ? 'REPOSITORY' : 'REPOSITORIES'}</text>
<clipPath id="bar"><rect x="${PAD}" y="${barY}" width="${barW}" height="10" rx="5"/></clipPath>
<rect x="${PAD}" y="${barY}" width="${barW}" height="10" rx="5" fill="${t.track}"/>
<g clip-path="url(#bar)"><g class="grow">${segments}</g></g>
${legend}`,
  });
}

// ---------------------------------------------------------------------------
// Spotify: now playing (or last played) + recently played list
// ---------------------------------------------------------------------------

function artwork({ x, y, size, href, id, theme }) {
  const t = THEMES[theme];
  const r = size > 60 ? 8 : 4;
  if (!href) {
    return `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${r}" fill="${t.track}"/>
<text x="${x + size / 2}" y="${y + size / 2 + size * 0.14}" font-size="${size * 0.4}" text-anchor="middle" class="muted">♪</text>`;
  }
  return `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${r}"/></clipPath>
<image href="${href}" x="${x}" y="${y}" width="${size}" height="${size}" clip-path="url(#${id})" preserveAspectRatio="xMidYMid slice"/>
<rect x="${x + 0.5}" y="${y + 0.5}" width="${size - 1}" height="${size - 1}" rx="${r}" fill="none" stroke="${t.border}" stroke-opacity="0.6"/>`;
}

export function spotifyCard({ state, current, recent = [], now = Date.now() }, theme) {
  const t = THEMES[theme];
  const art = 136;
  const tx = PAD + art + 24;
  const leftW = 300;
  const divider = tx + leftW + 18;
  const rx = divider + 22;
  const rightW = WIDTH - PAD - rx;
  const height = 184;

  let status;
  if (state === 'playing') {
    const bars = [0, 1, 2, 3]
      .map((i) => `<rect class="eq" style="animation-delay:-${[0.2, 0.55, 0.35, 0.8][i]}s" x="${tx + i * 5}" y="${30}" width="3" height="12" rx="1" fill="${t.spotify}"/>`)
      .join('');
    status = `${bars}<text x="${tx + 28}" y="41" class="label" style="fill:${t.spotify}">NOW PLAYING ON SPOTIFY</text>`;
  } else if (state === 'recent') {
    status = `<text x="${tx}" y="41" class="label">LAST PLAYED · ${esc(timeAgo(current.playedAt, now).toUpperCase())}</text>`;
  } else {
    status = `<text x="${tx}" y="41" class="label">SPOTIFY</text>`;
  }

  let details;
  if (current) {
    const progress =
      state === 'playing' && current.durationMs
        ? `<rect x="${tx}" y="146" width="${leftW}" height="4" rx="2" fill="${t.track}"/>
<rect x="${tx}" y="146" width="${(leftW * Math.min(1, current.progressMs / current.durationMs)).toFixed(1)}" height="4" rx="2" fill="${t.spotify}"/>
<text x="${tx}" y="166" font-size="11" class="muted">${formatDuration(current.progressMs)}</text>
<text x="${tx + leftW}" y="166" font-size="11" class="muted" text-anchor="end">${formatDuration(current.durationMs)}</text>`
        : '';
    details = `<text x="${tx}" y="78" font-size="22" font-weight="700">${esc(fit(current.title, leftW, 22, true))}</text>
<text x="${tx}" y="103" font-size="15" class="muted">${esc(fit(current.artists, leftW, 15))}</text>
<text x="${tx}" y="125" font-size="13" class="muted">${esc(fit(current.album, leftW, 13))}</text>
${progress}`;
  } else {
    details = `<text x="${tx}" y="84" font-size="22" font-weight="700">Not listening right now</text>
<text x="${tx}" y="108" font-size="14" class="muted">Probably renovating or practising guitar.</text>`;
  }

  const list = recent
    .slice(0, 3)
    .map((track, i) => {
      const y = 54 + i * 40;
      return `<g class="fade" style="animation-delay:${150 + i * 90}ms">
${artwork({ x: rx, y, size: 32, href: track.art, id: `r${i}`, theme })}
<text x="${rx + 44}" y="${y + 14}" font-size="13" font-weight="600">${esc(fit(track.title, rightW - 44, 13, true))}</text>
<text x="${rx + 44}" y="${y + 30}" font-size="12" class="muted">${esc(fit(track.artists, rightW - 44, 12))}</text>
</g>`;
    })
    .join('\n');
  const right = recent.length
    ? `<line x1="${divider}" y1="${PAD}" x2="${divider}" y2="${height - PAD}" stroke="${t.border}"/>
<text x="${rx}" y="41" class="label">RECENTLY PLAYED</text>
${list}`
    : '';

  return frame({
    height,
    theme,
    title: 'Spotify',
    desc: current ? `${state === 'playing' ? 'Now playing' : 'Last played'}: ${current.title} by ${current.artists}` : 'Not listening right now',
    style: `.eq { transform-box: fill-box; transform-origin: bottom; animation: eq 0.9s ease-in-out infinite alternate; }
  @keyframes eq { 0% { transform: scaleY(0.25); } 50% { transform: scaleY(1); } 100% { transform: scaleY(0.5); } }`,
    body: `<g class="fade">${artwork({ x: PAD, y: PAD, size: art, href: current?.art, id: 'cover', theme })}</g>
${status}
<g class="fade" style="animation-delay:80ms">${details}</g>
${right}`,
  });
}

// ---------------------------------------------------------------------------
// Hero: who I am, a little terminal with live numbers, and a rotating status
// ---------------------------------------------------------------------------

const MONO = `ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace`;

export function heroCard({ name, role, location, login, contributions, activeProjects, taglines }, theme) {
  const t = THEMES[theme];
  const height = 252;
  const tx = 420;
  const tw = WIDTH - PAD - tx;
  const term = { bg: '#161b22', bar: '#21262d', text: '#e6edf3', dim: '#8b949e', prompt: '#3fb950', border: theme === 'dark' ? '#30363d' : '#161b22' };

  const lines = [
    ['cmd', 'git log --since=1.year | wc -l'],
    ['out', `${contributions.toLocaleString('en-AU')}  # private repos included`],
    ['cmd', 'ls ~/side-projects | wc -l'],
    ['out', `${activeProjects}  # it's fine. everything's fine.`],
    ['cmd', 'guitar --skill'],
    ['skill', 'enthusiastic'],
  ];
  const lineSvg = lines
    .map(([kind, text], i) => {
      const y = 24 + 28 + 22 + i * 18;
      const delay = `style="animation-delay:${400 + i * 350}ms"`;
      if (kind === 'cmd') {
        return `<text x="${tx + 16}" y="${y}" class="mono fade" ${delay}><tspan fill="${term.prompt}">$</tspan><tspan fill="${term.text}"> ${esc(text)}</tspan></text>`;
      }
      if (kind === 'skill') {
        const blocks = Array.from({ length: 10 }, (_, b) => `<rect x="${tx + 16 + b * 9}" y="${y - 9}" width="7" height="10" rx="1" fill="${b < 3 ? term.prompt : term.bar}"/>`).join('');
        return `<g class="fade" ${delay}>${blocks}<text x="${tx + 16 + 98}" y="${y}" class="mono term-dim">${esc(text)}</text></g>`;
      }
      return `<text x="${tx + 16}" y="${y}" class="mono fade term-dim" ${delay}>${esc(text)}</text>`;
    })
    .join('\n');
  const cursorY = 24 + 28 + 22 + lines.length * 18;

  const cycle = taglines.length * 3.5;
  const step = 100 / taglines.length;
  const taglineSvg = taglines
    .map((line, i) => `<text x="${PAD + 92}" y="230" font-size="15" class="tagline${i === 0 ? ' first' : ''}" style="animation-delay:${i * 3.5}s">${esc(fit(line, WIDTH - PAD * 2 - 92, 15))}</text>`)
    .join('\n');

  return frame({
    height,
    theme,
    title: `${name} (${login})`,
    desc: `${role}, ${location}. ${contributions} contributions in the last year.`,
    style: `.mono { font-family: ${MONO}; font-size: 12px; }
  .mono tspan, .mono { white-space: pre; }
  text.term-dim { fill: ${term.dim}; }
  .tagline { opacity: 0; animation: cycle ${cycle}s infinite; }
  @keyframes cycle { 0% { opacity: 0; transform: translateY(6px); } ${(step * 0.12).toFixed(2)}% { opacity: 1; transform: none; } ${(step * 0.88).toFixed(2)}% { opacity: 1; transform: none; } ${step.toFixed(2)}% { opacity: 0; transform: translateY(-6px); } 100% { opacity: 0; } }
  .cursor { animation: blink 1.1s steps(1) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .tagline.first { opacity: 1; } }`,
    body: `<g class="fade">
  <text x="${PAD}" y="62" class="label">G'DAY, I'M</text>
  <text x="${PAD}" y="106" font-size="40" font-weight="800" letter-spacing="-0.02em">${esc(name)}</text>
  <text x="${PAD}" y="136" font-size="16" font-weight="600">${esc(role)}</text>
  <text x="${PAD}" y="160" font-size="13" class="muted">${esc(location)} · @${esc(login)}</text>
</g>
<g class="fade" style="animation-delay:200ms">
  <rect x="${tx}" y="${PAD}" width="${tw}" height="${cursorY - PAD + 14}" rx="10" fill="${term.bg}" stroke="${term.border}"/>
  <path d="M${tx + 10} ${PAD + 0.5} h${tw - 20} a10 10 0 0 1 10 10 v17.5 h-${tw} v-17.5 a10 10 0 0 1 10 -10 z" fill="${term.bar}"/>
  <circle cx="${tx + 16}" cy="${PAD + 14}" r="5" fill="#ff5f57"/><circle cx="${tx + 32}" cy="${PAD + 14}" r="5" fill="#febc2e"/><circle cx="${tx + 48}" cy="${PAD + 14}" r="5" fill="#28c840"/>
  <text x="${tx + tw / 2}" y="${PAD + 18}" class="mono term-dim" font-size="11" text-anchor="middle">~/papuadn — zsh</text>
</g>
${lineSvg}
<text x="${tx + 16}" y="${cursorY}" class="mono fade" style="animation-delay:${400 + lines.length * 350}ms"><tspan fill="${term.prompt}">$</tspan></text>
<rect x="${tx + 28}" y="${cursorY - 10}" width="7" height="13" fill="${term.text}" class="cursor"/>
<line x1="${PAD}" y1="206" x2="${WIDTH - PAD}" y2="206" stroke="${t.border}" stroke-dasharray="2 4"/>
<text x="${PAD}" y="229" class="label" style="fill:${t.spotify}">CURRENTLY ›</text>
${taglineSvg}`,
  });
}
