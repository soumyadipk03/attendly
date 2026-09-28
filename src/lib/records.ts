import { parseCsvRecords, pick, toCsv } from './csv'
import type { AttendanceEntry, AttendanceStatus, Student, StudentStat } from './types'

export const ROSTER_HEADER = ['name', 'roll_number', 'course'] as const
export const ATTENDANCE_HEADER = ['roll_number', 'name', 'course', 'status', 'slot', 'note'] as const
/** A squashed month is a per-student summary, not a replay of the daily rows. */
export const SQUASHED_HEADER = [
  'roll_number',
  'name',
  'course',
  'classes_attended',
  'classes_held',
  'attendance_percentage',
] as const

const ROLL_ALIASES = ['roll_number', 'rollnumber', 'roll', 'roll_no', 'rollno'] as const
const NAME_ALIASES = ['name', 'student_name', 'full_name'] as const
const COURSE_ALIASES = ['course', 'subject', 'program', 'class_course'] as const
const STATUS_ALIASES = ['status', 'attendance', 'result'] as const
const SLOT_ALIASES = ['slot', 'slot_range', 'time', 'session_time'] as const
const NOTE_ALIASES = ['note', 'comment', 'notes', 'remarks'] as const
const ATTENDED_ALIASES = ['classes_attended', 'attended', 'present'] as const
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

export function parseAttendanceCsv(text: string): AttendanceEntry[] {
  return parseCsvRecords(text)
    .map((record) => {
      const rollNumber = normalizeRollNumber(pick(record, ROLL_ALIASES))
      return {
        rollNumber,
        name: pick(record, NAME_ALIASES).trim(),
        course: pick(record, COURSE_ALIASES).trim(),
        status: parseStatus(pick(record, STATUS_ALIASES)),
        slot: pick(record, SLOT_ALIASES).trim(),
        note: pick(record, NOTE_ALIASES).trim(),
      }
    })
    .filter((entry) => entry.rollNumber.length > 0)
}

export function toAttendanceCsv(entries: readonly AttendanceEntry[]): string {
  return toCsv(
    ATTENDANCE_HEADER,
    entries.map((entry) => [entry.rollNumber, entry.name, entry.course, entry.status, entry.slot, entry.note]),
  )
}

function toCount(value: string): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

/** Reads a squashed <month>.csv back into per-student totals. */
export function parseSquashedCsv(
  text: string,
): Array<Student & { attended: number; held: number }> {
  return parseCsvRecords(text)
    .map((record) => ({
      rollNumber: normalizeRollNumber(pick(record, ROLL_ALIASES)),
      name: pick(record, NAME_ALIASES).trim(),
      course: pick(record, COURSE_ALIASES).trim(),
      attended: toCount(pick(record, ATTENDED_ALIASES)),
      held: toCount(pick(record, HELD_ALIASES)),
    }))
    .filter((row) => row.rollNumber.length > 0)
}

export function toSquashedAttendanceCsv(rows: readonly StudentStat[]): string {
  return toCsv(
    SQUASHED_HEADER,
    rows.map((row) => [
      row.student.rollNumber,
      row.student.name,
      row.student.course,
      row.attended,
      row.held,
      row.percentage,
    ]),
  )
}

/**
 * One file is one session, so every row repeats the same slot. Prefer the first
 * row that actually carries one so partially filled uploads still render.
 */
export function sessionSlotOf(session: { entries: readonly AttendanceEntry[] }): string {
  return session.entries.find((entry) => entry.slot.length > 0)?.slot ?? ''
}

export function sessionNoteOf(session: { entries: readonly AttendanceEntry[] }): string {
  return session.entries.find((entry) => entry.note.length > 0)?.note ?? ''
}
