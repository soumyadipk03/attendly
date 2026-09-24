import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  GitBranch,
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
type GitHubUser = {
  login: string
  avatar_url?: string
  html_url?: string
}
type IssueSummary = {
  title: string
  count: number
  detail: string
}

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

async function fetchGitHubUser(token: string): Promise<GitHubUser> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  })

  if (!response.ok) {
    throw new Error('Unable to fetch your GitHub profile.')
  }

  return response.json()
}

async function pollForGitHubToken(clientId: string, deviceCode: string, intervalSeconds: number) {
  const pollIntervalMs = (intervalSeconds || 5) * 1000

  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    })

    const data = await response.json()

    if (data.access_token) {
      return data
    }

    if (data.error === 'authorization_pending') {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
      continue
    }

    if (data.error === 'slow_down') {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs + 5000))
      continue
    }

    throw new Error(data.error_description || 'GitHub OAuth device flow failed.')
  }

  throw new Error('GitHub approval timed out. Please try again.')
}

function App() {
  const [students, setStudents] = useState<Student[]>(defaultStudents)
  const [attendance, setAttendance] = useState<AttendanceState>(() => defaultAttendance)
  const [query, setQuery] = useState('')
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [statusFilter, setStatusFilter] = useState<'all' | AttendanceStatus>('all')
  const [classFilter, setClassFilter] = useState<'all' | string>('all')
  const [githubUser, setGithubUser] = useState<GitHubUser | null>(null)
  const [statusMessage, setStatusMessage] = useState('Static-only mode is active. No backend required.')
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => {
    const persistedAttendance = localStorage.getItem('attendly-attendance')
    const persistedUser = localStorage.getItem('attendly-user')

    if (persistedAttendance) {
      setAttendance(JSON.parse(persistedAttendance))
    }

    if (persistedUser) {
      setGithubUser(JSON.parse(persistedUser))
      setStatusMessage('GitHub session restored locally.')
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('attendly-attendance', JSON.stringify(attendance))
  }, [attendance])

  useEffect(() => {
    if (githubUser) {
      localStorage.setItem('attendly-user', JSON.stringify(githubUser))
    }
  }, [githubUser])

  useEffect(() => {
    const csvUrl = import.meta.env.VITE_HF_CSV_URL ?? '/students.csv'

    fetch(csvUrl)
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
        setStatusMessage('Using the bundled sample roster because the HF CSV is not reachable yet.')
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

  const connectGitHub = async () => {
    const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID || 'Ov23liLcFMbThYi60P1E'

    setIsAuthenticating(true)

    try {
      const deviceResponse = await fetch('https://github.com/login/device/code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          scope: 'read:user',
        }),
      })

      if (!deviceResponse.ok) {
        throw new Error('GitHub device flow could not be started. Check your OAuth app settings.')
      }

      const device = await deviceResponse.json()

      if (!device.device_code) {
        throw new Error(device.error_description || 'Unable to start the GitHub device flow.')
      }

      window.open('https://github.com/login/device', '_blank', 'noopener,noreferrer')
      setStatusMessage(
        `Open GitHub and enter this code: ${device.user_code}. Device URL: https://github.com/login/device`,
      )

      const tokenData = await pollForGitHubToken(clientId, device.device_code, device.interval || 5)
      const user = await fetchGitHubUser(tokenData.access_token)

      setGithubUser(user)
      setStatusMessage(`Signed in as ${user.login}. Your browser session is authenticated.`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'GitHub sign-in failed.')
    } finally {
      setIsAuthenticating(false)
    }
  }

  const syncToHuggingFace = async () => {
    const csvUrl = import.meta.env.VITE_HF_CSV_URL

    if (!csvUrl) {
      setStatusMessage('Set VITE_HF_CSV_URL in .env.local to enable a remote roster sync.')
      return
    }

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

            <button
              type="button"
              onClick={connectGitHub}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-medium text-white transition hover:border-sky-500 hover:text-sky-200"
            >
              <GitBranch className="h-4 w-4" />
              {isAuthenticating ? 'Connecting...' : githubUser ? `Signed in as ${githubUser.login}` : 'Connect GitHub'}
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {[
              { label: 'Students', value: `${students.length}`, icon: Users },
              { label: 'Present', value: `${presentCount}`, icon: CheckCircle2 },
              { label: 'Late', value: `${lateCount}`, icon: Clock3 },
              { label: 'Rate', value: `${attendanceRate}%`, icon: BarChart3 },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-400">{label}</p>
                  <Icon className="h-4 w-4 text-sky-300" />
                </div>
                <p className="mt-4 text-3xl font-bold text-white">{value}</p>
              </div>
            ))}
          </div>
        </header>

        <main className="mt-6 grid gap-6 xl:grid-cols-[1.65fr_0.95fr]">
          <section className="rounded-[24px] border border-slate-800 bg-slate-900/80 p-5 shadow-glow">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Daily roster</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">Attendance board</h2>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300">
                  <CalendarDays className="h-4 w-4 text-sky-300" />
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    className="bg-transparent text-slate-100 outline-none"
                  />
                </label>
                <button
                  type="button"
                  onClick={exportCsv}
                  className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-3 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-400"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </button>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="relative w-full max-w-md">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search students, batch, or email"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-500"
                />
              </div>

              <div className="flex flex-wrap gap-2">
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

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {classSummary.map(({ className, count }) => (
                <div key={className} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-400">{className}</p>
                  <p className="mt-2 text-2xl font-bold text-white">{count}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-800">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead className="bg-slate-950/70 text-xs uppercase tracking-[0.15em] text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Student</th>
                      <th className="px-4 py-3 font-medium">Batch</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.map((student) => {
                      const currentStatus = attendance[student.id] ?? 'absent'

                      return (
                        <tr key={student.id} className="border-t border-slate-800 bg-slate-900/30">
                          <td className="px-4 py-4">
                            <div>
                              <p className="font-medium text-white">{student.name}</p>
                              <p className="text-sm text-slate-400">{student.email}</p>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-sm text-slate-300">{student.batch}</td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-2">
                              {statusOrder.map((status) => (
                                <button
                                  key={status}
                                  type="button"
                                  onClick={() => updateAttendance(student.id, status)}
                                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium capitalize transition ${
                                    currentStatus === status
                                      ? statusStyles[status].badge
                                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                  }`}
                                >
                                  {statusStyles[status].label}
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-[24px] border border-slate-800 bg-slate-900/80 p-5 shadow-glow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Signals</p>
                  <h3 className="mt-2 text-xl font-semibold text-white">Issue parser</h3>
                </div>
                <ShieldCheck className="h-5 w-5 text-sky-300" />
              </div>

              <div className="mt-5 space-y-3">
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
            </div>

            <div className="rounded-[24px] border border-slate-800 bg-slate-900/80 p-5 shadow-glow">
              <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Sync</p>
              <h3 className="mt-2 text-xl font-semibold text-white">Static integrations</h3>

              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 text-sm text-slate-300">
                <p className="font-medium text-white">Status</p>
                <p className="mt-2 text-slate-300">{statusMessage}</p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={syncToHuggingFace}
                  disabled={isSyncing}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSyncing ? 'Refreshing...' : 'Refresh roster'}
                </button>
                <button
                  type="button"
                  onClick={() => setStatusMessage('This static app keeps its data in the browser and exports CSV files locally.')}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-medium text-slate-100 transition hover:border-slate-500"
                >
                  No backend
                </button>
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-sky-950/40 p-5 shadow-glow">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-sky-500/10 p-2 text-sky-200">
                  <XCircle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-slate-400">Policy</p>
                  <p className="mt-1 font-medium text-white">Zero backend by design</p>
                </div>
              </div>

              <p className="mt-4 text-sm leading-6 text-slate-300">
                This site is intentionally static. The roster is retrieved as CSV, attendance is stored in browser storage, and GitHub OAuth flows through the browser’s device-code protocol without a server-side app.
              </p>
            </div>
          </aside>
        </main>
      </div>
    </div>
  )
}

export default App
