import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle, Folder, FolderOpen, Plus, GripVertical, Keyboard, Play, Archive, ChevronRight } from 'lucide-react'

interface Step {
  id: string
  target: string | null
  title: string
  description: string
  icon: React.ReactNode
  direction?: 'top' | 'bottom'
}

const STEPS: Step[] = [
  {
    id: 'welcome',
    target: null,
    title: 'Welcome to Protab',
    description: 'This walkthrough covers the key features. Use the arrow buttons or dots below to navigate.',
    icon: <HelpCircle size={18} />,
  },
  {
    id: 'projects',
    target: '.project-sidebar',
    title: 'Your projects live here',
    description: 'The sidebar on the left organizes your URLs into projects. Each project is a group of related tabs you want to keep around.',
    icon: <Folder size={18} />,
  },
  {
    id: 'create',
    target: '.new-project-button',
    title: 'Create a project',
    description: 'Click here to create your first project. Give it a name that reflects the work or topic — like "Client work" or "Research".',
    icon: <Plus size={18} />,
  },
  {
    id: 'file-tabs',
    target: '.current-tabs',
    title: 'File your open tabs',
    description: 'Your open tabs appear here. Drag a tab into a project in the sidebar, or into the workspace canvas. Hover over a tab and press A to file it into the currently selected project instantly.',
    icon: <GripVertical size={18} />,
  },
  {
    id: 'url-details',
    target: '.url-accordion',
    title: 'Each URL is yours to shape',
    description: 'Click a saved URL to expand it. Edit the title, add tags for filtering, write notes for context. Hover and press R to archive it when you\'re done, or right-click for more options like delete and copy.',
    icon: <Archive size={18} />,
  },
  {
    id: 'quick-capture',
    target: '.brand-header',
    title: 'Quick capture from anywhere',
    description: 'Press Ctrl+Shift+X from any tab to open the capture popup. Type a note, tags, and @Project name to save instantly — no need to open the workspace.',
    icon: <Keyboard size={18} />,
  },
  {
    id: 'activation',
    target: '.project-sidebar',
    title: 'Activation: deliberate focus',
    description: 'Right-click a project and choose "Activate" to close other projects\' tabs in your current window. Unassigned tabs stay open. This is how Protab helps you focus.',
    icon: <Play size={18} />,
  },
  {
    id: 'shortcuts',
    target: '.current-tabs',
    title: 'Filing & keyboard shortcuts',
    description: 'In the Current Tabs pane, hover over a tab and press A to file it into the selected project. Press R to archive a saved URL. Press O to open it.',
    icon: <GripVertical size={18} />,
  },
  {
    id: 'archive-export',
    target: null,
    title: 'Archive & export',
    description: 'Archive URLs you\'re done with but want to keep. Export projects as self-contained HTML files or a ZIP for backup. Drag files onto the sidebar to import.',
    icon: <Archive size={18} />,
  },
  {
    id: 'recap',
    target: null,
    title: 'You\'re all set',
    description: '',
    icon: <HelpCircle size={18} />,
  },
]

const RECAP_ITEMS = [
  { shortcut: 'Ctrl+Shift+X', action: 'Quick capture popup' },
  { shortcut: 'A', action: 'File hovered tab to selected project' },
  { shortcut: 'R', action: 'Archive / unarchive hovered URL' },
  { shortcut: 'O', action: 'Open hovered URL' },
  { shortcut: 'Shift+N', action: 'Create new project' },
  { shortcut: 'N', action: 'Focus notes on hovered URL' },
  { shortcut: 'Right-click project', action: 'Activate, rename, export, delete' },
]

interface SpotlightPosition {
  top: number
  left: number
  width: number
  height: number
  borderRadius: number
}

function getSpotlightRect(targetSelector: string): SpotlightPosition | null {
  const el = document.querySelector(targetSelector)
  if (!el) return null
  const rect = el.getBoundingClientRect()
  return {
    top: rect.top - 4,
    left: rect.left - 4,
    width: rect.width + 8,
    height: rect.height + 8,
    borderRadius: 8,
  }
}

interface QuickstartPanelProps {
  onBack: () => void
}

