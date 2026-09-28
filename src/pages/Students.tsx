import { useMemo, useRef, useState } from 'react'
import { GraduationCap, Search, Upload } from 'lucide-react'
import { ClassPicker } from '../components/ClassPicker'
import { EmptyState, Field, PageHeading, Panel, PrimaryButton, StatCard } from '../components/ui'
import type { DatasetController } from '../hooks/useDataset'

export function Students({ app }: { app: DatasetController }) {
  const { classNames, activeClassName, selectClass, roster, uploadRoster, isUploadingRoster } = app
  const [query, setQuery] = useState('')
  const [newClassName, setNewClassName] = useState('')
  const [rosterFile, setRosterFile] = useState<File | null>(null)
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

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) {
      return roster
    }
    return roster.filter((student) =>
      [student.name, student.rollNumber, student.course].some((value) => value.toLowerCase().includes(needle)),
    )
  }, [query, roster])

  const courseCount = useMemo(() => new Set(roster.map((student) => student.course)).size, [roster])

  return (
    <Panel>
      <PageHeading
        eyebrow="Roster"
        title="All students"
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
          <Field
            label="Roster CSV"
            hint="Columns: name, roll_number, course. Uploaded as students.csv."
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
              className="w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
            />
          </Field>
          <div className="md:pt-7">
            <PrimaryButton
              onClick={createClass}
              disabled={!rosterFile || !newClassName.trim() || isUploadingRoster}
            >
              <Upload className="h-4 w-4" />
              {isUploadingRoster ? 'Uploading...' : 'Create class'}
            </PrimaryButton>
          </div>
        </div>
        <datalist id="known-classes">
          {classNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </div>

      {classNames.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No rosters loaded"
            message="Rosters are only read from the Hugging Face dataset, and the dataset loads on its own. Add a token if nothing is here, or use Reset dataset on Accounts to seed the sample classes."
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
            <StatCard label="Students" value={String(roster.length)} hint={`in ${activeClassName}`} />
            <StatCard label="Courses" value={String(courseCount)} hint="courses in this class" />
          </div>

          <p className="mt-3 font-mono text-xs text-slate-500">
            data/students/{activeClassName}/students.csv
          </p>

          {roster.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                title={`No students.csv for ${activeClassName}`}
                message="Add the file at data/students/<class>/students.csv with name, roll_number and course columns, then reload the dataset."
              />
            </div>
          ) : visible.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                title="No match"
                message={`Nothing in ${activeClassName} matches "${query}". Clear the search to see the full roster.`}
              />
            </div>
          ) : (
            <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-slate-100/80 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Roll no</th>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Course</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {visible.map((student, index) => {
                    const previous = visible[index - 1]
                    const isNewCourse = !previous || previous.course !== student.course

                    return (
                      <tr key={student.rollNumber} className="bg-white/60">
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
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-3 text-xs text-slate-500">
            Ordered by course first, then roll number. Showing {visible.length} of {roster.length} students in{' '}
            {activeClassName}.
          </p>
        </>
      )}
    </Panel>
  )
}
