import { CalendarDays, CheckCircle2, Clock3, UploadCloud, XCircle } from 'lucide-react'
import { ClassPicker } from '../components/ClassPicker'
import { EmptyState, Field, GhostButton, PageHeading, Panel, PrimaryButton, StatCard } from '../components/ui'
import type { DatasetController } from '../hooks/useDataset'
import { buildAttendanceFileName, attendancePath } from '../lib/datasetLayout'

export function TakeAttendance({ app }: { app: DatasetController }) {
  const {
    classNames,
    activeClassName,
    roster,
    draft,
    sessionDate,
    slotStart,
    slotEnd,
    slotRange,
    slotIsValid,
    sessionNote,
    isSubmitting,
    toggleDraft,
    markAll,
    selectClass,
    setSessionDate,
    setSlotStart,
    setSlotEnd,
    setSessionNote,
    submitAttendance,
  } = app

  const fileName = buildAttendanceFileName(sessionDate, slotStart)
  const presentCount = roster.filter((student) => draft[student.rollNumber] === 'present').length

  return (
    <Panel>
      <PageHeading
        eyebrow="Attendance"
        title="Take Attendance"
        actions={
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 shadow-sm">
            <CalendarDays className="h-4 w-4 text-indigo-500" />
            <input
              type="date"
              value={sessionDate}
              onChange={(event) => setSessionDate(event.target.value)}
              className="bg-transparent text-slate-700 outline-none"
            />
          </div>
        }
      />

      {classNames.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No classes pulled from Hugging Face yet"
            message="Rosters live in the dataset at data/students/class/<class>/students.csv. Add a Hugging Face token and the dataset loads on its own, or use Reset dataset on Accounts to seed the sample classes."
          />
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <ClassPicker classNames={classNames} value={activeClassName} onChange={selectClass} label="Class folder" />

            <Field
              label="Slot"
              invalid={!slotIsValid}
              hint={slotIsValid ? 'Start and end are saved with the session' : 'End time must be after the start time'}
            >
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4 shrink-0 text-indigo-500" />
                <input
                  type="time"
                  value={slotStart}
                  onChange={(event) => setSlotStart(event.target.value)}
                  aria-label="Slot start time"
                  className="min-w-0 flex-1 bg-transparent text-base font-medium text-slate-700 outline-none"
                />
                <span className="shrink-0 text-xs uppercase tracking-[0.14em] text-slate-400">to</span>
                <input
                  type="time"
                  value={slotEnd}
                  onChange={(event) => setSlotEnd(event.target.value)}
                  aria-label="Slot end time"
                  className="min-w-0 flex-1 bg-transparent text-base font-medium text-slate-700 outline-none"
                />
              </div>
            </Field>

            <Field label="Note (optional)">
              <input
                value={sessionNote}
                onChange={(event) => setSessionNote(event.target.value)}
                placeholder="Lecture topic"
                className="w-full bg-transparent text-base font-medium text-slate-700 outline-none placeholder:text-slate-400"
              />
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 shadow-sm">
            <span className="font-mono text-[11px] text-slate-500">
              {attendancePath(activeClassName, sessionDate.slice(0, 7), fileName)}
              {slotRange ? ` · slot "${slotRange}"` : ''}
            </span>
            <div className="flex gap-2">
              <GhostButton onClick={() => markAll('present')}>Mark all present</GhostButton>
              <GhostButton onClick={() => markAll('absent')}>Mark all absent</GhostButton>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <StatCard label="Students in roster" value={String(roster.length)} hint={`Class ${activeClassName}`} />
            <StatCard label="Present right now" value={String(presentCount)} hint={`${roster.length - presentCount} absent`} />
          </div>

          {roster.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title={`No roster for ${activeClassName}`}
                message="The dataset has an attendance folder for this class but no students.csv. Add data/students/class/mock1/students.csv style file, then reload the dataset."
              />
            </div>
          ) : (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {roster.map((student) => {
                const isPresent = draft[student.rollNumber] === 'present'

                return (
                  <div key={student.rollNumber} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">{student.name}</p>
                        <p className="text-xs text-slate-500">{student.course}</p>
                        <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                          Roll {student.rollNumber}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-medium ${
                          isPresent
                            ? 'bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/30'
                            : 'bg-rose-500/10 text-rose-700 ring-1 ring-rose-500/30'
                        }`}
                      >
                        {isPresent ? 'Present' : 'Absent'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleDraft(student.rollNumber)}
                      className={`mt-4 w-full rounded-xl px-3 py-3 text-sm font-semibold text-white transition ${
                        isPresent ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-rose-500 hover:bg-rose-600'
                      }`}
                    >
                      {isPresent ? 'Mark absent' : 'Mark present'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          <div className="mt-6 flex justify-end">
            <PrimaryButton
              onClick={submitAttendance}
              disabled={isSubmitting || roster.length === 0 || !slotIsValid}
            >
              <UploadCloud className="h-4 w-4" />
              {isSubmitting ? 'Uploading...' : 'Submit attendance'}
            </PrimaryButton>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Each file equals one class held, so the report counts files.
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <XCircle className="h-4 w-4 text-rose-500" />
              Re-submitting the same date and slot start replaces that session.
            </div>
          </div>
        </>
      )}
    </Panel>
  )
}
