// The words on the hero card. Edit freely.
export function heroProfile({ contributions, activeProjects }) {
  return {
    name: 'Robert Price',
    role: 'Senior Software Engineer at Mable',
    location: 'Melbourne, Australia',
    contributions,
    activeProjects,
    taglines: [
      'shipping Flutter apps after hours, because sleep is overrated',
      `starting side project #${activeProjects + 1} instead of finishing #${activeProjects}`,
      'renovating the house, one YouTube tutorial at a time',
      'learning guitar. The neighbours are being very brave.',
      'noticing your kerning. Sorry, old designer habit.',
    ],
  };
}
