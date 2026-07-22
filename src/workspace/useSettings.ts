import { useState, useEffect, useCallback } from 'react'
import { readSettings, writeSettings, DEFAULT_SETTINGS, type ProtabSettings } from '../domain/settings'

export function useSettings(): [ProtabSettings, (update: Partial<ProtabSettings>) => void] {
  const [settings, setSettings] = useState<ProtabSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    // Only read settings if chrome.storage is available
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      void readSettings().then(setSettings).catch(() => {
        // Ignore errors in test environment
      })
    }
  }, [])

  const updateSettings = useCallback((update: Partial<ProtabSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...update }
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        void writeSettings(next).catch(() => {
          // Ignore errors in test environment
        })
      }
      return next
    })
  }, [])

  return [settings, updateSettings]
}
