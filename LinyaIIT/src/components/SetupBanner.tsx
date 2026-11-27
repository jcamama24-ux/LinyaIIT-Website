import { AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react';

export function SetupBanner() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <div className="rounded-3xl border border-amber-200 bg-white p-6 shadow-xl sm:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-maroon-800 text-white shadow-sm">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <span className="inline-block rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
              100% Free — No Credit Card Required
            </span>
            <h1 className="mt-1 text-xl font-extrabold text-slate-900 sm:text-2xl">
              Connect Your Free Supabase Backend
            </h1>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          LinyaIIT requires a live Supabase PostgreSQL database so multiple student phones and
          staff laptops stay synchronized in real time. No credentials were found in{' '}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-maroon-800">
            .env
          </code>
          .
        </p>

        <ol className="mt-6 space-y-3 text-sm text-slate-700">
          <li className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-maroon-700" />
            <span>
              Create a free project at{' '}
              <a
                href="https://supabase.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-maroon-800 underline"
              >
                supabase.com <ExternalLink className="h-3 w-3" />
              </a>{' '}
              (sign in with GitHub — no credit card needed).
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-maroon-700" />
            <span>
              Open <strong>SQL Editor</strong> and run{' '}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
                supabase/migrations/001_initial_schema.sql
              </code>
              .
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-maroon-700" />
            <span>
              Copy <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">.env.example</code> to{' '}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">.env</code> and paste your{' '}
              <strong>Project URL</strong> and <strong>anon public key</strong> from{' '}
              <em>Project Settings → API</em>.
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-maroon-700" />
            <span>
              Restart the dev server (<code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">npm run dev</code>).
            </span>
          </li>
        </ol>

        <div className="mt-6 rounded-xl bg-slate-900 p-4 font-mono text-xs text-slate-100">
          <div>VITE_SUPABASE_URL=https://your-project-id.supabase.co</div>
          <div>VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...</div>
        </div>
      </div>
    </div>
  );
}
