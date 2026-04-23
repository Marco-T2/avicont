import { Outlet } from 'react-router-dom';

// Layout usado por rutas de autenticación (/login y futuros /register,
// /forgot-password). Card centrada sobre fondo muted, sin sidebar ni topbar.
export function AuthShell(): React.JSX.Element {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Avicont</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Sistema contable para avicultores bolivianos
          </p>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
