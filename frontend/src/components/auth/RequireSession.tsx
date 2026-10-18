import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';

/** Staff sessions use the HMIS screens; facility sessions only get facility setup. */
export function RequireSession({ kind }: { kind: 'staff' | 'facility' }) {
  const session = useAuthStore((s) => s.session);
  const location = useLocation();

  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (session.kind !== kind) return <Navigate to={session.kind === 'facility' ? '/facility-setup' : '/'} replace />;
  return <Outlet />;
}
