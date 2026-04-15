import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'

export default function AddConnectionDialog({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const qc = useQueryClient()

  const save = async () => {
    if (!name || !url) return
    setBusy(true)
    try {
      await api.addConnection(name, url)
      await qc.invalidateQueries({ queryKey: ['connections'] })
      toast.success(`Connected to ${name}`)
      setOpen(false)
      setName('')
      setUrl('')
    } catch (e) {
      toast.error(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add connection</DialogTitle>
          <DialogDescription>
            Connect to another Postgres instance. Credentials stay in this process's memory.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="conn-name">Name</Label>
            <Input
              id="conn-name"
              placeholder="staging"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="conn-url">Connection URL</Label>
            <Input
              id="conn-url"
              placeholder="postgres://user:pass@host:5432/dbname"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !name || !url}>
            {busy ? 'Connecting…' : 'Connect'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
