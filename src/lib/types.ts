export type AttendanceStatus = 'present' | 'absent'

export type Student = {
  rollNumber: string
  name: string
  course: string
}

export type AttendanceEntry = {
  rollNumber: string
  name: string
  course: string
  status: AttendanceStatus
  /** User-defined slot for the whole session, e.g. "09:05 to 09:30". */
  slot: string
  note: string
}

export type AttendanceSession = {
  fileName: string
  path: string
  stamp: string
  date: string
  time: string
  month: string
  entries: AttendanceEntry[]
}

export type ClassData = {
  className: string
  roster: Student[]
  sessions: AttendanceSession[]
  /** Completed months held as a single summary file instead of daily files. */
  squashedMonths: SquashedMonth[]
  /** Past months still held as daily files, waiting to be squashed. */
  squashCandidates: SquashCandidate[]
}

export type DatasetSnapshot = Record<string, ClassData>

export type RangeMode = 'monthly' | 'total'

export type StudentStat = {
  student: Student
  attended: number
  held: number
  percentage: number
}

/** A completed month stored as one <month>.csv of per-student totals. */
export type SquashedMonth = {
  className: string
  month: string
  path: string
  stats: StudentStat[]
  classesHeld: number
}

export type ClassReport = {
  className: string
  mode: RangeMode
  month: string
  sessions: AttendanceSession[]
  squashedMonths: SquashedMonth[]
  months: string[]
  stats: StudentStat[]
  classesHeld: number
  averagePercentage: number
}

export type AttendanceDraft = Record<string, AttendanceStatus>

export type SquashCandidate = {
  className: string
  month: string
  dailyPaths: string[]
}

export type HfAccount = {
  name: string
  fullname: string
  email: string | null
  orgs: string[]
}

export type ModalState = {
  type: 'progress' | 'success' | 'confirm'
  title: string
  message: string
  progress?: number
  /** Shown as a blocking banner while an API write is in flight. */
  warning?: string
  confirmText?: string
  cancelText?: string
  onConfirm?: () => void
} | null

export type UploadFile = {
  path: string
  content: Blob
}
