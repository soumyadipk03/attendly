import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_REPO_NAME,
  createRepo,
  deleteRepo,
  destroyRepo,
  ensureRepo,
  loadDataset,
  readMonth,
  repoFor,
  resolveAccount,
  uploadFiles,
} from '../lib/hfDataset'
import type { HfRepo } from '../lib/hfDataset'
import {
  attendancePath,
  defaultSlotRange,
  formatSlotRange,
  isSlotRangeValid,
  isValidClassName,
  parseDateDigits,
  rosterPath,
  sanitizeDateDigits,
  sortByName,
} from '../lib/datasetLayout'
import { buildMockSeedFiles } from '../lib/mockSeed'
import { ROSTER_HEADER, mergeAttendanceRows, parseRosterCsv, toMonthCsv, withRecountedTotals } from '../lib/records'
import { buildReport, emptyReport, listMonths } from '../lib/report'
import type {
  AttendanceDraft,
  AttendanceStatus,
  AuthStatus,
  ClassReport,
  DatasetSnapshot,
  HfAccount,
  ModalState,
  MonthRow,
  RangeMode,
  Student,
} from '../lib/types'

const STORAGE_KEYS = {
  token: 'attendly-hf-token',
  repo: 'attendly-hf-repo',
  className: 'attendly-selected-class',
  rangeMode: 'attendly-range-mode',
  rangeMonth: 'attendly-range-month',
} as const

const CLOSE_WARNING =
  'Do not close this tab or refresh the page. An unfinished write can be fatal and leave the dataset half updated.'

function readStored(key: string): string {
  if (typeof window === 'undefined') {
    return ''
  }
  return window.localStorage.getItem(key) ?? ''
}

const EMPTY_SNAPSHOT: DatasetSnapshot = {}

