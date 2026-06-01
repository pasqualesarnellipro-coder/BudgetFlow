import { useEffect, useRef, useState } from 'react'

interface LazyChartProps {
  children: React.ReactNode
  /** Altezza riservata prima che il grafico sia visibile — evita layout shift */
  height?: number
  className?: string
}

/**
 * Wrapper che ritarda il rendering dei grafici Recharts finché non entrano
 * nel viewport. Usa IntersectionObserver (native, zero dipendenze).
 *
 * Perché: Recharts crea SVG pesanti. Sulla Dashboard Mensile ci sono 20+
 * elementi SVG renderizzati fuori viewport al caricamento — questo riduce
 * significativamente il tempo di interattività (TTI).
 */
export function LazyChart({ children, height = 200, className = '' }: LazyChartProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Se IntersectionObserver non è supportato (browser molto vecchi), mostra subito
    if (!('IntersectionObserver' in window)) {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect() // Una volta visibile, non serve più osservare
        }
      },
      { rootMargin: '100px' } // Pre-carica 100px prima che entri nel viewport
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} style={{ minHeight: height }} className={className}>
      {visible ? children : (
        <div
          className="animate-pulse bg-gray-100 dark:bg-gray-700/50 rounded-xl"
          style={{ height }}
          aria-hidden="true"
        />
      )}
    </div>
  )
}
