import {
  createRepo,
  datasetInfo,
  deleteRepo,
  downloadFile,
  listFiles,
  uploadFilesWithProgress,
  whoAmI,
} from '@huggingface/hub'
import { HubApiError } from '@huggingface/hub'
import {
  ATTENDANCE_ROOT,
  STUDENTS_ROOT,
  classNameOf,
  fileNameOf,
  isAttendancePath,
  isRosterPath,
  parseAttendanceFileName,
  sortByName,
} from './datasetLayout'
import { parseAttendanceCsv, parseRosterCsv, sortStudents } from './records'
import type { AttendanceSession, ClassData, DatasetSnapshot, HfAccount, UploadFile } from './types'

export type HfRepo = { type: 'dataset'; name: string }

export const DEFAULT_REPO_NAME = 'attendly-data'

export function repoIdFor(username: string, repoName: string): string {
  return `${username}/${repoName.trim() || DEFAULT_REPO_NAME}`
}

export function repoFor(username: string, repoName: string): HfRepo {
  return { type: 'dataset', name: repoIdFor(username, repoName) }
}

function statusOf(error: unknown): number | null {
  if (error instanceof HubApiError) {
    return error.statusCode
  }
  const candidate = (error as { statusCode?: unknown; status?: unknown } | null)?.statusCode
  return typeof candidate === 'number' ? candidate : null
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : ''
}

export function isMissingError(error: unknown): boolean {
  const status = statusOf(error)
  if (status === 404) {
    return true
  }
  return /not found|404|does not exist|no such file|entrynotfound|repository_not_found/i.test(messageOf(error))
}

export function isConflictError(error: unknown): boolean {
  const status = statusOf(error)
  if (status === 409) {
    return true
  }
  return /already (?:exists|created)|409|conflict|name must be unique/i.test(messageOf(error))
}

export async function resolveAccount(token: string): Promise<HfAccount> {
  const payload = await whoAmI({ accessToken: token })

  if (payload.type === 'app') {
    throw new Error('This is an app token. Use a personal read/write token from your Hugging Face settings instead.')
  }

  const username = payload.name
  if (!username) {
    throw new Error('The Hugging Face token did not resolve to an account name.')
  }

  return {
    name: username,
    fullname: payload.fullname || username,
    email: payload.email,
    orgs: payload.type === 'user' ? payload.orgs.map((org) => org.name) : [],
  }
}

export async function repoExists(repo: HfRepo, token: string): Promise<boolean> {
  try {
    await datasetInfo({ name: repo.name, accessToken: token })
    return true
  } catch (error) {
    if (isMissingError(error)) {
      return false
    }
    throw error
  }
}

export async function ensureRepo(repo: HfRepo, token: string): Promise<void> {
  if (await repoExists(repo, token)) {
    return
  }

  try {
    await createRepo({ repo, accessToken: token, visibility: 'private' })
  } catch (error) {
    if (!isConflictError(error)) {
      throw error
    }
  }
}

export async function destroyRepo(repo: HfRepo, token: string): Promise<void> {
  try {
    await deleteRepo({ repo, accessToken: token })
  } catch (error) {
    if (!isMissingError(error)) {
      throw error
    }
  }
}

export async function uploadFiles(
  repo: HfRepo,
  token: string,
  files: readonly UploadFile[],
  onProgress: (progress: number) => void,
): Promise<void> {
  if (files.length === 0) {
    return
  }

  const stream = uploadFilesWithProgress({
    repo,
    accessToken: token,
    commitTitle: 'Update Attendly dataset',
    files: files.map((file) => ({ path: file.path, content: file.content })),
  })

  for await (const event of stream) {
    if (event.event === 'fileProgress') {
      onProgress(Math.min(100, Math.round(event.progress ?? 0)))
    }
  }
}

async function listPaths(repo: HfRepo, token: string, path: string): Promise<string[]> {
  const paths: string[] = []

  try {
    for await (const entry of listFiles({ repo, accessToken: token, path, recursive: true })) {
      if (entry.type === 'file') {
        paths.push(entry.path)
      }
    }
  } catch (error) {
    if (isMissingError(error)) {
      return []
    }
    throw error
  }

  return paths
}

async function readText(repo: HfRepo, token: string, path: string): Promise<string | null> {
  const blob = await downloadFile({ repo, path, accessToken: token })
  return blob ? blob.text() : null
}

async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index])
    }
  })

  await Promise.all(runners)
  return results
}

async function loadSessions(repo: HfRepo, token: string, paths: readonly string[]): Promise<AttendanceSession[]> {
  const parsed = await mapWithConcurrency(paths, 6, async (path) => {
    const meta = parseAttendanceFileName(fileNameOf(path))
    if (!meta) {
      return null
    }

    const text = await readText(repo, token, path)
    if (!text) {
      return null
    }

    return {
      fileName: fileNameOf(path),
      path,
      stamp: meta.stamp,
      date: meta.date,
      time: meta.time,
      month: meta.month,
      entries: parseAttendanceCsv(text),
    } satisfies AttendanceSession
  })

  return parsed.filter((session): session is AttendanceSession => session !== null)
}

export type LoadProgress = (percent: number, message: string) => void

export async function loadDataset(
  repo: HfRepo,
  token: string,
  onProgress: LoadProgress = () => undefined,
): Promise<DatasetSnapshot> {
  if (!(await repoExists(repo, token))) {
    throw new Error(`Dataset ${repo.name} was not found. Use Reset dataset on the Accounts tab to create it with sample data.`)
  }

  onProgress(8, 'Listing class folders in the dataset...')

  const [rosterPaths, attendancePaths] = await Promise.all([
    listPaths(repo, token, STUDENTS_ROOT),
    listPaths(repo, token, ATTENDANCE_ROOT),
  ])

  const classNames = sortByName(
    new Set([...rosterPaths, ...attendancePaths].filter((path) => isRosterPath(path) || isAttendancePath(path)).map(classNameOf)),
  )

  onProgress(20, `Downloading ${classNames.length} class${classNames.length === 1 ? '' : 'es'}...`)

  const snapshot: DatasetSnapshot = {}
  let done = 0

  await mapWithConcurrency(classNames, 4, async (className) => {
    const rosterFile = rosterPaths.find((path) => isRosterPath(path) && classNameOf(path) === className)
    const rosterText = rosterFile ? await readText(repo, token, rosterFile) : null
    const classAttendancePaths = attendancePaths.filter((path) => isAttendancePath(path) && classNameOf(path) === className)

    const [sessions] = await Promise.all([loadSessions(repo, token, classAttendancePaths)])

    const data: ClassData = {
      className,
      roster: rosterText ? sortStudents(parseRosterCsv(rosterText)) : [],
      sessions: sessions.sort((a, b) => a.stamp.localeCompare(b.stamp)),
    }

    snapshot[className] = data

    done += 1
    const share = classNames.length === 0 ? 70 : (done / classNames.length) * 70
    onProgress(20 + share, `Loaded ${className} (${sessions.length} session${sessions.length === 1 ? '' : 's'})`)
  })

  onProgress(100, 'Dataset ready.')

  return Object.fromEntries(sortByName(Object.keys(snapshot)).map((className) => [className, snapshot[className]]))
}
