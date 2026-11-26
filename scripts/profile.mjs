// The words on the hero card. Edit freely.
export function heroProfile({ contributions, activeProjects }) {
  return {
    name: 'Robert Price',
    roles: ['CEO of Sunset Bytes Pty Ltd', 'Senior Software Engineer at Attain Healthtech'],
    location: 'Melbourne, Australia',
    contributions,
    activeProjects,
    taglines: [
      'shipping Flutter apps after hours, because sleep is overrated',
      'running Sunset Bytes: cosy apps and games for iOS, Android and Roblox',
      `starting side project #${activeProjects + 1} instead of finishing #${activeProjects}`,
      'renovating the house, one YouTube tutorial at a time',
      'learning guitar. The neighbours are being very brave.',
      'noticing your kerning. Sorry, old designer habit.',
    ],
  };
}
