import {
  ATTENDANCE_ROOT,
  ROSTER_FILE_NAME,
  STUDENTS_ROOT,
  attendancePath,
  rosterPath,
  toIsoDate,
} from './datasetLayout'
import { MONTH_HEADER, ROSTER_HEADER, toMonthCsv, toRosterCsv } from './records'
import type { MonthRow, Student, UploadFile } from './types'

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
const SESSIONS_PER_MONTH = SESSION_SLOTS.length
const MONTHS_OF_HISTORY = 3

function twoDigit(value: number): string {
  return String(value).padStart(2, '0')
}

function pseudoRandom(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

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

function buildMonthRows(
  roster: readonly Student[],
  dates: { date: string; month: string }[],
  classIndex: number,
): MonthRow[] {
  const rows: MonthRow[] = []

  for (const { date, month } of dates) {
    const sessionIndex = dates.findIndex((d) => d.date === date && d.month === month)
    const slot = SESSION_SLOTS[sessionIndex % SESSION_SLOTS.length]
    const seed = classIndex * 1000 + sessionIndex + 1

    for (const student of roster) {
      const isPresent = pseudoRandom(seed * 17 + roster.findIndex((s) => s.rollNumber === student.rollNumber) * 7) > 0.22
      rows.push({
        rollNumber: student.rollNumber,
        name: student.name,
        course: student.course,
        date,
        slot,
        status: isPresent ? 'present' : 'absent',
        classesAttended: 0,
        classesHeld: 0,
      })
    }
  }

  return rows
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
${ATTENDANCE_ROOT}/<class>/<YYYY-MM>.csv
\`\`\`

- Month files are numeric, \`YYYY-MM\`, never a month name.
- \`${ROSTER_FILE_NAME}\` columns: ${ROSTER_HEADER.join(', ')}
- Month file columns: ${MONTH_HEADER.join(', ')}
- Each row is one student's mark for one session (date + slot). The report
  counts distinct date+slot pairs as classes held.
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

    const monthRows = buildMonthRows(roster, dates, classIndex)

    const byMonth = new Map<string, MonthRow[]>()
    for (const row of monthRows) {
      const month = row.date.slice(0, 7)
      const bucket = byMonth.get(month)
      if (bucket) bucket.push(row)
      else byMonth.set(month, [row])
    }

    for (const [month, rows] of byMonth) {
      files.push({
        path: attendancePath(definition.className, month),
        content: new Blob([toMonthCsv(rows)], { type: 'text/csv;charset=utf-8' }),
      })
    }
  })

  return files
}

export const MOCK_CLASS_NAMES = SEED_CLASSES.map((definition) => definition.className)