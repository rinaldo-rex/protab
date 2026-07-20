import { Plus, X } from 'lucide-react'
import { useMemo, useState, type KeyboardEvent } from 'react'

interface TagEditorProps {
  value: string[]
  suggestions: string[]
  onChange: (tags: string[]) => Promise<void>
}

export function TagEditor({ value, suggestions, onChange }: TagEditorProps) {
  const [input, setInput] = useState('')
  const [error, setError] = useState<string>()
  const filtered = useMemo(() => {
    const query = input.trim().toLocaleLowerCase()
    return suggestions.filter((tag) => !value.some((chosen) => chosen.toLocaleLowerCase() === tag.toLocaleLowerCase()) && (!query || tag.toLocaleLowerCase().includes(query))).slice(0, 6)
  }, [input, suggestions, value])

  async function add(raw: string) {
    const tag = raw.trim()
    if (!tag) return
    try {
      await onChange([...value, tag])
      setInput('')
      setError(undefined)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not add this tag.')
    }
  }

  async function remove(tag: string) {
    try {
      await onChange(value.filter((item) => item !== tag))
      setError(undefined)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not remove this tag.')
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      void add(input)
    }
  }

  return (
    <div className="tag-editor">
      <span className="field-label">Tags</span>
      <div className="selected-tags">{value.map((tag) => <span className="tag editable" key={tag}>{tag}<button type="button" aria-label={`Remove tag ${tag}`} onClick={() => void remove(tag)}><X size={11} /></button></span>)}</div>
      <div className="tag-input-row"><input aria-label="Add tag" value={input} maxLength={32} onChange={(event) => setInput(event.target.value)} onKeyDown={onKeyDown} list="protab-tag-suggestions" /><button type="button" className="small-button" aria-label="Add typed tag" onClick={() => void add(input)}><Plus size={14} /> Add</button></div>
      {input && filtered.length > 0 && <div className="tag-suggestions" aria-label="Tag suggestions">{filtered.map((tag) => <button type="button" key={tag} onClick={() => void add(tag)}>{tag}</button>)}</div>}
      {error && <small className="form-error" role="alert">{error}</small>}
    </div>
  )
}
