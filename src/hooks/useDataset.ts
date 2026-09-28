import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_REPO_NAME,
  destroyRepo,
  ensureRepo,
  loadDataset,
  readMonth,
  repoFor,
  resolveAccount,
  uploadFiles,
} from '../lib/hfDataset'
import {
  attendancePath,
  defaultSlotRange,
  formatSlotRange,
  isSlotRangeValid,
  isValidClassName,
  rosterPath,
  sortByName,
} from '../lib/datasetLayout'
import { buildMockSeedFiles } from '../lib/mockSeed'
import { ROSTER_HEADER, parseRosterCsv, toMonthCsv, withRecountedTotals } from '../lib/records'
import { buildReport, emptyReport, listMonths } from '../lib/report'
import type {
  AttendanceDraft,
  AttendanceStatus,
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
  const [token, setTokenState] = useState(() => readStored(STORAGE_KEYS.token))
  const [repoName, setRepoNameState] = useState(() => readStored(STORAGE_KEYS.repo) || DEFAULT_REPO_NAME)
  const [account, setAccount] = useState<HfAccount | null>(null)
  const [snapshot, setSnapshot] = useState<DatasetSnapshot>(EMPTY_SNAPSHOT)
  const [status, setStatus] = useState(() =>
    token.trim()
      ? 'Loading the dataset from Hugging Face...'
      : 'No Hugging Face token saved yet, so there is nothing to load. Add one and the dataset loads on its own, or use Reset dataset to seed the sample classes.',
  )
  const [isVerifying, setIsVerifying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSeeding, setIsSeeding] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUploadingRoster, setIsUploadingRoster] = useState(false)
  const [modal, setModal] = useState<ModalState>(null)

  // Any Hugging Face write in flight. Used to warn before the tab is closed.
  const isWriting = isSeeding || isSubmitting || isUploadingRoster

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
  // pre-filled time would be a guess at when the class actually ran.
  const [sessionDate, setSessionDate] = useState('')
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

  const setToken = useCallback((next: string) => {
    setTokenState(next)
    if (next.trim()) {
      window.localStorage.setItem(STORAGE_KEYS.token, next)
    } else {
      window.localStorage.removeItem(STORAGE_KEYS.token)
      setAccount(null)
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

  // Declared after pullDataset because the dependency array below reads it.
  const verifyToken = useCallback(async () => {
    if (!token.trim()) {
      setAccount(null)
      const message = 'Paste a Hugging Face API token before verifying it.'
      setStatus(message)
      setModal({ type: 'success', title: 'No token to verify', message, confirmText: 'Dismiss' })
      return
    }

    setIsVerifying(true)
    try {
      const resolved = await resolveAccount(token)
      setAccount(resolved)
      setStatus(`Token verified for ${resolved.name}. Loading ${repoFor(resolved.name, repoName).name}...`)
      // Verifying is the natural moment to pull the data, since the app auto-loads
      // on open only when a token is already stored. pullDataset reports the result.
      void pullDataset()
    } catch (error) {
      setAccount(null)
      const message = `Token verification failed: ${error instanceof Error ? error.message : String(error)}`
      setStatus(message)
      setModal({ type: 'success', title: 'Verification failed', message, confirmText: 'Dismiss' })
    } finally {
      setIsVerifying(false)
    }
  }, [pullDataset, repoName, token])

  const autoLoadedRef = useRef(false)

  // The dataset loads by itself as soon as the app opens, so nobody has to hunt
  // for a Load button. Runs once; a stale token just reports in the status line
  // instead of interrupting with a modal.
  useEffect(() => {
    if (autoLoadedRef.current) {
      return
    }
    autoLoadedRef.current = true

    if (!token.trim()) {
      return
    }

    // Synchronizing with an external system (the Hugging Face API) on mount is
    // exactly what effects are for. pullDataset flips isLoading before it awaits,
    // which is what the progress modal is driven from.
    // oxlint-disable-next-line react/set-state-in-effect
    void pullDataset()
  }, [pullDataset, token])

  const seedDataset = useCallback(async () => {
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
  }, [repoName, requireAccount, token])

  const submitAttendance = useCallback(async () => {
    if (!activeClassName) {
      setStatus('Select a class before submitting attendance.')
      return
    }
    if (roster.length === 0) {
      setStatus('This class has no roster in the dataset, so there is nothing to submit.')
      return
    }
    if (!sessionDate || !sessionDate.trim()) {
      setStatus('Set a session date before submitting.')
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

      // Read any existing month file so we append to it rather than overwrite.
      const existing = await readMonth(repo, token, targetPath)
      const existingRows = withRecountedTotals(existing?.rows ?? [])

      // One row per student, appended to the month log.
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

      const allRows = withRecountedTotals([...existingRows, ...newRows])

      setModal({
        type: 'progress',
        title: 'Uploading attendance',
        message: `Appending ${roster.length} row${roster.length === 1 ? '' : 's'} to ${targetPath}. Do not close this tab.`,
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
        title: 'Attendance submitted',
        message: `${roster.length} row${roster.length === 1 ? '' : 's'} were pushed to ${targetPath} and the dataset was refreshed.`,
        confirmText: 'Continue',
      })
      setStatus(`${activeClassName}'s month file updated.`)
      setDraft({})
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setModal({ type: 'success', title: 'Upload failed', message, confirmText: 'Dismiss' })
      setStatus(message)
    } finally {
      setIsSubmitting(false)
      // Reset slot so the next submit starts fresh.
      setSlot(defaultSlotRange)
    }
  }, [
    activeClassName,
    activeDraft,
    repoName,
    requireAccount,
    roster,
    sessionDate,
    sessionNote,
    slotIsValid,
    slotRange,
    slotStart,
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
    [classNames, performRosterUpload],
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
    setSessionDate,
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
    verifyToken,
    seedDataset,
    submitAttendance,
    uploadRoster,
  }
}

export type DatasetController = ReturnType<typeof useDataset>
