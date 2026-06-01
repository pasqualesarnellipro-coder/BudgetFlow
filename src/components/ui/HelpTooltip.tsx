import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface HelpTooltipProps {
  content: string | React.ReactNode
  title?: string
  position?: 'top' | 'bottom' | 'left' | 'right'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function HelpTooltip({
  content,
  title,
  position = 'top',
  size = 'md',
  className = '',
}: HelpTooltipProps) {
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)

  const widthMap = { sm: 180, md: 240, lg: 300 }
  const tooltipWidth = widthMap[size]

  const updatePosition = () => {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const scrollY = window.scrollY
    const scrollX = window.scrollX
    const gap = 8

    let top = 0
    let left = 0

    if (position === 'top') {
      top = rect.top + scrollY - gap
      left = rect.left + scrollX + rect.width / 2
    } else if (position === 'bottom') {
      top = rect.bottom + scrollY + gap
      left = rect.left + scrollX + rect.width / 2
    } else if (position === 'left') {
      top = rect.top + scrollY + rect.height / 2
      left = rect.left + scrollX - gap
    } else {
      top = rect.top + scrollY + rect.height / 2
      left = rect.right + scrollX + gap
    }

    setCoords({ top, left })
  }

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!visible) updatePosition()
    setVisible((v) => !v)
  }

  useEffect(() => {
    if (!visible) return
    const close = () => setVisible(false)
    document.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [visible])

  const positionStyle: React.CSSProperties = (() => {
    if (position === 'top') return {
      position: 'absolute',
      top: coords.top,
      left: coords.left,
      transform: 'translate(-50%, -100%)',
    }
    if (position === 'bottom') return {
      position: 'absolute',
      top: coords.top,
      left: coords.left,
      transform: 'translateX(-50%)',
    }
    if (position === 'left') return {
      position: 'absolute',
      top: coords.top,
      left: coords.left,
      transform: 'translate(-100%, -50%)',
    }
    return {
      position: 'absolute',
      top: coords.top,
      left: coords.left,
      transform: 'translateY(-50%)',
    }
  })()

  const arrowClass = {
    top: 'after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-4 after:border-transparent after:border-t-gray-900',
    bottom: 'after:absolute after:bottom-full after:left-1/2 after:-translate-x-1/2 after:border-4 after:border-transparent after:border-b-gray-900',
    left: 'after:absolute after:left-full after:top-1/2 after:-translate-y-1/2 after:border-4 after:border-transparent after:border-l-gray-900',
    right: 'after:absolute after:right-full after:top-1/2 after:-translate-y-1/2 after:border-4 after:border-transparent after:border-r-gray-900',
  }[position]

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        className={`inline-flex items-center justify-center w-4 h-4 rounded-full bg-gray-200 hover:bg-indigo-500 hover:text-white text-gray-500 text-[10px] font-bold leading-none transition-colors flex-shrink-0 ${className}`}
        aria-label={title ? `Aiuto: ${title}` : 'Aiuto'}
        aria-expanded={visible}
        aria-haspopup="dialog"
      >
        <span aria-hidden="true">?</span>
      </button>

      {visible && createPortal(
        <div
          style={{ ...positionStyle, width: tooltipWidth, zIndex: 9999 }}
          className={`${arrowClass} bg-gray-900 text-white rounded-xl px-3 py-2.5 shadow-xl text-xs leading-relaxed`}
          role="dialog"
          aria-modal="false"
          onClick={(e) => e.stopPropagation()}
        >
          {title && <p className="font-semibold text-white mb-1">{title}</p>}
          <div className="text-gray-300">{content}</div>
        </div>,
        document.body
      )}
    </>
  )
}

// Versione inline per sezioni/form (non tooltip ma box espandibile)
interface HelpBoxProps {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}

export function HelpBox({ title, children, defaultOpen = false }: HelpBoxProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-indigo-700">
          <span className="w-4 h-4 rounded-full bg-indigo-200 text-indigo-700 flex items-center justify-center text-[10px] font-bold">?</span>
          {title}
        </span>
        <span className="text-indigo-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 text-xs text-indigo-800 space-y-1 leading-relaxed">
          {children}
        </div>
      )}
    </div>
  )
}
