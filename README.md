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

- Submit raffle entries and generate unique numeric-date ticket codes (`STL-YYYYMMDD-######`).
- Require one screenshot proof for each of the three campaign pages before generating a ticket.
- Store proof images outside the public web directory and protect admin/proof APIs with the organizer passcode.
- Review entries and mark them eligible or for review.
- Configure campaign details and an optional authorized campaign link.
- Set entry opening and closing times in Philippines time; the landing page shows a live countdown,
  and the API blocks proof uploads and submissions outside the configured window. With no schedule,
  entries remain open as before.
- Generate Facebook engagement-task links with ticket/username verification, one private screenshot
  proof per task, and per-entry completion counts in the admin dashboard.
- Draw a random eligible winner and export entries as CSV.
- Store full participant details and screenshots in private Supabase Storage buckets; keep only
  ticket, a keyed contact hash, status, and timestamp in the entry table.
- Store engagement-task completion metadata in the `raffle_task_completions` table.
- Store campaign settings and compact draw state in Supabase tables when deployed.
- Keep using local JSON files and proof files during development without Supabase credentials.
- Draw five distinct 5-kg rice winners first, followed by one distinct 25-kg rice winner.

The entry form asks for participant name, contact number, required agent username and supervisor
selection, and three screenshots. Never upload
passwords, authentication codes, or private messages. In production, full participant records are
stored as private JSON objects in the `raffle-entries` bucket, and screenshot proofs are stored in
the private `raffle-proofs` bucket. Database rows keep only raffle indexes and draw metadata. Locally,
records and proofs use files under `data/`. The private Supabase service-role key is used only by the
server and must never be added to client-side variables. Storage buckets have their own quota and
are not unlimited.

## Deploy to Vercel with Supabase

1. Create a Supabase project and open its SQL Editor.
2. Run [`supabase/schema.sql`](./supabase/schema.sql) to create the tables, private entry/proof
   buckets, and atomic raffle draw functions.
3. In the Vercel project settings, add these environment variables for Production (and Preview if
   needed):
   - `SUPABASE_URL` - the Supabase project URL.
   - `SUPABASE_SERVICE_ROLE_KEY` - the project's service-role key; keep it secret.
   - `ADMIN_PASSCODE` - a private organizer passcode of at least 12 characters.
4. Redeploy the project. The Vercel function in `api/` serves the Express API, while Vite serves
   the public site. No Supabase credentials are needed in browser-visible variables.

For an existing project, back up the database, run the updated schema, deploy the new code, and
pause submissions and draws while migrating existing records. With the Supabase URL and service-role
key in a local `.env`, run `npm run migrate:entries`. The command uploads and verifies each full
entry before replacing its database JSON with compact metadata, hashes contact numbers using the
service-role key, and removes participant details from draw history. It can be safely rerun; resolve
any reported missing records before resuming the raffle.

Set `SUPABASE_ENTRIES_BUCKET` or `SUPABASE_PROOFS_BUCKET` only if you change their names in the SQL
setup; defaults are `raffle-entries` and `raffle-proofs`. For an existing Supabase deployment, run
the updated schema before deploying this version; it creates the private completion metadata table.
Do not set only one of `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`. For local development, leave both unset to use the JSON/file store.
Contact hashes are keyed with the service-role key; if you rotate that key, rerun the migration
during maintenance before accepting new entries.

## API

- `GET /api/settings` and `POST /api/settings` - Read/update campaign details and the entry schedule.
- `POST /api/tasks` - Create a Facebook engagement task (organizer only).
- `GET /api/tasks/:taskId` - Read a task for its shared participant link.
- `POST /api/tasks/:taskId/verify` - Verify a ticket number or unique agent username.
- `POST /api/tasks/:taskId/proof` and `/complete` - Upload and record one private task screenshot.
- `POST /api/admin/session` - Verify the configured organizer passcode.
- `GET /api/entries` - List entries and summary counts.
- `POST /api/submit` - Create an entry and ticket.
- `POST /api/proofs/upload` - Upload entry proof images while the entry window is open.
- `POST /api/entries/:ticket/toggle` - Switch an entry between eligible and review.
- `GET /api/draw` and `POST /api/draw` - Read the draw history and select the next distinct winner.
- `GET /api/proofs/:filename` - View a screenshot proof.
- `GET /api/export` - Download an entries CSV.

Organizer-only API requests require the `x-admin-passcode` header. Task links, ticket verification,
task proof submission, and entry submission are public participant endpoints. The admin console is
available at `/admin` and requires the configured organizer passcode. The public participant page
does not display a link to it.
