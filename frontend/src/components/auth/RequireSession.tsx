import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/useAuthStore';

// Login is temporarily bypassed for a UI preview: anyone can view the staff screens
// without signing in. The hospital store already falls back to a demo staff member
// when there's no session (see src/store/slices/session.ts), so pages render normally.
// To bring login back, delete this block and restore the commented check below.
const LOGIN_DISABLED_FOR_PREVIEW = true;

/** Staff sessions use the HMIS screens; facility sessions only get facility setup. */
export function RequireSession({ kind }: { kind: 'staff' | 'facility' }) {
  const session = useAuthStore((s) => s.session);
  const location = useLocation();

  if (LOGIN_DISABLED_FOR_PREVIEW) return <Outlet />;

  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (session.kind !== kind) return <Navigate to={session.kind === 'facility' ? '/facility-setup' : '/'} replace />;
  return <Outlet />;
}
