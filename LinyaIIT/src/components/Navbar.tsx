import { Link, useLocation } from 'react-router-dom';
import { Tv, ShieldCheck, Ticket } from 'lucide-react';
import { ConnectionBadge } from './ConnectionBadge';
import type { RealtimeStatus } from '../types/database';

interface NavbarProps {
  realtimeStatus: RealtimeStatus;
  onRefresh?: () => void;
}

export function Navbar({ realtimeStatus, onRefresh }: NavbarProps) {
  const { pathname } = useLocation();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-maroon-800 text-white shadow-sm transition group-hover:bg-maroon-900">
            <span className="text-lg font-extrabold tracking-tight">L</span>
          </div>
          <div className="leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-extrabold tracking-tight text-slate-900">
                Linya<span className="text-maroon-800">IIT</span>
              </span>
            </div>
            <p className="hidden text-[11px] font-medium text-slate-500 sm:block">
              Smart Campus Queue System
            </p>
          </div>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <ConnectionBadge status={realtimeStatus} onRefresh={onRefresh} />

          <nav className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
            <Link
              to="/"
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                pathname === '/'
                  ? 'bg-white text-maroon-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Ticket className="h-3.5 w-3.5" />
              <span>Student</span>
            </Link>

            <Link
              to="/display"
              className={`hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition sm:inline-flex ${
                pathname === '/display'
                  ? 'bg-white text-maroon-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Tv className="h-3.5 w-3.5" />
              <span>Board</span>
            </Link>

            <Link
              to="/staff"
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                pathname.startsWith('/staff')
                  ? 'bg-white text-maroon-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Staff</span>
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
