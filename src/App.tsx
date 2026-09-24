import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  EyeOff,
  GitBranch,
  KeyRound,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react'

type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused'
type Student = {
  id: string
  name: string
  email: string
  batch: string
}
type AttendanceState = Record<string, AttendanceStatus>
type IssueSummary = {
  title: string
  count: number
  detail: string
}

const DEFAULT_CSV_URL = '/students.csv'
const GITHUB_PAT_KEY = 'attendly-github-pat'
const classNames = ['AI-101', 'BIO-202', 'CS-303', 'MATH-404', 'UX-505']

const defaultStudents: Student[] = [
  { id: 'stu-101', name: 'Aarav Sharma', email: 'aarav.sharma@school.edu', batch: 'AI-101' },
  { id: 'stu-102', name: 'Meera Patel', email: 'meera.patel@school.edu', batch: 'AI-101' },
  { id: 'stu-103', name: 'Leo Nguyen', email: 'leo.nguyen@school.edu', batch: 'AI-101' },
  { id: 'stu-104', name: 'Noah Brooks', email: 'noah.brooks@school.edu', batch: 'AI-101' },
  { id: 'stu-105', name: 'Riya Verma', email: 'riya.verma@school.edu', batch: 'AI-101' },
  { id: 'stu-201', name: 'Emma Johnson', email: 'emma.johnson@school.edu', batch: 'BIO-202' },
  { id: 'stu-202', name: 'Sophia Williams', email: 'sophia.williams@school.edu', batch: 'BIO-202' },
  { id: 'stu-203', name: 'Daniel Kim', email: 'daniel.kim@school.edu', batch: 'BIO-202' },
  { id: 'stu-204', name: 'Olivia Martinez', email: 'olivia.martinez@school.edu', batch: 'BIO-202' },
  { id: 'stu-205', name: 'Henry Lee', email: 'henry.lee@school.edu', batch: 'BIO-202' },
  { id: 'stu-301', name: 'Aiden Clark', email: 'aiden.clark@school.edu', batch: 'CS-303' },
  { id: 'stu-302', name: 'Mila Davis', email: 'mila.davis@school.edu', batch: 'CS-303' },
  { id: 'stu-303', name: 'Zoe Wilson', email: 'zoe.wilson@school.edu', batch: 'CS-303' },
  { id: 'stu-304', name: 'Jack Moore', email: 'jack.moore@school.edu', batch: 'CS-303' },
  { id: 'stu-305', name: 'Priya Shah', email: 'priya.shah@school.edu', batch: 'CS-303' },
  { id: 'stu-401', name: 'Ben Carter', email: 'ben.carter@school.edu', batch: 'MATH-404' },
  { id: 'stu-402', name: 'Liam Harris', email: 'liam.harris@school.edu', batch: 'MATH-404' },
  { id: 'stu-403', name: 'Nora Allen', email: 'nora.allen@school.edu', batch: 'MATH-404' },
  { id: 'stu-404', name: 'Sofia Brown', email: 'sofia.brown@school.edu', batch: 'MATH-404' },
  { id: 'stu-405', name: 'Lucas Evans', email: 'lucas.evans@school.edu', batch: 'MATH-404' },
  { id: 'stu-501', name: 'Harper King', email: 'harper.king@school.edu', batch: 'UX-505' },
  { id: 'stu-502', name: 'Ethan Walker', email: 'ethan.walker@school.edu', batch: 'UX-505' },
  { id: 'stu-503', name: 'Amelia Hall', email: 'amelia.hall@school.edu', batch: 'UX-505' },
  { id: 'stu-504', name: 'Mason Young', email: 'mason.young@school.edu', batch: 'UX-505' },
  { id: 'stu-505', name: 'Ella Scott', email: 'ella.scott@school.edu', batch: 'UX-505' },
]

const statusStyles: Record<AttendanceStatus, { label: string; badge: string }> = {
  present: { label: 'Present', badge: 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-400/30' },
  late: { label: 'Late', badge: 'bg-amber-500/10 text-amber-300 ring-1 ring-amber-400/30' },
  absent: { label: 'Absent', badge: 'bg-rose-500/10 text-rose-300 ring-1 ring-rose-400/30' },
  excused: { label: 'Excused', badge: 'bg-sky-500/10 text-sky-300 ring-1 ring-sky-400/30' },
}

const statusOrder: AttendanceStatus[] = ['present', 'late', 'absent', 'excused']

const defaultAttendance = Object.fromEntries(
  defaultStudents.map((student) => [student.id, 'present' as AttendanceStatus]),
) as AttendanceState

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
        name: record.name || 'Student',
        email: record.email || 'unknown@school.edu',
        batch: record.batch || 'General',
      }
    })
}

