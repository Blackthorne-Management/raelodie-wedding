# CLAUDE.md — Ro·dez·vous (Elodie & Rael's wedding site)

Read this first, every session (cloud or desk).

## Who you're working with

Rael is the site owner, not a developer. Talk in plain language: no jargon unless it's explained, no walls of code in chat. After every task, end with a **short recap**: what changed, whether it's live, and anything Rael needs to do. Rael often works from a phone, so keep replies short and lead with the outcome.

## Where things live

| What | Where |
|---|---|
| Code (source of truth) | GitHub `Blackthorne-Management/raelodie-wedding`, branch `main` |
| Live site | Netlify site `joyful-belekoy-9c4744` (team Blackthorne-Management) → https://joyful-belekoy-9c4744.netlify.app |
| How it deploys | **Netlify auto-deploys every push to `main`** (~1 min). No build step: plain HTML/CSS/JS, publish dir = repo root (`netlify.toml`). **Never run `netlify deploy` or deploy from any CLI.** |
| Database, auth, email function | Supabase org "Blackthorne-Management's Org", project "Blackthorne-Management's Project", ref `mawdkpwegsjmdqoagevi` (free plan, 2-project limit: don't create new projects). **Shared project**, see below. |
| Email alerts | Supabase Edge Function `rsvp-notify` (source: `supabase/functions/rsvp-notify/index.ts`) sends via Resend. Secrets `RESEND_API_KEY` and `NOTIFY_EMAIL` live only in Supabase → Edge Functions → Secrets. |
| Backups | Rael's computer pulls GitHub nightly into `D:\Blackthorne Management\Backups\Raelodie Wedding\repo` (read-only mirror: never edit or push from there) |

Blackthorne-Management is Rael's main account for everything (GitHub, Netlify, Supabase). Older accounts (`keepingitrael97` Netlify team, `keepingitrael-dev` GitHub) are legacy: never create anything there.

**The Supabase project is shared with another app** (Rael's homeschool / Azzy site). The wedding owns the `public` schema: tables `households`, `guests`, `rsvps`, `admin_users`, view `rsvp_overview`, and functions `search_guests`, `get_household`, `submit_rsvp`, `admin_rsvp_overview`. The other app lives in the `homeschool` schema, and its migrations (named `homeschool_*`, `azzy_*`, etc.) are in the same migration history. **Never touch the `homeschool` schema or its migrations**, and expect its security-advisor warnings to appear alongside the wedding's. Both apps share Supabase Auth users: the other app has its own sign-ups, which is why being signed in is never enough to read RSVPs. Only users in `public.admin_users` can.

Supabase changes are **not** deployed by pushing to GitHub:
- Schema changes: apply with the Supabase connector's `apply_migration` (name it `wedding_<what>`), **and** save the exact same SQL in the repo as `supabase/migrations/<version>_<name>.sql`, using the version number Supabase assigned (`list_migrations`). The files in `supabase/migrations/` are the wedding's full schema history, verified identical to what's in Supabase as of 2026-10-02. Guest data is never in them; it was loaded separately from the spreadsheets.
- Edge function changes: edit `supabase/functions/rsvp-notify/index.ts` **and** redeploy it with the connector's `deploy_edge_function` (`verify_jwt: false`, which is intentional; see the comment in the file). Keep the repo copy and the deployed copy identical.

## Not on GitHub on purpose

Kept in `D:\Blackthorne Management\Backups\Raelodie Wedding\local-only`:
- `Photos/`: original full-size photos (~380 MB). Only the web-sized copies in `images/gallery/` are committed.
- `.claude/`: local preview config (`launch.json`).

Also never committed: `.netlify/` (local CLI link), and **anything with guest personal data**: the guest-list spreadsheets ("JPR Guest List.xlsx", "JPR Event List.xlsx"), addresses, phone numbers. There is no `.env`: the only key in the code is the Supabase *publishable* key in `js/supabase-config.js`, which is safe to be public. Real secrets stay in Supabase.

## How a change ships

1. `git pull --rebase` first, always.
2. Make the change.
3. Run the checks:
   - `node --check js/*.js` (or each file): no syntax errors
   - `python -m json.tool data/events.json > /dev/null`: valid JSON
   - Search for leftovers: no `console.log`, no test data, no real secrets in the diff
   - Desk only: preview with `python -m http.server 8080` (or the `site` config in `.claude/launch.json`) and click through the changed page
4. Commit with a clear message, then `git push`. Netlify takes it live in about a minute.
5. Check the live URL (fetch the changed page/file and confirm the change is there), then recap for Rael.

For anything risky (RSVP flow, admin page, database), test first: on desk use the local preview; in the cloud, push to a branch and open a PR (Netlify deploy previews for PRs are on by default, but this hasn't been confirmed for this site; if no preview link appears on the PR, say so), and ask Rael to look on the preview before merging.

## Hard rules and product decisions (don't undo)

**RSVP system (Supabase, replaced Netlify Forms; don't go back to Netlify Forms)**
- The guest list lives only in Supabase, never in the repo (`data/guests.json` was deliberately deleted so the invite list isn't public). Only names and event invitations were imported, with no addresses or phones.
- Data model: `households` → `guests` (one row per person, own `events[]`) → `rsvps` (one row per person per event). Searching any named member shows the whole household; each event lists only the members invited to it (e.g. Amanda sees the Rehearsal Dinner, Taion doesn't; Taion sees the Bachelor Shenanigans, Amanda doesn't).
- Plus-ones are `is_plus_one = true`, named "Guest", not searchable; the household can type their name when RSVPing.
- Search: min 3 characters, max 6 results, matches `guests.search_text` (lowercase, no accents, no quotes). Set `search_text` for any guest added by hand.
- Security: all tables have RLS on with **no** policies and no grants to `anon`/`authenticated`. The public site can only call `search_guests`, `get_household`, `submit_rsvp`. The admin page can only call `admin_rsvp_overview`, which checks the `admin_users` table. Never add table grants or open policies; add or change a function instead. After any schema change, run the security advisor and confirm the wedding has only the expected warnings (SECURITY DEFINER functions callable by anon/authenticated, RLS without policies). Ignore warnings about the `homeschool` schema; that's the other app.
- `submit_rsvp` rejects people outside the household and events they aren't invited to; resubmitting updates answers (no duplicates); one alert email per household submission.
- Meal choice (incl. "Kids' meal") is asked per person where the event's `fields` include `mealChoice`; kosher where it includes `kosherMeal` (`data/events.json`). Event display order = key order in `data/events.json`.

**Admin page (`/admin.html`)**
- Not linked from the site; `noindex`. Username **Raelodie** maps to the Supabase Auth account `raelodiehome@gmail.com` (`ADMIN_ACCOUNTS` in `js/admin.js`); only users in `admin_users` can read RSVPs.

**Things Claude never does here**
- Never create accounts, set or type passwords, or enter API keys or secrets anywhere, even if Rael pastes one in chat. Give Rael the exact dashboard steps instead (Supabase → Authentication → Users for logins; Edge Functions → Secrets for keys).
- Never deploy from a CLI; never push to the backup mirror.

**Photos / gallery**
- Original photos are never committed. Web copies: `images/gallery/full/NN.jpg` (max 1600px) and `thumb/NN.jpg` (max 600px), all metadata including GPS stripped, ordered by date taken.
- Slideshow (`js/gallery.js`) builds itself from the grid links in `gallery.html`: add a photo to the grid and it joins the slideshow. 5s rotation, pause on hover/button, no autoplay for reduced-motion users.

**Testing with real data**
- Test RSVPs use `test@example.com` and must be deleted afterwards (delete those `rsvps` rows and reset that household's `email`, `notes`, `responded_at`, `notified_at`). Tests trigger a real alert email, so tell Rael it was a test.

**Site content**
- Placeholders are marked `[TO ADD]`, `[TBD]`, `[XX]` or dashed "placeholder note" boxes (see README). Site contact email: jpr5527@gmail.com.

## What a cloud session can't do (and what to do instead)

| Can't | Instead |
|---|---|
| No `.env` / secrets (none needed in the repo) | Secrets live in Supabase; ask Rael to change them in the dashboard |
| No `Photos/` originals | Ask Rael to upload the new photos to the chat; resize them (Pillow: 1600px + 600px, strip metadata) before committing |
| No local preview / browser pane / `.claude/launch.json` | Push to a branch, open a PR, and use Netlify's deploy preview; or push small safe changes to `main` and check the live URL |
| No real-device testing | Keep layouts phone-first (16px gutters, no sideways scroll) and ask Rael to check on the phone after deploy |
| No Netlify CLI | Not needed: GitHub push = deploy. Netlify dashboard settings (domain, etc.) are Rael's to change |
| Supabase connector may not be connected | If it isn't, don't guess: tell Rael which database or function change is needed and wait for a desk session |

## Open items (as of 2026-10-02)

- Guests with "NEED" as last name (Emma, Giovani, Lisset, Luis, Paulo, Emilia): searchable by first name only until last names arrive. "Emma" has 6 plus-ones, "Paulo & Emilia" 5: confirm.
- Possible typos: "Junior Barons" vs "Florette Baron"; two "Alexa Gratia" in one household.
- Ring Benediction, Disney Bachelorette, Bachelor Shenanigans details are "TBD" in `data/events.json`.
- Photographer credit for the engagement shoot (file was "©-inesaramburo-15") and optional photo captions: waiting on Rael.
- Custom domain `www.rodezvous.com` not yet connected (Netlify dashboard, Rael's account).
- Homepage photos are still placeholder tiles.
