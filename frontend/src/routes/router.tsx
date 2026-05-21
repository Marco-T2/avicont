import { createBrowserRouter, Navigate } from 'react-router-dom';

import { AuthShell } from '@/components/shells/auth-shell';
import { DashboardShell } from '@/components/shells/dashboard-shell';
import { LoginPage } from '@/features/auth/login-page';
import { RegisterPage } from '@/features/auth/register-page';
import { ContactosPage } from '@/features/contactos/pages/contactos-page';
import { DashboardPage } from '@/features/dashboard/dashboard-page';
import { AcceptInvitePage } from '@/features/invitations/pages/accept-invite-page';
import { MembersPage } from '@/features/memberships/pages/members-page';
import { PlanCuentasPage } from '@/features/plan-cuentas/pages/plan-cuentas-page';
import { RolesPage } from '@/features/roles/pages/roles-page';
import { FeaturesPage } from '@/features/tenants/pages/features-page';

import { ProtectedRoute } from './protected-route';

export const router = createBrowserRouter([
  {
    element: <AuthShell />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/accept-invite', element: <AcceptInvitePage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <DashboardShell />,
        children: [
          { path: '/', element: <DashboardPage /> },
          { path: '/plan-cuentas', element: <PlanCuentasPage /> },
          { path: '/contactos', element: <ContactosPage /> },
          { path: '/settings/members', element: <MembersPage /> },
          { path: '/settings/roles', element: <RolesPage /> },
          { path: '/settings/features', element: <FeaturesPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
