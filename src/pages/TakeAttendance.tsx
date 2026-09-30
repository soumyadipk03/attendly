import { CalendarDays, CheckCircle2, Clock3, UploadCloud, XCircle } from 'lucide-react'
import { ClassPicker } from '../components/ClassPicker'
import { EmptyState, Field, GhostButton, PageHeading, Panel, PrimaryButton, StatCard } from '../components/ui'
import type { DatasetController } from '../hooks/useDataset'
import { attendancePath, formatDateForInput, sanitizeDateDigits } from '../lib/datasetLayout'

/** Says what is wrong with the typed date rather than just refusing it. */
function dateHintFor(digits: string): string {
  if (digits.length < 8) {
    return `Type the full date — ${8 - digits.length} more digit${digits.length === 7 ? '' : 's'}`
  }
  const day = Number(digits.slice(0, 2))
  const month = Number(digits.slice(2, 4))
  if (month < 1 || month > 12) {
    return 'That month does not exist — month must be 01 to 12'
  }
  if (day < 1) {
    return 'Day must start at 01'
  }
  return `There is no ${digits.slice(0, 2)}/${digits.slice(2, 4)} in ${digits.slice(4, 8)}`
}

export function TakeAttendance({ app }: { app: DatasetController }) {
  const {
    classNames,
    activeClassName,
    roster,
    draft,
    sessionDate,
    sessionDateDigits,
    sessionDateIsValid,
    slotStart,
    slotEnd,
    slotRange,
    slotIsValid,
    sessionNote,
    isSubmitting,
    toggleDraft,
    markAll,
    selectClass,
    setSessionDateDigits,
    setSlotStart,
    setSlotEnd,
    setSessionNote,
    submitAttendance,
  } = app

  const presentCount = roster.filter((student) => draft[student.rollNumber] === 'present').length
  // Only nag once something has been typed, so the form is not born red.
  const dateTouched = sessionDateDigits.length > 0
  const dateInvalid = !sessionDateIsValid
  const dateHint = !dateTouched
    ? 'Required — day, month, year with no guessing'
    : sessionDateIsValid
      ? `Saved as ${sessionDate}`
      : dateHintFor(sessionDateDigits)

  return (
    <Panel>
      <PageHeading
        eyebrow="Attendance"
        title="Take Attendance"
        actions={
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 shadow-sm">
            <CalendarDays className="h-4 w-4 text-indigo-500" />
            <span className="text-xs uppercase tracking-[0.14em] text-slate-400">Nothing is recorded until you submit</span>
          </div>
        }
      />

      {classNames.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No classes pulled from Hugging Face yet"
            message="Rosters live in the dataset at data/students/<class>/students.csv. Add a Hugging Face token and the dataset loads on its own, or use Reset dataset on Accounts to seed the sample classes."
          />
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <ClassPicker classNames={classNames} value={activeClassName} onChange={selectClass} label="Class folder" />

            <Field label="Date (required)" invalid={dateTouched && dateInvalid} hint={dateHint}>
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 shrink-0 text-indigo-500" />
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  value={formatDateForInput(sessionDateDigits)}
                  onChange={(event) => setSessionDateDigits(sanitizeDateDigits(event.target.value))}
                  placeholder="dd/mm/yyyy"
                  aria-label="Session date, day month year"
                  aria-invalid={dateTouched && dateInvalid}
                  className="min-w-0 flex-1 bg-transparent text-base font-medium text-slate-700 outline-none placeholder:text-slate-300"
                />
              </div>
            </Field>

            <Field
              label="Slot (required)"
              invalid={!slotIsValid && (slotStart.length > 0 || slotEnd.length > 0)}
              hint={
                slotIsValid
                  ? 'Start and end are saved with the session'
                  : slotStart.length > 0 || slotEnd.length > 0
                    ? 'End time must be after the start time'
                    : 'Required — start time at least'
              }
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
          </div>

          <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-3">
            <Field label="Note (optional)" hint="Not saved with the session, it is only for your own reference while marking">
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
              {sessionDateIsValid ? attendancePath(activeClassName, sessionDate.slice(0, 7)) : 'set a date to see the target file'}
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
                message="The dataset has an attendance folder for this class but no students.csv. Add data/students/mock1/students.csv style file, then reload the dataset."
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
              disabled={isSubmitting || roster.length === 0 || !slotIsValid || !sessionDateIsValid}
            >
              <UploadCloud className="h-4 w-4" />
              {isSubmitting ? 'Uploading...' : 'Submit attendance'}
            </PrimaryButton>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-2 text-xs text-slate-500">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <span>
                One <span className="font-mono">{'<month>.csv'}</span> per class. Submitting a date and slot for the
                first time adds a session; a row per student is saved.
              </span>
            </div>
            <div className="flex items-start gap-2 text-xs text-slate-500">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
              <span>
                Submitting the same date and slot again merges into that session: anyone newly marked present is added,
                and anyone already present stays present. It will not remove a present.
              </span>
            </div>
          </div>
        </>
      )}
    </Panel>
  )
}
