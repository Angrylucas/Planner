# Wanderly — a Wanderlog-style trip planner

Plan trips collaboratively: build day-by-day itineraries, save places to a map,
invite friends to edit, and share read-only links with anyone.

Built with **Vite + React + TypeScript + Tailwind**, **Supabase** (Auth +
Postgres + RLS + Realtime), and **Leaflet + OpenStreetMap**. Designed to deploy
to **Cloudflare Pages**.

## Features

- Email + password auth (Supabase)
- Multi-day itinerary with drag-and-drop reordering (`@dnd-kit`)
- Saved places with a live Leaflet map (OpenStreetMap tiles)
- Place search powered by Nominatim (OpenStreetMap)
- Collaboration:
  - Invite collaborators by email with editor / viewer roles
  - Public read-only share link (toggle on/off, regenerable)
- Realtime sync — collaborators see updates live
- Per-trip RLS enforced in Postgres

## Local development

```sh
npm install
cp .env.example .env  # then fill in your Supabase URL + anon key
npm run dev
```

## Supabase setup

1. Create a project at https://supabase.com.
2. Open **SQL Editor** → paste the contents of
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) →
   **Run**. This creates all tables, RLS policies, triggers, and adds tables
   to the realtime publication.
3. In **Authentication → Providers**, ensure **Email** is enabled. For local
   testing you can disable email confirmation (Auth → Settings → "Confirm
   email") so signups can log in immediately.
4. Copy your **Project URL** and **anon public key** from
   *Project Settings → API* into `.env`:

   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR-ANON-KEY
   ```

## Deploying to Cloudflare Pages

1. Push this repo to GitHub.
2. In Cloudflare Pages → **Create project** → **Connect to Git** → pick the repo.
3. Build settings:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Build output directory: `dist`
4. Environment variables (Production + Preview):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy. The included `public/_redirects` makes client-side routing work.

## Data model

| Table | Purpose |
| --- | --- |
| `profiles` | Mirrors `auth.users`; auto-created on signup. |
| `trips` | One row per trip. Owner is set on insert; share link fields included. |
| `trip_members` | (trip, user, role). Owner row auto-created via trigger. |
| `trip_invites` | Pending invites by email; consumed at `/invite/:token`. |
| `trip_days` | Days inside a trip; auto-generated from start/end dates. |
| `places` | Saved places with lat/lng (from Nominatim or manual). |
| `itinerary_items` | Items inside a day (ordered by `position`). |

RLS is enforced via SECURITY DEFINER helpers (`is_trip_member`,
`is_trip_editor`, `is_trip_owner`) so policies never cause infinite recursion.

## Routes

- `/login`, `/signup` — auth pages
- `/trips` — list of your trips (owned + collaborated)
- `/trips/:id` — trip detail (itinerary + map + places + share)
- `/trips/:id/edit` — trip metadata
- `/invite/:token` — accept an email invite
- `/shared/:token` — public read-only view (when share is enabled)

## Scripts

```sh
npm run dev       # local dev server
npm run build     # type-check + production build
npm run preview   # serve the built app locally
npm run lint      # ESLint
```

## Notes

- The Nominatim usage policy asks for a custom User-Agent and modest request
  volume. For production, swap to a hosted geocoder (e.g. MapTiler, LocationIQ,
  or Mapbox) or stand up your own Nominatim instance.
- Email delivery for invites is currently link-based: the inviter copies the
  invite URL and shares it. Wire up Supabase Edge Functions + an email
  provider (Resend, Postmark) to send invites automatically.
