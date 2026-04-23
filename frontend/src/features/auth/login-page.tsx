import { Navigate } from 'react-router-dom';

import { useAuthStore } from '@/stores/auth-store';

import { LoginForm } from './login-form';

// Si ya hay sesión activa, redirigir al dashboard en vez de mostrar el form.
export function LoginPage(): React.JSX.Element {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (accessToken !== null) {
    return <Navigate to="/" replace />;
  }
  return <LoginForm />;
}