export function QuickstartPanel({ onBack }: QuickstartPanelProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [spotlight, setSpotlight] = useState<SpotlightPosition | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const portalRef = useRef<HTMLDivElement | null>(null)

  // Create portal container
  if (!portalRef.current) {
    portalRef.current = document.createElement('div')
    portalRef.current.className = 'quickstart-portal'
  }

  useEffect(() => {
    const portal = portalRef.current!
    document.body.appendChild(portal)
    return () => { portal.remove() }
  }, [])

  const step = STEPS[currentStep]

  // Calculate spotlight and tooltip positions
  useLayoutEffect(() => {
    if (!step.target) {
      setSpotlight(null)
      setTooltipPos(null)
      return
    }

    const rect = getSpotlightRect(step.target)
    setSpotlight(rect)

    if (rect) {
      const tooltipHeight = 220
      const tooltipWidth = 380
      const gap = 16
      const viewportHeight = window.innerHeight
      const viewportWidth = window.innerWidth

      // Try below
      let top = rect.top + rect.height + gap

      // If below goes off-screen, try above
      if (top + tooltipHeight > viewportHeight - 16) {
        top = rect.top - tooltipHeight - gap
      }

      // If above also goes off-screen, center vertically next to the spotlight
      if (top < 16) {
        top = Math.max(16, (viewportHeight - tooltipHeight) / 2)
      }

      // Horizontal: place to the right of the spotlight, or left if it would overflow
      let left = rect.left + rect.width + gap
      if (left + tooltipWidth > viewportWidth - 16) {
        left = rect.left - tooltipWidth - gap
      }
      left = Math.max(16, Math.min(left, viewportWidth - tooltipWidth - 16))

      setTooltipPos({ top, left })
    } else {
      setTooltipPos(null)
    }
  }, [step.target, currentStep])

  // Recalculate on resize
  useEffect(() => {
    const handleResize = () => {
      if (step.target) {
        const rect = getSpotlightRect(step.target)
        setSpotlight(rect)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [step.target])

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1))
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        setCurrentStep((s) => Math.max(s - 1, 0))
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onBack()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onBack])

  const goToNext = useCallback(() => {
    setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1))
  }, [])

  const goToPrev = useCallback(() => {
    setCurrentStep((s) => Math.max(s - 1, 0))
  }, [])

  const isRecap = step.id === 'recap'
  const isFirst = currentStep === 0
  const isLast = currentStep === STEPS.length - 1
  const hasSpotlight = spotlight !== null

  const overlay = createPortal(
    <>
      {/* Spotlight overlay */}
      <div
        className={`quickstart-overlay ${hasSpotlight ? 'has-spotlight' : ''}`}
        onClick={onBack}
        aria-hidden="true"
      >
        {hasSpotlight && spotlight && (
          <div
            className="quickstart-spotlight"
            style={{
              top: spotlight.top,
              left: spotlight.left,
              width: spotlight.width,
              height: spotlight.height,
              borderRadius: spotlight.borderRadius,
            }}
          />
        )}
      </div>

      {/* Tooltip card */}
      {hasSpotlight && spotlight && tooltipPos ? (
        <div
          ref={tooltipRef}
          className="quickstart-tooltip"
          style={{ top: tooltipPos.top, left: tooltipPos.left }}
          role="dialog"
          aria-label={step.title}
        >
          <div className="quickstart-tooltip-header">
            {step.icon}
            <span className="quickstart-step-label">Step {currentStep + 1} of {STEPS.length}</span>
          </div>
          <h3 className="quickstart-tooltip-title">{step.title}</h3>
          <p className="quickstart-tooltip-desc">{step.description}</p>
          <div className="quickstart-tooltip-footer">
            <div className="quickstart-dots">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  className={`quickstart-dot ${i === currentStep ? 'active' : ''}`}
                  onClick={() => setCurrentStep(i)}
                  aria-label={`Go to step ${i + 1}`}
                />
              ))}
            </div>
            <div className="quickstart-nav-buttons">
              {!isFirst && (
                <button className="button secondary quickstart-nav-btn" onClick={goToPrev}>
                  Back
                </button>
              )}
              {!isLast ? (
                <button className="button primary quickstart-nav-btn" onClick={goToNext}>
                  Next <ChevronRight size={14} />
                </button>
              ) : (
                <button className="button primary quickstart-nav-btn" onClick={onBack}>
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Centered card for steps without spotlight */
        <div className="quickstart-centered-card" role="dialog" aria-label={step.title}>
          {isRecap ? (
            <>
              <div className="quickstart-recap-icon">
                <FolderOpen size={28} />
              </div>
              <h3 className="quickstart-tooltip-title">You're all set</h3>
              <p className="quickstart-tooltip-desc" style={{ marginBottom: 20 }}>
                Here are the key shortcuts to remember:
              </p>
              <div className="quickstart-recap-list">
                {RECAP_ITEMS.map((item) => (
                  <div key={item.shortcut} className="quickstart-recap-row">
                    <code className="quickstart-recap-shortcut">{item.shortcut}</code>
                    <span className="quickstart-recap-action">{item.action}</span>
                  </div>
                ))}
              </div>
              <p className="quickstart-tooltip-desc" style={{ marginTop: 20, fontSize: 11, opacity: 0.6 }}>
                Click the ? icon anytime to revisit this guide.
              </p>
            </>
          ) : (
            <>
              <div className="quickstart-recap-icon">
                {step.icon}
              </div>
              <div className="quickstart-tooltip-header" style={{ justifyContent: 'center' }}>
                <span className="quickstart-step-label">Step {currentStep + 1} of {STEPS.length}</span>
              </div>
              <h3 className="quickstart-tooltip-title">{step.title}</h3>
              <p className="quickstart-tooltip-desc">{step.description}</p>
            </>
          )}
          <div className="quickstart-tooltip-footer">
            <div className="quickstart-dots">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  className={`quickstart-dot ${i === currentStep ? 'active' : ''}`}
                  onClick={() => setCurrentStep(i)}
                  aria-label={`Go to step ${i + 1}`}
                />
              ))}
            </div>
            <div className="quickstart-nav-buttons">
              {!isFirst && (
                <button className="button secondary quickstart-nav-btn" onClick={goToPrev}>
                  Back
                </button>
              )}
              {!isLast ? (
                <button className="button primary quickstart-nav-btn" onClick={goToNext}>
                  Next <ChevronRight size={14} />
                </button>
              ) : (
                <button className="button primary quickstart-nav-btn" onClick={onBack}>
                  Done
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>,
    portalRef.current,
  )

  return overlay
}
