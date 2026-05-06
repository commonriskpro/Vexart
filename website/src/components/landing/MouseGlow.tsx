'use client'
import { useEffect, useRef } from 'react'

export function MouseGlow() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const move = (e: MouseEvent) => {
      el.style.setProperty('--mx', `${e.clientX}px`)
      el.style.setProperty('--my', `${e.clientY}px`)
    }

    window.addEventListener('mousemove', move)
    return () => window.removeEventListener('mousemove', move)
  }, [])

  return (
    <div ref={ref} className="fixed inset-0 pointer-events-none z-0">
      <div
        className="absolute w-[600px] h-[600px] rounded-full opacity-[0.07] blur-[120px] transition-all duration-700 ease-out"
        style={{
          background: 'radial-gradient(circle, #56d4c8 0%, transparent 70%)',
          left: 'var(--mx, 50%)',
          top: 'var(--my, 50%)',
          transform: 'translate(-50%, -50%)',
        }}
      />
    </div>
  )
}
