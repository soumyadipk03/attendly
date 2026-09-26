import { useEffect, useMemo, useState } from 'react'
import {
  createRepo,
  datasetInfo,
  deleteRepo,
  downloadFile,
  listFiles,
  uploadFilesWithProgress,
  whoAmI,
} from '@huggingface/hub'
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  XCircle,
} from 'lucide-react'

type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused'
type Student = {
  id: string
  rollNumber?: string
  name: string
  email: string
  batch: string
  course?: string
}
type AttendanceState = Record<string, AttendanceStatus>
type IssueSummary = {
  title: string
  count: number
  detail: string
}

const DEFAULT_HF_REPO_NAME = 'attendly-data'
const HUGGINGFACE_TOKEN_KEY = 'attendly-hf-token'
const HUGGINGFACE_REPO_KEY = 'attendly-hf-repo'
const CLASS_ROSTER_KEY = 'attendly-class-rosters'
const SELECTED_CLASS_KEY = 'attendly-selected-class'
const SLOT_START_KEY = 'attendly-slot-start'
const SLOT_END_KEY = 'attendly-slot-end'
const COMMENT_KEY = 'attendly-attendance-comment'
const GENERATED_CLASS_CONFIG = [
  { batch: 'mock 1', courses: ['Computer Science', 'Biology', 'Mathematics', 'Computer Science', 'Biology'] },
  { batch: 'mock 2', courses: ['Mathematics', 'Computer Science', 'Biology', 'Mathematics', 'Computer Science'] },
] as const

const buildGeneratedMockStudents = (): Student[] =>
  GENERATED_CLASS_CONFIG.flatMap(({ batch, courses }, classIndex) =>
    courses.map((course, studentIndex) => ({
      id: `mock-${classIndex + 1}-${studentIndex + 1}`,
      rollNumber: String(studentIndex + 1),
      name: `student-${studentIndex + 1}`,
      email: `mock-${classIndex + 1}-${studentIndex + 1}@example.edu`,
      batch,
      course,
    })),
  )

const buildMockAttendance = (students: Student[] = buildGeneratedMockStudents()): AttendanceState =>
  Object.fromEntries(students.map((student) => [student.id, 'absent' as AttendanceStatus])) as AttendanceState

const buildMockClassRosterMap = (): Record<string, Student[]> => {
  const students = buildGeneratedMockStudents()

  return students.reduce<Record<string, Student[]>>((classes: Record<string, Student[]>, student: Student) => {
    const className = student.batch
    classes[className] = classes[className] ? [...classes[className], student] : [student]
    return classes
  }, {})
}

const defaultStudents = buildGeneratedMockStudents()
const defaultAttendance = buildMockAttendance(defaultStudents)
const defaultClassRosterMap = buildMockClassRosterMap()

function parseStudentsCsv(csvText: string): Student[] {
  const lines = csvText.trim().split(/\r?\n/)
  const [header, ...rows] = lines

  if (!header || !rows.length) {
    return defaultStudents
  }

  const columns = header.split(',').map((column) => column.trim().toLowerCase())

  return rows
    .filter((row) => row.trim())
    .map((row) => {
      const values = row.split(',').map((cell) => cell.trim())
      const record = Object.fromEntries(columns.map((column, index) => [column, values[index] || '']))

      return {
        id: record.id || `${record.name?.toLowerCase().replace(/\s+/g, '-') || 'student'}-${Math.random()}`,
        rollNumber: record.roll_number || record.rollnumber || record.roll || record.id || 'unknown',
        name: record.name || 'Student',
        email: record.email || 'unknown@school.edu',
        batch: record.batch || 'General',
        course: record.course || record.subject || record.program || 'General',
      }
    })
}

type PageId = 'attendance' | 'overview' | 'students' | 'accounts'

