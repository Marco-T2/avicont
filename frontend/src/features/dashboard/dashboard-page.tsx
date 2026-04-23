import { ArrowRight, BookOpen, Building2, Settings } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useAuthStore } from '@/stores/auth-store';

// Dashboard home — espejo del layout de avicont-ia: banner de org, h1 grande,
// grid de 3 cards con placeholders. Los números reales llegan cuando tengamos
// los endpoints GET /api/cuentas, /api/organizations, etc. conectados.
export function DashboardPage(): React.JSX.Element {
  const user = useAuthStore((s) => s.user);
  const activeRole = user?.roles[0] ?? '—';

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Banner org + rol — en mobile el Badge se apila abajo para no chocar
          con el texto truncado de la org cuando el nombre es largo. */}
      <div className="rounded-lg border bg-card px-4 py-3.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-medium leading-none truncate">
              Sin organización seleccionada
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Espacio de trabajo
            </p>
          </div>
          <Badge variant="outline" className="self-start px-2 py-0.5 text-xs sm:self-auto">
            {activeRole}
          </Badge>
        </div>
      </div>

      <div>
        <h1 className="text-2xl md:text-3xl font-bold break-all md:break-normal">
          Hola, {user?.email ?? 'usuario'}
        </h1>
        <p className="text-sm md:text-base text-muted-foreground">
          Bienvenido a tu espacio de trabajo
        </p>
      </div>

      <div className="grid gap-4 md:gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              Organizaciones
            </CardTitle>
            <CardDescription>A las que perteneces</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">—</div>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              disabled
              title="Disponible cuando se conecte GET /api/memberships"
            >
              Ver organizaciones
              <ArrowRight className="ml-2 h-3 w-3" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-muted-foreground" />
              Plan de cuentas
            </CardTitle>
            <CardDescription>Cuentas activas del tenant</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">—</div>
            <Button variant="ghost" size="sm" className="mt-2" disabled>
              Ver plan de cuentas
              <ArrowRight className="ml-2 h-3 w-3" />
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings className="h-5 w-5 text-muted-foreground" />
              Configuración contable
            </CardTitle>
            <CardDescription>Conceptos mapeados</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">—</div>
            <Button variant="ghost" size="sm" className="mt-2" disabled>
              Ver configuración
              <ArrowRight className="ml-2 h-3 w-3" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
