import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider, useAuth } from './context/AuthContext';
import { GlobalErrorProvider, publishGlobalError } from './context/GlobalErrorContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { classifyFirestoreError } from './lib/firestore-errors';
import { AppShell } from './components/layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { CreateSmartLinkPage } from './pages/CreateSmartLinkPage';
import { AllLinksPage } from './pages/AllLinksPage';
import { CampaignsPage } from './pages/CampaignsPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { QrCodesPage } from './pages/QrCodesPage';
import { ApplicationsPage } from './pages/ApplicationsPage';
import { SettingsPage } from './pages/SettingsPage';
import { UsersPage } from './pages/UsersPage';
import { ShortRedirectPage } from './pages/ShortRedirectPage';
import { ErrorBoundary } from './components/ErrorBoundary';

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      publishGlobalError(error, 'query');
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      publishGlobalError(error, 'mutation');
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      retry: (failureCount, error) => {
        const classified = classifyFirestoreError(error);
        // Do not retry deterministic permission, auth, quota, or configuration errors
        if (
          classified.category === 'permission' ||
          classified.category === 'auth' ||
          classified.category === 'quota' ||
          classified.category === 'config'
        ) {
          return false;
        }
        return failureCount < 1;
      },
    },
  },
});

function FullPageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAFB] dark:bg-[#090D16]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-blue-600 text-white font-display text-xs font-bold flex items-center justify-center">
          SL
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">Loading SmartLink workspace...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({
  children,
  superAdminOnly = false,
}: {
  children: React.ReactNode;
  superAdminOnly?: boolean;
}) {
  const { profile, loading } = useAuth();

  if (loading) {
    return <FullPageLoader />;
  }

  if (!profile) {
    return <Navigate to="/login" replace />;
  }

  if (superAdminOnly && profile.role !== 'super_admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <AppShell>{children}</AppShell>;
}

function AppRoutes() {
  const { profile, loading } = useAuth();
  const { theme } = useTheme();

  return (
    <>
      <Toaster theme={theme} position="bottom-right" richColors />
      <Routes>
        <Route
          path="/login"
          element={
            loading ? (
              <FullPageLoader />
            ) : profile ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <LoginPage />
            )
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/create"
          element={
            <ProtectedRoute>
              <CreateSmartLinkPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/links"
          element={
            <ProtectedRoute>
              <AllLinksPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/campaigns"
          element={
            <ProtectedRoute>
              <CampaignsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/analytics"
          element={
            <ProtectedRoute>
              <AnalyticsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/qr-codes"
          element={
            <ProtectedRoute>
              <QrCodesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/applications"
          element={
            <ProtectedRoute>
              <ApplicationsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute superAdminOnly>
              <UsersPage />
            </ProtectedRoute>
          }
        />
        <Route path="/r/:shortCode" element={<ShortRedirectPage />} />
        <Route
          path="/"
          element={<Navigate to={profile ? '/dashboard' : '/login'} replace />}
        />
        <Route path="/:shortCode" element={<ShortRedirectPage />} />
        <Route
          path="*"
          element={<Navigate to={profile ? '/dashboard' : '/login'} replace />}
        />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GlobalErrorProvider>
          <ThemeProvider>
            <AuthProvider>
              <BrowserRouter>
                <AppRoutes />
              </BrowserRouter>
            </AuthProvider>
          </ThemeProvider>
        </GlobalErrorProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
