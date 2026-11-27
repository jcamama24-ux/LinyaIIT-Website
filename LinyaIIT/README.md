# LinyaIIT — Smart Campus Queue Management MVP

A real-time, multi-device campus queue management system built with **React + TypeScript + Tailwind CSS + Supabase (PostgreSQL, Auth, Realtime, RLS)** — engineered to run **100% FREE with NO credit card required**.

## Features Included

- **Mobile-First Student Interface (`/`)**:
  - Browse open campus service points with live waiting counts, currently serving numbers, and estimated wait times.
  - One-tap atomic ticket generation (`A001`, `A002`, `B001`, etc.) with zero race conditions.
  - Live position tracking, automatic phone wake-up sync, Web Audio chime + vibration alert when called, and safe Leave Queue option.
  - Database-enforced duplicate prevention: one active ticket per student session per day.
- **Authorized Staff Dashboard (`/staff`)**:
  - Secured with Supabase Auth + `staff_profiles` authorization check (random sign-ups cannot access staff controls).
  - Real-time waiting list, **Call Next**, **Mark Completed**, **Skip**, **Re-queue Skipped**, **Pause/Open Counter**, and **Reset Today's Queue** (for clean demos).
  - Keyboard shortcuts (`N` = Call Next, `C` = Complete, `S` = Skip) and live daily statistics.
- **Bonus Hallway Kiosk TV Board (`/display`)**:
  - Full-screen "Now Serving" monitor with an auto-generated QR code students can scan with their phones.

---

## 100% Free Hosting Stack (No Credit Card Required)

| Layer | Free Service | Credit Card Needed? |
|---|---|---|
| PostgreSQL + Auth + Realtime | **Supabase Free Tier** | **No** (Sign in with GitHub/Email) |
| Frontend Hosting + HTTPS | **Vercel Hobby** or **Netlify Free** or **Cloudflare Pages** | **No** |

---

## Step 1: Set Up Supabase (5 Minutes, Free)

1. Go to [https://supabase.com](https://supabase.com) and click **Start your project** (sign in with GitHub — no credit card required).
2. Click **New Project**, name it `LinyaIIT`, set a database password, pick **Southeast Asia (Singapore)** for lowest latency in the Philippines, and click **Create new project**.
3. Once ready, open **SQL Editor** in the left sidebar → click **New query**.
4. Open `supabase/migrations/001_initial_schema.sql`, copy the entire file, paste it into the SQL Editor, and click **Run**.
   - This creates all tables, atomic daily ticket counters (using `Asia/Manila` timezone), RLS policies, secure RPC functions, Realtime publications, and 5 realistic campus offices.
5. Create a Staff login account:
   - Go to **Authentication → Users → Add user → Create new user**.
   - Enter an email (e.g. `staff@linyaiit.edu.ph`), a password, and check **Auto Confirm User**.
   - Open `supabase/seed_staff.sql`, change the email if needed, paste it into **SQL Editor**, and click **Run**.
6. Get your public API credentials:
   - Go to **Project Settings → API**.
   - Copy **Project URL** and **anon / public** key. (NEVER copy or expose `service_role` in frontend code!)

---

## Step 2: Run Locally

Requires Node.js 18+ ([nodejs.org](https://nodejs.org)).

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env
# Edit .env and paste your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# 3. Verify TypeScript + production build
npm run build

# 4. Start development server
npm run dev
```

Open `http://localhost:5173` on your laptop (or `http://<your-local-ip>:5173` on phones connected to the same Wi-Fi).

---

## Step 3: Deploy Free Online (So Any Phone on Mobile Data Can Join)

### Option A: Vercel (Recommended — Fastest, No Credit Card)
1. Push this `LinyaIIT` folder to a free GitHub repository.
2. Go to [https://vercel.com](https://vercel.com) → Sign in with GitHub → **Add New Project** → import your repo.
3. Under **Environment Variables**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Click **Deploy**. You immediately get a free HTTPS URL like `https://linyaiit.vercel.app`.

### Option B: Netlify Drop / Git (No Credit Card)
1. Push to GitHub and connect to [https://app.netlify.com](https://app.netlify.com), add the same two environment variables, and deploy. `public/_redirects` is already included for SPA routing.

---

## Live 3-Device Demo Script

1. On **Laptop**, open `https://your-url/staff`, sign in with your staff email/password, and select **[A] Office of the Registrar** (click **Reset Queue** if you tested earlier so numbering starts cleanly at `A001`).
2. On **Phone 1**, open `https://your-url/` → select **Office of the Registrar** → tap **Join Queue** → receives **`A001`**.
3. On **Phone 2**, open `https://your-url/` → select **Office of the Registrar** → tap **Join Queue** → receives **`A002`**.
4. Verify **Laptop** shows both `A001` and `A002` immediately without refreshing.
5. On **Laptop**, click **Call Next (A001)**.
   - **Phone 1** turns bright green ("It's your turn!"), chimes, and vibrates.
   - **Phone 2** updates live to show `Now Serving: A001` and `Position: #1`.
6. On **Laptop**, click **Mark Completed**.
   - **Phone 1** updates live to show **Service Completed**.
7. On **Laptop**, click **Call Next (A002)**.
   - **Phone 2** turns bright green ("It's your turn!").

---

## Security & Concurrency Architecture

- **No `service_role` key in frontend**: Only `VITE_SUPABASE_ANON_KEY` is shipped to browsers.
- **Row Level Security (RLS)** enabled on every table. Direct `INSERT`/`UPDATE`/`DELETE` on `tickets` and `service_point_counters` are blocked for clients.
- **Atomic Ticket Numbers**: `join_queue()` uses PostgreSQL `INSERT ... ON CONFLICT DO UPDATE` row locks so simultaneous joins never produce duplicate ticket numbers.
- **Tamper-Proof Student Sessions**: The browser generates a random session token, which PostgreSQL hashes with `SHA-256` (`session_token_hash`). Other users watching Realtime cannot spoof or cancel someone else's ticket.
- **Staff Authorization**: Even if someone signs up via Supabase Auth, `is_authorized_staff()` rejects any user who does not have a record in `public.staff_profiles`.
