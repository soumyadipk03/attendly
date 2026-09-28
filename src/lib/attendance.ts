import {
  countSessions,
  groupSessions,
  sessionKey,
  withRecountedTotals,
} from './records'
import type { MonthRecord, MonthRow, Student, StudentStat } from './types'

function percentageOf(attended: number, held: number): number {
  if (held <= 0) {
    return 0
  }
  return Math.round((attended / held) * 100)
}

function isInRange(row: MonthRow, month: string | null): boolean {
  return month === null || row.date.slice(0, 7) === month
}

/** Sessions held in scope: every distinct date+slot, counted once. */
export function heldInScope(months: readonly MonthRecord[], month: string | null): number {
  const keys = new Set<string>()
  for (const record of months) {
    for (const row of record.rows) {
      if (isInRange(row, month)) {
        keys.add(sessionKey(row.date, row.slot))
      }
    }
  }
  return keys.size
}

/**
 * Per-student classes taken over classes held, in roster order. A student with
 * no rows still appears with 0 taken, so someone new is visible rather than
 * simply missing from the report.
 */
export function buildStats(
  roster: readonly Student[],
  months: readonly MonthRecord[],
  month: string | null,
): StudentStat[] {
  const held = heldInScope(months, month)
  const attended = new Map<string, number>()

  for (const record of months) {
    for (const row of record.rows) {
      if (isInRange(row, month) && row.status === 'present') {
        attended.set(row.rollNumber, (attended.get(row.rollNumber) ?? 0) + 1)
      }
    }
  }

  return roster.map((student) => {
    const taken = attended.get(student.rollNumber) ?? 0
    return { student, attended: taken, held, percentage: percentageOf(taken, held) }
  })
}

export function averagePercentage(stats: readonly StudentStat[]): number {
  if (stats.length === 0) {
    return 0
  }
  return Math.round(stats.reduce((sum, stat) => sum + stat.percentage, 0) / stats.length)
}

export function listMonths(classData: { months: { month: string }[] }): string[] {
  return [...new Set(classData.months.map((m) => m.month))].sort()
}

export { countSessions, groupSessions, sessionKey, withRecountedTotals }