export function useDataset() {
  // A stored token is treated as unproven until it is verified again, so the
  // app shell stays hidden behind the login gate on every reload.
  const [token, setTokenState] = useState(() => readStored(STORAGE_KEYS.token))
  const [repoName, setRepoNameState] = useState(() => readStored(STORAGE_KEYS.repo) || DEFAULT_REPO_NAME)
  const [account, setAccount] = useState<HfAccount | null>(null)
  // Auth is a state machine, not a boolean. 'signed-out' and 'checking' must
  // both keep the app shell hidden; the two success states decide the role.
  const [authStatus, setAuthStatus] = useState<AuthStatus>('signed-out')
  const [snapshot, setSnapshot] = useState<DatasetSnapshot>(EMPTY_SNAPSHOT)
  const [status, setStatus] = useState('Enter your Hugging Face API token to continue.')
  const [isVerifying, setIsVerifying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSeeding, setIsSeeding] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUploadingRoster, setIsUploadingRoster] = useState(false)
  const [modal, setModal] = useState<ModalState>(null)

  // Any Hugging Face write in flight. Used to warn before the tab is closed.
  const isWriting = isSeeding || isSubmitting || isUploadingRoster

  // Derived from the state machine so the gate and the role can never disagree.
  const isVerified = authStatus === 'teacher' || authStatus === 'student'
  const canWrite = authStatus === 'teacher'
  const isChecking = authStatus === 'checking'

  // Tracks which role already triggered a dataset load, so signing in loads
  // exactly once and the read-only probe can hand its result straight over.
  const loadedForRef = useRef<AuthStatus | null>(null)

  // Every write path checks this. Hiding a button is not authorization.
  const requireWriteAccess = useCallback((): boolean => {
    if (authStatus === 'teacher') {
      return true
    }
    setStatus('This account is read-only. Attendance cannot be modified.')
    return false
  }, [authStatus])

  useEffect(() => {
    if (!isWriting) {
      return
    }
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [isWriting])

  const [selectedClassName, setSelectedClassName] = useState(() => readStored(STORAGE_KEYS.className))
  const [rangeMode, setRangeModeState] = useState<RangeMode>(() =>
    readStored(STORAGE_KEYS.rangeMode) === 'monthly' ? 'monthly' : 'total',
  )
  const [rangeMonth, setRangeMonthState] = useState(() => readStored(STORAGE_KEYS.rangeMonth))

  // Date and slot both start empty: a session is logged deliberately, and a
  // pre-filled time would be a guess at when the class actually ran. The date is
  // typed as ddmmyyyy and is converted to the ISO yyyy-mm-dd the dataset stores,
  // so month folders and chronological sorting keep working unchanged.
  const [sessionDateDigits, setSessionDateDigits] = useState('')
  const sessionDate = useMemo(() => parseDateDigits(sessionDateDigits) ?? '', [sessionDateDigits])
  const sessionDateIsValid = sessionDate.length > 0
  const setSessionDate = useCallback((next: string) => setSessionDateDigits(sanitizeDateDigits(next)), [])
  const [slot, setSlot] = useState(defaultSlotRange)
  const slotStart = slot.start
  const slotEnd = slot.end
  const slotRange = formatSlotRange(slotStart, slotEnd)
  const slotIsValid = isSlotRangeValid(slotStart, slotEnd)
  const setSlotStart = useCallback((next: string) => setSlot((current) => ({ ...current, start: next })), [])
  const setSlotEnd = useCallback((next: string) => setSlot((current) => ({ ...current, end: next })), [])
  const [sessionNote, setSessionNote] = useState('')
  const [draft, setDraft] = useState<AttendanceDraft>({})

  const classNames = useMemo(() => sortByName(Object.keys(snapshot)), [snapshot])
  const activeClassName = classNames.includes(selectedClassName) ? selectedClassName : (classNames[0] ?? '')
  const activeClass = activeClassName ? snapshot[activeClassName] : undefined
  const roster: Student[] = useMemo(() => activeClass?.roster ?? [], [activeClass])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.className, activeClassName)
  }, [activeClassName])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.rangeMode, rangeMode)
  }, [rangeMode])

  const months = useMemo(() => (activeClass ? listMonths(activeClass) : []), [activeClass])
  const activeMonth = months.includes(rangeMonth) ? rangeMonth : (months[0] ?? '')

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.rangeMonth, activeMonth)
  }, [activeMonth])

  const report: ClassReport = useMemo(
    () => (activeClass ? buildReport(activeClass, rangeMode, activeMonth) : emptyReport(rangeMode, activeMonth)),
    [activeClass, activeMonth, rangeMode],
  )

  const activeDraft: AttendanceDraft = useMemo(
    () => Object.fromEntries(roster.map((student) => [student.rollNumber, draft[student.rollNumber] ?? 'absent'])),
    [draft, roster],
  )

  // Editing the token always invalidates the current session: a token that has
  // not been verified yet must not inherit the previous token's role.
  const setToken = useCallback((next: string) => {
    setTokenState(next)
    setAuthStatus('signed-out')
    setAccount(null)
    setSnapshot(EMPTY_SNAPSHOT)
    loadedForRef.current = null
    if (next.trim()) {
      window.localStorage.setItem(STORAGE_KEYS.token, next)
    } else {
      window.localStorage.removeItem(STORAGE_KEYS.token)
    }
  }, [])

  const setRepoName = useCallback((next: string) => {
    setRepoNameState(next)
    window.localStorage.setItem(STORAGE_KEYS.repo, next)
  }, [])

  const setRangeMode = useCallback((next: RangeMode) => setRangeModeState(next), [])
  const setRangeMonth = useCallback((next: string) => setRangeMonthState(next), [])

  const selectClass = useCallback((next: string) => {
    setSelectedClassName(next)
    setDraft({})
  }, [])

  const clearToken = useCallback(() => {
    setTokenState('')
    setAccount(null)
    setAuthStatus('signed-out')
    loadedForRef.current = null
    window.localStorage.removeItem(STORAGE_KEYS.token)
    setStatus('Hugging Face token cleared from this browser. Cached dataset data was dropped too.')
    setSnapshot(EMPTY_SNAPSHOT)
  }, [])

  const requireAccount = useCallback(async (): Promise<HfAccount> => {
    if (!token.trim()) {
      throw new Error('Add a Hugging Face API token first.')
    }
    if (account) {
      return account
    }
    const resolved = await resolveAccount(token)
    setAccount(resolved)
    return resolved
  }, [account, token])

  // Always reports back through a dialog. A load that finishes silently is
  // indistinguishable from one that never ran, so success and failure both
  // confirm, and the progress dialog is reused rather than stacked.
  const pullDataset = useCallback(async (): Promise<DatasetSnapshot | null> => {
    setIsLoading(true)
    try {
      const resolved = await requireAccount()
      const repo = repoFor(resolved.name, repoName)
      const loaded = await loadDataset(repo, token, (percent, message) => {
        setModal({ type: 'progress', title: 'Loading dataset', message, progress: percent })
      })
      setSnapshot(loaded)
      setModal({
        type: 'success',
        title: 'Dataset loaded',
        message: `Pulled ${Object.keys(loaded).length} class folder${Object.keys(loaded).length === 1 ? '' : 's'} from ${repo.name}.`,
        confirmText: 'Continue',
      })
      setStatus(`Dataset loaded from ${repo.name}.`)
      return loaded
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setModal({ type: 'success', title: 'Load failed', message, confirmText: 'Dismiss' })
      setStatus(message)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [repoName, requireAccount, token])

  // Proves write access without touching the main dataset: a throwaway repo is
  // created and then deleted, so the dataset history stays clean. The repo is
  // removed in `finally` so a failed delete cannot silently leak it.
  const probeWriteAccess = useCallback(async (username: string, candidate: string): Promise<boolean> => {
    const probeRepo: HfRepo = { type: 'dataset', name: `${username}/attendly-access-probe-${Date.now()}` }
    let created = false
    try {
      await createRepo({ repo: probeRepo, accessToken: candidate, visibility: 'private' })
      created = true
      return true
    } catch {
      // Creation refused: either the token cannot write, or the network/HF
      // service failed. Both are treated as "not proven to be a writer", and
      // the caller falls back to confirming read access before trusting it.
      return false
    } finally {
      if (created) {
        try {
          await deleteRepo({ repo: probeRepo, accessToken: candidate })
        } catch {
          setStatus(
            `Could not delete the temporary access-check repo ${probeRepo.name}. Remove it manually on Hugging Face.`,
          )
        }
      }
    }
  }, [])

  // `candidate` is passed in explicitly instead of read from the closure. The
  // login form sets the token and verifies it in the same event, so the state
  // value is still stale when a closure-based verify runs.
  const verifyToken = useCallback(
    async (candidate?: string) => {
      const attempt = (candidate ?? token).trim()

      if (!attempt) {
        setAuthStatus('signed-out')
        setStatus('Paste a Hugging Face API token before verifying it.')
        return
      }

      setIsVerifying(true)
      // 'checking' keeps the app shell hidden while the round-trip to Hugging
      // Face happens, and returns to the login screen if it fails.
      setAuthStatus('checking')
      setModal(null)
      setStatus('Checking the token with Hugging Face...')

      try {
        const resolved = await resolveAccount(attempt)

        setAccount(resolved)
        setTokenState(attempt)
        window.localStorage.setItem(STORAGE_KEYS.token, attempt)

        const writable = await probeWriteAccess(resolved.name, attempt)

        if (writable) {
          setAuthStatus('teacher')
          setStatus(`Verified teacher access for ${resolved.name}. Loading dataset...`)
          return
        }

        // No write access. Only accept it as a read-only session if the dataset
        // can actually be read, otherwise the token has no usable access. The
        // read result is kept so the dataset is not fetched a second time.
        try {
          const loaded = await loadDataset(repoFor(resolved.name, repoName), attempt, () => undefined)
          setSnapshot(loaded)
          loadedForRef.current = 'student'
          setAuthStatus('student')
          setStatus(
            `Verified read-only access for ${resolved.name}. Loaded ${Object.keys(loaded).length} class${
              Object.keys(loaded).length === 1 ? '' : 'es'
            }.`,
          )
        } catch (readError) {
          setAuthStatus('signed-out')
          setAccount(null)
          window.localStorage.removeItem(STORAGE_KEYS.token)
          setTokenState('')
          const detail = readError instanceof Error ? readError.message : String(readError)
          const message = `This token cannot read or write the dataset. ${detail}`
          setStatus(message)
          setModal({ type: 'success', title: 'Access denied', message, confirmText: 'Dismiss' })
        }
      } catch (error) {
        setAuthStatus('signed-out')
        setAccount(null)
        window.localStorage.removeItem(STORAGE_KEYS.token)
        setTokenState('')
        const message = `Verification failed: ${error instanceof Error ? error.message : String(error)}`
        setStatus(message)
        setModal({ type: 'success', title: 'Verification failed', message, confirmText: 'Dismiss' })
      } finally {
        setIsVerifying(false)
      }
    },
    [probeWriteAccess, repoName, token],
  )

  // The dataset loads once per successful sign-in. Both roles load it; only
  // 'teacher' is allowed to write afterwards.
  useEffect(() => {
    if (!isVerified || loadedForRef.current === authStatus) {
      return
    }
    loadedForRef.current = authStatus
    // oxlint-disable-next-line react/set-state-in-effect
    void pullDataset()
  }, [authStatus, isVerified, pullDataset])

  const seedDataset = useCallback(async () => {
    if (!requireWriteAccess()) {
      return
    }
    setIsSeeding(true)
    setModal({
      type: 'progress',
      title: 'Seeding dataset',
      message: 'Recreating the dataset repo and writing the class folders. Do not close this tab.',
      progress: 0,
      warning: CLOSE_WARNING,
    })

    try {
      const resolved = await requireAccount()
      const repo = repoFor(resolved.name, repoName)
      const files = buildMockSeedFiles()

      setModal((current) =>
        current
          ? { ...current, progress: 10, message: `Deleting any previous contents of ${repo.name}...` }
          : current,
      )
      await destroyRepo(repo, token)

      setModal((current) =>
        current ? { ...current, progress: 30, message: 'Creating the dataset repo and folder structure...' } : current,
      )
      await ensureRepo(repo, token)

      setModal((current) =>
        current
          ? { ...current, progress: 45, message: `Uploading ${files.length} files into data/students and data/attendance...` }
          : current,
      )
      await uploadFiles(repo, token, files, (percent) => {
        setModal((current) =>
          current
            ? { ...current, progress: 45 + Math.round((percent / 100) * 50), message: 'Uploading class folders...' }
            : current,
        )
      })

      setModal((current) => (current ? { ...current, progress: 100, message: 'Reading the dataset back...' } : current))
      const loaded = await loadDataset(repo, token, (percent, message) => {
        setModal((current) => (current ? { ...current, progress: percent, message } : current))
      })

      setSnapshot(loaded)
      setSelectedClassName(sortByName(Object.keys(loaded))[0] ?? '')
      setModal({
        type: 'success',
        title: 'Dataset ready',
        message: `Seeded ${Object.keys(loaded).length} class folders with rosters and attendance sessions in ${repo.name}.`,
        confirmText: 'Continue',
      })
      setStatus(`Seeded ${repo.name} and loaded it.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setModal({ type: 'success', title: 'Setup failed', message, confirmText: 'Dismiss' })
      setStatus(message)
    } finally {
      setIsSeeding(false)
    }
  }, [repoName, requireAccount, requireWriteAccess, token])

  const submitAttendance = useCallback(async () => {
    if (!requireWriteAccess()) {
      return
    }
    if (!activeClassName) {
      setStatus('Select a class before submitting attendance.')
      return
    }
    if (roster.length === 0) {
      setStatus('This class has no roster in the dataset, so there is nothing to submit.')
      return
    }
    if (!sessionDateIsValid) {
      setStatus('Enter the session date as ddmmyyyy before submitting.')
      return
    }
    if (!slotIsValid) {
      setStatus('Fix the slot first: it needs a start time, and the end time must come after it.')
      return
    }

    setIsSubmitting(true)
    const month = sessionDate.slice(0, 7)
    const targetPath = attendancePath(activeClassName, month)

    try {
      const resolved = await requireAccount()
      const repo = repoFor(resolved.name, repoName)
      await ensureRepo(repo, token)

      // Read any existing month file so we merge into it rather than overwrite.
      const existing = await readMonth(repo, token, targetPath)
      const existingRows = existing?.rows ?? []

      // One row per student for this date and slot.
      const newRows: MonthRow[] = roster.map((student) => ({
        rollNumber: student.rollNumber,
        name: student.name,
        course: student.course,
        date: sessionDate,
        slot: slotRange,
        status: activeDraft[student.rollNumber] ?? 'absent',
        classesAttended: 0,
        classesHeld: 0,
      }))

      // Submitting the same date and slot again folds into that session instead
      // of stacking a duplicate: absences can become presences, and a presence is
      // never taken away. Other sessions in the month are passed through as-is.
      const merged = mergeAttendanceRows(existingRows, newRows)
      const allRows = withRecountedTotals(merged)
      const isResubmit = existingRows.some((row) => row.date === sessionDate && row.slot === slotRange)
      const newlyPresent = isResubmit
        ? newRows.filter(
            (row) =>
              row.status === 'present' &&
              !existingRows.some(
                (old) => old.rollNumber === row.rollNumber && old.date === sessionDate && old.slot === slotRange,
              ),
          ).length
        : 0

      setModal({
        type: 'progress',
        title: isResubmit ? 'Updating session' : 'Uploading attendance',
        message: isResubmit
          ? `Merging ${roster.length} row${roster.length === 1 ? '' : 's'} into the existing ${sessionDate} ${slotRange} session in ${targetPath}. Do not close this tab.`
          : `Adding ${roster.length} row${roster.length === 1 ? '' : 's'} to ${targetPath}. Do not close this tab.`,
        progress: 10,
        warning: CLOSE_WARNING,
      })

      setModal((current) => (current ? { ...current, progress: 45 } : current))

      await uploadFiles(
        repo,
        token,
        [{ path: targetPath, content: new Blob([toMonthCsv(allRows)], { type: 'text/csv;charset=utf-8' }) }],
        (percent) => {
          setModal((current) =>
            current ? { ...current, progress: 45 + Math.round((percent / 100) * 50) } : current,
          )
        },
      )

      setModal((current) => (current ? { ...current, progress: 100, message: 'Refreshing dataset...' } : current))
      const loaded = await loadDataset(repo, token, (percent, message) => {
        setModal((current) => (current ? { ...current, progress: percent, message } : current))
      })
      setSnapshot(loaded)

      setModal({
        type: 'success',
        title: isResubmit ? 'Session updated' : 'Attendance submitted',
        message: isResubmit
          ? `The ${sessionDate} "${slotRange}" session in ${activeClassName} was merged${
              newlyPresent > 0 ? `, adding ${newlyPresent} newly present student${newlyPresent === 1 ? '' : 's'}` : ''
            }. Recorded presences were kept.`
          : `${roster.length} row${roster.length === 1 ? '' : 's'} were pushed to ${targetPath} and the dataset was refreshed.`,
        confirmText: 'Continue',
      })
      setStatus(isResubmit ? `${activeClassName}: ${sessionDate} "${slotRange}" merged.` : `${activeClassName}'s month file updated.`)
      setDraft({})
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setModal({ type: 'success', title: 'Upload failed', message, confirmText: 'Dismiss' })
      setStatus(message)
    } finally {
      setIsSubmitting(false)
      // Date and slot both start blank again: a session is logged deliberately,
      // so nothing is pre-filled for the next one.
      setSessionDate('')
      setSlot(defaultSlotRange)
    }
  }, [
    activeClassName,
    activeDraft,
    repoName,
    requireAccount,
    requireWriteAccess,
    roster,
    sessionDate,
    sessionDateIsValid,
    setSessionDate,
    slotIsValid,
    slotRange,
    token,
  ])

  const refreshModal = useCallback((patch: Partial<ModalState>) => {
    setModal((current) => (current ? { ...current, ...patch } : current))
  }, [])

  const pendingRosterRef = useRef<{ className: string; text: string; count: number } | null>(null)

  const performRosterUpload = useCallback(async () => {
    const pending = pendingRosterRef.current
    if (!pending) {
      return
    }
    pendingRosterRef.current = null
    const target = rosterPath(pending.className)

    setIsUploadingRoster(true)
    setModal({
      type: 'progress',
      title: 'Creating class',
      message: `Uploading ${pending.count} student${pending.count === 1 ? '' : 's'} to ${target}. Do not close this tab.`,
      progress: 10,
      warning: CLOSE_WARNING,
    })

    try {
      const resolved = await requireAccount()
      const repo = repoFor(resolved.name, repoName)
      await ensureRepo(repo, token)

      refreshModal({ progress: 45 })

      await uploadFiles(
        repo,
        token,
        [{ path: target, content: new Blob([pending.text], { type: 'text/csv;charset=utf-8' }) }],
        (percent) => {
          refreshModal({ progress: 45 + Math.round((percent / 100) * 50) })
        },
      )

      refreshModal({ progress: 100, message: 'Refreshing dataset...' })
      const loaded = await loadDataset(repo, token, (percent, message) => {
        refreshModal({ progress: percent, message })
      })
      setSnapshot(loaded)
      selectClass(pending.className)

      setModal({
        type: 'success',
        title: 'Class created',
        message: `${pending.count} student${pending.count === 1 ? '' : 's'} were pushed to ${target} and the dataset was refreshed.`,
        confirmText: 'Continue',
      })
      setStatus(`${pending.className} created at ${target}.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setModal({ type: 'success', title: 'Upload failed', message, confirmText: 'Dismiss' })
      setStatus(message)
    } finally {
      setIsUploadingRoster(false)
    }
  }, [refreshModal, repoName, requireAccount, selectClass, token])

  const uploadRoster = useCallback(
    async (className: string, file: File) => {
      if (!requireWriteAccess()) {
        return
      }
      const trimmed = className.trim()
      if (!isValidClassName(trimmed)) {
        const message =
          'Give the class a plain folder name: letters, numbers, spaces and dashes only, with no slashes or dots at the start.'
        setModal({ type: 'success', title: 'Class name not usable', message, confirmText: 'Dismiss' })
        setStatus(message)
        return
      }

      let text: string
      try {
        text = await file.text()
      } catch (error) {
        const message = `Could not read that file: ${error instanceof Error ? error.message : String(error)}`
        setModal({ type: 'success', title: 'File not readable', message, confirmText: 'Dismiss' })
        setStatus(message)
        return
      }

      // Parse before writing: a roster that yields no students would create a
      // class folder that renders empty, with no clue why.
      const students = parseRosterCsv(text)
      if (students.length === 0) {
        const message = `${file.name} has no readable students. It needs a header row and columns for name, roll_number and course.`
        setModal({ type: 'success', title: 'No students in that file', message, confirmText: 'Dismiss' })
        setStatus(message)
        return
      }

      pendingRosterRef.current = { className: trimmed, text, count: students.length }

      if (classNames.includes(trimmed)) {
        setModal({
          type: 'confirm',
          title: `Replace the roster for ${trimmed}?`,
          message: `${trimmed} already exists, so its ${ROSTER_HEADER.join(', ')} file will be overwritten with the ${students.length} student${students.length === 1 ? '' : 's'} in ${file.name}. Attendance already recorded for this class is not changed, but the old roster is replaced.`,
          confirmText: 'Replace roster',
          onConfirm: () => {
            setModal(null)
            void performRosterUpload()
          },
        })
        return
      }

      void performRosterUpload()
    },
    [classNames, performRosterUpload, requireWriteAccess],
  )

  const toggleDraft = useCallback((rollNumber: string) => {
    setDraft((current) => ({
      ...current,
      [rollNumber]: current[rollNumber] === 'present' ? 'absent' : 'present',
    }))
  }, [])

  const markAll = useCallback(
    (status: AttendanceStatus) => {
      setDraft(Object.fromEntries(roster.map((student) => [student.rollNumber, status])))
    },
    [roster],
  )

  return {
    token,
    setToken,
    clearToken,
    repoName,
    setRepoName,
    account,
    status,
    setStatus,
    snapshot,
    classNames,
    activeClassName,
    selectClass,
    activeClass,
    roster,
    report,
    rangeMode,
    setRangeMode,
    rangeMonth: activeMonth,
    setRangeMonth,
    sessionDate,
    sessionDateDigits,
    sessionDateIsValid,
    setSessionDate,
    setSessionDateDigits,
    slotStart,
    setSlotStart,
    slotEnd,
    setSlotEnd,
    slotRange,
    slotIsValid,
    sessionNote,
    setSessionNote,
    draft: activeDraft,
    toggleDraft,
    markAll,
    modal,
    setModal,
    isVerifying,
    isLoading,
    isSeeding,
    isSubmitting,
    isUploadingRoster,
    isWriting,
    authStatus,
    isVerified,
    isChecking,
    canWrite,
    verifyToken,
    seedDataset,
    submitAttendance,
    uploadRoster,
  }
}

export type DatasetController = ReturnType<typeof useDataset>
