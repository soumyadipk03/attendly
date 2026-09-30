import { parseCsvRecords, pick, toCsv } from './csv'
import type { AttendanceStatus, MonthRow, Student } from './types'

export const ROSTER_HEADER = ['name', 'roll_number', 'course'] as const
/**
 * A month's single file. One row per student per session, appended on every
 * submit, with the running classes taken / total classes held kept alongside.
 */
export const MONTH_HEADER = [
  'roll_number',
  'name',
  'course',
  'date',
  'slot',
  'status',
  'classes_attended',
  'classes_held',
] as const

const ROLL_ALIASES = ['roll_number', 'rollnumber', 'roll', 'roll_no', 'rollno'] as const
const NAME_ALIASES = ['name', 'student_name', 'full_name'] as const
const COURSE_ALIASES = ['course', 'subject', 'program', 'class_course'] as const
const STATUS_ALIASES = ['status', 'attendance', 'result'] as const
const SLOT_ALIASES = ['slot', 'slot_range', 'time', 'session_time'] as const
const DATE_ALIASES = ['date', 'session_date', 'day'] as const
const ATTENDED_ALIASES = ['classes_attended', 'attended', 'classes_taken'] as const
const HELD_ALIASES = ['classes_held', 'held', 'total_classes', 'classes'] as const

export function normalizeRollNumber(value: string): string {
  return value.trim().replace(/^0+(?=\d)/, '')
}

export function parseRosterCsv(text: string): Student[] {
  return parseCsvRecords(text)
    .map((record) => ({
      rollNumber: normalizeRollNumber(pick(record, ROLL_ALIASES)),
      name: pick(record, NAME_ALIASES).trim(),
      course: pick(record, COURSE_ALIASES).trim(),
    }))
    .filter((student) => student.rollNumber.length > 0 || student.name.length > 0)
    .map((student, index) => ({
      rollNumber: student.rollNumber || String(index + 1),
      name: student.name || `Roll ${student.rollNumber}`,
      course: student.course || 'Unassigned',
    }))
    .filter((student, index, all) => all.findIndex((other) => other.rollNumber === student.rollNumber) === index)
}

export function toRosterCsv(students: readonly Student[]): string {
  return toCsv(
    ROSTER_HEADER,
    students.map((student) => [student.name, student.rollNumber, student.course]),
  )
}

export function parseStatus(value: string): AttendanceStatus {
  return value.trim().toLowerCase() === 'present' ? 'present' : 'absent'
}

/**
 * Canonical roster order: course first, then roll number. Courses differ from
 * student to student inside a single class folder, so grouping by course keeps
 * the list readable, and roll number breaks ties within a course.
 */
export function sortStudents(students: readonly Student[]): Student[] {
  return [...students].sort((a, b) => {
    const byCourse = a.course.localeCompare(b.course, undefined, { numeric: true, sensitivity: 'base' })
    if (byCourse !== 0) {
      return byCourse
    }

    const aRoll = Number.parseInt(a.rollNumber, 10)
    const bRoll = Number.parseInt(b.rollNumber, 10)
    if (Number.isFinite(aRoll) && Number.isFinite(bRoll) && aRoll !== bRoll) {
      return aRoll - bRoll
    }

    return a.rollNumber.localeCompare(b.rollNumber, undefined, { numeric: true, sensitivity: 'base' })
  })
}

function toCount(value: string): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

/** Reads a month's appended rows back. The stored counts are re-derived on read. */
export function parseMonthCsv(text: string): MonthRow[] {
  return parseCsvRecords(text)
    .map((record) => {
      const rollNumber = normalizeRollNumber(pick(record, ROLL_ALIASES))
      return {
        rollNumber,
        name: pick(record, NAME_ALIASES).trim(),
        course: pick(record, COURSE_ALIASES).trim(),
        date: pick(record, DATE_ALIASES).trim(),
        slot: pick(record, SLOT_ALIASES).trim(),
        status: parseStatus(pick(record, STATUS_ALIASES)),
        classesAttended: toCount(pick(record, ATTENDED_ALIASES)),
        classesHeld: toCount(pick(record, HELD_ALIASES)),
      }
    })
    .filter((row) => row.rollNumber.length > 0)
}

