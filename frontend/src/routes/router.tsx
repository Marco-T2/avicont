import { createBrowserRouter, Navigate } from 'react-router-dom';

import { AuthShell } from '@/components/shells/auth-shell';
import { DashboardShell } from '@/components/shells/dashboard-shell';
import { LoginPage } from '@/features/auth/login-page';
import { RegisterPage } from '@/features/auth/register-page';
import { ComprobanteDetailPage } from '@/features/comprobantes/pages/comprobante-detail-page';
import { ComprobantesPage } from '@/features/comprobantes/pages/comprobantes-page';
import { EditarComprobantePage } from '@/features/comprobantes/pages/editar-comprobante-page';
import { ContactosPage } from '@/features/contactos/pages/contactos-page';
import { DocumentosFisicosPage } from '@/features/documentos-fisicos/pages/documentos-fisicos-page';
import { TiposDocumentoFisicoPage } from '@/features/tipos-documento-fisico/pages/tipos-documento-fisico-page';
import { DashboardPage } from '@/features/dashboard/dashboard-page';
import { AcceptInvitePage } from '@/features/invitations/pages/accept-invite-page';
import { MembersPage } from '@/features/memberships/pages/members-page';
import { PeriodosFiscalesPage } from '@/features/periodos-fiscales/pages/periodos-fiscales-page';
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
          { path: '/comprobantes', element: <ComprobantesPage /> },
          { path: '/comprobantes/nuevo', element: <EditarComprobantePage /> },
          { path: '/comprobantes/:id', element: <ComprobanteDetailPage /> },
          { path: '/comprobantes/:id/editar', element: <EditarComprobantePage /> },
          { path: '/contactos', element: <ContactosPage /> },
          { path: '/tipos-documento-fisico', element: <TiposDocumentoFisicoPage /> },
          { path: '/documentos-fisicos', element: <DocumentosFisicosPage /> },
          { path: '/periodos-fiscales', element: <PeriodosFiscalesPage /> },
          { path: '/settings/members', element: <MembersPage /> },
          { path: '/settings/roles', element: <RolesPage /> },
          { path: '/settings/features', element: <FeaturesPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
