# Ro·dez·vous — Elodie & Rael's Wedding Site

Plain HTML/CSS/JS static site (no build step needed). Deploys straight to Netlify from a GitHub repo.

## Structure

```
index.html            Home — hero, countdown, weekend schedule
travel.html            Hotel booking, flights, rideshare, parking
things-to-do.html      Activities, restaurants, family stuff, synagogues
dream-team.html        Wedding party
faq.html                Q&A
gallery.html            "Our Journey in Pics" animated photo gallery
rsvp.html                Name lookup + per-event RSVP form (Supabase)
registry.html            Zola registry link
admin.html               RSVP admin: totals per event, full list, CSV download (not linked from the site)

css/style.css           All styling (colors, fonts, layout)
js/main.js               Nav toggle, countdown timer, gallery scroll-reveal
js/rsvp.js                RSVP name lookup + dynamic form + submission
js/admin.js               Admin sign-in + RSVP dashboard
js/supabase-config.js     Supabase URL + public key (shared by both)
supabase/functions/       rsvp-notify: emails an alert on each RSVP (deployed to Supabase)

data/events.json          Event details (date, dress code, which form fields to ask)

design-reference/          Your original mood board / inspiration screenshots (not part of the live site)
images/gallery/             Drop real "Our Journey" photos here
images/team/                 Drop wedding party photos here
```

## What's still a placeholder

Search the site for `[TO ADD]`, `[TBD]`, `[XX]`, or the dashed orange "placeholder note" boxes. Known items:

- **Ceremony/reception exact time** — update `WEDDING_DATETIME` in `js/main.js` (drives the countdown) and the `timeLabel` fields in `data/events.json`.
- **Room block / group booking link and code** for The Grove Resort — call 407-734-0609 or email Sales@groveresortorlando.com.
- **Parking rate per night** at The Grove.
- **Wedding party names, roles, photos, and contact info** — `dream-team.html`.
- **Real photos** for the homepage and `gallery.html` — currently placeholder tiles.
- **Full weekend schedule** beyond Welcome Reception + Wedding Ceremony & Reception (rehearsal dinner, bachelor/bachelorette, ring benediction, kosher brunch times/locations) — update `data/events.json`.

## Guest list & RSVP

The guest list and RSVPs live in Supabase (Blackthorne-Management's Org → project `mawdkpwegsjmdqoagevi`), not in this repo, so the invite list isn't publicly downloadable.

- **`guests`** — who's invited to what. Add/edit rows in the Supabase Table Editor. `name` is what guests type to find themselves; `events` is a list of event keys, e.g. `{welcome-reception,wedding-reception}`. Keys must match `data/events.json`. Currently only 3 demo guests (Elodie, Rael, sample guest "Karla Colley") — **replace with the real guest list** before sharing the site.
- **`rsvps`** — one row per guest per event. Resubmitting updates the existing row instead of duplicating.
- **`rsvp_overview`** — every invite with its response (`yes` / `no` / `no response`), meal choice, notes, etc. Use this view for headcounts; export to CSV from the Table Editor.

The site's public key can only call three database functions (`search_guests`, `get_guest_events`, `submit_rsvp`); it can't read the tables. Name search needs at least 3 characters and returns at most 6 matches. RSVPs work locally too, as long as the page is served over http (not opened as a file).

### Admin page & email alerts

`/admin.html` shows totals per event (yes / no / waiting, meal counts, kosher, kids' meals), the full RSVP list, and a CSV download. Sign-in uses Supabase Auth: the username `Raelodie` maps to the account `raelodie@rodezvous.com` (see `ADMIN_ACCOUNTS` in `js/admin.js`), and only accounts listed in the `admin_users` table can read RSVPs.

Each RSVP calls the `rsvp-notify` Edge Function, which emails a summary. It stays silent until these Edge Function secrets are set in Supabase: `RESEND_API_KEY` (from resend.com) and `NOTIFY_EMAIL` (where alerts go).

## Deploying

1. Push this folder to a GitHub repo.
2. In Netlify: **Add new site → Import an existing project → GitHub**, pick the repo.
3. Build command: leave blank. Publish directory: `.` (repo root).
4. Deploy. (No Netlify Forms setup needed — RSVPs go to Supabase.)
5. Point your domain (`www.rodezvous.com`) at the Netlify site under **Domain management**.

## Fonts & palette

- Headers/titles: `Mea Culpa` (cursive, legible)
- Names/hero accents: `Alex Brush` (full script)
- Body text: `Quicksand` (rounded, friendly, non-cursive)
- Colors pulled from the Pantone mood board in `design-reference/IMG_2102.PNG` — see CSS custom properties at the top of `css/style.css` to adjust.
