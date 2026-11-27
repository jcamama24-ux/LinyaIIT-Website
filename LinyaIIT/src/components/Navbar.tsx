import { Link, useLocation } from 'react-router-dom';
import { Tv, ShieldCheck, Ticket, Moon, Sun } from 'lucide-react';
import { ConnectionBadge } from './ConnectionBadge';
import { useTheme } from '../lib/theme';
import type { RealtimeStatus } from '../types/database';

interface NavbarProps {
  realtimeStatus: RealtimeStatus;
  onRefresh?: () => void;
}

export function Navbar({ realtimeStatus, onRefresh }: NavbarProps) {
  const { pathname } = useLocation();
  const { isDark, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link to="/" className="group flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-maroon-800 text-white shadow-sm transition group-hover:bg-maroon-900 dark:bg-rose-500 dark:text-slate-950 dark:group-hover:bg-rose-400">
            <span className="text-lg font-extrabold tracking-tight">L</span>
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
                Linya
                <span className="text-maroon-800 dark:text-rose-400">IIT</span>
              </span>
            </div>
            <p className="hidden text-[11px] font-medium text-slate-500 dark:text-slate-400 sm:block">
              Smart Campus Queue System
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-2 sm:gap-2.5">
          <ConnectionBadge status={realtimeStatus} onRefresh={onRefresh} />

          <nav className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            <Link
              to="/"
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                pathname === '/'
                  ? 'bg-white text-maroon-800 shadow-sm dark:bg-slate-950 dark:text-rose-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              <Ticket className="h-3.5 w-3.5" />
              <span>Student</span>
            </Link>

            <Link
              to="/display"
              className={`hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:inline-flex ${
                pathname === '/display'
                  ? 'bg-white text-maroon-800 shadow-sm dark:bg-slate-950 dark:text-rose-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              <Tv className="h-3.5 w-3.5" />
              <span>Board</span>
            </Link>

            <Link
              to="/staff"
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                pathname.startsWith('/staff')
                  ? 'bg-white text-maroon-800 shadow-sm dark:bg-slate-950 dark:text-rose-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Staff</span>
            </Link>
          </nav>

          <button
            type="button"
            onClick={toggleTheme}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-gold-400 dark:hover:bg-slate-700"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </header>
  );
}