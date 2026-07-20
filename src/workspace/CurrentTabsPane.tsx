import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, Globe2, RefreshCw } from 'lucide-react'
import { groupLiveTabs } from '../domain/ownership'
import type { PersistedStateV1 } from '../domain/types'
import type { LiveTabsModel } from './useLiveTabs'

export function CurrentTabsPane({ model, state }: { model: LiveTabsModel; state: PersistedStateV1 }) {
  const inventory = model.inventory
  const groups = useMemo(() => groupLiveTabs(state, inventory?.tabs ?? []), [state, inventory?.tabs])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  return (
    <aside className="current-tabs" aria-labelledby="current-tabs-title">
      <div className="pane-heading">
        <h2 id="current-tabs-title">Current Tabs</h2>
        <span>{inventory ? inventory.tabs.length : 'LIVE'}</span>
      </div>
      {model.actionError && <div className="tabs-warning" role="alert"><span>{model.actionError}</span><button onClick={model.dismissActionError}>Dismiss</button></div>}
      {model.status === 'loading' ? (
        <div className="tabs-empty" aria-live="polite"><div className="loader" /><h3>Reading this window’s tabs</h3><p>Protab only displays tabs beside this workspace.</p></div>
      ) : inventory?.stale ? (
        <div className="tabs-error" role="alert"><AlertTriangle size={22} /><h3>Current tabs are unavailable</h3><p>{inventory.error}</p><button className="button secondary" onClick={model.retry}><RefreshCw size={14} /> Retry</button>{inventory.tabs.length > 0 && <p className="stale-note">The list below is the last successful snapshot.</p>}</div>
      ) : inventory?.tabs.length === 0 ? (
        <div className="tabs-empty"><div className="tab-lines"><i /><i /><i /></div><h3>No ordinary tabs in this window</h3><p>Open a page beside Protab and it will appear here automatically.</p></div>
      ) : null}
      {inventory && inventory.tabs.length > 0 && (
        <div className={inventory.stale ? 'live-tab-groups stale' : 'live-tab-groups'}>
          {groups.map((group) => {
            const isCollapsed = collapsed.has(group.id)
            return <section className="live-tab-group" key={group.id} aria-labelledby={`live-group-${group.id}`}>
              <button id={`live-group-${group.id}`} className="live-group-heading" aria-expanded={!isCollapsed} aria-controls={`live-group-list-${group.id}`} onClick={() => setCollapsed((current) => { const next = new Set(current); if (next.has(group.id)) next.delete(group.id); else next.add(group.id); return next })}>
                <span>{group.label}</span><span>{group.tabs.length}</span><ChevronDown size={14} className={isCollapsed ? 'group-chevron collapsed' : 'group-chevron'} />
              </button>
              {!isCollapsed && <ul id={`live-group-list-${group.id}`} className="live-tab-list" aria-label={`${group.label} tabs`}>
                {group.tabs.map((tab) => (
                  <li key={tab.tabId}>
                    <button className="live-tab-row" aria-current={tab.active ? 'page' : undefined} aria-label={`${tab.title}. ${tab.url ?? tab.urlSummary}. ${tab.active ? 'Current tab. ' : ''}${tab.ownership ? `Owned by ${group.label}. ${tab.ownership.drifted ? 'Navigated from saved URL.' : ''}` : tab.supported ? 'Unassigned.' : 'Unsupported page — view only.'}`} onClick={() => model.focus(tab.tabId)}>
                      {tab.favIconUrl ? <img src={tab.favIconUrl} alt="" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true }} /> : <Globe2 aria-hidden="true" size={18} />}
                      <span className="live-tab-copy"><strong title={tab.title}>{tab.title}</strong><small title={tab.url}>{tab.urlSummary}</small><span>{tab.active ? 'Current tab · ' : ''}{tab.ownership ? tab.ownership.drifted ? 'Navigated from saved URL' : `Owned by ${group.label}` : tab.supported ? 'Unassigned' : 'Unsupported page — view only'}</span></span>
                    </button>
                  </li>
                ))}
              </ul>}
            </section>
          })}
        </div>
      )}
    </aside>
  )
}
