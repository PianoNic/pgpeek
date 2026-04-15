import { create } from 'zustand'

type State = {
  commandOpen: boolean
  setCommandOpen: (v: boolean) => void
  toggleCommand: () => void
}

export const useUI = create<State>((set) => ({
  commandOpen: false,
  setCommandOpen: (v) => set({ commandOpen: v }),
  toggleCommand: () => set((s) => ({ commandOpen: !s.commandOpen })),
}))
