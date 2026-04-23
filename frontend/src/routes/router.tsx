import { createBrowserRouter, Navigate } from 'react-router-dom';

import { AuthShell } from '@/components/shells/auth-shell';
import { DashboardShell } from '@/components/shells/dashboard-shell';
import { LoginPage } from '@/features/auth/login-page';
import { DashboardPage } from '@/features/dashboard/dashboard-page';

import { ProtectedRoute } from './protected-route';

export const router = createBrowserRouter([
  {
    element: <AuthShell />,
    children: [{ path: '/login', element: <LoginPage /> }],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <DashboardShell />,
        children: [{ path: '/', element: <DashboardPage /> }],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
