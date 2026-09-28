import { averagePercentage, buildStats, heldInScope, listMonths } from './attendance'
import { groupSessions } from './records'
import type { ClassData, ClassReport, MonthRecord, RangeMode } from './types'

export { listMonths }

export function formatMonth(month: string): string {
  const [year, monthPart] = month.split('-')
  const index = Number(monthPart) - 1
  const label = Number.isInteger(index)
    ? new Date(Number(year), index, 1).toLocaleString(undefined, { month: 'long' })
    : monthPart
  return `${label} ${year}`
}

export function filterMonths(
  months: readonly MonthRecord[],
  mode: RangeMode,
  month: string,
): MonthRecord[] {
  const selected = mode === 'total' ? months : months.filter((entry) => entry.month === month)
  return [...selected].sort((a, b) => a.month.localeCompare(b.month))
}

/**
 * Sessions in scope, derived from the appended rows rather than stored. Rows
 * sharing a date and slot are one class held, so grouping them keeps a month
 * with many students from inflating the held count.
 */
export function sessionsInScope(months: readonly MonthRecord[]): number {
  return heldInScope(months, null)
}

export function buildReport(
  classData: ClassData,
  mode: RangeMode,
  month: string,
): ClassReport {
  const months = filterMonths(classData.months, mode, month)
  const scope = mode === 'total' ? null : month
  const stats = buildStats(classData.roster, months, scope)

  return {
    className: classData.className,
    mode,
    month,
    months,
    monthNames: listMonths(classData),
    stats,
    classesHeld: heldInScope(months, scope),
    averagePercentage: averagePercentage(stats),
  }
}

export function emptyReport(mode: RangeMode, month: string): ClassReport {
  return {
    className: '',
    mode,
    month,
    months: [],
    monthNames: [],
    stats: [],
    classesHeld: 0,
    averagePercentage: 0,
  }
}

export function percentageTone(percentage: number): string {
  if (percentage >= 75) {
    return 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/30'
  }
  if (percentage >= 50) {
    return 'bg-amber-500/10 text-amber-700 ring-amber-500/30'
  }
  return 'bg-rose-500/10 text-rose-700 ring-rose-500/30'
}

export { groupSessions }
