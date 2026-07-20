import { AlertTriangle, Globe2, RefreshCw } from 'lucide-react'
import type { LiveTabsModel } from './useLiveTabs'

export function CurrentTabsPane({ model }: { model: LiveTabsModel }) {
  const inventory = model.inventory
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
        <ul className={inventory.stale ? 'live-tab-list stale' : 'live-tab-list'} aria-label="Tabs in this Chrome window">
          {inventory.tabs.map((tab) => (
            <li key={tab.tabId}>
              <button className="live-tab-row" aria-current={tab.active ? 'page' : undefined} aria-label={`${tab.title}. ${tab.url ?? tab.urlSummary}. ${tab.active ? 'Current tab. ' : ''}${tab.supported ? '' : 'Unsupported page — view only.'}`} onClick={() => model.focus(tab.tabId)}>
                {tab.favIconUrl ? <img src={tab.favIconUrl} alt="" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true }} /> : <Globe2 aria-hidden="true" size={18} />}
                <span className="live-tab-copy"><strong title={tab.title}>{tab.title}</strong><small title={tab.url}>{tab.urlSummary}</small><span>{tab.active ? 'Current tab' : tab.supported ? 'Unassigned' : 'Unsupported page — view only'}</span></span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
