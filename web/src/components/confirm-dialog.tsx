import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * A question before something that can't be undone: a native modal <dialog> (focus stays in
 * it, Escape closes it), a panel on its ledge rising over the page, dimmed by `scrim`. With
 * `word`, the confirm button waits until that word is typed, for the few actions that destroy
 * a lot.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  word,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  cancelLabel?: string
  word?: string
  busy?: boolean
  error?: string | null
  onConfirm: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [typed, setTyped] = useState('')
  const titleId = useId()
  const wordId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      setTyped('')
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  const ready = !word || typed.trim().toLowerCase() === word
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) onClose()
      }}
      className="panel m-auto w-[min(480px,calc(100vw-32px))] p-0 text-foreground backdrop:bg-scrim open:animate-sheet"
    >
      <form
        method="dialog"
        className="flex flex-col gap-4 p-7"
        onSubmit={(e) => {
          e.preventDefault()
          if (ready && !busy) onConfirm()
        }}
      >
        <h2 id={titleId} className="font-heading text-2xl font-bold">
          {title}
        </h2>
        <div className="flex flex-col gap-3 text-muted-foreground">{children}</div>
        {word && (
          <label htmlFor={wordId} className="flex flex-col gap-2">
            <span className="font-extrabold">
              Type <span className="font-mono">{word}</span> to confirm
            </span>
            <Input id={wordId} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="mt-1 flex flex-wrap justify-end gap-2.5">
          <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button type="submit" variant="danger" disabled={!ready || busy}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </dialog>
  )
}
