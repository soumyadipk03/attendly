import { useMemo, useRef, useState } from 'react'
import { GraduationCap, Search, Upload, Eye, X, UserRound } from 'lucide-react'
import { ClassPicker } from '../components/ClassPicker'
import { EmptyState, Field, GhostButton, PageHeading, Panel, PrimaryButton, StatCard } from '../components/ui'
import type { DatasetController } from '../hooks/useDataset'
import { heldInScope } from '../lib/attendance'
import { formatMonth } from '../lib/report'
import type { MonthRecord, MonthRow, RangeMode, Student } from '../lib/types'

interface StudentDetail {
  student: Student
  sessions: MonthRow[]
  totalHeld: number
  totalAttended: number
  scopeLabel: string
}

const RANGE_OPTIONS: Array<{ id: RangeMode; label: string }> = [
  { id: 'total', label: 'Total' },
  { id: 'monthly', label: 'Monthly' },
]

function percentageOf(held: number, attended: number): number {
  return held > 0 ? Math.round((attended / held) * 100) : 0
}

export function Students({ app }: { app: DatasetController }) {
  const {
    classNames,
    activeClassName,
    selectClass,
    roster,
    report,
    rangeMode,
    setRangeMode,
    rangeMonth,
    setRangeMonth,
    uploadRoster,
    isUploadingRoster,
    canWrite,
    snapshot,
  } = app

  const [query, setQuery] = useState('')
  const [rollQuery, setRollQuery] = useState('')
  const [newClassName, setNewClassName] = useState('')
  const [rosterFile, setRosterFile] = useState<File | null>(null)
  const [detailRoll, setDetailRoll] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const chooseFile = (file: File | null) => {
    setRosterFile(file)
    if (file && !newClassName.trim()) {
      setNewClassName(file.name.replace(/\.csv$/i, '').trim())
    }
  }

  const createClass = () => {
    if (!rosterFile || !newClassName.trim()) {
      return
    }
    void uploadRoster(newClassName, rosterFile)
    setRosterFile(null)
    setNewClassName('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Changing class invalidates the search and any open detail, so results never
  // describe a class the viewer is no longer looking at.
  const changeClass = (next: string) => {
    setQuery('')
    setRollQuery('')
    setDetailRoll(null)
    selectClass(next)
  }

  const courseCount = useMemo(() => new Set(roster.map((student) => student.course)).size, [roster])

  // Both search boxes narrow the same roster, so one filter decides what is
  // listed and what the footer counts.
  const visible = useMemo(() => {
    const text = query.trim().toLowerCase()
    const roll = rollQuery.trim().toLowerCase()
    return roster.filter((student) => {
      if (roll && !student.rollNumber.toLowerCase().includes(roll)) {
        return false
      }
      if (text && ![student.name, student.rollNumber, student.course].some((value) => value.toLowerCase().includes(text))) {
        return false
      }
      return true
    })
  }, [query, rollQuery, roster])

  // Held classes and attendance are derived from the stored rows on every read,
  // so a corrected row corrects the figures immediately. The selected range
  // scopes both sides: classes held only counts sessions inside that range, or a
  // monthly view would divide a month of attendance by the whole term.
  const scope = rangeMode === 'monthly' && rangeMonth ? rangeMonth : null
  const scopeLabel = scope ? formatMonth(scope) : 'All time'

  // Only the selected roll number is held in state; the figures are derived
  // during render, so changing the class or range updates an open panel instead
  // of leaving stale numbers on screen.
  const detail = useMemo<StudentDetail | null>(() => {
    const student = roster.find((entry) => entry.rollNumber === detailRoll)
    if (!student) {
      return null
    }
    const months: MonthRecord[] = snapshot[activeClassName]?.months ?? []
    const sessions = months
      .flatMap((record) => record.rows)
      .filter((row) => row.rollNumber === student.rollNumber && (scope === null || row.date.slice(0, 7) === scope))
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date) || a.slot.localeCompare(b.slot))
    return {
      student,
      sessions,
      totalHeld: heldInScope(months, scope),
      totalAttended: sessions.filter((row) => row.status === 'present').length,
      scopeLabel,
    }
  }, [activeClassName, detailRoll, roster, scope, scopeLabel, snapshot])

  return (
    <Panel>
      <PageHeading
        eyebrow="Roster"
        title={canWrite ? 'All students' : 'Attendance lookup'}
        actions={
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, roll number, or course"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>
        }
      />

      {!canWrite ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <Eye className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Read-only access. Pick a class, search by roll number, then open a student to see which classes were held
            and which were attended.
          </span>
        </div>
      ) : null}

      {/* Class comes first: a roll number only means something inside a class. */}
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <ClassPicker
          classNames={classNames}
          value={activeClassName}
          onChange={changeClass}
          label="Class"
          hint="Pick a class before searching a roll number"
        />
        <StatCard label="Students" value={String(roster.length)} hint={`in ${activeClassName || 'no class'}`} />
        <StatCard label="Courses" value={String(courseCount)} hint="courses in this class" />
      </div>

      {/* Range decides which sessions count towards the figures below. */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setRangeMode(option.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                rangeMode === option.id ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {rangeMode === 'monthly' ? (
          <select
            value={rangeMonth}
            onChange={(event) => setRangeMonth(event.target.value)}
            aria-label="Select month"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
          >
            {(report.monthNames.length > 0 ? report.monthNames : [rangeMonth].filter(Boolean)).map((month) => (
              <option key={month} value={month}>
                {formatMonth(month)}
              </option>
            ))}
          </select>
        ) : null}
        <span className="text-xs text-slate-500">Showing {scopeLabel.toLowerCase()}</span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <UserRound className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={rollQuery}
            onChange={(event) => setRollQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && visible.length === 1) {
                setDetailRoll(visible[0].rollNumber)
              }
            }}
            placeholder="Search by roll number..."
            aria-label="Search by roll number"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
        </div>
        {rollQuery || query ? (
          <GhostButton
            onClick={() => {
              setRollQuery('')
              setQuery('')
            }}
          >
            <X className="h-4 w-4" />
            Clear
          </GhostButton>
        ) : null}
        {rollQuery.trim() && visible.length === 1 ? (
          <PrimaryButton onClick={() => setDetailRoll(visible[0].rollNumber)}>
            <Eye className="h-4 w-4" />
            View attendance
          </PrimaryButton>
        ) : null}
      </div>

      {canWrite ? (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Create a class</p>
          <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,14rem)_1fr_auto] md:items-start">
            <Field label="Class name" hint="Becomes the folder name">
              <input
                value={newClassName}
                onChange={(event) => setNewClassName(event.target.value)}
                placeholder="mock1"
                list="known-classes"
                className="w-full bg-transparent text-base font-medium text-slate-700 outline-none placeholder:text-slate-300"
              />
            </Field>
            <Field label="Roster CSV" hint="Columns: name, roll_number, course. Uploaded as students.csv.">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
                className="w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
              />
            </Field>
            <div className="md:pt-7">
              <PrimaryButton onClick={createClass} disabled={!rosterFile || !newClassName.trim() || isUploadingRoster}>
                <Upload className="h-4 w-4" />
                {isUploadingRoster ? 'Uploading...' : 'Create class'}
              </PrimaryButton>
            </div>
          </div>
        </div>
      ) : null}

      <p className="mt-3 font-mono text-xs text-slate-500">
        data/students/{activeClassName}/students.csv
      </p>

      {roster.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No rosters loaded"
            message="Rosters come from the Hugging Face dataset only. Pick a class above, or use Reset dataset on Accounts to seed the sample classes."
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No match"
            message={`Nothing in ${activeClassName || 'this class'} matches that search. Clear it to see the full roster.`}
          />
        </div>
      ) : (
        <>
          <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-100/80 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Roll no</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Course</th>
                  <th className="px-4 py-3 text-right font-medium">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {visible.map((student, index) => {
                  const previous = visible[index - 1]
                  const isNewCourse = !previous || previous.course !== student.course
                  return (
                    <tr
                      key={student.rollNumber}
                      className="cursor-pointer bg-white/60 transition hover:bg-slate-50"
                      onClick={() => setDetailRoll(student.rollNumber)}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{student.rollNumber}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{student.name}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
                            isNewCourse
                              ? 'bg-indigo-100 text-indigo-700 ring-indigo-500/30'
                              : 'bg-slate-100 text-slate-600 ring-slate-300/40'
                          }`}
                        >
                          {isNewCourse ? <GraduationCap className="h-3 w-3" /> : null}
                          {student.course}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600">
                          <Eye className="h-4 w-4" />
                          View
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Ordered by course first, then roll number. Click a row to see that student's attendance history for{' '}
            {scopeLabel.toLowerCase()}. Showing{' '}
            {visible.length} of {roster.length} students in {activeClassName}.
          </p>
        </>
      )}

      <datalist id="known-classes">
        {classNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {detail ? <StudentDetailPanel detail={detail} onClose={() => setDetailRoll(null)} /> : null}
    </Panel>
  )
}

function StudentDetailPanel({ detail, onClose }: { detail: StudentDetail; onClose: () => void }) {
  const { student, sessions, totalHeld, totalAttended, scopeLabel } = detail
  const percentage = percentageOf(totalHeld, totalAttended)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${student.name} attendance`}
    >
      <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_25px_80px_rgba(15,23,42,0.35)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Attendance history</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-900">{student.name}</h3>
            <p className="mt-1 font-mono text-xs text-slate-500">
              {student.rollNumber} · {student.course}
            </p>          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close attendance history"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:text-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <StatCard label="Classes held" value={String(totalHeld)} hint={`sessions in ${scopeLabel.toLowerCase()}`} />
          <StatCard label="Classes attended" value={String(totalAttended)} hint="marked present" />
          <StatCard
            label="Attendance"
            value={`${percentage}%`}
            hint={`${totalAttended} of ${totalHeld} classes attended`}
          />
        </div>

        <p className="mt-5 text-[10px] uppercase tracking-[0.18em] text-slate-500">
          Sessions · {scopeLabel}
        </p>
        {sessions.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            No attendance has been recorded for this student in {scopeLabel.toLowerCase()}.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {sessions.map((row, index) => (
              <li
                key={`${row.date}-${row.slot}-${index}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3"
              >
                <div>
                  <p className="font-mono text-sm text-slate-700">
                    {row.date} · {row.slot}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">Class was held on this date</p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                    row.status === 'present'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {row.status === 'present' ? 'Present' : 'Absent'}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex justify-end">
          <PrimaryButton onClick={onClose}>Close</PrimaryButton>
        </div>
      </div>
    </div>
  )
}
