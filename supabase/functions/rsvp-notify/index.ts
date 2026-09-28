// Emails the couple a summary whenever a guest submits (or updates) their RSVP.
// Called by public.submit_rsvp() via pg_net with { guest_id }.
//
// Needs two Edge Function secrets (Supabase dashboard -> Edge Functions -> Secrets):
//   RESEND_API_KEY  API key from resend.com
//   NOTIFY_EMAIL    where to send alerts (comma-separate for several)
// Optional: NOTIFY_FROM (defaults to Resend's test sender), SITE_URL (for event titles).
//
// No auth header is required, so each call is only honoured once per real
// submission: guests.notified_at is claimed atomically before sending, and
// submissions older than 10 minutes are ignored.

import { createClient } from 'npm:@supabase/supabase-js@2';

const MEAL_LABELS: Record<string, string> = {
  chicken: 'Herb Chicken',
  fish: 'Citrus Fish',
  beef: 'Braised Beef',
  vegetarian: 'Garden Vegetarian',
  vegan: 'Vegan',
};

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

async function eventTitles(): Promise<Record<string, string>> {
  const site = Deno.env.get('SITE_URL') ?? 'https://joyful-belekoy-9c4744.netlify.app';
  try {
    const events = await (await fetch(`${site}/data/events.json`)).json();
    return Object.fromEntries(Object.entries(events).map(([k, v]) => [k, (v as { title: string }).title]));
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const { guest_id } = await req.json().catch(() => ({}));
  if (typeof guest_id !== 'string') return json({ error: 'guest_id required' }, 400);

  const apiKey = Deno.env.get('RESEND_API_KEY');
  const to = Deno.env.get('NOTIFY_EMAIL');
  if (!apiKey || !to) return json({ skipped: 'RESEND_API_KEY / NOTIFY_EMAIL not set' });

  const { data: rsvps, error } = await db
    .from('rsvps')
    .select('event_key, attending, meal_choice, kosher_meal, kids_meal, kids_ages, notes, email, updated_at')
    .eq('guest_id', guest_id)
    .order('event_key');
  if (error) return json({ error: error.message }, 500);
  if (!rsvps?.length) return json({ skipped: 'no rsvps' });

  const latest = rsvps.map((r) => r.updated_at).sort().at(-1)!;
  if (Date.now() - new Date(latest).getTime() > 10 * 60 * 1000) return json({ skipped: 'stale' });

  // Claim this submission; a second call for the same submission gets no row back.
  const { data: guest } = await db
    .from('guests')
    .update({ notified_at: latest })
    .eq('id', guest_id)
    .or(`notified_at.is.null,notified_at.lt."${latest}"`)
    .select('name')
    .maybeSingle();
  if (!guest) return json({ skipped: 'already notified' });

  const titles = await eventTitles();
  const email = rsvps.find((r) => r.email)?.email ?? '';
  const lines = rsvps.map((r) => {
    const details = [
      r.meal_choice && `Meal: ${MEAL_LABELS[r.meal_choice] ?? r.meal_choice}`,
      r.kosher_meal && 'Kosher meal',
      r.kids_meal && `Kids' meal${r.kids_ages ? ` (ages ${r.kids_ages})` : ''}`,
      r.notes && `Notes: ${r.notes}`,
    ].filter(Boolean) as string[];
    return `<li><strong>${escapeHtml(titles[r.event_key] ?? r.event_key)}:</strong> ${
      r.attending ? 'Yes' : 'No'
    }${details.length ? `<br><span style="color:#5b473d">${details.map(escapeHtml).join(' · ')}</span>` : ''}</li>`;
  });

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('NOTIFY_FROM') ?? 'Ro·dez·vous RSVPs <onboarding@resend.dev>',
      to: to.split(',').map((s) => s.trim()),
      reply_to: email || undefined,
      subject: `New RSVP: ${guest.name}`,
      html: `<p><strong>${escapeHtml(guest.name)}</strong> just RSVP'd${
        email ? ` (${escapeHtml(email)})` : ''
      }:</p><ul>${lines.join('')}</ul>`,
    }),
  });

  if (!res.ok) {
    // Release the claim so a retry can send it.
    await db.from('guests').update({ notified_at: null }).eq('id', guest_id).eq('notified_at', latest);
    return json({ error: `Resend ${res.status}: ${await res.text()}` }, 502);
  }
  return json({ sent: true });
});
