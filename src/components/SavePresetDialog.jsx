import { useState } from 'react'
import { Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

export function SavePresetDialog({ presets, current, onSave, onDelete, className }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const trimmed = name.trim()
  const overwrites = presets.some((p) => p.name === trimmed)

  function submit(e) {
    e.preventDefault()
    if (!trimmed) return
    if (onSave(trimmed)) setOpen(false)
    else setError('Could not save: this browser is blocking local storage.')
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setName(current ?? '')
          setError('')
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Save preset" className={className}>
          <Save /> <span className="hidden lg:inline">Save</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Save preset</DialogTitle>
          <DialogDescription>Saved in this browser. Use Copy link to share a patch with someone else.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-xs text-muted-foreground">Name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="My patch"
            />
          </label>
          {overwrites && <p className="text-xs text-muted-foreground">A preset with this name exists and will be replaced.</p>}
          {error && <p className="text-xs text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={!trimmed}>
              {overwrites ? 'Replace' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
        {presets.length > 0 && (
          <div className="space-y-1 border-t border-border pt-3">
            <div className="text-xs text-muted-foreground">My presets</div>
            <ul className="max-h-48 overflow-y-auto">
              {presets.map((p) => (
                <li key={p.name} className="flex items-center justify-between gap-2 py-0.5 text-sm">
                  <span className="truncate">{p.name}</span>
                  <Button variant="ghost" size="icon-xs" aria-label={`Delete ${p.name}`} onClick={() => onDelete(p.name)}>
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
