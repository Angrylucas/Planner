import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './contexts/auth-context'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppHeader } from './components/AppHeader'
import { LoginPage } from './pages/LoginPage'
import { SignupPage } from './pages/SignupPage'
import { TripsPage } from './pages/TripsPage'
import { TripDetailPage } from './pages/TripDetailPage'
import { EditTripPage } from './pages/EditTripPage'
import { InvitePage } from './pages/InvitePage'
import { SharedTripPage } from './pages/SharedTripPage'

function HomeRedirect() {
  const { user, loading } = useAuth()
  if (loading) return null
  return <Navigate to={user ? '/trips' : '/login'} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="flex min-h-screen flex-col">
          <AppHeader />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<HomeRedirect />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/invite/:token" element={<InvitePage />} />
              <Route path="/shared/:token" element={<SharedTripPage />} />
              <Route
                path="/trips"
                element={
                  <ProtectedRoute>
                    <TripsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/trips/:tripId"
                element={
                  <ProtectedRoute>
                    <TripDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/trips/:tripId/edit"
                element={
                  <ProtectedRoute>
                    <EditTripPage />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AuthProvider>
  )
}
