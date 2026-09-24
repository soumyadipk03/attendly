import { writeFileSync } from 'node:fs'

const repo = process.env.GITHUB_REPOSITORY || 'owner/repo'
const token = process.env.GITHUB_TOKEN
const hfToken = process.env.HF_TOKEN
const hfRepo = 'soumyadipk03/attendly'

const headers = {
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}

if (token) {
  headers.Authorization = `Bearer ${token}`
}

const response = await fetch(`https://api.github.com/repos/${repo}/issues?state=all&per_page=100`, {
  headers,
})

if (!response.ok) {
  throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`)
}

const issues = await response.json()
const validIssues = issues.filter((issue) => !issue.pull_request)

function parseIssuePayload(body) {
  if (!body) {
    return {}
  }

  const payload = {}
  const lines = body.split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes(':')) {
      continue
    }

    const separatorIndex = trimmed.indexOf(':')
    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim()

    if (key) {
      payload[key] = value.replace(/^['"]|['"]$/g, '')
    }
  }

  return payload
}

const rows = [
  ['number', 'title', 'student_id', 'student_name', 'class_name', 'status', 'attendance_date', 'notes', 'state', 'labels', 'created_at', 'updated_at'],
  ...validIssues.map((issue) => {
    const payload = parseIssuePayload(issue.body)

    return [
      String(issue.number),
      String(issue.title).replace(/\r?\n/g, ' '),
      payload.student_id || '',
      payload.student_name || '',
      payload.class_name || payload.class || '',
      payload.status || '',
      payload.attendance_date || payload.date || '',
      payload.notes || payload.note || '',
      issue.state,
      (issue.labels || []).map((label) => typeof label === 'string' ? label : label.name).join('|'),
      issue.created_at,
      issue.updated_at,
    ]
  }),
]

const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
writeFileSync('issue-report.csv', `${csv}\n`)

if (hfRepo && hfToken) {
  await fetch(`https://huggingface.co/api/repos/${hfRepo}/upload/main/issue-report.csv`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${hfToken}`,
      'Content-Type': 'text/csv',
    },
    body: csv,
  })
}

console.log(`Parsed ${validIssues.length} issues into issue-report.csv`)
