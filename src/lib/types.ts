export type AttendanceStatus = 'present' | 'absent'

export type Student = {
  rollNumber: string
  name: string
  course: string
}

/** One student's mark for one session, as stored in a month's rows. */
export type MonthRow = {
  rollNumber: string
  name: string
  course: string
  /** The day the session ran, as YYYY-MM-DD. */
  date: string
  /** User-defined slot for the whole session, e.g. "09:05 to 09:30". */
  slot: string
  status: AttendanceStatus
  /** Running count of sessions this student attended that month. */
  classesAttended: number
  /** Distinct sessions held that month, identical on every row. */
  classesHeld: number
}

/** One <month>.csv: every session logged for a class in that month. */
export type MonthRecord = {
  className: string
  month: string
  path: string
  rows: MonthRow[]
}

export type ClassData = {
  className: string
  roster: Student[]
  months: MonthRecord[]
}

export type DatasetSnapshot = Record<string, ClassData>

export type RangeMode = 'monthly' | 'total'

export type StudentStat = {
  student: Student
  attended: number
  held: number
  percentage: number
}

export type ClassReport = {
  className: string
  mode: RangeMode
  month: string
  months: MonthRecord[]
  monthNames: string[]
  stats: StudentStat[]
  classesHeld: number
  averagePercentage: number
}

export type AttendanceDraft = Record<string, AttendanceStatus>

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
