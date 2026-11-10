# GearHub — GitHub + Vercel deployment

## Before uploading

- Do not upload `.env.local` or any file containing a Supabase secret/service-role key.
- `.env.example` is safe to commit; replace placeholder values only in Vercel Environment Variables.
- This project is Vite + Supabase JS.

## Upload to the existing GitHub repository

Repository: https://github.com/trx333bladd/gearhub

1. Extract this project folder.
2. Open the repository on GitHub and choose **Add file → Upload files**.
3. Upload the *contents* of this folder (including `index.html`, `app.js`, `style.css`, `package.json`, `public/`, and `fonts/`). Do not upload `.env.local`.
4. Commit to the `main` branch.

## Deploy on Vercel

1. Open https://vercel.com/new and import `trx333bladd/gearhub`.
2. Framework preset: `Vite`.
3. Root directory: `./`.
4. Build command: `npm run build`.
5. Output directory: `dist`.
6. Add these environment variables to both Preview and Production:
   - `VITE_SUPABASE_URL` = `https://exgpuvbijdvciqkjibhz.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = the project's publishable key from Supabase → Project Settings → API Keys.
7. Deploy.

## Supabase Auth redirect URLs

After Vercel assigns the production domain, add the following in Supabase → Authentication → URL Configuration:

- Site URL: `https://YOUR-PROJECT.vercel.app`
- Redirect URL: `https://YOUR-PROJECT.vercel.app/**`
- Keep `http://localhost:5173/**` for local testing.

The frontend must use only the Supabase publishable key. Never place a `service_role` or secret key in Vercel variables prefixed with `VITE_` or in browser code.
