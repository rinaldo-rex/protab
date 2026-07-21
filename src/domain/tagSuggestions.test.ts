import { describe, expect, it } from 'vitest'
import { suggestTags } from './tagSuggestions'

describe('suggestTags', () => {
  it('returns video for youtube.com and youtu.be', () => {
    expect(suggestTags('youtube.com')).toEqual(['video'])
    expect(suggestTags('youtu.be')).toEqual(['video'])
  })

  it('returns video for YouTube subdomains', () => {
    expect(suggestTags('www.youtube.com')).toEqual(['video'])
    expect(suggestTags('music.youtube.com')).toEqual(['video'])
    expect(suggestTags('m.youtube.com')).toEqual(['video'])
  })

  it('returns code for GitHub, GitLab, Bitbucket', () => {
    expect(suggestTags('github.com')).toEqual(['code'])
    expect(suggestTags('gitlab.com')).toEqual(['code'])
    expect(suggestTags('bitbucket.org')).toEqual(['code'])
  })

  it('returns code for code hosting subdomains', () => {
    expect(suggestTags('www.github.com')).toEqual(['code'])
    expect(suggestTags('gist.github.com')).toEqual(['code'])
    expect(suggestTags('about.gitlab.com')).toEqual(['code'])
  })

  it('returns article for Medium and Substack', () => {
    expect(suggestTags('medium.com')).toEqual(['article'])
    expect(suggestTags('substack.com')).toEqual(['article'])
  })

  it('returns article for Medium and Substack subdomains', () => {
    expect(suggestTags('www.medium.com')).toEqual(['article'])
    expect(suggestTags('blog.substack.com')).toEqual(['article'])
  })

  it('returns social for listed social domains', () => {
    expect(suggestTags('x.com')).toEqual(['social'])
    expect(suggestTags('twitter.com')).toEqual(['social'])
    expect(suggestTags('facebook.com')).toEqual(['social'])
    expect(suggestTags('instagram.com')).toEqual(['social'])
    expect(suggestTags('linkedin.com')).toEqual(['social'])
    expect(suggestTags('reddit.com')).toEqual(['social'])
    expect(suggestTags('tiktok.com')).toEqual(['social'])
  })

  it('returns social for social subdomains', () => {
    expect(suggestTags('www.x.com')).toEqual(['social'])
    expect(suggestTags('mobile.twitter.com')).toEqual(['social'])
    expect(suggestTags('www.facebook.com')).toEqual(['social'])
    expect(suggestTags('old.reddit.com')).toEqual(['social'])
  })

  it('returns empty array for unknown hosts', () => {
    expect(suggestTags('random-blog.com')).toEqual([])
    expect(suggestTags('example.org')).toEqual([])
    expect(suggestTags('news.ycombinator.com')).toEqual([])
    expect(suggestTags('stackoverflow.com')).toEqual([])
  })

  it('does not match deceptive suffix domains', () => {
    expect(suggestTags('notyoutube.com')).toEqual([])
    expect(suggestTags('notgithub.com')).toEqual([])
    expect(suggestTags('faketwitter.com')).toEqual([])
    expect(suggestTags('youtube.com.evil.com')).toEqual([])
    expect(suggestTags('github.com.attacker.org')).toEqual([])
  })

  it('handles empty and invalid input', () => {
    expect(suggestTags('')).toEqual([])
    expect(suggestTags('   ')).toEqual([])
  })

  it('returns each tag at most once even if multiple domains match', () => {
    // Both youtube.com and youtu.be map to 'video', but should not duplicate
    expect(suggestTags('youtube.com')).toEqual(['video'])
    expect(suggestTags('youtu.be')).toEqual(['video'])
  })

  it('is case-insensitive for hostname matching', () => {
    expect(suggestTags('YouTube.com')).toEqual(['video'])
    expect(suggestTags('GITHUB.COM')).toEqual(['code'])
    expect(suggestTags('WWW.Reddit.com')).toEqual(['social'])
  })

  it('returns empty array for non-hostname strings', () => {
    // The function expects just hostname, not full URLs
    // Callers should parse URLs and extract hostname before calling suggestTags
    expect(suggestTags('https://youtube.com')).toEqual([])
    expect(suggestTags('youtube.com/')).toEqual([])
    expect(suggestTags('youtube.com:443')).toEqual([])
  })
})
