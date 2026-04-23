import { Outlet } from 'react-router-dom';

import { AppSidebar } from '@/components/app-sidebar';
import { Topbar } from '@/components/topbar';

// Layout de rutas autenticadas: sidebar fija a la izquierda, topbar arriba,
// scroll único en el main (evita conflictos cuando haya tablas largas).
export function DashboardShell(): React.JSX.Element {
  return (
    <div className="flex h-screen bg-background">
      <AppSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
