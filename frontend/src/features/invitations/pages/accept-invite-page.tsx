import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import {
  Link,
  Navigate,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { backendErrorMessage } from '@/lib/error-messages';
import { useAuthStore } from '@/stores/auth-store';
import type { LoginResponse } from '@/types/api';

import {
  useAcceptAndRegisterInvitation,
  useAcceptInvitation,
  useInvitationPreview,
} from '../hooks/use-invitations';
import {
  type AcceptRegisterFormValues,
  acceptRegisterSchema,
} from '../schemas/accept-register-schema';

function formatFecha(iso: string): string {
  // CLAUDE.md §4.6: timestamps storage en UTC, presentación en America/La_Paz.
  return new Date(iso).toLocaleDateString('es-BO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'America/La_Paz',
  });
}

// Página pública /accept-invite?token=xxx. Se llega desde el link del email.
// Flujo:
// 1) Preview del token → datos de la invitación (org, invitador, email).
// 2a) Si el user está logueado → botón "Aceptar invitación".
// 2b) Si no → form de registro (password + displayName) con email bloqueado
//     proveniente del preview.
// El backend valida match de email en ambos casos.
export function AcceptInvitePage(): React.JSX.Element {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const accessToken = useAuthStore((s) => s.accessToken);

  if (token === null || token.length === 0) {
    return <InvalidLinkCard />;
  }

  return (
    <AcceptInviteCard token={token} isAuthenticated={accessToken !== null} />
  );
}

function InvalidLinkCard(): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-destructive" />
          Link inválido
        </CardTitle>
        <CardDescription>
          Este link no incluye un token de invitación.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button asChild variant="outline" className="w-full">
          <Link to="/login">Ir al inicio de sesión</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

interface AcceptInviteCardProps {
  token: string;
  isAuthenticated: boolean;
}

function AcceptInviteCard({
  token,
  isAuthenticated,
}: AcceptInviteCardProps): React.JSX.Element {
  const preview = useInvitationPreview(token);

  if (preview.isLoading) {
    return (
      <Card>
        <CardContent className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (preview.isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            Invitación no disponible
          </CardTitle>
          <CardDescription>
            {backendErrorMessage(
              preview.error,
              'Esta invitación no existe, expiró o ya fue aceptada.',
            )}
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild variant="outline" className="w-full">
            <Link to="/login">Volver al inicio de sesión</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const data = preview.data;
  if (data === undefined) {
    return <InvalidLinkCard />;
  }

  const invitedByName = data.invitedBy.displayName ?? data.invitedBy.email;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Te invitaron a {data.organization.name}</CardTitle>
          <CardDescription>
            <span className="font-medium">{invitedByName}</span> te invita a
            unirte a <span className="font-medium">{data.organization.name}</span>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between border-b pb-2">
            <span className="text-muted-foreground">Email invitado</span>
            <span className="font-medium">{data.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Expira</span>
            <span className="font-medium">{formatFecha(data.expiresAt)}</span>
          </div>
        </CardContent>
      </Card>

      {isAuthenticated ? (
        <AcceptWithSessionCard token={token} email={data.email} />
      ) : (
        <RegisterAndAcceptCard token={token} email={data.email} />
      )}
    </div>
  );
}

// ----- Aceptación con sesión activa -----

function AcceptWithSessionCard({
  token,
  email,
}: {
  token: string;
  email: string;
}): React.JSX.Element {
  const mutation = useAcceptInvitation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  function handleAccept(): void {
    mutation.mutate(token, {
      onSuccess: () => {
        toast.success('Invitación aceptada — bienvenido a la organización');
        // Reset de todas las queries para recargar /users/me con el nuevo tenant.
        void queryClient.invalidateQueries();
        navigate('/', { replace: true });
      },
      onError: (err) => {
        toast.error(
          backendErrorMessage(err, 'No se pudo aceptar la invitación'),
        );
      },
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Aceptar con tu cuenta</CardTitle>
        <CardDescription>
          Si tu sesión actual es <span className="font-medium">{email}</span>,
          podés aceptar directamente. Si no, cerrá sesión y usá la cuenta
          correcta.
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex flex-col gap-2">
        <Button
          onClick={handleAccept}
          className="w-full"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Aceptando…
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Aceptar invitación
            </>
          )}
        </Button>
        <Button asChild variant="ghost" className="w-full">
          <Link to="/login">Usar otra cuenta</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

// ----- Registro + aceptación (user nuevo) -----

function RegisterAndAcceptCard({
  token,
  email,
}: {
  token: string;
  email: string;
}): React.JSX.Element {
  const registerMutation = useAcceptAndRegisterInvitation();
  const setToken = useAuthStore((s) => s.setToken);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AcceptRegisterFormValues>({
    resolver: zodResolver(acceptRegisterSchema),
    defaultValues: { displayName: '', password: '' },
  });

  async function onSubmit(values: AcceptRegisterFormValues): Promise<void> {
    try {
      await registerMutation.mutateAsync({
        token,
        password: values.password,
        ...(values.displayName !== undefined && values.displayName.length > 0
          ? { displayName: values.displayName }
          : {}),
      });
      // Tras crear la cuenta, login automático para no pedir credenciales.
      const login = await api.post<LoginResponse>('/api/auth/login', {
        email,
        password: values.password,
      });
      setToken(login.data.accessToken);
      void queryClient.invalidateQueries();
      toast.success('Cuenta creada — bienvenido');
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(backendErrorMessage(err, 'No se pudo crear la cuenta'));
    }
  }

  if (registerMutation.isSuccess && !registerMutation.isPending) {
    // Edge: mutateAsync arriba navega en success; este guard evita re-render flicker.
    return <Navigate to="/" replace />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Crear tu cuenta</CardTitle>
        <CardDescription>
          Elegí una contraseña para tu cuenta{' '}
          <span className="font-medium">{email}</span>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            void handleSubmit(onSubmit)(e);
          }}
          className="space-y-4"
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="email-readonly">Email</Label>
            <Input
              id="email-readonly"
              type="email"
              value={email}
              disabled
              readOnly
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="displayName">Tu nombre (opcional)</Label>
            <Input
              id="displayName"
              type="text"
              autoComplete="name"
              placeholder="Juan Pérez"
              aria-invalid={errors.displayName !== undefined}
              {...register('displayName')}
            />
            {errors.displayName !== undefined ? (
              <p className="text-xs text-destructive">
                {errors.displayName.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={errors.password !== undefined}
              {...register('password')}
            />
            {errors.password !== undefined ? (
              <p className="text-xs text-destructive">
                {errors.password.message}
              </p>
            ) : null}
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={registerMutation.isPending}
          >
            {registerMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creando cuenta…
              </>
            ) : (
              'Crear cuenta y aceptar'
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            ¿Ya tenés una cuenta?{' '}
            <Link to="/login" className="underline">
              Iniciar sesión
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
