-- Guest list + RSVPs for the Ro·dez·vous wedding site.
-- Tables are locked down with RLS and no policies: the public site can only
-- go through the three SECURITY DEFINER functions below.

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  events text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.rsvps (
  guest_id uuid not null references public.guests(id) on delete cascade,
  event_key text not null,
  attending boolean not null,
  meal_choice text,
  kosher_meal boolean,
  kids_meal boolean,
  kids_ages text,
  notes text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (guest_id, event_key)
);

alter table public.guests enable row level security;
alter table public.rsvps enable row level security;
revoke all on public.guests, public.rsvps from anon, authenticated;

-- Typeahead lookup: min 3 chars, max 6 results, names only.
create function public.search_guests(q text)
returns table (id uuid, name text)
language sql stable security definer set search_path = ''
as $$
  select g.id, g.name
  from public.guests g
  where length(trim(q)) >= 3
    and g.name ilike '%' || trim(q) || '%'
  order by g.name
  limit 6;
$$;

-- Which events a selected guest is invited to.
create function public.get_guest_events(p_guest_id uuid)
returns text[]
language sql stable security definer set search_path = ''
as $$
  select g.events from public.guests g where g.id = p_guest_id;
$$;

-- Upsert one row per event. responses: [{event_key, attending, meal_choice, kosher_meal, kids_meal, kids_ages, notes}]
create function public.submit_rsvp(p_guest_id uuid, p_email text, p_responses jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  invited text[];
  r jsonb;
begin
  select g.events into invited from public.guests g where g.id = p_guest_id;
  if invited is null then
    raise exception 'Unknown guest';
  end if;
  if jsonb_typeof(p_responses) <> 'array' or jsonb_array_length(p_responses) = 0
     or jsonb_array_length(p_responses) > 20 then
    raise exception 'Invalid responses';
  end if;

  for r in select * from jsonb_array_elements(p_responses) loop
    if not (r->>'event_key' = any (invited)) then
      raise exception 'Guest is not invited to %', r->>'event_key';
    end if;

    insert into public.rsvps as x
      (guest_id, event_key, attending, meal_choice, kosher_meal, kids_meal, kids_ages, notes, email)
    values (
      p_guest_id,
      r->>'event_key',
      (r->>'attending')::boolean,
      left(nullif(r->>'meal_choice', ''), 50),
      (r->>'kosher_meal')::boolean,
      (r->>'kids_meal')::boolean,
      left(nullif(r->>'kids_ages', ''), 100),
      left(nullif(r->>'notes', ''), 2000),
      left(nullif(trim(p_email), ''), 254)
    )
    on conflict (guest_id, event_key) do update set
      attending = excluded.attending,
      meal_choice = excluded.meal_choice,
      kosher_meal = excluded.kosher_meal,
      kids_meal = excluded.kids_meal,
      kids_ages = excluded.kids_ages,
      notes = excluded.notes,
      email = excluded.email,
      updated_at = now();
  end loop;
end;
$$;

revoke execute on function public.search_guests(text) from public;
revoke execute on function public.get_guest_events(uuid) from public;
revoke execute on function public.submit_rsvp(uuid, text, jsonb) from public;
grant execute on function public.search_guests(text) to anon, authenticated;
grant execute on function public.get_guest_events(uuid) to anon, authenticated;
grant execute on function public.submit_rsvp(uuid, text, jsonb) to anon, authenticated;

-- Dashboard-only view: every invite, with its response (or blank if none yet).
create view public.rsvp_overview with (security_invoker = true) as
select g.name, e.event_key,
       case when r.attending is null then 'no response'
            when r.attending then 'yes' else 'no' end as response,
       r.meal_choice, r.kosher_meal, r.kids_meal, r.kids_ages, r.notes, r.email, r.updated_at
from public.guests g
cross join lateral unnest(g.events) as e(event_key)
left join public.rsvps r on r.guest_id = g.id and r.event_key = e.event_key
order by e.event_key, g.name;

revoke all on public.rsvp_overview from anon, authenticated;