function App() {
  const [classRosterMap, setClassRosterMap] = useState<Record<string, Student[]>>(() => {
    if (typeof window === 'undefined') {
      return defaultClassRosterMap
    }

    const saved = window.localStorage.getItem(CLASS_ROSTER_KEY)

    if (!saved) {
      return defaultClassRosterMap
    }

    try {
      const parsed = JSON.parse(saved) as Record<string, Student[]>
      return { ...defaultClassRosterMap, ...parsed }
    } catch {
      return defaultClassRosterMap
    }
  })
  const [selectedClassName, setSelectedClassName] = useState(() => {
    const availableClasses = Object.keys(defaultClassRosterMap).sort()
    if (typeof window === 'undefined') {
      return availableClasses[0] ?? 'General'
    }

    const saved = window.localStorage.getItem(SELECTED_CLASS_KEY)
    return saved && defaultClassRosterMap[saved] ? saved : availableClasses[0] ?? 'General'
  })
  const [slotStart, setSlotStart] = useState(() => {
    if (typeof window === 'undefined') {
      return ''
    }

    return window.localStorage.getItem(SLOT_START_KEY) ?? ''
  })
  const [slotEnd, setSlotEnd] = useState(() => {
    if (typeof window === 'undefined') {
      return ''
    }

    return window.localStorage.getItem(SLOT_END_KEY) ?? ''
  })
  const [comment, setComment] = useState(() => {
    if (typeof window === 'undefined') {
      return ''
    }

    return window.localStorage.getItem(COMMENT_KEY) ?? ''
  })
  const [attendance, setAttendance] = useState<AttendanceState>(() => defaultAttendance)
  const [query, setQuery] = useState('')
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [hfToken, setHfToken] = useState('')
  const [hfRepoName, setHfRepoName] = useState(DEFAULT_HF_REPO_NAME)
  const [hfUser, setHfUser] = useState<{
    name?: string
    fullname?: string
    email?: string | null
    orgs?: Array<{ name?: string }>
  } | null>(null)
  const [showHfToken, setShowHfToken] = useState(false)
  const [statusMessage, setStatusMessage] = useState('Static-only mode is active. No backend required.')
  const [isSyncing, setIsSyncing] = useState(false)
  const [isVerifyingHfToken, setIsVerifyingHfToken] = useState(false)
  const [isSettingUpRepo, setIsSettingUpRepo] = useState(false)
  const [isUploadingToHf, setIsUploadingToHf] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [currentPage, setCurrentPage] = useState<PageId>('attendance')
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)
  const [blockingModal, setBlockingModal] = useState<null | {
    type: 'progress' | 'success' | 'confirm'
    title: string
    message: string
    progress?: number
    confirmText?: string
    cancelText?: string
    onConfirm?: () => void
  }>(null)

  useEffect(() => {
    const persistedAttendance = localStorage.getItem('attendly-attendance')
    const persistedHfToken = localStorage.getItem(HUGGINGFACE_TOKEN_KEY)
    const persistedHfRepo = localStorage.getItem(HUGGINGFACE_REPO_KEY)
    const persistedClassRosterMap = localStorage.getItem(CLASS_ROSTER_KEY)
    const persistedClass = localStorage.getItem(SELECTED_CLASS_KEY)
    const persistedSlotStart = localStorage.getItem(SLOT_START_KEY)
    const persistedSlotEnd = localStorage.getItem(SLOT_END_KEY)
    const persistedComment = localStorage.getItem(COMMENT_KEY)

    if (persistedAttendance) {
      setAttendance(JSON.parse(persistedAttendance))
    }

    if (persistedHfToken) {
      setHfToken(persistedHfToken)
      setStatusMessage('Hugging Face token loaded from this browser.')
    }

    if (persistedHfRepo) {
      setHfRepoName(persistedHfRepo)
    }

    if (persistedClassRosterMap) {
      try {
        const parsed = JSON.parse(persistedClassRosterMap) as Record<string, Student[]>
        setClassRosterMap({ ...defaultClassRosterMap, ...parsed })
      } catch {
        setClassRosterMap(defaultClassRosterMap)
      }
    }

    if (persistedClass && defaultClassRosterMap[persistedClass]) {
      setSelectedClassName(persistedClass)
    }

    if (persistedSlotStart) {
      setSlotStart(persistedSlotStart)
    }

    if (persistedSlotEnd) {
      setSlotEnd(persistedSlotEnd)
    }

    if (persistedComment) {
      setComment(persistedComment)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('attendly-attendance', JSON.stringify(attendance))
  }, [attendance])

  useEffect(() => {
    localStorage.setItem(HUGGINGFACE_REPO_KEY, hfRepoName)
  }, [hfRepoName])

  useEffect(() => {
    localStorage.setItem(CLASS_ROSTER_KEY, JSON.stringify(classRosterMap))
  }, [classRosterMap])

  useEffect(() => {
    localStorage.setItem(SELECTED_CLASS_KEY, selectedClassName)
  }, [selectedClassName])

  useEffect(() => {
    localStorage.setItem(SLOT_START_KEY, slotStart)
  }, [slotStart])

  useEffect(() => {
    localStorage.setItem(SLOT_END_KEY, slotEnd)
  }, [slotEnd])

  useEffect(() => {
    localStorage.setItem(COMMENT_KEY, comment)
  }, [comment])

  useEffect(() => {
    setIsMobileNavOpen(false)
  }, [currentPage])

  useEffect(() => {
    const seededMap = buildMockClassRosterMap()
    const seededClassNames = Object.keys(seededMap).sort()

    if (seededClassNames.length > 0) {
      setClassRosterMap(seededMap)
      setSelectedClassName((current) => current || seededClassNames[0])
    }

    setAttendance((current) => ({ ...buildMockAttendance(), ...current }))
    setStatusMessage('Mock data is ready. Reset will recreate a fresh sample roster.')
  }, [])

  const classNames = useMemo(() => Object.keys(classRosterMap).sort(), [classRosterMap])
  const students = useMemo(() => classRosterMap[selectedClassName] ?? [], [classRosterMap, selectedClassName])

  const filteredStudents = useMemo(() => {
    return [...students]
      .filter((student) => {
        const matchesQuery =
          student.name.toLowerCase().includes(query.toLowerCase()) ||
          student.email.toLowerCase().includes(query.toLowerCase()) ||
          student.batch.toLowerCase().includes(query.toLowerCase()) ||
          (student.course ?? '').toLowerCase().includes(query.toLowerCase())

        return matchesQuery
      })
      .sort((a, b) => {
        const courseCompare = (a.course ?? '').localeCompare(b.course ?? '')
        if (courseCompare !== 0) {
          return courseCompare
        }

        const aRoll = Number.parseInt(a.rollNumber ?? a.id, 10) || 0
        const bRoll = Number.parseInt(b.rollNumber ?? b.id, 10) || 0
        return aRoll - bRoll
      })
  }, [attendance, query, students])

  const presentCount = useMemo(
    () => Object.values(attendance).filter((status) => status === 'present').length,
    [attendance],
  )
  const lateCount = useMemo(
    () => Object.values(attendance).filter((status) => status === 'late').length,
    [attendance],
  )
  const attendanceRate = Math.round((presentCount / Math.max(students.length, 1)) * 100)

  const issueSummary: IssueSummary[] = [
    { title: 'Attendance uploads', count: 3, detail: 'CSV export ready' },
    { title: 'Course coverage', count: classNames.length, detail: 'classes loaded' },
    { title: 'Roster sync', count: students.length, detail: 'students in current class' },
    { title: 'Compression', count: 1, detail: 'HF payload optimized' },
  ]

  const toggleAttendance = (studentId: string) => {
    setAttendance((previous) => {
      const current = previous[studentId] ?? 'absent'
      return {
        ...previous,
        [studentId]: current === 'present' ? 'absent' : 'present',
      }
    })
  }

  const slotRange = slotStart && slotEnd ? `${slotStart} to ${slotEnd}` : slotStart || slotEnd || 'unscheduled'

  const exportCsv = () => {
    const timestamp = new Date()
    const fileStamp = `${String(timestamp.getDate()).padStart(2, '0')}${String(timestamp.getMonth() + 1).padStart(2, '0')}${String(timestamp.getFullYear()).slice(-2)}-${String(timestamp.getHours()).padStart(2, '0')}${String(timestamp.getMinutes()).padStart(2, '0')}${String(timestamp.getSeconds()).padStart(2, '0')}`

    const rows = [
      ['student_id', 'student_name', 'email', 'course', 'batch', 'class_name', 'slot', 'comment', 'status', 'date'],
      ...students.map((student) => [
        student.id,
        student.name,
        student.email,
        student.course ?? 'Unknown',
        student.batch,
        student.batch,
        slotRange,
        comment.trim() || 'No comment',
        attendance[student.id] ?? 'absent',
        selectedDate,
      ]),
    ]

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${fileStamp}-attendance.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const resetAllData = () => {
    const seededMap = buildMockClassRosterMap()
    const firstClass = Object.keys(seededMap).sort()[0] ?? ''
    const seededAttendance = buildMockAttendance(Object.values(seededMap).flat())

    setClassRosterMap(seededMap)
    setSelectedClassName(firstClass)
    setAttendance(seededAttendance)
    setSlotStart('')
    setSlotEnd('')
    setComment('')
    setQuery('')
    setHfToken('')
    setHfUser(null)
    setHfRepoName(DEFAULT_HF_REPO_NAME)
    setStatusMessage('All local attendance data has been reset and a fresh mock dataset has been created.')

    localStorage.clear()
    localStorage.setItem(CLASS_ROSTER_KEY, JSON.stringify(seededMap))
    localStorage.setItem(SELECTED_CLASS_KEY, firstClass)
    localStorage.setItem('attendly-attendance', JSON.stringify(seededAttendance))
    localStorage.setItem(HUGGINGFACE_REPO_KEY, DEFAULT_HF_REPO_NAME)
  }

  const updateHfToken = (nextValue: string) => {
    setHfToken(nextValue)

    if (!nextValue.trim()) {
      localStorage.removeItem(HUGGINGFACE_TOKEN_KEY)
      setHfUser(null)
      return
    }

    localStorage.setItem(HUGGINGFACE_TOKEN_KEY, nextValue)
  }

  const verifyHfToken = async () => {
    if (!hfToken.trim()) {
      setHfUser(null)
      setStatusMessage('Paste a Hugging Face API token above before verifying it.')
      return
    }

    setIsVerifyingHfToken(true)

    try {
      const payload = await whoAmI({ accessToken: hfToken })
      const user = payload.type === 'user' ? payload : null
      const username = user?.name || payload.name || 'unknown'
      const displayName = user?.fullname || payload.name || 'Hugging Face user'
      const remaining = user?.orgs?.length ? user.orgs.map((org) => org.name).filter(Boolean).join(', ') : 'no orgs'

      setHfUser(
        user
          ? { ...user, name: username, fullname: user.fullname || username }
          : { name: username, fullname: displayName },
      )
      setHfRepoName(DEFAULT_HF_REPO_NAME)
      localStorage.setItem(HUGGINGFACE_REPO_KEY, DEFAULT_HF_REPO_NAME)
      setStatusMessage(`HF token verified. Account: ${displayName}. Username: ${username}. Access: ${remaining}. Use Setup / Reset dataset repo to recreate the dataset.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'HF token verification failed.'
      setHfUser(null)
      setStatusMessage(`HF token verification failed: ${message}`)
    } finally {
      setIsVerifyingHfToken(false)
    }
  }

  const setupHfDatasetRepo = async () => {
    if (!hfToken.trim()) {
      setStatusMessage('Add a Hugging Face API token before setting up the dataset repo.')
      return
    }

    const currentUser = hfUser?.name || hfUser?.fullname
    const username = currentUser || (await whoAmI({ accessToken: hfToken })).name || 'unknown'

    if (!username || username === 'unknown') {
      setStatusMessage('No verified Hugging Face user was found for this token.')
      return
    }

    const repoName = hfRepoName.trim() || DEFAULT_HF_REPO_NAME
    const repo = { type: 'dataset' as const, name: `${username}/${repoName}` }
    const createdMockStudents = buildGeneratedMockStudents()
    const rosterCsvRows = [
      ['id', 'roll_number', 'name', 'email', 'batch', 'course'],
      ...createdMockStudents.map((student) => [
        student.id,
        student.rollNumber ?? student.id,
        student.name,
        student.email,
        student.batch,
        student.course ?? 'General',
      ]),
    ]
    const rosterCsv = rosterCsvRows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const readmeText = `---
pretty_name: Attendly Mock Dataset
language: en
license: mit
tags:
- attendance
- education
- mock-data
- student-roster
---

# Attendly dataset

This private dataset is managed by Attendly and is used to store the roster and attendance exports for the current authenticated user.

## Contents

- README.md
- data/attendance/README.md
- data/mock-roster.csv
- attendance CSV exports uploaded during class sessions

## Notes

The repo is reset during setup so the latest attendance and roster files stay in sync with the verified account.
`
    const attendanceReadme = `# Attendance data\n\nStore attendance exports in this folder as CSV files.\n\nExample columns:\n\n- student_id\n- student_name\n- roll_number\n- class_name\n- course\n- email\n- date\n- slot\n- comment\n- status\n`

    setIsSettingUpRepo(true)
    setUploadProgress(0)
    setBlockingModal({
      type: 'progress',
      title: 'Resetting dataset repo',
      message: 'Do not close this window until the dataset setup completes successfully.',
      progress: 0,
    })
    setStatusMessage('Resetting dataset repo. Do not close this browser tab until the setup completes successfully.')

    try {
      setUploadProgress(10)
      setBlockingModal((current) => (current ? { ...current, progress: 10 } : current))

      let repoExists = false
      try {
        await datasetInfo({ name: repo.name, accessToken: hfToken })
        repoExists = true
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        const isMissingRepo = /not found|404|does not exist|Repository.*not found/i.test(message)
        if (!isMissingRepo) {
          throw error
        }
      }

      if (repoExists) {
        try {
          await deleteRepo({ repo, accessToken: hfToken })
        } catch (error) {
          const message = error instanceof Error ? error.message : ''
          const isMissingRepo = /not found|404|does not exist|Repository.*not found/i.test(message)
          if (!isMissingRepo) {
            throw error
          }
        }
      }

      setUploadProgress(35)
      setBlockingModal((current) => (current ? { ...current, progress: 35, message: 'Recreating the dataset repo and adding the default file structure...' } : current))
      setStatusMessage('Recreating the dataset repo and adding the default file structure...')

      await createRepo({
        repo,
        accessToken: hfToken,
        visibility: 'private',
        files: [
          { path: 'README.md', content: new Blob([readmeText], { type: 'text/markdown' }) },
          { path: 'data/mock-roster.csv', content: new Blob([rosterCsv], { type: 'text/csv' }) },
          { path: 'data/attendance/README.md', content: new Blob([attendanceReadme], { type: 'text/markdown' }) },
        ],
      })

      setUploadProgress(65)
      setBlockingModal((current) => (current ? { ...current, progress: 65, message: 'Dataset repo is live. Adding the default folder layout and metadata...' } : current))
      setStatusMessage('Dataset repo is live. Adding the default folder layout and metadata...')

      const uploadStream = uploadFilesWithProgress({
        repo,
        accessToken: hfToken,
        files: [
          {
            path: 'README.md',
            content: new Blob([readmeText], { type: 'text/markdown' }),
          },
          {
            path: 'data/mock-roster.csv',
            content: new Blob([rosterCsv], { type: 'text/csv' }),
          },
          {
            path: 'data/attendance/README.md',
            content: new Blob([attendanceReadme], { type: 'text/markdown' }),
          },
        ],
      })

      for await (const event of uploadStream) {
        if (event.event === 'fileProgress') {
          const nextProgress = Math.min(98, 65 + Math.round((event.progress ?? 0) * 30))
          setUploadProgress(nextProgress)
          setBlockingModal((current) => (current ? { ...current, progress: nextProgress } : current))
        }
      }

      setUploadProgress(100)
      setBlockingModal({
        type: 'success',
        title: 'Dataset reset complete',
        message: `Dataset repo setup complete. Ready to push attendance data to ${repo.name}.`,
        confirmText: 'Continue',
      })
      setStatusMessage(`Dataset repo setup complete. Ready to push attendance data to ${repo.name}.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Dataset setup failed.'
      setBlockingModal({
        type: 'success',
        title: 'Setup issue',
        message: `Dataset setup failed: ${message}`,
        confirmText: 'Dismiss',
      })
      setStatusMessage(`Dataset setup failed: ${message}`)
    } finally {
      setIsSettingUpRepo(false)
    }
  }

  const syncToHuggingFace = async () => {
    if (!hfToken.trim()) {
      setStatusMessage('Add a Hugging Face API token before refreshing the roster from the dataset repo.')
      return
    }

    if (!hfUser?.name && !hfUser?.fullname) {
      await verifyHfToken()
    }

    const username = hfUser?.name || hfUser?.fullname
    if (!username) {
      setStatusMessage('Your Hugging Face account could not be resolved from the current token.')
      return
    }

    setIsSyncing(true)

    try {
      const repo = { type: 'dataset' as const, name: `${username}/${hfRepoName.trim() || DEFAULT_HF_REPO_NAME}` }
      const files: Array<{ path: string }> = []
      for await (const file of listFiles({ repo, accessToken: hfToken })) {
        files.push(file)
      }
      const rosterFile = files.find((file) => /mock[-_]?roster|students.*\.csv/i.test(file.path))

      if (!rosterFile) {
        const generatedRoster = buildGeneratedMockStudents()
        const generatedMap = generatedRoster.reduce<Record<string, Student[]>>((classes: Record<string, Student[]>, student: Student) => {
          const batch = student.batch
          classes[batch] = classes[batch] ? [...classes[batch], student] : [student]
          return classes
        }, {})
        setClassRosterMap(generatedMap)
        const firstClass = Object.keys(generatedMap).sort()[0] ?? ''
        setSelectedClassName(firstClass)
        setAttendance(buildMockAttendance(generatedRoster))
        setStatusMessage('No roster file was found in the private HF dataset, so a fresh mock roster was generated and loaded.')
        return
      }

      const blob = await downloadFile({ repo, path: rosterFile.path, accessToken: hfToken })
      if (!blob) {
        throw new Error('The roster file in the HF dataset could not be downloaded.')
      }
      const text = await blob.text()
      const parsed = parseStudentsCsv(text)

      if (parsed.length === 0) {
        throw new Error('The roster file in the HF dataset is empty.')
      }

      const nextMap = parsed.reduce<Record<string, Student[]>>((classes, student) => {
        const batch = student.batch || 'General'
        classes[batch] = classes[batch] ? [...classes[batch], student] : [student]
        return classes
      }, {})

      setClassRosterMap(nextMap)
      const firstClass = Object.keys(nextMap).sort()[0] ?? ''
      setSelectedClassName(firstClass)
      setAttendance(
        Object.fromEntries(parsed.map((student) => [student.id, 'absent' as AttendanceStatus])) as AttendanceState,
      )
      setStatusMessage('Roster refreshed from the private Hugging Face dataset using your API token.')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Roster refresh failed.')
    } finally {
      setIsSyncing(false)
    }
  }

  const submitAttendanceToHuggingFace = async () => {
    if (!hfToken.trim()) {
      setStatusMessage('Add a Hugging Face API token before uploading attendance data.')
      return
    }

    const username = hfUser?.name || hfUser?.fullname
    if (!username) {
      await verifyHfToken()
    }

    const finalUsername = hfUser?.name || hfUser?.fullname
    if (!finalUsername) {
      setStatusMessage('Your Hugging Face account could not be resolved from the current token.')
      return
    }

    const repoName = hfRepoName.trim() || 'attendly-data'
    const repo = { type: 'dataset' as const, name: `${finalUsername}/${repoName}` }
    const attendanceRows = students.map((student) => {
      const status = attendance[student.id] ?? 'absent'
      return {
        student_id: student.id,
        student_name: student.name,
        roll_number: student.rollNumber ?? student.id,
        class_name: student.batch,
        course: student.course ?? 'Unknown',
        email: student.email,
        date: selectedDate,
        slot: slotRange,
        comment: comment.trim() || 'No comment',
        status,
      }
    })

    const csv = [
      ['student_id', 'student_name', 'roll_number', 'class_name', 'course', 'email', 'date', 'slot', 'comment', 'status'],
      ...attendanceRows.map((row) => [
        row.student_id,
        row.student_name,
        row.roll_number,
        row.class_name,
        row.course,
        row.email,
        row.date,
        row.slot,
        row.comment,
        row.status,
      ]),
    ]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const fileName = `${selectedClassName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'attendance'}-${selectedDate}.csv`

    setIsUploadingToHf(true)
    setUploadProgress(10)
    setBlockingModal({
      type: 'progress',
      title: 'Uploading attendance',
      message: 'Your attendance is being sent to Hugging Face. Please do not close this window.',
      progress: 10,
    })

    try {
      setStatusMessage('Ensuring the private Hugging Face dataset repo exists...')
      setUploadProgress(22)
      setBlockingModal((current) => (current ? { ...current, progress: 22, message: 'Ensuring the private Hugging Face dataset repo exists...' } : current))

      try {
        await createRepo({
          repo,
          accessToken: hfToken,
          private: true,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        if (!message.includes('already exists') && !message.includes('409')) {
          throw error
        }
      }

      setStatusMessage('Uploading attendance CSV to the dataset repo...')
      setUploadProgress(55)
      setBlockingModal((current) => (current ? { ...current, progress: 55, message: 'Uploading attendance CSV to the dataset repo...' } : current))

      const uploadStream = uploadFilesWithProgress({
        repo,
        accessToken: hfToken,
        files: [
          {
            path: fileName,
            content: new Blob([csv], { type: 'text/csv;charset=utf-8' }),
          },
        ],
      })

      for await (const event of uploadStream) {
        if (event.event === 'fileProgress') {
          const nextProgress = Math.min(98, 55 + Math.round((event.progress ?? 0) * 40))
          setUploadProgress(nextProgress)
          setBlockingModal((current) => (current ? { ...current, progress: nextProgress } : current))
        }
      }

      setUploadProgress(100)
      setBlockingModal({
        type: 'success',
        title: 'Attendance submitted',
        message: `Attendance uploaded successfully to Hugging Face dataset ${repo.name}.`,
        confirmText: 'Continue',
      })
      setStatusMessage(`Attendance uploaded successfully to Hugging Face dataset ${repo.name}. Reloading the screen...`)
      window.setTimeout(() => {
        window.location.reload()
      }, 1100)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Dataset upload failed.'
      setBlockingModal({
        type: 'success',
        title: 'Upload failed',
        message,
        confirmText: 'Dismiss',
      })
      setStatusMessage(message)
    } finally {
      setIsUploadingToHf(false)
    }
  }

  const navItems = [
    { id: 'attendance', label: 'Take Attendance' },
    { id: 'overview', label: 'Show Attendance' },
    { id: 'students', label: 'Students' },
    { id: 'accounts', label: 'Accounts' },
  ] as const

  const renderPage = () => {
    if (currentPage === 'attendance') {
      return (
        <main className="mt-6 space-y-6 rounded-[28px] border border-slate-200 bg-white/85 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Attendance</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">Take Attendance</h2>
            </div>
            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 shadow-sm">
              <CalendarDays className="h-4 w-4 text-indigo-500" />
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="bg-transparent text-slate-700 outline-none"
              />
            </label>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 shadow-sm">
              <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Class folder</span>
              <select
                value={selectedClassName}
                onChange={(event) => {
                  const nextClass = event.target.value
                  setSelectedClassName(nextClass)
                }}
                className="bg-transparent text-base font-medium text-slate-700 outline-none"
              >
                {classNames.map((className) => (
                  <option key={className} value={className}>
                    {className}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 shadow-sm">
              <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Comment (optional)</span>
              <input
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder="Add note for this session"
                className="bg-transparent text-base font-medium text-slate-700 outline-none placeholder:text-slate-400"
              />
            </label>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm text-slate-600">
                <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">From</span>
                <input
                  type="time"
                  value={slotStart}
                  onChange={(event) => setSlotStart(event.target.value)}
                  className="w-full bg-transparent text-base text-slate-700 outline-none"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm text-slate-600">
                <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">To</span>
                <input
                  type="time"
                  value={slotEnd}
                  onChange={(event) => setSlotEnd(event.target.value)}
                  className="w-full bg-transparent text-base text-slate-700 outline-none"
                />
              </label>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredStudents.map((student) => {
              const currentStatus = attendance[student.id] ?? 'absent'
              const isPresent = currentStatus === 'present'

              return (
                <div key={student.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">{student.name}</p>
                      <p className="text-sm text-slate-500">{student.batch}</p>
                      <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                        Roll {student.rollNumber || student.id}
                      </p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-medium capitalize ${isPresent ? 'bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/30' : 'bg-rose-500/10 text-rose-700 ring-1 ring-rose-500/30'}`}>
                      {isPresent ? 'Present' : 'Absent'}
                    </span>
                  </div>

                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => toggleAttendance(student.id)}
                      className={`w-full rounded-xl px-3 py-3 text-sm font-semibold transition ${
                        isPresent
                          ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                          : 'bg-rose-500 text-white hover:bg-rose-600'
                      }`}
                    >
                      {isPresent ? 'Present' : 'Absent'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={submitAttendanceToHuggingFace}
              className="rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isUploadingToHf}
            >
              {isUploadingToHf ? 'Uploading...' : 'Submit attendance'}
            </button>
          </div>
        </main>
      )
    }

    if (currentPage === 'overview') {
      return (
        <main className="mt-6 rounded-[28px] border border-slate-200 bg-white/85 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Show Attendance</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">Student attendance</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                <Download className="h-4 w-4" />
                Export CSV
              </button>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
            <label className="flex flex-col gap-2 text-sm text-slate-600">
              <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Select class</span>
              <select
                value={selectedClassName}
                onChange={(event) => setSelectedClassName(event.target.value)}
                className="bg-transparent text-base font-medium text-slate-700 outline-none"
              >
                {classNames.map((className) => (
                  <option key={className} value={className}>
                    {className}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              { label: 'Students', value: `${students.length}`, icon: Users },
              { label: 'Present', value: `${presentCount}`, icon: CheckCircle2 },
              { label: 'Absent', value: `${students.length - presentCount}`, icon: XCircle },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">{label}</p>
                  <Icon className="h-4 w-4 text-indigo-500" />
                </div>
                <p className="mt-4 text-3xl font-bold text-slate-900">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.16em] text-slate-500">Current class</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-lg font-semibold text-slate-900">{selectedClassName}</p>
              <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700">{attendanceRate}%</span>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {students.map((student) => {
              const status = attendance[student.id] ?? 'absent'
              const isPresent = status === 'present'

              return (
                <div key={student.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">{student.name}</p>
                      <p className="text-xs text-slate-500">{student.course ?? 'Course not set'}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-medium capitalize ${
                      isPresent
                        ? 'bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-700 ring-1 ring-rose-500/30'
                    }`}>
                      {status}
                    </span>
                  </div>

                  <div className="mt-3 space-y-1 text-sm text-slate-600">
                    <p>Roll: {student.rollNumber ?? student.id}</p>
                    <p>{student.email}</p>
                    <p>{student.batch}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </main>
      )
    }

    if (currentPage === 'students') {
      return (
        <main className="mt-6 rounded-[28px] border border-slate-200 bg-white/85 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Roster</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">All students</h2>
            </div>
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search students, batch, or email"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-700 outline-none ring-0 placeholder:text-slate-400"
              />
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredStudents.map((student) => (
              <div key={student.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{student.name}</p>
                    <p className="text-xs text-slate-500">{student.course ?? 'Course not set'}</p>
                  </div>
                  <span className="rounded-full bg-indigo-100 px-2 py-1 text-[10px] font-medium text-indigo-700">
                    {student.batch}
                  </span>
                </div>
                <div className="mt-3 space-y-1 text-sm text-slate-600">
                  <p>Roll: {student.rollNumber ?? student.id}</p>
                  <p>{student.email}</p>
                </div>
                <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-500">
                  {attendance[student.id] ?? 'absent'}
                </p>
              </div>
            ))}
          </div>
        </main>
      )
    }

    if (currentPage === 'accounts') {
      return (
        <main className="mt-6 rounded-[28px] border border-slate-200 bg-white/85 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Accounts</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">Hugging Face access</h2>
            </div>
            <ShieldCheck className="h-5 w-5 text-indigo-500" />
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 shadow-sm">
            <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-slate-500">Hugging Face API token</label>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
              <input
                type={showHfToken ? 'text' : 'password'}
                value={hfToken}
                onChange={(event) => updateHfToken(event.target.value)}
                placeholder="hf_xxxxxxxxxxxxx"
                className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
              <button
                type="button"
                onClick={() => setShowHfToken((current) => !current)}
                className="text-slate-500 transition hover:text-indigo-600"
                aria-label={showHfToken ? 'Hide HF token' : 'Show HF token'}
              >
                {showHfToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Required for private Hugging Face dataset access and browser-side uploads. Stored locally in this browser only.
            </p>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-slate-900">Status</p>
              <XCircle className="h-4 w-4 text-indigo-500" />
            </div>
            <p className="mt-2 text-slate-600">{statusMessage}</p>
          </div>

          {hfUser && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 shadow-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Verified Hugging Face account</p>
              <div className="mt-3 space-y-2">
                <p className="text-base font-medium text-slate-900">{hfUser.fullname || hfUser.name || 'Hugging Face user'}</p>
                <p>Username: {hfUser.name || 'unknown'}</p>
                {hfUser.email && <p>Email: {hfUser.email}</p>}
                {hfUser.orgs && hfUser.orgs.length > 0 && <p>Orgs: {hfUser.orgs.map((org) => org.name).filter(Boolean).join(', ')}</p>}
              </div>
            </div>
          )}

          <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 shadow-sm">
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-slate-500">Dataset repo</span>
              <input
                value={hfRepoName}
                readOnly
                placeholder="attendly-data"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={verifyHfToken}
                disabled={isVerifyingHfToken}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isVerifyingHfToken ? 'Verifying...' : 'Verify HF token'}
              </button>
              <button
                type="button"
                onClick={setupHfDatasetRepo}
                disabled={!hfUser || isSettingUpRepo}
                className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSettingUpRepo ? 'Resetting repo...' : 'Setup / Reset dataset repo'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setBlockingModal({
                    type: 'confirm',
                    title: 'Reset all local data?',
                    message: 'This will erase the full local attendance database, including all students and class roster data. This action cannot be undone.',
                    confirmText: 'Reset everything',
                    cancelText: 'Cancel',
                    onConfirm: () => {
                      resetAllData()
                      setBlockingModal(null)
                    },
                  })
                }}
                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 transition hover:border-rose-300 hover:bg-rose-100"
              >
                Reset data
              </button>
              <button
                type="button"
                onClick={() => {
                  setHfToken('')
                  setHfUser(null)
                  localStorage.removeItem(HUGGINGFACE_TOKEN_KEY)
                  setStatusMessage('Hugging Face token was cleared from this browser.')
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
              >
                Clear HF token
              </button>
            </div>
            {isSettingUpRepo && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">
                <p className="text-xs font-semibold uppercase tracking-[0.18em]">Important</p>
                <p className="mt-2 text-sm">Do not close this window until the dataset repo reset completes successfully.</p>
                <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-amber-200">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <p className="mt-2 text-xs font-medium">{uploadProgress}% complete</p>
              </div>
            )}
          </div>
        </main>
      )
    }

    return (
      <main className="mt-6 space-y-6 rounded-[28px] border border-slate-200 bg-white/85 p-4 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-sm sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Show Attendance</p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">Attendance overview</h2>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {[
            { label: 'Students', value: `${students.length}`, icon: Users },
            { label: 'Present', value: `${presentCount}`, icon: CheckCircle2 },
            { label: 'Late', value: `${lateCount}`, icon: Clock3 },
            { label: 'Rate', value: `${attendanceRate}%`, icon: BarChart3 },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">{label}</p>
                <Icon className="h-4 w-4 text-indigo-500" />
              </div>
              <p className="mt-4 text-3xl font-bold text-slate-900">{value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Issue parser</p>
            <div className="mt-4 space-y-3">
              {issueSummary.map((issue) => (
                <div key={issue.title} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-900">{issue.title}</p>
                    <span className="rounded-full bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-700">{issue.count}</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{issue.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Status</p>
              <ShieldCheck className="h-5 w-5 text-indigo-500" />
            </div>
            <p className="mt-4 text-base text-slate-700">{statusMessage}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage('attendance')}
                className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                Start attendance
              </button>
              <button
                type="button"
                onClick={syncToHuggingFace}
                disabled={isSyncing}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSyncing ? 'Refreshing...' : 'Refresh roster'}
              </button>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#f5f7ff_0%,_#eef2ff_22%,_#f8fafc_48%,_#f3f4f6_100%)] text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <header className="rounded-[30px] border border-slate-200 bg-white/80 p-4 shadow-[0_22px_60px_rgba(15,23,42,0.08)] backdrop-blur-md sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-indigo-700">
                <Sparkles className="h-3.5 w-3.5" />
                Attendly
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
                Attendance, simplified for modern cohorts.
              </h1>
            </div>

            <button
              type="button"
              aria-label="Toggle navigation menu"
              onClick={() => setIsMobileNavOpen((current) => !current)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-indigo-200 hover:text-indigo-700 lg:hidden"
            >
              {isMobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 shadow-sm">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-indigo-500" />
              <span>{hfToken ? 'HF token stored locally' : 'No HF token saved yet'}</span>
            </div>
          </div>

          <nav className={`${isMobileNavOpen ? 'mt-4 flex' : 'mt-6 hidden'} flex-col gap-2 lg:mt-6 lg:flex lg:flex-row lg:flex-wrap`}>
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCurrentPage(item.id)}
                className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                  currentPage === item.id
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'border border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-700'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </header>

        {renderPage()}
      </div>

      {blockingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_25px_80px_rgba(15,23,42,0.35)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Action required</p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900">{blockingModal.title}</h3>
              </div>
              {blockingModal.type !== 'progress' && (
                <button
                  type="button"
                  onClick={() => setBlockingModal(null)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:text-slate-700"
                  aria-label="Close modal"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <p className="mt-4 text-sm leading-6 text-slate-600">{blockingModal.message}</p>

            {blockingModal.type === 'progress' && (
              <div className="mt-5">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-slate-500">
                  <span>Progress</span>
                  <span>{blockingModal.progress ?? 0}%</span>
                </div>
                <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 transition-all duration-300"
                    style={{ width: `${blockingModal.progress ?? 0}%` }}
                  />
                </div>
              </div>
            )}

            {blockingModal.type === 'confirm' && (
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBlockingModal(null)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300"
                >
                  {blockingModal.cancelText ?? 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={blockingModal.onConfirm}
                  className="rounded-xl bg-rose-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-rose-700"
                >
                  {blockingModal.confirmText ?? 'Confirm'}
                </button>
              </div>
            )}

            {blockingModal.type === 'success' && (
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => setBlockingModal(null)}
                  className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
                >
                  {blockingModal.confirmText ?? 'Continue'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App
