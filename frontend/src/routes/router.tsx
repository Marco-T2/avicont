import { createBrowserRouter, Navigate } from 'react-router-dom';

import { RequirePermission } from '@/components/shared/require-permission';
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
import { LibroDiarioPage } from '@/features/libro-diario/pages/libro-diario-page';
import { LibroMayorPage } from '@/features/libro-mayor/pages/libro-mayor-page';
import { BalanceGeneralPage } from '@/features/balance-general/pages/balance-general-page';
import { EstadoResultadosPage } from '@/features/estado-resultados/pages/estado-resultados-page';
import { MembersPage } from '@/features/memberships/pages/members-page';
import { PeriodosFiscalesPage } from '@/features/periodos-fiscales/pages/periodos-fiscales-page';
import { PlanCuentasPage } from '@/features/plan-cuentas/pages/plan-cuentas-page';
import { RolesPage } from '@/features/roles/pages/roles-page';
import { FeaturesPage } from '@/features/tenants/pages/features-page';
import { PERMISSIONS } from '@/lib/permissions';

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
          {
            path: '/plan-cuentas',
            element: (
              <RequirePermission permission={PERMISSIONS.contabilidad.planCuentas.read}>
                <PlanCuentasPage />
              </RequirePermission>
            ),
          },
          {
            path: '/comprobantes',
            element: (
              <RequirePermission permission={PERMISSIONS.contabilidad.asientos.read}>
                <ComprobantesPage />
              </RequirePermission>
            ),
          },
          {
            path: '/comprobantes/nuevo',
            element: (
              <RequirePermission permission={PERMISSIONS.contabilidad.asientos.read}>
                <EditarComprobantePage />
              </RequirePermission>
            ),
          },
          {
            path: '/comprobantes/:id',
            element: (
              <RequirePermission permission={PERMISSIONS.contabilidad.asientos.read}>
                <ComprobanteDetailPage />
              </RequirePermission>
            ),
          },
          {
            path: '/comprobantes/:id/editar',
            element: (
              <RequirePermission permission={PERMISSIONS.contabilidad.asientos.read}>
                <EditarComprobantePage />
              </RequirePermission>
            ),
          },
          {
            path: '/libros/diario',
            element: (
              <RequirePermission permission={PERMISSIONS.contabilidad.libroDiario.read}>
                <LibroDiarioPage />
              </RequirePermission>
            ),
          },
          {
            path: '/libros/mayor',
            element: (
              <RequirePermission permission={PERMISSIONS.contabilidad.libroMayor.read}>
                <LibroMayorPage />
              </RequirePermission>
            ),
          },
          {
            path: '/eeff/balance',
            element: (
              <RequirePermission permission={PERMISSIONS.contabilidad.eeff.read}>
                <BalanceGeneralPage />
              </RequirePermission>
            ),
          },
          {
            path: '/eeff/resultados',
            element: (
              <RequirePermission permission={PERMISSIONS.contabilidad.eeff.read}>
                <EstadoResultadosPage />
              </RequirePermission>
            ),
          },
          {
            path: '/contactos',
            element: (
              <RequirePermission permission={PERMISSIONS.contabilidad.contactos.read}>
                <ContactosPage />
              </RequirePermission>
            ),
          },
          {
            path: '/tipos-documento-fisico',
            element: (
              <RequirePermission permission={PERMISSIONS.contabilidad.tiposDocumento.read}>
                <TiposDocumentoFisicoPage />
              </RequirePermission>
            ),
          },
          {
            path: '/documentos-fisicos',
            element: (
              <RequirePermission permission={PERMISSIONS.contabilidad.documentosFisicos.read}>
                <DocumentosFisicosPage />
              </RequirePermission>
            ),
          },
          {
            path: '/periodos-fiscales',
            element: (
              <RequirePermission permission={PERMISSIONS.contabilidad.periodos.read}>
                <PeriodosFiscalesPage />
              </RequirePermission>
            ),
          },
          {
            path: '/settings/members',
            element: (
              <RequirePermission permission={PERMISSIONS.organizacion.miembros.read}>
                <MembersPage />
              </RequirePermission>
            ),
          },
          {
            path: '/settings/roles',
            element: (
              <RequirePermission permission={PERMISSIONS.organizacion.roles.read}>
                <RolesPage />
              </RequirePermission>
            ),
          },
          {
            path: '/settings/features',
            element: (
              <RequirePermission permission={PERMISSIONS.organizacion.features.read}>
                <FeaturesPage />
              </RequirePermission>
            ),
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);
