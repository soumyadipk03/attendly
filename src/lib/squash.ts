import { attendanceMonthOf, isSquashedPath } from './datasetLayout'
import { toSquashedAttendanceCsv } from './records'
import type { AttendanceSession, DatasetSnapshot, Student, StudentStat, SquashCandidate } from './types'

function percentageOf(attended: number, held: number): number {
  return held === 0 ? 0 : Math.round((attended / held) * 100)
}

/**
 * Per-student totals for one month of daily sessions. This is exactly what a
 * <month>.csv stores, so squashing a month loses no information that the report
 * needs: both attendance and classes held are plain counts and they add up
 * across months.
 */
export function summariseSessions(roster: readonly Student[], sessions: readonly AttendanceSession[]): StudentStat[] {
  const held = sessions.length
  const attendedByRoll = new Map<string, number>()

  for (const session of sessions) {
    for (const entry of session.entries) {
      if (entry.status === 'present') {
        attendedByRoll.set(entry.rollNumber, (attendedByRoll.get(entry.rollNumber) ?? 0) + 1)
      }
    }
  }

  return roster.map((student) => {
    const attended = attendedByRoll.get(student.rollNumber) ?? 0
    return { student, attended, held, percentage: percentageOf(attended, held) }
  })
}

export function buildSquashedCsv(rows: readonly StudentStat[]): string {
  return toSquashedAttendanceCsv(rows)
}

export function filterMonthSessions(
  sessions: readonly AttendanceSession[],
  month: string,
): AttendanceSession[] {
  return sessions.filter((session) => session.month === month)
}

/**
 * Whenever a class holds two or more month folders, the older ones are finished
 * and get offered for squashing. Only the newest folder is left alone, so the
 * month currently being written to is never folded.
 */
export function findSquashCandidates(snapshot: DatasetSnapshot): SquashCandidate[] {
  return Object.values(snapshot)
    .flatMap((classData) => {
      const byMonth = new Map<string, string[]>()

      for (const session of classData.sessions) {
        if (isSquashedPath(session.path)) {
          continue
        }
        const month = attendanceMonthOf(session.path)
        if (!month) {
          continue
        }
        const bucket = byMonth.get(month)
        if (bucket) {
          bucket.push(session.path)
        } else {
          byMonth.set(month, [session.path])
        }
      }

      // Every month except the newest is a finished month.
      const months = [...byMonth.keys()].sort()
      return months.slice(0, -1).map((month) => ({
        className: classData.className,
        month,
        dailyPaths: [...byMonth.get(month)!].sort(),
      }))
    })
    .sort((a, b) => a.className.localeCompare(b.className) || a.month.localeCompare(b.month))
}

export function describeCandidates(candidates: readonly SquashCandidate[]): string {
  return candidates
    .map((candidate) => `${candidate.className} ${candidate.month} (${candidate.dailyPaths.length} files)`)
    .join(', ')
}

export { percentageOf }
