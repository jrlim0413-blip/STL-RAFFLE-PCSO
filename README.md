# Raffle Campaign Manager

A generic raffle entry and administration app built with React, Vite, Tailwind CSS, and Express.
It is not affiliated with any government agency or social platform and does not provide social
media login.

## Run locally

1. Install dependencies with `npm install`.
2. Set a private organizer passcode of at least 12 characters in the `ADMIN_PASSCODE` environment variable.
   In PowerShell, replace the placeholder with your own secret: `$env:ADMIN_PASSCODE = '<your-private-passcode>'`.
3. Start the frontend and API with `npm run dev`.
4. Open the Vite URL shown in the terminal (usually `http://localhost:5173`).

The Express API runs on `http://localhost:3000`. Without Supabase variables, local data and proofs
are stored under `data/`. To build the frontend, run `npm run build`.
The backend loads `.env` at the project root or `src/.env` for local development. Use
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` there for Supabase; keep the service-role key private
and do not use a `VITE_` prefix.

The public participant landing page is `/`. The admin console is available directly at `/admin`;
there is no admin link or operations tab on the landing page.

## Features

- Submit raffle entries and generate unique ticket codes.
- Require one screenshot proof for each of the three campaign pages before generating a ticket.
- Store proof images outside the public web directory and protect admin/proof APIs with the organizer passcode.
- Review entries and mark them eligible or for review.
- Configure campaign details and an optional authorized campaign link.
- Draw a random eligible winner and export entries as CSV.
- Store campaign settings, entries, draw state, and private proofs in Supabase when deployed.
- Keep using local JSON files and proof files during development without Supabase credentials.
- Draw five distinct 5-kg rice winners first, followed by one distinct 25-kg rice winner.

The entry form asks for participant name, contact number, and three screenshots. Never upload
passwords, authentication codes, or private messages. Screenshot proofs are uploaded individually and are stored in the private `raffle-proofs` Supabase
bucket in production, or `data/proofs/` locally. The private Supabase service-role key is used only
by the server and must never be added to client-side variables.

## Deploy to Vercel with Supabase

1. Create a Supabase project and open its SQL Editor.
2. Run [`supabase/schema.sql`](./supabase/schema.sql) to create the tables, private proof bucket,
   and atomic raffle draw functions.
3. In the Vercel project settings, add these environment variables for Production (and Preview if
   needed):
   - `SUPABASE_URL` - the Supabase project URL.
   - `SUPABASE_SERVICE_ROLE_KEY` - the project's service-role key; keep it secret.
   - `ADMIN_PASSCODE` - a private organizer passcode of at least 12 characters.
4. Redeploy the project. The Vercel function in `api/` serves the Express API, while Vite serves
   the public site. No Supabase credentials are needed in browser-visible variables.

Set `SUPABASE_PROOFS_BUCKET` only if you change the bucket name in the SQL setup; the default is
`raffle-proofs`. Do not set only one of `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
For local development, leave both unset to use the JSON/file store.

## API

- `GET /api/settings` and `POST /api/settings` - Read/update campaign details.
- `POST /api/admin/session` - Verify the configured organizer passcode.
- `GET /api/entries` - List entries and summary counts.
- `POST /api/submit` - Create an entry and ticket.
- `POST /api/entries/:ticket/toggle` - Switch an entry between eligible and review.
- `GET /api/draw` and `POST /api/draw` - Read the draw history and select the next distinct winner.
- `GET /api/proofs/:filename` - View a screenshot proof.
- `GET /api/export` - Download an entries CSV.

Except for public settings and entry submission, admin API requests require the
`x-admin-passcode` header. The admin console is available at `/admin` and requires the configured
organizer passcode. The public participant page does not display a link to it.
