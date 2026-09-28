import type { AttendanceSession, ClassData, ClassReport, RangeMode, StudentStat } from './types'

export function sortSessions(sessions: readonly AttendanceSession[]): AttendanceSession[] {
  return [...sessions].sort((a, b) => a.stamp.localeCompare(b.stamp) || a.path.localeCompare(b.path))
}

export function listMonths(sessions: readonly AttendanceSession[]): string[] {
  return [...new Set(sessions.map((session) => session.month))].sort((a, b) => b.localeCompare(a))
}

export function formatMonth(month: string): string {
  const [year, monthPart] = month.split('-')
  const index = Number(monthPart) - 1
  const label = Number.isInteger(index) ? new Date(Number(year), index, 1).toLocaleString(undefined, { month: 'long' }) : monthPart
  return `${label} ${year}`
}

export function filterSessions(
  sessions: readonly AttendanceSession[],
  mode: RangeMode,
  month: string,
): AttendanceSession[] {
  if (mode === 'total') {
    return sortSessions(sessions)
  }
  return sortSessions(sessions.filter((session) => session.month === month))
}

function buildStats(classData: ClassData, sessions: readonly AttendanceSession[]): StudentStat[] {
  const held = sessions.length

  const attendedByRoll = new Map<string, number>()
  for (const session of sessions) {
    for (const entry of session.entries) {
      if (entry.status === 'present') {
        attendedByRoll.set(entry.rollNumber, (attendedByRoll.get(entry.rollNumber) ?? 0) + 1)
      }
    }
  }

  return classData.roster.map((student) => {
    const attended = attendedByRoll.get(student.rollNumber) ?? 0
    return {
      student,
      attended,
      held,
      percentage: held === 0 ? 0 : Math.round((attended / held) * 100),
    }
  })
}

export function buildReport(
  classData: ClassData,
  mode: RangeMode,
  month: string,
  months: readonly string[],
): ClassReport {
  const sessions = filterSessions(classData.sessions, mode, month)
  const stats = buildStats(classData, sessions)
  const averagePercentage =
    stats.length === 0 ? 0 : Math.round(stats.reduce((total, stat) => total + stat.percentage, 0) / stats.length)

  return {
    className: classData.className,
    mode,
    month,
    sessions,
    months: [...months],
    stats,
    classesHeld: sessions.length,
    averagePercentage,
  }
}

export function emptyReport(mode: RangeMode, month: string): ClassReport {
  return {
    className: '',
    mode,
    month,
    sessions: [],
    months: [],
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
