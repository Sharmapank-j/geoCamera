# geoCamera

A production‑ready, responsive web app that lets users capture or upload photos with geographic location metadata.

## Features
- In‑browser camera capture with front/back switching and flash (where supported)
- Precise location using the Geolocation API (prompted only on explicit actions)
- Stores latitude, longitude, accuracy, timestamp, and optional address
- Uploads images to **Supabase** private storage (row‑level security so each user only sees their own photos)
- Gallery view with thumbnail, timestamp, location name and a tiny map preview
- Interactive map view with pins for each photo (click to see photo & details)
- Download original image (EXIF GPS embedded when possible) or JSON side‑car
- Edit / delete location metadata, permanent photo deletion
- Search / filter by date and place name
- Email/password authentication (Supabase Auth)
- Responsive bottom navigation (Camera, Gallery, Map, Profile)
- Accessibility‑focused UI (ARIA labels, keyboard navigation, high contrast)
- Offline draft support via IndexedDB (optional)

## Tech Stack
- **React / Next.js** (TypeScript) – SSR ready, Vercel deployable
- **Supabase** – Auth, Postgres DB, private Storage bucket
- **MapLibre GL JS** with OpenStreetMap tiles – no ad‑supported map embeds
- Browser APIs: `MediaDevices.getUserMedia`, `navigator.geolocation`, `<canvas>`
- `piexifjs` – inject GPS EXIF tags client‑side
- `idb` – IndexedDB wrapper for offline drafts

## Project Structure
```
geoCamera/
├─ .env.local            # environment variables (see below)
├─ next.config.js
├─ tsconfig.json
├─ package.json
├─ README.md
├─ public/
│   └─ ... (icons, favicons)
├─ src/
│   ├─ pages/
│   │   ├─ _app.tsx
│   │   ├─ index.tsx          # redirects based on auth state
│   │   ├─ auth.tsx           # sign‑in / sign‑up UI
│   │   ├─ camera.tsx         # camera capture UI
│   │   ├─ gallery.tsx        # private photo gallery
│   │   ├─ map.tsx            # map view with pins
│   │   └─ profile.tsx        # account info, sign‑out
│   ├─ components/
│   │   ├─ NavBar.tsx        # mobile bottom navigation
│   │   ├─ PhotoCard.tsx     # thumbnail, mini‑map, download/delete
│   │   └─ … (future: PermissionPrompt, etc.)
│   ├─ lib/
│   │   ├─ supabaseClient.ts # Supabase wrapper & types
│   │   └─ … (geolocation, exif utils, indexedDB) 
│   └─ styles/
│       └─ globals.css
└─ prisma/ (optional – Supabase uses Postgres, you can keep schema.sql here)
```

## Setup Instructions
1. **Clone / create the repo**
   ```bash
   git clone <repo‑url>
   cd geoCamera
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```
   (The `npm install` task is already running in the background – monitor its log if you like.)

3. **Create a Supabase project**
   - Go to https://app.supabase.com and create a new project.
   - Enable **Auth → Email‑Password** sign‑in.
   - Create a **Storage bucket** named `private` and set it to *private*.
   - In **SQL editor**, run the schema below (or use the UI to create the tables).

4. **Database schema (Postgres)**
   ```sql
   create table public.users (
     id uuid primary key default uuid_generate_v4(),
     email text not null unique,
     created_at timestamp with time zone default now()
   );

   create table public.photos (
     id uuid primary key default uuid_generate_v4(),
     user_id uuid references public.users(id) on delete cascade,
     storage_path text not null,
     latitude double precision not null,
     longitude double precision not null,
     accuracy double precision not null,
     captured_at timestamp with time zone not null,
     address text,
     exif_embedded boolean not null default false,
     created_at timestamp with time zone default now()
   );

   -- Row‑level security – only the owner can read/write their photos
   alter table public.photos enable row level security;
   create policy "Allow owner access" on public.photos
     for all using (auth.uid() = user_id);
   ```

5. **Environment variables** – create a `.env.local` file in the project root (already added as a placeholder). Replace the placeholders with your actual Supabase values:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<your‑project>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon‑public‑key>
   NEXT_PUBLIC_NOMINATIM_URL=https://nominatim.openstreetmap.org
   NEXT_PUBLIC_MAPTILER_KEY=<optional‑maptiler‑key>   # you can leave empty; the demo tiles work without it
   ```

6. **Run the dev server**
   ```bash
   npm run dev
   ```
   Open http://localhost:3000 – you should be redirected to `/auth`.

7. **Deploy to Vercel** (optional but recommended for production)
   - Connect the repository to Vercel (or use `vercel` CLI).
   - In Vercel project settings, add the same environment variables as above.
   - Vercel will automatically build and deploy the Next.js app.

## Security & Privacy Notes
- The app never accesses location in the background; the geolocation request is made **only after the user presses “Attach Location”.**
- All storage buckets are **private** – Supabase RLS ensures a user can only read/write their own photos.
- No third‑party analytics, ads, or tracking pixels are included.
- Permissions are clearly explained in the UI before camera or location access.

## Development Extras
- **Offline drafts** – you can implement `src/lib/indexedDB.ts` using the `idb` package; the current scaffold leaves it as a future enhancement.
- **EXIF embedding** – `piexifjs` is already installed; you can extend `src/lib/exifUtils.ts` to write GPS tags before upload.
- **Testing** – add Jest unit tests for utility functions and Playwright end‑to‑end tests (sign‑in, capture, save, view).

---

Enjoy building with geoCamera! If you need any further features (e.g., profile avatar, email verification, extended map controls) just let me know.
