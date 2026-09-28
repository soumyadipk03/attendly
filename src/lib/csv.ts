export function escapeCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`
}

export function toCsv(header: readonly string[], rows: readonly (readonly (string | number)[])[]): string {
  return [header, ...rows]
    .map((row) => row.map((cell) => escapeCell(cell)).join(','))
    .join('\n')
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        cell += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(cell.trim())
      cell = ''
    } else if (char === '\n') {
      row.push(cell.trim())
      rows.push(row)
      row = []
      cell = ''
    } else if (char !== '\r') {
      cell += char
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim())
    rows.push(row)
  }

  return rows.filter((entry) => entry.some((value) => value.length > 0))
}

export function parseCsvRecords(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text)

  if (!header) {
    return []
  }

  const columns = header.map((column) => column.trim().toLowerCase())

  return rows.map((row) => {
    const record: Record<string, string> = {}
    columns.forEach((column, index) => {
      record[column] = row[index] ?? ''
    })
    return record
  })
}

export function pick(record: Record<string, string>, aliases: readonly string[]): string {
  for (const alias of aliases) {
    const value = record[alias]
    if (value) {
      return value
    }
  }
  return ''
}
