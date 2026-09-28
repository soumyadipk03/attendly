import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_REPO_NAME,
  destroyRepo,
  ensureRepo,
  loadDataset,
  repoFor,
  resolveAccount,
  uploadFiles,
} from '../lib/hfDataset'
import {
  buildAttendanceFileName,
  attendancePath,
  defaultSlotRange,
  formatSlotRange,
  isSlotRangeValid,
  sortByName,
  toIsoDate,
} from '../lib/datasetLayout'
import { buildMockSeedFiles } from '../lib/mockSeed'
import { toAttendanceCsv } from '../lib/records'
import { buildReport, emptyReport, listMonths } from '../lib/report'
import type {
  AttendanceDraft,
  AttendanceStatus,
  ClassReport,
  DatasetSnapshot,
  HfAccount,
  ModalState,
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
  const [modal, setModal] = useState<ModalState>(null)

  const [selectedClassName, setSelectedClassName] = useState(() => readStored(STORAGE_KEYS.className))
  const [rangeMode, setRangeModeState] = useState<RangeMode>(() =>
    readStored(STORAGE_KEYS.rangeMode) === 'monthly' ? 'monthly' : 'total',
  )
  const [rangeMonth, setRangeMonthState] = useState(() => readStored(STORAGE_KEYS.rangeMonth))

  const [sessionDate, setSessionDate] = useState(() => toIsoDate(new Date()))
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

  const months = useMemo(() => (activeClass ? listMonths(activeClass.sessions) : []), [activeClass])
  const activeMonth = months.includes(rangeMonth) ? rangeMonth : (months[0] ?? '')

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.rangeMonth, activeMonth)
  }, [activeMonth])

  const report: ClassReport = useMemo(
    () => (activeClass ? buildReport(activeClass, rangeMode, activeMonth, months) : emptyReport(rangeMode, activeMonth)),
    [activeClass, activeMonth, months, rangeMode],
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

  const pullDataset = useCallback(
    async (options: { announce?: boolean } = {}): Promise<DatasetSnapshot | null> => {
      const announce = options.announce ?? true
      setIsLoading(true)
      try {
        const resolved = await requireAccount()
        const repo = repoFor(resolved.name, repoName)
        const loaded = await loadDataset(repo, token, (percent, message) => {
          setModal({ type: 'progress', title: 'Loading dataset', message, progress: percent })
        })
        setSnapshot(loaded)
        if (announce) {
          setModal({
            type: 'success',
            title: 'Dataset loaded',
            message: `Pulled ${Object.keys(loaded).length} class folder${Object.keys(loaded).length === 1 ? '' : 's'} from ${repo.name}.`,
            confirmText: 'Continue',
          })
        }
        setStatus(`Dataset loaded from ${repo.name}.`)
        return loaded
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (announce) {
          setModal({ type: 'success', title: 'Load failed', message, confirmText: 'Dismiss' })
        }
        setStatus(message)
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [repoName, requireAccount, token],
  )

  // Declared after pullDataset because the dependency array below reads it.
  const verifyToken = useCallback(async () => {
    if (!token.trim()) {
      setAccount(null)
      setStatus('Paste a Hugging Face API token before verifying it.')
      return
    }

    setIsVerifying(true)
    try {
      const resolved = await resolveAccount(token)
      setAccount(resolved)
      setStatus(`Token verified for ${resolved.name}. Loading ${repoFor(resolved.name, repoName).name}...`)
      // Verifying is the natural moment to pull the data, since the app auto-loads
      // on open only when a token is already stored.
      void pullDataset({ announce: false })
    } catch (error) {
      setAccount(null)
      setStatus(`Token verification failed: ${error instanceof Error ? error.message : String(error)}`)
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
    void pullDataset({ announce: false })
  }, [pullDataset, token])

  const seedDataset = useCallback(async () => {
    setIsSeeding(true)
    setModal({
      type: 'progress',
      title: 'Seeding dataset',
      message: 'Recreating the dataset repo and writing the class folders. Do not close this tab.',
      progress: 0,
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
    if (!slotIsValid) {
      setStatus('Fix the slot first: it needs a start time, and the end time must come after it.')
      return
    }

    setIsSubmitting(true)
    // The filename records the slot start; the full "from to" range is kept in
    // the file's own slot column.
    const fileName = buildAttendanceFileName(sessionDate, slotStart)

    setModal({
      type: 'progress',
      title: 'Uploading attendance',
      message: `Writing ${fileName} to data/attendance/class/${activeClassName}/`,
      progress: 10,
    })

    try {
      const resolved = await requireAccount()
      const repo = repoFor(resolved.name, repoName)
      await ensureRepo(repo, token)

      setModal((current) => (current ? { ...current, progress: 45 } : current))

      const csv = toAttendanceCsv(
        roster.map((student) => ({
          rollNumber: student.rollNumber,
          name: student.name,
          course: student.course,
          status: activeDraft[student.rollNumber] ?? 'absent',
          slot: slotRange,
          note: sessionNote.trim(),
        })),
      )

      await uploadFiles(
        repo,
        token,
        [
          {
            path: attendancePath(activeClassName, fileName),
            content: new Blob([csv], { type: 'text/csv;charset=utf-8' }),
          },
        ],
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
        message: `${fileName} was pushed to ${attendancePath(activeClassName, fileName)} and the dataset was refreshed.`,
        confirmText: 'Continue',
      })
      setStatus(`Attendance pushed to ${attendancePath(activeClassName, fileName)}.`)
      setDraft({})
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setModal({ type: 'success', title: 'Upload failed', message, confirmText: 'Dismiss' })
      setStatus(message)
    } finally {
      setIsSubmitting(false)
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
    verifyToken,
    seedDataset,
    submitAttendance,
  }
}

export type DatasetController = ReturnType<typeof useDataset>
