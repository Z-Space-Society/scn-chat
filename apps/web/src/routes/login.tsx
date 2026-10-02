import { createFileRoute, Navigate } from '@tanstack/react-router'
import { LoginPage } from '../pages/LoginPage.tsx'
import { useSession } from '../session.tsx'

export const Route = createFileRoute('/login')({ component: Login })

function Login() {
  if (useSession().state === 'signed-in') return <Navigate to="/" replace />
  return <LoginPage />
}
