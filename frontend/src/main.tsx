import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, staleTime: 15_000, retry: 1 },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TooltipProvider delayDuration={200}>
          <App />
        </TooltipProvider>
        <Toaster
          theme="dark"
          richColors
          position="bottom-right"
          toastOptions={{ style: { fontFamily: 'Inter, sans-serif' } }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
