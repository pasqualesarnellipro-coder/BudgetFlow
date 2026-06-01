import { useEffect, useRef, useState } from 'react'

interface Props {
  percentage: number
  color: string
  size?: number
  strokeWidth?: number
  centerLabel?: string
}

export function DonutProgressRing({
  percentage,
  color,
  size = 80,
  strokeWidth = 8,
  centerLabel,
}: Props) {
  const [animated, setAnimated] = useState(0)
  const animRef = useRef<number>(0)
  const clamped = Math.min(100, Math.max(0, percentage))

  useEffect(() => {
    const duration = 800
    const start = performance.now()
    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setAnimated(eased * clamped)
      if (progress < 1) animRef.current = requestAnimationFrame(animate)
    }
    animRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animRef.current)
  }, [clamped])

  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (animated / 100) * circumference
  const cx = size / 2
  const cy = size / 2

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
      {centerLabel && (
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ transform: 'rotate(90deg)', transformOrigin: `${cx}px ${cy}px`, fontSize: size * 0.18, fontWeight: 600, fill: '#1a1a2e' }}
        >
          {centerLabel}
        </text>
      )}
    </svg>
  )
}
