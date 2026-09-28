// Emails the couple a summary whenever a household submits (or updates) their RSVP.
// Called by public.submit_rsvp() via pg_net with { household_id }.
//
// Needs two Edge Function secrets (Supabase dashboard -> Edge Functions -> Secrets):
//   RESEND_API_KEY  API key from resend.com
//   NOTIFY_EMAIL    where to send alerts (comma-separate for several)
// Optional: NOTIFY_FROM (defaults to Resend's test sender), SITE_URL (for event titles).
//
// No auth header is required, so each call is only honoured once per real
// submission: households.notified_at is claimed atomically before sending, and
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

async function loadEvents(): Promise<[string, string][]> {
  const site = Deno.env.get('SITE_URL') ?? 'https://joyful-belekoy-9c4744.netlify.app';
  try {
    const events = await (await fetch(`${site}/data/events.json`)).json();
    return Object.entries(events).map(([k, v]) => [k, (v as { title: string }).title]);
  } catch {
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const { household_id } = await req.json().catch(() => ({}));
  if (typeof household_id !== 'string') return json({ error: 'household_id required' }, 400);

  const apiKey = Deno.env.get('RESEND_API_KEY');
  const to = Deno.env.get('NOTIFY_EMAIL');
  if (!apiKey || !to) return json({ skipped: 'RESEND_API_KEY / NOTIFY_EMAIL not set' });

  const { data: household, error } = await db
    .from('households')
    .select('label, email, notes, responded_at, notified_at')
    .eq('id', household_id)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!household?.responded_at) return json({ skipped: 'no response' });

  const respondedAt = household.responded_at as string;
  if (Date.now() - new Date(respondedAt).getTime() > 10 * 60 * 1000) return json({ skipped: 'stale' });

  // Claim this submission; a second call for the same submission gets no row back.
  const { data: claimed } = await db
    .from('households')
    .update({ notified_at: respondedAt })
    .eq('id', household_id)
    .or(`notified_at.is.null,notified_at.lt."${respondedAt}"`)
    .select('id')
    .maybeSingle();
  if (!claimed) return json({ skipped: 'already notified' });

  const { data: guests } = await db
    .from('guests')
    .select('id, name, is_plus_one, sort_order, rsvps(event_key, attending, meal_choice, kosher_meal, kids_meal, plus_one_name)')
    .eq('household_id', household_id)
    .order('sort_order');

  const events = await loadEvents();
  const sections = events
    .map(([key, title]) => {
      const lines = (guests ?? []).flatMap((g) =>
        (g.rsvps ?? [])
          .filter((r) => r.event_key === key)
          .map((r) => {
            const who = g.is_plus_one ? (r.plus_one_name ? `${r.plus_one_name} (guest)` : 'Guest') : g.name;
            const details = [
              r.meal_choice && (MEAL_LABELS[r.meal_choice] ?? r.meal_choice),
              r.kids_meal && "Kids' meal",
              r.kosher_meal && 'Kosher',
            ].filter(Boolean) as string[];
            return `<li>${escapeHtml(who)}: <strong>${r.attending ? 'Yes' : 'No'}</strong>${
              details.length ? ` <span style="color:#5b473d">(${details.map(escapeHtml).join(', ')})</span>` : ''
            }</li>`;
          }),
      );
      return lines.length ? `<p style="margin:14px 0 4px"><strong>${escapeHtml(title)}</strong></p><ul style="margin:0">${lines.join('')}</ul>` : '';
    })
    .join('');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('NOTIFY_FROM') ?? 'Ro·dez·vous RSVPs <onboarding@resend.dev>',
      to: to.split(',').map((s) => s.trim()),
      reply_to: household.email || undefined,
      subject: `New RSVP: ${household.label}`,
      html: `<p><strong>${escapeHtml(household.label)}</strong> just RSVP'd${
        household.email ? ` (${escapeHtml(household.email)})` : ''
      }.</p>${sections}${
        household.notes ? `<p style="margin-top:14px"><strong>Notes:</strong> ${escapeHtml(household.notes)}</p>` : ''
      }`,
    }),
  });

  if (!res.ok) {
    // Release the claim so a retry can send it.
    await db.from('households').update({ notified_at: null }).eq('id', household_id).eq('notified_at', respondedAt);
    return json({ error: `Resend ${res.status}: ${await res.text()}` }, 502);
  }
  return json({ sent: true });
});
