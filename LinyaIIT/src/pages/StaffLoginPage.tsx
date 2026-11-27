import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ShieldCheck, LogIn, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export function StaffLoginPage() {
  const { user, isAuthorizedStaff, loading, signIn, signOut } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && isAuthorizedStaff) {
      navigate('/staff', { replace: true });
    }
  }, [loading, isAuthorizedStaff, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      await signIn(email, password);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center bg-slate-50 px-4 py-12">
      <div className="mx-auto w-full max-w-md">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-maroon-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Student Queue
        </Link>

        <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-xl sm:p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-maroon-800 text-white shadow-sm">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900">Staff Portal Login</h1>
              <p className="text-xs font-medium text-slate-500">
                LinyaIIT Authorized Queue Operators Only
              </p>
            </div>
          </div>

          {user && !isAuthorizedStaff && !loading && (
            <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-bold">Account not authorized as staff</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-800">
                Signed in as <strong>{user.email}</strong>, but no matching row exists in{' '}
                <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">
                  public.staff_profiles
                </code>
                . Run <code className="font-mono">supabase/seed_staff.sql</code> in Supabase SQL
                Editor to grant access.
              </p>
              <button
                type="button"
                onClick={() => void signOut()}
                className="mt-3 rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-950"
              >
                Sign out & switch account
              </button>
            </div>
          )}

          {formError && (
            <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-800">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="staff-email" className="block text-xs font-bold uppercase tracking-wide text-slate-600">
                Staff Email
              </label>
              <input
                id="staff-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="staff@linyaiit.edu.ph"
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-maroon-700 focus:outline-none focus:ring-2 focus:ring-maroon-700/20"
              />
            </div>

            <div>
              <label htmlFor="staff-password" className="block text-xs font-bold uppercase tracking-wide text-slate-600">
                Password
              </label>
              <input
                id="staff-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-maroon-700 focus:outline-none focus:ring-2 focus:ring-maroon-700/20"
              />
            </div>

            <button
              type="submit"
              disabled={submitting || loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-maroon-800 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-maroon-900 disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Verifying Credentials...
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" />
                  Sign In to Dashboard
                </>
              )}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-500">
            Staff accounts are provisioned by your campus administrator via Supabase Auth.
          </p>
        </div>
      </div>
    </div>
  );
}
