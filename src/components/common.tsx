import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useStore } from '../store'
import type { Warning } from '../lib/schedule'
import { LEVEL_META } from '../ui'
import { applyFix } from '../actions'

/** 일정과 지도가 나란히 보이는 넓이인지 (Tailwind md) */
export const isWideScreen = () => window.matchMedia('(min-width: 768px)').matches

export function cx(...c: (string | false | undefined | null)[]) {
  return c.filter(Boolean).join(' ')
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-stone-900/40 p-4 sm:p-8" onMouseDown={onClose}>
      <div
        className={cx('w-full rounded-2xl bg-white shadow-2xl', wide ? 'max-w-3xl' : 'max-w-xl')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3.5">
          <h2 className="text-[17px] font-bold">{title}</h2>
          <button className="rounded-lg px-2 py-1 text-stone-500 hover:bg-stone-100" onClick={onClose} aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

export function Toast() {
  const toast = useStore((s) => s.toast)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!toast) return
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 3200)
    return () => clearTimeout(t)
  }, [toast])
  if (!toast || !visible) return null
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[2000] -translate-x-1/2 rounded-xl bg-stone-900 px-4 py-2.5 text-sm text-white shadow-lg">
      {toast.text}
    </div>
  )
}

export function WarningList({ warnings, compact }: { warnings: Warning[]; compact?: boolean }) {
  if (!warnings.length) return null
  return (
    <ul className="mt-1.5 space-y-1">
      {warnings.map((w, i) => {
        const m = LEVEL_META[w.level]
        return (
          <li key={i} className={cx('flex items-start gap-1.5 rounded-md border-l-[3px] px-2 py-1 text-[12.5px] leading-snug text-stone-800', m.cls)}>
            <span className="shrink-0" aria-label={m.label}>
              {m.icon}
            </span>
            <span className="flex-1">{w.text}</span>
            {w.fix && !compact && (
              <button
                className="shrink-0 rounded border border-stone-300 bg-white px-1.5 py-0.5 text-[11.5px] font-medium hover:bg-stone-50"
                onClick={(e) => {
                  e.stopPropagation()
                  applyFix(w.fix!)
                }}
              >
                {w.fix.label}
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** 클릭하면 바로 편집되는 텍스트 */
export function InlineText({
  value,
  onChange,
  placeholder,
  className,
  wrap,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
  wrap?: boolean // 길면 줄바꿈 (기본은 말줄임)
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => setDraft(value), [value])
  useEffect(() => {
    if (editing) ref.current?.select()
  }, [editing])
  if (!editing)
    return (
      <button
        className={cx('max-w-full rounded-md px-1 -mx-1 text-left hover:bg-stone-100', !wrap && 'truncate', !value && 'text-stone-400', className)}
        onClick={() => setEditing(true)}
        title="클릭해서 수정"
      >
        {value || placeholder}
      </button>
    )
  const commit = () => {
    setEditing(false)
    if (draft !== value) onChange(draft)
  }
  return (
    <input
      ref={ref}
      className={cx('w-full rounded-md border border-violet-300 px-1 -mx-1 outline-none ring-2 ring-violet-100', className)}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') {
          setDraft(value)
          setEditing(false)
        }
      }}
    />
  )
}

export function TimeInput({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <input
      type="time"
      className={cx('rounded-md border border-stone-300 bg-white px-1.5 py-0.5 text-sm tabular-nums', className)}
      value={value}
      step={300}
      onChange={(e) => e.target.value && onChange(e.target.value)}
    />
  )
}

export function Menu({ label, children, align = 'right' }: { label: ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div className="relative" ref={ref}>
      <button
        className="rounded-md px-1.5 py-0.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(!open)
        }}
      >
        {label}
      </button>
      {open && (
        <div
          className={cx(
            'absolute z-50 mt-1 max-h-72 min-w-48 overflow-y-auto rounded-xl border border-stone-200 bg-white py-1 text-sm shadow-xl sm:min-w-64',
            align === 'right' ? 'right-0' : 'left-0',
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function MenuItem({ onClick, children, danger }: { onClick: () => void; children: ReactNode; danger?: boolean }) {
  return (
    <button className={cx('block w-full px-3 py-1.5 text-left hover:bg-stone-100', danger && 'text-red-600')} onClick={onClick}>
      {children}
    </button>
  )
}

export function Btn({
  children,
  onClick,
  variant = 'default',
  className,
  disabled,
  title,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'default' | 'primary' | 'ghost'
  className?: string
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition disabled:opacity-40',
        variant === 'primary' && 'bg-violet-600 text-white hover:bg-violet-700',
        variant === 'default' && 'border border-stone-300 bg-white text-stone-800 hover:bg-stone-50',
        variant === 'ghost' && 'text-stone-600 hover:bg-stone-100',
        className,
      )}
    >
      {children}
    </button>
  )
}

export function ExtLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={cx('text-violet-700 hover:underline', className)} onClick={(e) => e.stopPropagation()}>
      {children}
    </a>
  )
}
