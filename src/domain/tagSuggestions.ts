const TAG_MAP: Record<string, string> = {
  'youtube.com': 'video',
  'youtu.be': 'video',
  'github.com': 'code',
  'gitlab.com': 'code',
  'bitbucket.org': 'code',
  'medium.com': 'article',
  'substack.com': 'article',
  'x.com': 'social',
  'twitter.com': 'social',
  'facebook.com': 'social',
  'instagram.com': 'social',
  'linkedin.com': 'social',
  'reddit.com': 'social',
  'tiktok.com': 'social',
}

export function suggestTags(hostname: string): string[] {
  if (!hostname) return []
  const lower = hostname.toLowerCase()
  const tags = new Set<string>()
  for (const [base, tag] of Object.entries(TAG_MAP)) {
    if (lower === base || lower.endsWith('.' + base)) {
      tags.add(tag)
    }
  }
  return Array.from(tags)
}
