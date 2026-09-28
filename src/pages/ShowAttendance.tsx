import { useMemo } from 'react'
import { CalendarRange, Download, Layers, TrendingUp, Users } from 'lucide-react'
import { ClassPicker } from '../components/ClassPicker'
import { EmptyState, GhostButton, PageHeading, Panel, StatCard } from '../components/ui'
import type { DatasetController } from '../hooks/useDataset'
import { toCsv } from '../lib/csv'
import { sessionNoteOf, sessionSlotOf } from '../lib/records'
import { formatMonth, percentageTone } from '../lib/report'
import type { RangeMode } from '../lib/types'

const RANGE_OPTIONS: Array<{ id: RangeMode; label: string }> = [
  { id: 'total', label: 'Total' },
  { id: 'monthly', label: 'Monthly' },
]

export function ShowAttendance({ app }: { app: DatasetController }) {
  const {
    classNames,
    activeClassName,
    selectClass,
    report,
    rangeMode,
    setRangeMode,
    rangeMonth,
    setRangeMonth,
  } = app

  const sessionsByMonth = useMemo(() => {
    const groups = new Map<string, typeof report.sessions>()
    for (const session of report.sessions) {
      const bucket = groups.get(session.month) ?? []
      bucket.push(session)
      groups.set(session.month, bucket)
    }
    return [...groups.entries()]
  }, [report.sessions])

  const rangeLabel = rangeMode === 'monthly' && rangeMonth ? formatMonth(rangeMonth) : 'All time'

  const exportReport = () => {
    const csv = toCsv(
      ['roll_number', 'name', 'course', 'classes_attended', 'classes_held', 'attendance_percentage', 'range'],
      report.stats.map((stat) => [
        stat.student.rollNumber,
        stat.student.name,
        stat.student.course,
        stat.attended,
        stat.held,
        `${stat.percentage}%`,
        rangeLabel,
      ]),
    )
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${activeClassName || 'class'}-${rangeMode === 'monthly' ? rangeMonth || 'month' : 'total'}-attendance.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Panel>
      <PageHeading
        eyebrow="Report"
        title="Show Attendance"
        actions={
          <GhostButton onClick={exportReport} disabled={report.stats.length === 0}>
            <Download className="h-4 w-4" />
            Export CSV
          </GhostButton>
        }
      />

      {classNames.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Nothing to report yet"
            message="Every class, roster and attendance file is pulled from the Hugging Face dataset as soon as the app opens. If nothing is here, add your token on Accounts, or use Reset dataset there to seed mock1 and mock2."
          />
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <ClassPicker
              classNames={classNames}
              value={activeClassName}
              onChange={selectClass}
              hint={`${app.roster.length} students in data/students/class/${activeClassName}/students.csv`}
            />

            <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 shadow-sm">
              <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Range</span>
              <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
                {RANGE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setRangeMode(option.id)}
                    className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      rangeMode === option.id
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'text-slate-600 hover:text-indigo-700'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {rangeMode === 'monthly' ? (
              <label className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 shadow-sm">
                <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Month</span>
                <div className="flex items-center gap-2">
                  <CalendarRange className="h-4 w-4 shrink-0 text-indigo-500" />
                  <select
                    value={rangeMonth}
                    onChange={(event) => setRangeMonth(event.target.value)}
                    disabled={report.months.length === 0}
                    className="w-full bg-transparent text-base font-medium text-slate-700 outline-none disabled:opacity-50"
                  >
                    {report.months.length === 0 ? <option value="">No months found</option> : null}
                    {report.months.map((month) => (
                      <option key={month} value={month}>
                        {formatMonth(month)}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
            ) : (
              <div className="flex flex-col justify-center gap-1 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 shadow-sm">
                <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Covering</span>
                <p className="text-base font-medium text-slate-700">All sessions ({report.months.length} months)</p>
              </div>
            )}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Classes held" value={String(report.classesHeld)} hint={rangeLabel} />
            <StatCard label="Students" value={String(report.stats.length)} hint={activeClassName} />
            <StatCard label="Average attendance" value={`${report.averagePercentage}%`} hint={rangeLabel} />
            <StatCard
              label="Sessions available"
              value={String(app.activeClass?.sessions.length ?? 0)}
              hint="files in data/attendance/class"
            />
          </div>

          {report.stats.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                title={`No roster for ${activeClassName}`}
                message="This class folder has attendance files but no students.csv, so there is nobody to report on."
              />
            </div>
          ) : report.classesHeld === 0 ? (
            <div className="mt-5">
              <EmptyState
                title={`No classes held for ${rangeLabel}`}
                message="Pick another month, switch to Total, or push a new session from the Take Attendance tab."
              />
            </div>
          ) : (
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-slate-100/80 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Roll</th>
                    <th className="px-4 py-3 font-medium">Student</th>
                    <th className="hidden px-4 py-3 font-medium sm:table-cell">Course</th>
                    <th className="px-4 py-3 font-medium">Classes attended</th>
                    <th className="hidden px-4 py-3 font-medium md:table-cell">Attendance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {report.stats.map((stat) => (
                    <tr key={stat.student.rollNumber} className="bg-white/60">
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{stat.student.rollNumber}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{stat.student.name}</p>
                        <p className="text-xs text-slate-500 sm:hidden">{stat.student.course}</p>
                      </td>
                      <td className="hidden px-4 py-3 text-slate-600 sm:table-cell">{stat.student.course}</td>
                      <td className="px-4 py-3 text-slate-700">
                        <span className="font-semibold text-slate-900">{stat.attended}</span>
                        <span className="text-slate-500"> / {stat.held}</span>
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-200">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-sky-500"
                              style={{ width: `${stat.percentage}%` }}
                            />
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${percentageTone(stat.percentage)}`}
                          >
                            {stat.percentage}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex flex-wrap gap-4 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 md:hidden">
                {report.stats.map((stat) => (
                  <span key={stat.student.rollNumber} className="inline-flex items-center gap-1">
                    <TrendingUp className="h-3.5 w-3.5 text-indigo-500" />
                    {stat.student.name}: {stat.attended}/{stat.held} ({stat.percentage}%)
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                <Layers className="h-4 w-4 text-indigo-500" />
                Session order
              </p>
              <p className="flex items-center gap-2 text-xs text-slate-500">
                <Users className="h-3.5 w-3.5" />
                {report.sessions.length} file{report.sessions.length === 1 ? '' : 's'} in range
              </p>
            </div>

            {sessionsByMonth.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No attendance files matched this range.</p>
            ) : (
              <div className="mt-3 space-y-4">
                {sessionsByMonth.map(([month, sessions]) => (
                  <div key={month}>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{formatMonth(month)}</p>
                    <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {sessions.map((session) => (
                        <li
                          key={session.path}
                          className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                        >
                          <span className="font-mono text-slate-600">{session.fileName}</span>
                          <span className="text-slate-400">
                            {session.date}
                            {sessionSlotOf(session) ? ` · ${sessionSlotOf(session)}` : ''}
                            {sessionNoteOf(session) ? ` · ${sessionNoteOf(session)}` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Panel>
  )
}
