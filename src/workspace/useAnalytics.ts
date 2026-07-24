import { useState, useEffect } from 'react'
import type { ProtabAnalytics } from '../domain/analytics'
import { emptyAnalytics } from '../domain/analytics'

export function useAnalytics(): ProtabAnalytics {
  const [analytics, setAnalytics] = useState<ProtabAnalytics>(emptyAnalytics())

  useEffect(() => {
    // Only read analytics if chrome.storage is available
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.get('protab.analytics').then((result) => {
        const raw = result['protab.analytics']
        if (raw && typeof raw === 'object') {
          setAnalytics({
            totalTabsFiled: typeof raw.totalTabsFiled === 'number' ? raw.totalTabsFiled : 0,
            totalUrlsArchived: typeof raw.totalUrlsArchived === 'number' ? raw.totalUrlsArchived : 0,
            lastAction: raw.lastAction ?? undefined,
            dailyFocus: raw.dailyFocus && typeof raw.dailyFocus === 'object' ? raw.dailyFocus : {},
          })
        }
      }).catch(() => {
        // Ignore errors in test environment
      })

      // Listen for storage changes
      const onChanged = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
        if (areaName === 'local' && changes['protab.analytics']) {
          const raw = changes['protab.analytics'].newValue
          if (raw && typeof raw === 'object') {
            setAnalytics({
              totalTabsFiled: typeof raw.totalTabsFiled === 'number' ? raw.totalTabsFiled : 0,
              totalUrlsArchived: typeof raw.totalUrlsArchived === 'number' ? raw.totalUrlsArchived : 0,
              lastAction: raw.lastAction ?? undefined,
              dailyFocus: raw.dailyFocus && typeof raw.dailyFocus === 'object' ? raw.dailyFocus : {},
            })
          }
        }
      }
      chrome.storage.onChanged.addListener(onChanged)
      return () => chrome.storage.onChanged.removeListener(onChanged)
    }
  }, [])

  return analytics
}
