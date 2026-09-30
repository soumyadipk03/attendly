export const STUDENTS_ROOT = 'data/students'
export const ATTENDANCE_ROOT = 'data/attendance'
export const ROSTER_FILE_NAME = 'students.csv'
/** One file per month, numeric YYYY-MM: data/attendance/<class>/<YYYY-MM>.csv */
export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/
export const MONTH_FILE_PATTERN = /^(\d{4}-(?:0[1-9]|1[0-2]))\.csv$/i
export const CLASS_PATH_INDEX = 2

export function studentsClassDir(className: string): string {
  return `${STUDENTS_ROOT}/${className}`
}

/**
 * Class names are typed by the user and become folder names, so they are
 * restricted to what a single safe folder segment allows. Anything that could
 * climb out of data/<root>/ — separators, dot segments, control characters —
 * is rejected rather than sanitised, so a rejected name stays visible.
 */
export function isValidClassName(className: string): boolean {
  if (!className || className.length > 64) {
    return false
  }
  if (className !== className.trim() || className.startsWith('.')) {
    return false
  }
  for (const character of className) {
    const code = character.codePointAt(0) ?? 0
    const isControl = code < 32 || code === 127
    if (isControl || character === '/' || character === '\\') {
      return false
    }
  }
  return true
}

export function rosterPath(className: string): string {
  return `${studentsClassDir(className)}/${ROSTER_FILE_NAME}`
}

export function attendanceClassDir(className: string): string {
  return `${ATTENDANCE_ROOT}/${className}`
}

/** Folder holding one month of daily attendance files for a class. */
export function attendanceMonthDir(className: string, month: string): string {
  return `${attendanceClassDir(className)}/${month}`
}

/** The month file, appended to on every submit. */
export function attendancePath(className: string, month: string): string {
  return `${attendanceClassDir(className)}/${month}.csv`
}

export function monthOf(fileName: string): string | null {
  return MONTH_FILE_PATTERN.exec(fileName)?.[1] ?? null
}

export function currentMonth(now = new Date()): string {
  return `${now.getFullYear()}-${twoDigit(now.getMonth() + 1)}`
}

function twoDigit(value: number): string {
  return String(value).padStart(2, '0')
}

export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${twoDigit(date.getMonth() + 1)}-${twoDigit(date.getDate())}`
}

/**
 * The date is typed as ddmmyyyy, the way it is written by hand, and it is typed
 * in every time: like the slot, a session date is a deliberate choice rather than
 * a guess, so nothing is pre-filled from the clock.
 */
export const DATE_DIGITS = 8

/** Digits only, capped at 8, so the field cannot hold a half-typed month name. */
export function sanitizeDateDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, DATE_DIGITS)
}

/** "31082026" reads as "31/08/2026" while it is being typed. */
export function formatDateForInput(digits: string): string {
  const clean = sanitizeDateDigits(digits)
  if (clean.length <= 2) {
    return clean
  }
  if (clean.length <= 4) {
    return `${clean.slice(0, 2)}/${clean.slice(2)}`
  }
  return `${clean.slice(0, 2)}/${clean.slice(2, 4)}/${clean.slice(4)}`
}

/**
 * ddmmyyyy to the ISO yyyy-mm-dd the dataset stores. Returns null unless the
 * digits form a real calendar date, so 31/02 is refused rather than rolled over
 * into March and recorded against the wrong day.
 */
export function parseDateDigits(digits: string): string | null {
  const clean = sanitizeDateDigits(digits)
  if (clean.length !== DATE_DIGITS) {
    return null
  }

  const day = Number(clean.slice(0, 2))
  const month = Number(clean.slice(2, 4))
  const year = Number(clean.slice(4, 8))

  if (month < 1 || month > 12 || day < 1) {
    return null
  }

  const candidate = new Date(year, month - 1, day)
  const roundTrips =
    candidate.getFullYear() === year && candidate.getMonth() === month - 1 && candidate.getDate() === day
  return roundTrips ? toIsoDate(candidate) : null
}

/** yyyy-mm-dd back to ddmmyyyy for display. */
export function formatDateDigits(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  return match ? `${match[3]}${match[2]}${match[1]}` : ''
}

export function toClock(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440
  return `${twoDigit(Math.floor(wrapped / 60))}:${twoDigit(wrapped % 60)}`
}

export function clockToMinutes(clock: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock.trim())
  if (!match) {
    return null
  }
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) {
    return null
  }
  return hours * 60 + minutes
}

/** Blank on purpose: the slot is chosen per session, never pre-filled from the clock. */
export function defaultSlotRange(): { start: string; end: string } {
  return { start: '', end: '' }
}

/** "09:05 to 09:30", or whichever end the user filled in. Empty when neither is set. */
export function formatSlotRange(start: string, end: string): string {
  if (start && end) {
    return `${start} to ${end}`
  }
  return start || end || ''
}

/** True when both ends are set and the slot does not run backwards. */
export function isSlotRangeValid(start: string, end: string): boolean {
  if (!start) {
    return false
  }
  if (!end) {
    return true
  }
  const from = clockToMinutes(start)
  const to = clockToMinutes(end)
  if (from === null || to === null) {
    return false
  }
  return to > from
}

export function isRosterPath(path: string): boolean {
  return path.toLowerCase().endsWith(`/${ROSTER_FILE_NAME}`) || path.toLowerCase() === ROSTER_FILE_NAME
}

/** True for a month's <YYYY-MM>.csv. */
export function isAttendancePath(path: string): boolean {
  return monthOf(fileNameOf(path)) !== null
}

export function fileNameOf(path: string): string {
  const segments = path.split('/')
  return segments[segments.length - 1] ?? ''
}

/**
 * Every path is data/<root>/<class>/... so the class always sits at a fixed
 * index, whether or not a month folder follows it.
 */
export function classNameOf(path: string): string {
  return path.split('/').filter(Boolean)[CLASS_PATH_INDEX] ?? ''
}

export function attendanceMonthOf(path: string): string | null {
  return monthOf(fileNameOf(path))
}

export function sortByName(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
}