/**
 * A session is one date and one slot. Two rows sharing both are the same class
 * held, so this is what makes classes held a count of sessions rather than a
 * count of rows.
 */
export function sessionKey(date: string, slot: string): string {
  return `${date}|${slot}`
}

export function countSessions(rows: readonly MonthRow[]): number {
  return new Set(rows.map((row) => sessionKey(row.date, row.slot))).size
}

/**
 * Recomputes the running counts so they cannot drift: a hand-edited or truncated
 * file still reports the right ratio, because the numbers are derived from the
 * rows rather than trusted from the file.
 */
export function withRecountedTotals(rows: readonly MonthRow[]): MonthRow[] {
  const held = countSessions(rows)
  const attended = new Map<string, number>()
  for (const row of rows) {
    if (row.status === 'present') {
      attended.set(row.rollNumber, (attended.get(row.rollNumber) ?? 0) + 1)
    }
  }
  return rows.map((row) => ({ ...row, classesAttended: attended.get(row.rollNumber) ?? 0, classesHeld: held }))
}

export function toMonthCsv(rows: readonly MonthRow[]): string {
  return toCsv(
    MONTH_HEADER,
    rows.map((row) => [
      row.rollNumber,
      row.name,
      row.course,
      row.date,
      row.slot,
      row.status,
      row.classesAttended,
      row.classesHeld,
    ]),
  )
}

/** Groups a month's rows into sessions, ordered by date then slot. */
export function groupSessions(rows: readonly MonthRow[]): MonthRow[][] {
  const byKey = new Map<string, MonthRow[]>()
  for (const row of rows) {
    const key = sessionKey(row.date, row.slot)
    const bucket = byKey.get(key)
    if (bucket) {
      bucket.push(row)
    } else {
      byKey.set(key, [row])
    }
  }
  return [...byKey.values()].sort((a, b) =>
    (a[0]?.date ?? '').localeCompare(b[0]?.date ?? '') ||
    (a[0]?.slot ?? '').localeCompare(b[0]?.slot ?? ''),
  )
}

/**
 * Folds a fresh submit into a month's rows, where the incoming rows are all for
 * the one session identified by their own date and slot.
 *
 * The rules, in order of importance:
 *
 * - **Present is never taken away.** Re-submitting a session that was already
 *   recorded can correct an absence into a presence, but never downgrades a
 *   presence. A present that was recorded by mistake has to be removed from the
 *   dataset by hand, because silently forgetting a class someone attended is the
 *   worse failure of the two.
 * - **The union is kept.** A student already in the session but missing from the
 *   payload keeps their recorded row, and a student new to the session is added.
 *   Merging never drops anybody.
 * - **Everything else is untouched.** Rows for other sessions are copied through
 *   as they were, so merging one session cannot disturb the rest of the month.
 */
export function mergeAttendanceRows(
  existing: readonly MonthRow[],
  incoming: readonly MonthRow[],
): MonthRow[] {
  if (incoming.length === 0) {
    return [...existing]
  }

  const first = incoming[0]
  const target = sessionKey(first.date, first.slot)

  const others = existing.filter((row) => sessionKey(row.date, row.slot) !== target)

  // Collapse anything already recorded for this session to one row per student,
  // keeping a present if the same student somehow has more than one row.
  const prior = new Map<string, MonthRow>()
  for (const row of existing) {
    if (sessionKey(row.date, row.slot) !== target) {
      continue
    }
    const current = prior.get(row.rollNumber)
    if (!current || (current.status !== 'present' && row.status === 'present')) {
      prior.set(row.rollNumber, row)
    }
  }

  const incomingByRoll = new Map(incoming.map((row) => [row.rollNumber, row]))
  const merged = new Map<string, MonthRow>()

  // Payload order first, so the session reads in the same roster order the
  // teacher just saw on screen.
  for (const row of incoming) {
    const before = prior.get(row.rollNumber)
    const staysPresent = before?.status === 'present'
    merged.set(row.rollNumber, {
      ...row,
      status: staysPresent || row.status === 'present' ? 'present' : 'absent',
    })
  }

  // Then anyone already recorded for this session who was not in the payload.
  for (const [rollNumber, row] of prior) {
    if (!incomingByRoll.has(rollNumber)) {
      merged.set(rollNumber, row)
    }
  }

  return [...others, ...merged.values()]
}
