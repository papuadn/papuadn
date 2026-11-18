// Turns public GitHub events into a short markdown list for the README.
const link = (text, url) => `[${text.replace(/[[\]]/g, '')}](${url})`;
const repoLink = (name) => link(name, `https://github.com/${name}`);

function describe(event) {
  const { type, payload: p, repo } = event;
  const r = repoLink(repo.name);
  switch (type) {
    case 'PushEvent': {
      const n = p.size ?? p.commits?.length;
      return n ? `⬆️ Pushed ${n} commit${n === 1 ? '' : 's'} to ${r}` : `⬆️ Pushed to ${r}`;
    }
    case 'PullRequestEvent': {
      const pr = link(`#${p.pull_request.number}`, p.pull_request.html_url);
      if (p.action === 'closed') return p.pull_request.merged ? `🎉 Merged PR ${pr} in ${r}` : `❌ Closed PR ${pr} in ${r}`;
      if (p.action === 'opened' || p.action === 'reopened') return `💪 Opened PR ${pr} in ${r}`;
      return null;
    }
    case 'PullRequestReviewEvent':
      return `👀 Reviewed PR ${link(`#${p.pull_request.number}`, p.pull_request.html_url)} in ${r}`;
    case 'IssuesEvent': {
      const issue = link(`#${p.issue.number}`, p.issue.html_url);
      if (p.action === 'opened') return `❗ Opened issue ${issue} in ${r}`;
      if (p.action === 'closed') return `✔️ Closed issue ${issue} in ${r}`;
      return null;
    }
    case 'IssueCommentEvent':
      return `🗣 Commented on ${link(`#${p.issue.number}`, p.comment.html_url)} in ${r}`;
    case 'CreateEvent':
      return p.ref_type === 'repository' ? `🌱 Created ${r}` : null;
    case 'ReleaseEvent':
      return p.action === 'published' ? `🚀 Released ${link(p.release.tag_name, p.release.html_url)} of ${r}` : null;
    case 'WatchEvent':
      return `⭐ Starred ${r}`;
    case 'ForkEvent':
      return `🍴 Forked ${r}`;
    default:
      return null;
  }
}

/** Markdown for the activity section. Consecutive pushes to one repo collapse into one line. */
export function renderActivity(events, totals, { limit = 6 } = {}) {
  const lines = [];
  let previous = null;
  for (const event of events) {
    if (event.type === 'PushEvent' && previous?.type === 'PushEvent' && previous.repo.name === event.repo.name) continue;
    const text = describe(event);
    previous = event;
    if (text) lines.push(text);
    if (lines.length === limit) break;
  }

  const out = lines.map((line, i) => `${i + 1}. ${line}`);
  if (totals?.private > 0) {
    if (out.length) out.push('');
    out.push(`🔒 ${out.length ? 'Plus' : 'Mostly heads-down in private repos:'} **${totals.private.toLocaleString('en-AU')}** contributions to private projects in the last ${totals.days} days.`);
  }
  if (out.length === 0) out.push('_Quiet on the public front lately._');
  return out.join('\n');
}

export function replaceSection(readme, name, content) {
  const start = `<!--START_SECTION:${name}-->`;
  const end = `<!--END_SECTION:${name}-->`;
  const from = readme.indexOf(start);
  const to = readme.indexOf(end);
  if (from === -1 || to === -1 || to < from) throw new Error(`README is missing the ${name} section markers`);
  return `${readme.slice(0, from + start.length)}\n${content}\n${readme.slice(to)}`;
}
