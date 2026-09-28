import { Download, Users } from 'lucide-react'
import { ClassPicker } from '../components/ClassPicker'
import { EmptyState, GhostButton, PageHeading, Panel, StatCard } from '../components/ui'
import type { DatasetController } from '../hooks/useDataset'
import { toCsv } from '../lib/csv'
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
        stat.percentage,
        rangeLabel,
      ]),
    )
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance-${activeClassName}-${rangeMode === 'monthly' ? rangeMonth : 'total'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Panel>
      <PageHeading eyebrow="Report" title="Attendance overview" actions={
          <div className="flex items-center gap-2">
            <GhostButton onClick={exportReport} disabled={report.stats.length === 0}>
              <Download className="h-4 w-4" />
              Export CSV
            </GhostButton>
            <div className="flex items-center gap-1 border border-slate-200 rounded-xl bg-slate-50 px-2 py-1">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setRangeMode(opt.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    rangeMode === opt.id
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        }
      />

      {classNames.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No classes loaded"
            message="Add a Hugging Face token and the dataset loads on its own, or use Reset dataset on Accounts to seed the sample classes."
          />
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <ClassPicker
              classNames={classNames}
              value={activeClassName}
              onChange={selectClass}
              label="Class"
              hint="Students are listed per class folder"
            />
            <StatCard label="Students" value={String(report.stats.length)} hint={`in ${activeClassName}`} />
            <StatCard label="Classes held" value={String(report.classesHeld)} hint={rangeLabel} />
          </div>

          {rangeMode === 'monthly' && (
            <div className="mt-3">
              <select
                value={rangeMonth}
                onChange={(e) => setRangeMonth(e.target.value)}
                className="w-full max-w-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
              >
                {report.monthNames.map((m) => (
                  <option key={m} value={m}>
                    {formatMonth(m)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <p className="mt-3 font-mono text-xs text-slate-500">
            data/attendance/{activeClassName}/{"<YYYY-MM>.csv"}
          </p>

          {report.stats.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                title={`No attendance for ${activeClassName}`}
                message="Submit a session on the Take Attendance tab, or create a class on the Students tab."
/>

      <p className="text-sm text-slate-600">
        {classNames.length === 0 ? 'No classes loaded' : `Showing ${rangeLabel} for ${activeClassName}`}
      </p>
            </div>
          ) : (
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-slate-100/80 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Roll no</th>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Course</th>
                    <th className="px-4 py-3 font-medium">Classes attended</th>
                    <th className="px-4 py-3 font-medium">Classes held</th>
                    <th className="px-4 py-3 font-medium">Attendance %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {report.stats.map((stat, index) => {
                    const previous = report.stats[index - 1]
                    const isNewCourse = !previous || previous.student.course !== stat.student.course

                    return (
                      <tr key={stat.student.rollNumber} className="bg-white/60">
                        <td className="px-4 py-3 font-mono text-xs text-slate-500">{stat.student.rollNumber}</td>
                        <td className="px-4 py-3 font-medium text-slate-900">{stat.student.name}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
                              isNewCourse
                                ? 'bg-indigo-100 text-indigo-700 ring-indigo-500/30'
                                : 'bg-slate-100 text-slate-600 ring-slate-300/40'
                            }`}
                          >
                            {isNewCourse ? <Users className="h-3 w-3" /> : null}
                            {stat.student.course}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-700">{stat.attended}</td>
                        <td className="px-4 py-3 font-mono text-slate-700">{stat.held}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${percentageTone(stat.percentage)}`}>
                            {stat.percentage}%
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-3 text-xs text-slate-500">
            Ordered by course first, then roll number. Showing {report.stats.length} of {report.stats.length} students in{' '}
            {activeClassName} ({rangeLabel}).
          </p>
        </>
      )}
    </Panel>
  )
}