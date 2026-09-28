import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DEFAULT_REPO_NAME,
  deleteFilesIn,
  destroyRepo,
  ensureRepo,
  loadDataset,
  readSquashedMonth,
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
  squashedAttendancePath,
  toIsoDate,
} from '../lib/datasetLayout'
import { buildMockSeedFiles } from '../lib/mockSeed'
import { toAttendanceCsv } from '../lib/records'
import { buildReport, emptyReport, listMonths } from '../lib/report'
import { buildSquashedCsv, describeCandidates, findSquashCandidates, summariseSessions } from '../lib/squash'
import type {
  AttendanceDraft,
  AttendanceStatus,
  ClassReport,
  DatasetSnapshot,
  HfAccount,
  ModalState,
  RangeMode,
  Student,
  SquashCandidate,
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
  const [isSquashing, setIsSquashing] = useState(false)
  const [modal, setModal] = useState<ModalState>(null)

  // Any Hugging Face write in flight. Used to warn before the tab is closed.
  const isWriting = isSeeding || isSubmitting || isSquashing

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

  const months = useMemo(() => (activeClass ? listMonths(activeClass) : []), [activeClass])
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
    if (!slotIsValid) {
      setStatus('Fix the slot first: it needs a start time, and the end time must come after it.')
      return
    }

    setIsSubmitting(true)
    // The filename records the slot start; the full "from to" range is kept in
    // the file's own slot column.
    const fileName = buildAttendanceFileName(sessionDate, slotStart)
    const month = sessionDate.slice(0, 7)
    const targetPath = attendancePath(activeClassName, month, fileName)

    setModal({
      type: 'progress',
      title: 'Uploading attendance',
      message: `Writing ${fileName} to data/attendance/class/${activeClassName}/${month}/. Do not close this tab.`,
      progress: 10,
      warning: CLOSE_WARNING,
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
            path: targetPath,
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
        message: `${fileName} was pushed to ${targetPath} and the dataset was refreshed.`,
        confirmText: 'Continue',
      })
      setStatus(`Attendance pushed to ${targetPath}.`)
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

  const squashCandidates = useMemo(() => findSquashCandidates(snapshot), [snapshot])

  const refreshModal = useCallback((patch: Partial<ModalState>) => {
    setModal((current) => (current ? { ...current, ...patch } : current))
  }, [])

  /**
   * Folds finished months into one <month>.csv each.
   *
   * The write and the cleanup are deliberately separate API calls: the summary is
   * uploaded and read back first, and only once that succeeds are the daily files
   * removed. If the upload fails nothing is deleted, so a failure can never lose
   * a month. The user watches the whole thing as a single dialog.
   */
  const squashMonths = useCallback(
    async (targets: readonly SquashCandidate[]) => {
      if (targets.length === 0) {
        return
      }

      setIsSquashing(true)
      setModal({
        type: 'progress',
        title: 'Squashing finished months',
        message: `Preparing ${targets.length} month${targets.length === 1 ? '' : 's'}... Do not close this tab.`,
        progress: 0,
        warning: CLOSE_WARNING,
      })

      try {
        const resolved = await requireAccount()
        const repo = repoFor(resolved.name, repoName)
        const totalFiles = targets.reduce((total, target) => total + target.dailyPaths.length, 0)
        let processed = 0

        for (const target of targets) {
          const classData = snapshot[target.className]
          if (!classData) {
            continue
          }
          const sessions = classData.sessions.filter((session) => target.dailyPaths.includes(session.path))
          if (sessions.length === 0) {
            continue
          }

          const rows = summariseSessions(classData.roster, sessions)
          const csv = buildSquashedCsv(rows)
          const path = squashedAttendancePath(target.className, target.month)

          const phaseBase = Math.round((processed / totalFiles) * 100)
          const phaseSpan = Math.max(1, Math.round((sessions.length / totalFiles) * 100))

          refreshModal({
            message: `Squashing ${target.className} ${target.month} (${sessions.length} files)... Do not close this tab.`,
            progress: phaseBase,
          })

          await uploadFiles(
            repo,
            token,
            [{ path, content: new Blob([csv], { type: 'text/csv;charset=utf-8' }) }],
            (percent) => refreshModal({ progress: phaseBase + Math.round((percent / 100) * phaseSpan * 0.5) }),
          )

          // Read it back before deleting anything.
          refreshModal({
            message: `Verifying ${target.className} ${target.month}.csv, then removing the ${sessions.length} daily files... Do not close this tab.`,
            progress: phaseBase + Math.round(phaseSpan * 0.6),
          })

          const written = await readSquashedMonth(repo, token, target.className, path, classData.roster)
          if (!written || written.stats.length === 0) {
            throw new Error(
              `${path} did not read back correctly, so the daily files in ${target.month} were left untouched.`,
            )
          }

          await deleteFilesIn(repo, token, target.dailyPaths, `Squash ${target.className} ${target.month}`)

          processed += sessions.length
          refreshModal({ progress: Math.round((processed / totalFiles) * 100) })
        }

        refreshModal({ message: 'Reading the dataset back...', progress: 99 })
        const loaded = await loadDataset(repo, token, (percent, message) => refreshModal({ progress: percent, message }))
        setSnapshot(loaded)

        setModal({
          type: 'success',
          title: 'Squash complete',
          message: `Folded ${targets.length} month${targets.length === 1 ? '' : 's'} into a single summary file each and removed the daily files.`,
          confirmText: 'Continue',
        })
        setStatus(`Squashed ${describeCandidates(targets)} into monthly summary files in ${repo.name}.`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setModal({ type: 'success', title: 'Squash failed', message, confirmText: 'Dismiss' })
        setStatus(message)
      } finally {
        setIsSquashing(false)
      }
    },
    [refreshModal, repoName, requireAccount, snapshot, token],
  )

  const confirmSquash = useCallback(() => {
    if (squashCandidates.length === 0) {
      return
    }
    const targets = squashCandidates
    setModal({
      type: 'confirm',
      title: 'Squash the previous months?',
      message: `${describeCandidates(targets)} have a newer month folder alongside them, so they are finished. Each becomes one <month>.csv holding every student's classes attended over classes held, and the daily files in that month are removed.`,
      confirmText: 'Squash',
      onConfirm: () => {
        setModal(null)
        void squashMonths(targets)
      },
    })
  }, [squashCandidates, squashMonths])

  // Offer once per app open, after the first dataset load. A ref keeps this from
  // re-rendering, since nothing on screen depends on having asked.
  const squashPromptedRef = useRef(false)
  useEffect(() => {
    if (squashPromptedRef.current || squashCandidates.length === 0 || isLoading) {
      return
    }
    squashPromptedRef.current = true
    confirmSquash()
  }, [confirmSquash, isLoading, squashCandidates.length])

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
    isSquashing,
    isWriting,
    squashCandidates,
    confirmSquash,
    verifyToken,
    seedDataset,
    submitAttendance,
  }
}

export type DatasetController = ReturnType<typeof useDataset>
