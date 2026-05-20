import { Navigate } from 'react-router-dom';

import { useAuthStore } from '@/stores/auth-store';

import { RegisterForm } from './register-form';

// Si ya hay sesión activa, redirigir al dashboard en vez de mostrar el form.
export function RegisterPage(): React.JSX.Element {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (accessToken !== null) {
    return <Navigate to="/" replace />;
  }
  return <RegisterForm />;
}
