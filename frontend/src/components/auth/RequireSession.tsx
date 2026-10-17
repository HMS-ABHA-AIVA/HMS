import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';

// Login is configurable via VITE_LOGIN_DISABLED_FOR_PREVIEW in development,
// and strictly enforced (always false) in production.
const LOGIN_DISABLED_FOR_PREVIEW =
  import.meta.env.MODE !== 'production' &&
  import.meta.env.VITE_LOGIN_DISABLED_FOR_PREVIEW === 'true';

/** Staff sessions use the HMIS screens; facility sessions only get facility setup. */
export function RequireSession({ kind }: { kind: 'staff' | 'facility' }) {
  const session = useAuthStore((s) => s.session);
  const location = useLocation();

  if (LOGIN_DISABLED_FOR_PREVIEW) return <Outlet />;

  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (session.kind !== kind) return <Navigate to={session.kind === 'facility' ? '/facility-setup' : '/'} replace />;
  return <Outlet />;
}
