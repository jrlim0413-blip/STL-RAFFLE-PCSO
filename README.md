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

The Express API runs on `http://localhost:3000`. To build the frontend, run `npm run build`.
Set `ADMIN_PASSCODE` in the deployment platform's secret environment configuration before deploying.

The public participant landing page is `/`. The admin console is available directly at `/admin`;
there is no admin link or operations tab on the landing page.

## Features

- Submit raffle entries and generate unique ticket codes.
- Require one screenshot proof for each of the three campaign pages before generating a ticket.
- Store proof images outside the public web directory and protect admin/proof APIs with the organizer passcode.
- Review entries and mark them eligible or for review.
- Configure campaign details and an optional authorized campaign link.
- Draw a random eligible winner and export entries as CSV.
- Store campaign settings and entries in JSON files under `data/`.
- Draw five distinct 5-kg rice winners first, followed by one distinct 25-kg rice winner.

The entry form asks for participant name, contact number, and three screenshots. Never upload
passwords, authentication codes, or private messages. Screenshot proofs are stored in `data/proofs/`,
which is excluded from Git.

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
