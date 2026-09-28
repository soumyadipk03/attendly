import {
  ATTENDANCE_FILE_SUFFIX,
  ATTENDANCE_ROOT,
  ROSTER_FILE_NAME,
  STUDENTS_ROOT,
  attendancePath,
  buildAttendanceFileName,
  rosterPath,
  toIsoDate,
} from './datasetLayout'
import { ATTENDANCE_HEADER, ROSTER_HEADER, SQUASHED_HEADER, toAttendanceCsv, toRosterCsv } from './records'
import type { AttendanceEntry, Student, UploadFile } from './types'

/**
 * Seed-only fixture. This is the single place in the project where sample
 * rosters exist, and it is reachable only from the "Reset dataset"
 * action, which writes the files into the Hugging Face dataset. It is never
 * used as a runtime data source: every student the UI renders is pulled from
 * the dataset.
 */

const SEED_CLASSES: Array<{ className: string; students: Array<[string, string, string]> }> = [
  {
    className: 'mock1',
    students: [
      ['Aarav Sharma', '01', 'Computer Science'],
      ['Meera Patel', '02', 'Biology'],
      ['Ishaan Roy', '03', 'Computer Science'],
      ['Nandini Rao', '04', 'Mathematics'],
      ['Kabir Malhotra', '05', 'Biology'],
      ['Sara Qureshi', '06', 'Computer Science'],
    ],
  },
  {
    className: 'mock2',
    students: [
      ['Arjun Nair', '01', 'Mathematics'],
      ['Diya Kapoor', '02', 'Computer Science'],
      ['Rohan Desai', '03', 'Biology'],
      ['Ananya Iyer', '04', 'Computer Science'],
      ['Vivaan Ghosh', '05', 'Mathematics'],
      ['Tara Menon', '06', 'Biology'],
    ],
  },
]

const SESSION_SLOTS = [
  '09:00 to 09:30',
  '10:30 to 11:00',
  '12:00 to 12:45',
  '14:30 to 15:30',
] as const
const TOPICS = ['Lecture', 'Revision', 'Doubt clearing', 'Lab']
const SESSIONS_PER_MONTH = SESSION_SLOTS.length
const MONTHS_OF_HISTORY = 3

function twoDigit(value: number): string {
  return String(value).padStart(2, '0')
}

function pseudoRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

/** One entry per session, carrying the numeric month folder it belongs in. */
function sessionDates(today: Date): Array<{ date: string; month: string }> {
  const dates: Array<{ date: string; month: string }> = []

  for (let back = MONTHS_OF_HISTORY - 1; back >= 0; back -= 1) {
    const cursor = new Date(today.getFullYear(), today.getMonth() - back, 1)
    const month = `${cursor.getFullYear()}-${twoDigit(cursor.getMonth() + 1)}`
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
    const lastDay = back === 0 ? Math.min(today.getDate(), daysInMonth) : daysInMonth

    for (let session = 0; session < SESSIONS_PER_MONTH; session += 1) {
      const day = Math.min(1 + session * 7, lastDay)
      dates.push({ date: toIsoDate(new Date(cursor.getFullYear(), cursor.getMonth(), day)), month })
    }
  }

  return dates
}

function buildRoster(definition: (typeof SEED_CLASSES)[number]): Student[] {
  return definition.students.map(([name, rollNumber, course]) => ({ name, rollNumber, course }))
}

function buildEntries(
  students: readonly Student[],
  seed: number,
  slot: string,
  note: string,
): AttendanceEntry[] {
  return students.map((student, index) => ({
    rollNumber: student.rollNumber,
    name: student.name,
    course: student.course,
    status: pseudoRandom(seed * 17 + index * 7) > 0.22 ? 'present' : 'absent',
    slot,
    note,
  }))
}

export function buildDatasetReadme(): string {
  return `---
pretty_name: Attendly Attendance Dataset
language: en
license: mit
tags:
- attendance
- education
- student-roster
---

# Attendly dataset

This dataset is managed by the Attendly app and holds every class roster and
attendance session for the authenticated Hugging Face account.

## Layout

\`\`\`
${STUDENTS_ROOT}/<class>/${ROSTER_FILE_NAME}
${ATTENDANCE_ROOT}/<class>/<YYYY-MM>/<ddmmyy>_<tttttt>${ATTENDANCE_FILE_SUFFIX}
\`\`\`

- Month folders are numeric, \`YYYY-MM\`, never a month name.
- \`${ROSTER_FILE_NAME}\` columns: ${ROSTER_HEADER.join(', ')}
- Attendance file columns: ${ATTENDANCE_HEADER.join(', ')}
- One attendance file equals one class held. The filename carries the session
  date (\`ddmmyy\`) and slot start time (\`tttttt\`), while the \`slot\` column
  keeps the full user-defined range, for example \`09:05 to 09:30\`.
- Once a class has two month folders, the older one is squashed into a single
  \`<class>/<YYYY-MM>.csv\` summary with columns ${SQUASHED_HEADER.join(', ')}
  holding each student's classes attended over classes held. The daily files in
  that month folder are then removed, and the summary takes their place in the
  report.
`
}

export function buildMockSeedFiles(now = new Date()): UploadFile[] {
  const files: UploadFile[] = [{ path: 'README.md', content: new Blob([buildDatasetReadme()], { type: 'text/markdown' }) }]
  const dates = sessionDates(now)

  SEED_CLASSES.forEach((definition, classIndex) => {
    const roster = buildRoster(definition)

    files.push({
      path: rosterPath(definition.className),
      content: new Blob([toRosterCsv(roster)], { type: 'text/csv;charset=utf-8' }),
    })

    dates.forEach(({ date, month }, sessionIndex) => {
      const slot = SESSION_SLOTS[sessionIndex % SESSION_SLOTS.length]
      const fileName = buildAttendanceFileName(date, slot.split(' to ')[0])
      const note = TOPICS[(classIndex + sessionIndex) % TOPICS.length]
      const entries = buildEntries(roster, classIndex * 1000 + sessionIndex + 1, slot, note)

      files.push({
        path: attendancePath(definition.className, month, fileName),
        content: new Blob([toAttendanceCsv(entries)], { type: 'text/csv;charset=utf-8' }),
      })
    })
  })

  return files
}

export const MOCK_CLASS_NAMES = SEED_CLASSES.map((definition) => definition.className)
