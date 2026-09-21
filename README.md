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
rsvp.html                Name lookup + per-event RSVP form (Netlify Forms)
registry.html            Zola registry link

css/style.css           All styling (colors, fonts, layout)
js/main.js               Nav toggle, countdown timer, gallery scroll-reveal
js/rsvp.js                RSVP name lookup + dynamic form + submission

data/events.json          Event details (date, dress code, which form fields to ask)
data/guests.json           Guest list -> which events each guest is invited to

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

`data/guests.json` is the source of truth for who's invited to what. Each entry:

```json
{ "name": "Full Name", "events": ["welcome-reception", "wedding-reception"] }
```

Event keys must match the keys in `data/events.json`. Currently only 3 demo guests are in the file (Elodie, Rael, and a sample guest "Karla Colley") — **replace this with your real guest list** before sharing the site.

RSVP submissions are collected via [Netlify Forms](https://docs.netlify.com/manage/forms/setup/) — no backend needed, but the form only works once the site is deployed on Netlify (it won't capture submissions when opened locally as a file). Responses show up in your Netlify site dashboard under **Forms**, and can be set to email you on each new submission (Site settings → Forms → Form notifications).

## Deploying

1. Push this folder to a GitHub repo.
2. In Netlify: **Add new site → Import an existing project → GitHub**, pick the repo.
3. Build command: leave blank. Publish directory: `.` (repo root).
4. Deploy. Netlify will auto-detect the `rsvp` form on first deploy.
5. Point your domain (`www.rodezvous.com`) at the Netlify site under **Domain management**.

## Fonts & palette

- Headers/titles: `Mea Culpa` (cursive, legible)
- Names/hero accents: `Alex Brush` (full script)
- Body text: `Quicksand` (rounded, friendly, non-cursive)
- Colors pulled from the Pantone mood board in `design-reference/IMG_2102.PNG` — see CSS custom properties at the top of `css/style.css` to adjust.
