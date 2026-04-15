import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from '@/components/Layout'
import HomePage from '@/pages/HomePage'
import TablePage from '@/pages/TablePage'
import QueryPage from '@/pages/QueryPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="/c/:connId" element={<HomePage />} />
        <Route path="/c/:connId/t/:schema/:table" element={<TablePage />} />
        <Route path="/c/:connId/query" element={<QueryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