type PageId = 'dashboard' | 'attendance' | 'overview' | 'students' | 'accounts'

function App() {
  const [students, setStudents] = useState<Student[]>(defaultStudents)
  const [attendance, setAttendance] = useState<AttendanceState>(() => defaultAttendance)
  const [query, setQuery] = useState('')
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [statusFilter, setStatusFilter] = useState<'all' | AttendanceStatus>('all')
  const [classFilter, setClassFilter] = useState<'all' | string>('all')
  const [githubPat, setGithubPat] = useState('')
  const [githubUser, setGithubUser] = useState<{
    login: string
    id: number
    name?: string
    html_url?: string
    public_repos?: number
    email?: string | null
  } | null>(null)
  const [showPat, setShowPat] = useState(false)
  const [statusMessage, setStatusMessage] = useState('Static-only mode is active. No backend required.')
  const [isSyncing, setIsSyncing] = useState(false)
  const [isVerifyingPat, setIsVerifyingPat] = useState(false)
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard')

  useEffect(() => {
    const persistedAttendance = localStorage.getItem('attendly-attendance')
    const persistedPat = localStorage.getItem(GITHUB_PAT_KEY)

    if (persistedAttendance) {
      setAttendance(JSON.parse(persistedAttendance))
    }

    if (persistedPat) {
      setGithubPat(persistedPat)
      setStatusMessage('GitHub PAT loaded from this browser.')
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('attendly-attendance', JSON.stringify(attendance))
  }, [attendance])

  useEffect(() => {
    fetch(DEFAULT_CSV_URL)
      .then((response) => {
        if (!response.ok) {
          return null
        }

        return response.text()
      })
      .then((csvText) => {
        if (!csvText) {
          return
        }

        const parsed = parseStudentsCsv(csvText)
        setStudents(parsed)
      })
      .catch(() => {
        setStatusMessage('Using the bundled sample roster because the local CSV is not reachable yet.')
      })
  }, [])

  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      const matchesQuery =
        student.name.toLowerCase().includes(query.toLowerCase()) ||
        student.email.toLowerCase().includes(query.toLowerCase()) ||
        student.batch.toLowerCase().includes(query.toLowerCase())

      const matchesClass = classFilter === 'all' || student.batch === classFilter

      const currentState = attendance[student.id] ?? 'absent'
      const matchesFilter = statusFilter === 'all' || currentState === statusFilter

      return matchesQuery && matchesClass && matchesFilter
    })
  }, [attendance, classFilter, query, statusFilter, students])

  const presentCount = useMemo(
    () => Object.values(attendance).filter((status) => status === 'present').length,
    [attendance],
  )
  const lateCount = useMemo(
    () => Object.values(attendance).filter((status) => status === 'late').length,
    [attendance],
  )
  const attendanceRate = Math.round((presentCount / students.length) * 100)

  const classSummary = useMemo(
    () =>
      classNames.map((className) => ({
        className,
        count: students.filter((student) => student.batch === className).length,
      })),
    [students],
  )

  const issueSummary: IssueSummary[] = [
    { title: 'Attendance requests', count: 14, detail: 'updated 4h ago' },
    { title: 'Absence notes', count: 5, detail: '3 await review' },
    { title: 'Late arrivals', count: 8, detail: '1 flagged as urgent' },
    { title: 'Roster issues', count: 2, detail: 'csv needs validation' },
  ]

  const updateAttendance = (studentId: string, nextStatus: AttendanceStatus) => {
    setAttendance((previous) => ({
      ...previous,
      [studentId]: nextStatus,
    }))
  }

  const exportCsv = () => {
    const rows = [
      ['student_id', 'student_name', 'email', 'batch', 'status', 'date'],
      ...students.map((student) => [
        student.id,
        student.name,
        student.email,
        student.batch,
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
    link.download = `attendance-${selectedDate}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const updateGithubPat = (nextValue: string) => {
    setGithubPat(nextValue)

    if (!nextValue.trim()) {
      localStorage.removeItem(GITHUB_PAT_KEY)
      setGithubUser(null)
      return
    }

    localStorage.setItem(GITHUB_PAT_KEY, nextValue)
  }

  const verifyGithubPat = async () => {
    if (!githubPat.trim()) {
      setGithubUser(null)
      setStatusMessage('Paste a GitHub PAT above before verifying it.')
      return
    }

    setIsVerifyingPat(true)

    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${githubPat}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      })

      if (!response.ok) {
        throw new Error(`GitHub rejected this PAT with status ${response.status}.`)
      }

      const payload = await response.json()
      const login = payload.login || 'GitHub user'
      const name = payload.name || login
      const publicRepos = typeof payload.public_repos === 'number' ? payload.public_repos : 'unknown'

      setGithubUser(payload)
      setStatusMessage(`PAT verified. GitHub account: ${name} (${login}). ID: ${payload.id}. Public repos: ${publicRepos}.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PAT verification failed.'
      setGithubUser(null)
      setStatusMessage(`PAT verification failed: ${message}`)
    } finally {
      setIsVerifyingPat(false)
    }
  }

  const syncToHuggingFace = async () => {
    const csvUrl = '/students.csv'

    setIsSyncing(true)

    try {
      const response = await fetch(csvUrl)

      if (!response.ok) {
        throw new Error('The Hugging Face roster could not be reached.')
      }

      const text = await response.text()
      const parsed = parseStudentsCsv(text)

      setStudents(parsed)
      setStatusMessage('Roster refreshed from the public Hugging Face CSV file.')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Roster refresh failed.')
    } finally {
      setIsSyncing(false)
    }
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'attendance', label: 'Take Attendance' },
    { id: 'overview', label: 'Attendance View' },
    { id: 'students', label: 'All Students' },
    { id: 'accounts', label: 'Accounts' },
  ] as const

  const renderPage = () => {
    if (currentPage === 'attendance') {
      return (
        <main className="mt-6 space-y-6 rounded-[24px] border border-slate-800 bg-slate-900/80 p-5 shadow-glow">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Attendance</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Take attendance</h2>
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300">
              <CalendarDays className="h-4 w-4 text-sky-300" />
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="bg-transparent text-slate-100 outline-none"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {(['all', ...classNames] as const).map((className) => (
              <button
                key={className}
                type="button"
                onClick={() => setClassFilter(className)}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  classFilter === className
                    ? 'border-sky-500 bg-sky-500/10 text-sky-200'
                    : 'border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500'
                }`}
              >
                {className === 'all' ? 'All classes' : className}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {(['all', 'present', 'late', 'absent', 'excused'] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setStatusFilter(filter)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize transition ${
                  statusFilter === filter
                    ? 'bg-sky-500 text-slate-950'
                    : 'border border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500'
                }`}
              >
                {filter === 'all' ? 'All' : filter}
              </button>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredStudents.map((student) => {
              const currentStatus = attendance[student.id] ?? 'absent'

              return (
                <div key={student.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{student.name}</p>
                      <p className="text-sm text-slate-400">{student.batch}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-medium capitalize ${statusStyles[currentStatus].badge}`}>
                      {statusStyles[currentStatus].label}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {statusOrder.map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => updateAttendance(student.id, status)}
                        className={`rounded-xl px-2 py-2 text-xs font-medium capitalize transition ${
                          currentStatus === status
                            ? statusStyles[status].badge
                            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {statusStyles[status].label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </main>
      )
    }

    if (currentPage === 'overview') {
      return (
        <main className="mt-6 rounded-[24px] border border-slate-800 bg-slate-900/80 p-5 shadow-glow">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Overview</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Attendance summary</h2>
            </div>
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-3 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-400"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {[
              { label: 'Students', value: `${students.length}`, icon: Users },
              { label: 'Present', value: `${presentCount}`, icon: CheckCircle2 },
              { label: 'Late', value: `${lateCount}`, icon: Clock3 },
              { label: 'Rate', value: `${attendanceRate}%`, icon: BarChart3 },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-400">{label}</p>
                  <Icon className="h-4 w-4 text-sky-300" />
                </div>
                <p className="mt-4 text-3xl font-bold text-white">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {classSummary.map(({ className, count }) => (
              <div key={className} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{className}</p>
                <p className="mt-2 text-2xl font-bold text-white">{count}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-3">
            {issueSummary.map((issue) => (
              <div key={issue.title} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-white">{issue.title}</p>
                  <span className="rounded-full bg-sky-500/10 px-2 py-1 text-xs text-sky-200">{issue.count}</span>
                </div>
                <p className="mt-2 text-xs text-slate-400">{issue.detail}</p>
              </div>
            ))}
          </div>
        </main>
      )
    }

    if (currentPage === 'students') {
      return (
        <main className="mt-6 rounded-[24px] border border-slate-800 bg-slate-900/80 p-5 shadow-glow">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Roster</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">All students</h2>
            </div>
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search students, batch, or email"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-500"
              />
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {students
              .filter((student) => {
                const haystack = `${student.name} ${student.email} ${student.batch}`.toLowerCase()
                return haystack.includes(query.toLowerCase())
              })
              .map((student) => (
                <div key={student.id} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{student.name}</p>
                      <p className="text-xs text-slate-400">{student.id}</p>
                    </div>
                    <span className="rounded-full bg-sky-500/10 px-2 py-1 text-[10px] font-medium text-sky-200">
                      {student.batch}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-slate-300">{student.email}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.16em] text-slate-400">
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
        <main className="mt-6 rounded-[24px] border border-slate-800 bg-slate-900/80 p-5 shadow-glow">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Accounts</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">GitHub access</h2>
            </div>
            <GitBranch className="h-5 w-5 text-sky-300" />
          </div>

          <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
            <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-slate-400">Personal access token</label>
            <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2">
              <input
                type={showPat ? 'text' : 'password'}
                value={githubPat}
                onChange={(event) => updateGithubPat(event.target.value)}
                placeholder="ghp_xxxxxxxxxxxxx"
                className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => setShowPat((current) => !current)}
                className="text-slate-300 transition hover:text-sky-200"
                aria-label={showPat ? 'Hide PAT' : 'Show PAT'}
              >
                {showPat ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Stored locally in this browser only. This is a static-only fallback and no backend is used.
            </p>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-white">Status</p>
              <XCircle className="h-4 w-4 text-sky-300" />
            </div>
            <p className="mt-2 text-slate-300">{statusMessage}</p>
          </div>

          {githubUser && (
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Verified account</p>
              <div className="mt-3 space-y-2">
                <p className="text-base font-medium text-white">{githubUser.name || githubUser.login}</p>
                <p>Login: {githubUser.login}</p>
                <p>GitHub ID: {githubUser.id}</p>
                <p>Public repos: {githubUser.public_repos ?? 'unknown'}</p>
                {githubUser.email && <p>Email: {githubUser.email}</p>}
                {githubUser.html_url && (
                  <a
                    href={githubUser.html_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block text-sky-300 underline underline-offset-4"
                  >
                    Open GitHub profile
                  </a>
                )}
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={verifyGithubPat}
              disabled={isVerifyingPat}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isVerifyingPat ? 'Verifying...' : 'Verify PAT'}
            </button>
            <button
              type="button"
              onClick={() => {
                setGithubPat('')
                setGithubUser(null)
                localStorage.removeItem(GITHUB_PAT_KEY)
                setStatusMessage('GitHub PAT was cleared from this browser.')
              }}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500"
            >
              Clear PAT
            </button>
          </div>
        </main>
      )
    }

    return (
      <main className="mt-6 space-y-6 rounded-[24px] border border-slate-800 bg-slate-900/80 p-5 shadow-glow">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Dashboard</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Attendance board</h2>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-3 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-400"
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
            <div key={label} className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-400">{label}</p>
                <Icon className="h-4 w-4 text-sky-300" />
              </div>
              <p className="mt-4 text-3xl font-bold text-white">{value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Issue parser</p>
            <div className="mt-4 space-y-3">
              {issueSummary.map((issue) => (
                <div key={issue.title} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-white">{issue.title}</p>
                    <span className="rounded-full bg-sky-500/10 px-2 py-1 text-xs text-sky-200">{issue.count}</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">{issue.detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Status</p>
              <ShieldCheck className="h-5 w-5 text-sky-300" />
            </div>
            <p className="mt-4 text-base text-slate-200">{statusMessage}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage('attendance')}
                className="rounded-xl bg-sky-500 px-3 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-400"
              >
                Start attendance
              </button>
              <button
                type="button"
                onClick={syncToHuggingFace}
                disabled={isSyncing}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
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
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
        <header className="rounded-[28px] border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-6 shadow-glow">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-sky-200">
                <Sparkles className="h-3.5 w-3.5" />
                Attendly
              </div>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Attendance, simplified for modern cohorts.
              </h1>
            </div>

            <div className="flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs text-slate-300">
              <KeyRound className="h-4 w-4 text-sky-300" />
              <span>{githubPat ? 'PAT stored locally' : 'No PAT saved yet'}</span>
            </div>
          </div>

          <nav className="mt-6 flex flex-wrap gap-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCurrentPage(item.id)}
                className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                  currentPage === item.id
                    ? 'bg-sky-500 text-slate-950'
                    : 'border border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </header>

        {renderPage()}
      </div>
    </div>
  )
}

export default App
