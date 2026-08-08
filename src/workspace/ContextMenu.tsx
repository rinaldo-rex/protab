import { useEffect, useRef, useState } from 'react'

interface ContextMenuItem {
  label: string
  icon?: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  danger?: boolean
  submenu?: ContextMenuItem[]
  shortcut?: string
  separator?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

function ContextSubmenu({ items, parentRect, onClose }: { items: ContextMenuItem[]; parentRect: DOMRect; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: 0, top: 0 })

  useEffect(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = parentRect.right + 2
    let top = parentRect.top
    if (left + rect.width > vw - 8) left = parentRect.left - rect.width - 2
    if (top + rect.height > vh - 8) top = vh - rect.height - 8
    if (top < 8) top = 8
    setPos({ left, top })
  }, [parentRect])

  return (
    <div
      ref={ref}
      className="context-menu context-submenu"
      role="menu"
      style={{ left: pos.left, top: pos.top }}
    >
      {items.map((item, index) => (
        <button
          key={index}
          role="menuitem"
          className={`context-menu-item${item.danger ? ' danger-text' : ''}`}
          disabled={item.disabled}
          onClick={() => {
            item.onClick?.()
            onClose()
          }}
        >
          {item.icon && <span className="context-menu-icon">{item.icon}</span>}
          {item.label}
        </button>
      ))}
    </div>
  )
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [openSubmenu, setOpenSubmenu] = useState<{ index: number; rect: DOMRect } | null>(null)
  const [focusedIndex, setFocusedIndex] = useState<number>(() => {
    // Focus first non-disabled, non-separator item
    const first = items.findIndex((item) => !item.separator && !item.disabled)
    return first >= 0 ? first : 0
  })

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Close if click is outside both the main menu and any open submenu
      const target = event.target as Node
      const inMainMenu = menuRef.current?.contains(target)
      const inSubmenu = document.querySelector('.context-submenu')?.contains(target)
      if (!inMainMenu && !inSubmenu) {
        onClose()
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      // Arrow key navigation within menu
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const direction = event.key === 'ArrowDown' ? 1 : -1
        let next = focusedIndex + direction
        // Wrap around and skip separators/disabled
        for (let i = 0; i < items.length; i++) {
          if (next < 0) next = items.length - 1
          if (next >= items.length) next = 0
          if (!items[next]?.separator && !items[next]?.disabled) break
          next += direction
        }
        setFocusedIndex(next)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose, focusedIndex, items])

  // Focus the menu item when focusedIndex changes
  useEffect(() => {
    const menuItems = menuRef.current?.querySelectorAll('[role="menuitem"]')
    if (menuItems && menuItems[focusedIndex]) {
      (menuItems[focusedIndex] as HTMLElement).focus()
    }
  }, [focusedIndex])

  // Adjust position to keep menu in viewport
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      if (rect.right > viewportWidth) {
        menuRef.current.style.left = `${viewportWidth - rect.width - 8}px`
      }
      if (rect.bottom > viewportHeight) {
        menuRef.current.style.top = `${viewportHeight - rect.height - 8}px`
      }
    }
  }, [x, y])

  return (
    <>
      <div
        ref={menuRef}
        className="context-menu"
        role="menu"
        style={{ left: x, top: y }}
      >
        {items.map((item, index) => (
          item.separator ? (
            <div key={index} role="separator" className="context-menu-separator" />
          ) : item.submenu ? (
            <button
              key={index}
              role="menuitem"
              className="context-menu-item has-submenu"
              disabled={item.disabled}
              aria-haspopup="menu"
              tabIndex={-1}
              onMouseEnter={(e) => {
                setOpenSubmenu({ index, rect: e.currentTarget.getBoundingClientRect() })
              }}
              onMouseLeave={() => {
                // Delay closing so mouse can travel to submenu
                setTimeout(() => setOpenSubmenu((current) => current?.index === index ? null : current), 150)
              }}
            >
              {item.icon && <span className="context-menu-icon">{item.icon}</span>}
              {item.label}
              <span className="submenu-arrow" aria-hidden="true">▸</span>
            </button>
          ) : (
            <button
              key={index}
              role="menuitem"
              className={`context-menu-item${item.danger ? ' danger-text' : ''}`}
              disabled={item.disabled}
              tabIndex={-1}
              onClick={() => {
                item.onClick?.()
                onClose()
              }}
            >
              {item.icon && <span className="context-menu-icon">{item.icon}</span>}
              <span className="context-menu-label">{item.label}</span>
              {item.shortcut && <span className="context-menu-shortcut">{item.shortcut}</span>}
            </button>
          )
        ))}
      </div>
      {openSubmenu && menuRef.current && (
        <ContextSubmenu
          items={items[openSubmenu.index].submenu!}
          parentRect={openSubmenu.rect}
          onClose={onClose}
        />
      )}
    </>
  )
}
