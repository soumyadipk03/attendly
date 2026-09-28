import type { ReactNode } from 'react'
import { CircleCheck, TriangleAlert, X } from 'lucide-react'
import type { ModalState } from '../lib/types'

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <main
      className={`mt-6 rounded-[28px] border border-slate-200 bg-white/85 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:p-5 ${className}`}
    >
      {children}
    </main>
  )
}

export function PageHeading({
  eyebrow,
  title,
  actions,
}: {
  eyebrow: string
  title: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm uppercase tracking-[0.2em] text-slate-500">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">{title}</h2>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-bold text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  )
}

export function Field({
  label,
  hint,
  invalid = false,
  children,
}: {
  label: string
  hint?: string
  invalid?: boolean
  children: ReactNode
}) {
  return (
    <label
      className={`flex flex-col gap-2 rounded-2xl border bg-slate-50 px-3 py-2 text-sm text-slate-600 shadow-sm ${
        invalid ? 'border-rose-300' : 'border-slate-200'
      }`}
    >
      <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</span>
      {children}
      {hint ? <span className={`text-xs ${invalid ? 'font-medium text-rose-600' : 'text-slate-500'}`}>{hint}</span> : null}
    </label>
  )
}

export function Select({
  value,
  onChange,
  children,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="w-full bg-transparent text-base font-medium text-slate-700 outline-none disabled:opacity-50"
    >
      {children}
    </select>
  )
}

export function PrimaryButton({
  onClick,
  children,
  disabled,
}: {
  onClick: () => void
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  )
}

export function GhostButton({
  onClick,
  children,
  disabled,
}: {
  onClick: () => void
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  )
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-8 text-center">
      <p className="text-base font-semibold text-slate-800">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{message}</p>
    </div>
  )
}

export function Modal({ modal, onClose }: { modal: ModalState; onClose: () => void }) {
  if (!modal) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_25px_80px_rgba(15,23,42,0.35)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Attendly</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-900">{modal.title}</h3>
          </div>
          {modal.type !== 'progress' ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:text-slate-700"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <p className="mt-4 text-sm leading-6 text-slate-600">{modal.message}</p>

        {modal.warning ? (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium leading-5 text-amber-900">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {modal.warning}
          </p>
        ) : null}

        {modal.type === 'progress' ? (
          <div className="mt-5">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-slate-500">
              <span className="flex items-center gap-1.5">
                {(modal.progress ?? 0) >= 100 ? <CircleCheck className="h-3.5 w-3.5 text-emerald-500" /> : null}
                {(modal.progress ?? 0) >= 100 ? 'Complete' : 'Progress'}
              </span>
              <span>{modal.progress ?? 0}%</span>
            </div>
            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 transition-all duration-300"
                style={{ width: `${modal.progress ?? 0}%` }}
              />
            </div>
          </div>
        ) : null}

        {/* No button while work is in flight: the dialog stays put until the
            operation reports back, so nothing can be dismissed mid-write. */}
        {modal.type === 'progress' ? (
          <p className="mt-6 text-center text-xs text-slate-400">
            This dialog closes on its own once the dataset reports back.
          </p>
        ) : (
          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={modal.type === 'confirm' ? () => modal.onConfirm?.() : onClose}
              className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
            >
              {modal.confirmText ?? (modal.type === 'confirm' ? 'Confirm' : 'Continue')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
