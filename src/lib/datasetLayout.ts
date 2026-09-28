export const STUDENTS_ROOT = 'data/students'
export const ATTENDANCE_ROOT = 'data/attendance'
export const ROSTER_FILE_NAME = 'students.csv'
export const ATTENDANCE_FILE_SUFFIX = '_attendance.csv'
export const ATTENDANCE_FILE_PATTERN = /^(\d{2})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})_attendance\.csv$/i
/** Attendance lives one month deep: data/attendance/<class>/<YYYY-MM>/<file>.csv */
export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/
export const SQUASHED_MONTH_PATTERN = /^(\d{4}-(?:0[1-9]|1[0-2]))\.csv$/i
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

export function attendancePath(className: string, month: string, fileName: string): string {
  return `${attendanceMonthDir(className, month)}/${fileName}`
}

/** The squashed month file, sitting beside the month folders it replaces. */
export function squashedAttendancePath(className: string, month: string): string {
  return `${attendanceClassDir(className)}/${month}.csv`
}

export function squashedMonthOf(fileName: string): string | null {
  return SQUASHED_MONTH_PATTERN.exec(fileName)?.[1] ?? null
}

export function currentMonth(now = new Date()): string {
  return `${now.getFullYear()}-${twoDigit(now.getMonth() + 1)}`
}

/**
 * True for daily files that live inside a month folder. Squashed <month>.csv
 * files are deliberately excluded: they are already month-level.
 */
export function isMonthDayPath(path: string): boolean {
  const segments = path.split('/').filter(Boolean)
  if (segments.length < 2) {
    return false
  }
  const month = squashedMonthOf(segments[segments.length - 1])
  if (month) {
    return false
  }
  return MONTH_PATTERN.test(segments[segments.length - 2] ?? '') && isAttendancePath(path)
}

function twoDigit(value: number): string {
  return String(value).padStart(2, '0')
}

export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${twoDigit(date.getMonth() + 1)}-${twoDigit(date.getDate())}`
}

/**
 * Attendance filenames encode the slot start: ddmmyy_tttttt_attendance.csv.
 * The full "from to" range lives in the file's `slot` column, so two sessions
 * that begin at the same minute on the same day remain the same session.
 */
export function buildAttendanceFileName(date: string, startTime: string): string {
  const [year, month, day] = date.split('-')
  const [hour, minute, second] = startTime.split(':')
  const datePart = `${day ?? '01'}${month ?? '01'}${(year ?? '1970').slice(-2)}`
  const timePart = `${hour ?? '00'}${minute ?? '00'}${twoDigit(Number(second ?? '0') || 0)}`
  return `${datePart}_${timePart}${ATTENDANCE_FILE_SUFFIX}`
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

export function defaultSlotRange(): { start: string; end: string } {
  const now = new Date()
  const start = now.getHours() * 60 + now.getMinutes()
  return { start: toClock(start), end: toClock(start + 30) }
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

type ParsedAttendanceFileName = {
  stamp: string
  date: string
  time: string
  month: string
}

export function parseAttendanceFileName(fileName: string): ParsedAttendanceFileName | null {
  const match = ATTENDANCE_FILE_PATTERN.exec(fileName)
  if (!match) {
    return null
  }

  const [, day, month, shortYear, hour, minute, second] = match
  const date = `20${shortYear}-${month}-${day}`
  const time = `${hour}:${minute}:${second}`

  return {
    stamp: `${day}${month}${shortYear}_${hour}${minute}${second}`,
    date,
    time,
    month: `${20}${shortYear}-${month}`,
  }
}

export function isRosterPath(path: string): boolean {
  return path.toLowerCase().endsWith(`/${ROSTER_FILE_NAME}`) || path.toLowerCase() === ROSTER_FILE_NAME
}

/** True for both daily files and squashed month files. */
export function isAttendancePath(path: string): boolean {
  const fileName = fileNameOf(path)
  return ATTENDANCE_FILE_PATTERN.test(fileName) || squashedMonthOf(fileName) !== null
}

export function isSquashedPath(path: string): boolean {
  return squashedMonthOf(fileNameOf(path)) !== null
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

/** Month folder name for a daily file, or the month a squashed file represents. */
export function attendanceMonthOf(path: string): string | null {
  const segments = path.split('/').filter(Boolean)
  const squashed = squashedMonthOf(segments[segments.length - 1] ?? '')
  if (squashed) {
    return squashed
  }
  const folder = segments[segments.length - 2] ?? ''
  return MONTH_PATTERN.test(folder) ? folder : null
}

export function sortByName(values: Iterable<string>): string[] {
  return [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
}
