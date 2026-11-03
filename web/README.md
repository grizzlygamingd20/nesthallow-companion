# Grove Naturalist (Project Acorn, Naturalist M1)

The Keeper and Nesthallow's private field journal. This folder is a Next.js web app that
lives beside the pendant app and never touches it: `backend/` (the voice) and `android/`
(the companion app) are unchanged, and changes here don't trigger APK builds.

**M1 is the foundation only:** sign-in, the database with its integrity rules, and private
photo storage. The expedition journal screens arrive in M2.

## What's protected, and where

| Rule | Enforced by |
| --- | --- |
| Only the Keeper can sign in | Google sign-in, allowed for `KEEPER_EMAIL` only, checked on every page and API route |
| Original field notes are write-once | Database trigger |
| Identifications, observation notes, research notes and sources are append-only (corrections are new rows) | Database triggers |
| Real records are never deleted; only sample data can be purged | Database triggers + `purge_sample_data()` |
| An AI author can't record a direct field observation | Database check |
| Locations are private by default | `location_public` defaults to false; nothing is public in V1 |
| Photo originals keep their metadata, privately; display copies have none | Private Blob store; `lib/media.ts` strips all metadata from display copies |
| A photo's original and hash never change | Database trigger |

## One-time setup (about 20 minutes)

You'll make one new Vercel project and connect three things to it. Steps 1–4 can be done in any order.

### 1. Create the Vercel project

1. In Vercel: **Add New → Project**, import `nesthallow-companion`.
2. Set **Root Directory** to `web`. The framework is detected as Next.js.
3. Name it something like `grove-naturalist`. This is a new project, separate from the
   voice backend and from the Tavern.
4. **No production yet:** in **Settings → Git**, set the **Production Branch** to
   `naturalist-production` (a branch that doesn't exist). Branches then deploy as previews
   only, and nothing reaches production until you create that branch.

### 2. Connect the database (Neon)

In the project: **Storage → Create Database → Neon (Postgres)**, then connect it to the
project for **Preview** (and Development if you like). This adds `DATABASE_URL`. The schema is
created automatically on the next deployment.

### 3. Connect private photo storage (Vercel Blob)

**Storage → Create → Blob**, and set access to **Private**. Connect it to the project. This
adds `BLOB_READ_WRITE_TOKEN`. Don't choose Public: public blobs can be opened by anyone with the link.

### 4. Set up Google sign-in

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a project
   (e.g. "Grove Naturalist").
2. **APIs & Services → OAuth consent screen:** choose **External**, fill in the app name
   and your email, and under **Test users** add your own Google address. Leave it in
   Testing mode; only listed test users can ever sign in.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type **Web application**.
4. Under **Authorized redirect URIs**, add the callback for the branch's preview address:
   `https://<project>-git-naturalist-m1-foundation-<your-vercel-name>.vercel.app/api/auth/callback/google`
   (Vercel shows the branch address on the deployment page; copy it from there and add
   `/api/auth/callback/google`.) Add one per branch you want to sign in on.
5. Copy the **Client ID** and **Client secret**.

### 5. Environment variables

In **Settings → Environment Variables**, for **Preview**:

| Name | Value |
| --- | --- |
| `KEEPER_EMAIL` | Your Google email. Only this address can sign in. |
| `AUTH_SECRET` | A long random string. Make one at https://generate-secret.vercel.app/32 or with `openssl rand -base64 33` |
| `AUTH_GOOGLE_ID` | The Client ID from step 4 |
| `AUTH_GOOGLE_SECRET` | The Client secret from step 4 |

`DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` were added in steps 2 and 3. Never paste these
values into GitHub or chat.

### 6. Deploy and check

Redeploy the `naturalist/m1-foundation` branch. Open its address on your phone, tap
**Sign in with Google**, and the **Foundation check** card should show the database and photo
storage as connected. Any other Google account is turned away.

## Working on it locally

```bash
cd web
npm install
npm run dev          # needs the env vars above in web/.env.local (git-ignored)
npm run typecheck
npm test             # unit tests; add TEST_DATABASE_URL for the database rules
```

`TEST_DATABASE_URL` must point at an **empty throwaway** Postgres database: the integrity
tests drop and recreate its schema. Never point it at the real archive.

## API (M1)

All routes require the Keeper's sign-in.

| Route | Does |
| --- | --- |
| `GET /api/v1/health` | Reports whether the database and photo storage are connected |
| `POST /api/v1/media/upload` | Issues a short-lived token so the browser can upload one original photo (JPEG, PNG or WebP, up to 25 MB) straight to private storage |
| `POST /api/v1/media` | Registers an uploaded original: hashes it, makes the metadata-free display copy, links it to an observation or expedition |
| `GET /api/v1/media/:id` | The display copy. Add `?original=1` for the untouched original |

## Artwork

Nesthallow's luna moth goes in `components/ArtworkSlot.tsx`: put the file in `public/art/`
and set `ARTWORK_SRC`. Until then a placeholder moth shows.
