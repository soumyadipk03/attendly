import { FolderTree } from 'lucide-react'
import { Field, Select } from './ui'

export function ClassPicker({
  classNames,
  value,
  onChange,
  label = 'Select class',
  hint,
}: {
  classNames: string[]
  value: string
  onChange: (value: string) => void
  label?: string
  hint?: string
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <FolderTree className="h-4 w-4 shrink-0 text-indigo-500" />
        <Select value={value} onChange={onChange} disabled={classNames.length === 0}>
          {classNames.length === 0 ? <option value="">No classes loaded</option> : null}
          {classNames.map((className) => (
            <option key={className} value={className}>
              {className}
            </option>
          ))}
        </Select>
      </div>
    </Field>
  )
}
