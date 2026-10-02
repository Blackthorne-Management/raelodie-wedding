-- Guests now belong to households: searching any named member shows the whole
-- household, each person with only the events they are invited to.

drop view public.rsvp_overview;
drop function public.admin_rsvp_overview();
drop function public.search_guests(text);
drop function public.get_guest_events(uuid);
drop function public.submit_rsvp(uuid, text, jsonb);
delete from public.rsvps;
delete from public.guests;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  email text,
  notes text,
  responded_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.households enable row level security;
revoke all on public.households from anon, authenticated;

alter table public.guests drop column notified_at;
alter table public.guests
  add column household_id uuid not null references public.households(id) on delete cascade,
  add column sort_order int not null default 0,
  add column is_plus_one boolean not null default false,
  add column search_text text not null default '';
create index guests_household_idx on public.guests(household_id);

alter table public.rsvps drop column kids_ages, drop column notes, drop column email;
alter table public.rsvps add column plus_one_name text;

-- Typeahead: every word typed must appear in the guest's (accent-free, lowercased) name.
create function public.search_guests(q text)
returns table (household_id uuid, name text)
language sql stable security definer set search_path = ''
as $$
  with words as (
    select array_remove(regexp_split_to_array(lower(trim(q)), '\s+'), '') as w
  )
  select g.household_id, g.name
  from public.guests g, words
  where length(trim(q)) >= 3
    and not g.is_plus_one
    and (select bool_and(g.search_text like '%' || x || '%') from unnest(words.w) x)
  order by g.name
  limit 6;
$$;

-- Everyone in the household and the events each one is invited to.
create function public.get_household(p_household_id uuid)
returns table (guest_id uuid, name text, is_plus_one boolean, events text[])
language sql stable security definer set search_path = ''
as $$
  select g.id, g.name, g.is_plus_one, g.events
  from public.guests g
  where g.household_id = p_household_id
  order by g.sort_order;
$$;

-- responses: [{guest_id, event_key, attending, meal_choice, kosher_meal, kids_meal, plus_one_name}]
create function public.submit_rsvp(p_household_id uuid, p_email text, p_notes text, p_responses jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  r jsonb;
  g public.guests;
begin
  if not exists (select 1 from public.households h where h.id = p_household_id) then
    raise exception 'Unknown household';
  end if;
  if jsonb_typeof(p_responses) <> 'array' or jsonb_array_length(p_responses) = 0
     or jsonb_array_length(p_responses) > 100 then
    raise exception 'Invalid responses';
  end if;

  for r in select * from jsonb_array_elements(p_responses) loop
    select * into g from public.guests x
      where x.id = (r->>'guest_id')::uuid and x.household_id = p_household_id;
    if g.id is null then
      raise exception 'Guest is not in this household';
    end if;
    if not (r->>'event_key' = any (g.events)) then
      raise exception '% is not invited to %', g.name, r->>'event_key';
    end if;

    insert into public.rsvps
      (guest_id, event_key, attending, meal_choice, kosher_meal, kids_meal, plus_one_name)
    values (
      g.id,
      r->>'event_key',
      (r->>'attending')::boolean,
      left(nullif(r->>'meal_choice', ''), 50),
      (r->>'kosher_meal')::boolean,
      (r->>'kids_meal')::boolean,
      case when g.is_plus_one then left(nullif(trim(r->>'plus_one_name'), ''), 100) end
    )
    on conflict (guest_id, event_key) do update set
      attending = excluded.attending,
      meal_choice = excluded.meal_choice,
      kosher_meal = excluded.kosher_meal,
      kids_meal = excluded.kids_meal,
      plus_one_name = excluded.plus_one_name,
      updated_at = now();
  end loop;

  update public.households set
    email = left(nullif(trim(p_email), ''), 254),
    notes = left(nullif(trim(p_notes), ''), 2000),
    responded_at = now()
  where id = p_household_id;

  -- Email alert (async; a failure here never blocks the RSVP).
  begin
    perform net.http_post(
      url := 'https://mawdkpwegsjmdqoagevi.supabase.co/functions/v1/rsvp-notify',
      body := jsonb_build_object('household_id', p_household_id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  exception when others then
    null;
  end;
end;
$$;

revoke execute on function public.search_guests(text) from public;
revoke execute on function public.get_household(uuid) from public;
revoke execute on function public.submit_rsvp(uuid, text, text, jsonb) from public;
grant execute on function public.search_guests(text) to anon, authenticated;
grant execute on function public.get_household(uuid) to anon, authenticated;
grant execute on function public.submit_rsvp(uuid, text, text, jsonb) to anon, authenticated;

-- Dashboard view: every person x invited event, with their response.
create view public.rsvp_overview with (security_invoker = true) as
select h.label as household,
       case when g.is_plus_one then
              coalesce(r.plus_one_name || ' (guest)', 'Guest')
            else g.name end as name,
       e.event_key,
       case when r.attending is null then 'no response'
            when r.attending then 'yes' else 'no' end as response,
       r.meal_choice, r.kosher_meal, r.kids_meal,
       h.email, h.notes, r.updated_at,
       h.id as household_id, g.sort_order
from public.guests g
join public.households h on h.id = g.household_id
cross join lateral unnest(g.events) as e(event_key)
left join public.rsvps r on r.guest_id = g.id and r.event_key = e.event_key;
revoke all on public.rsvp_overview from anon, authenticated;

create function public.admin_rsvp_overview()
returns table (
  household text, name text, event_key text, response text, meal_choice text,
  kosher_meal boolean, kids_meal boolean, email text, notes text, updated_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.admin_users a where a.user_id = auth.uid()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
    select o.household, o.name, o.event_key, o.response, o.meal_choice, o.kosher_meal,
           o.kids_meal, o.email, o.notes, o.updated_at
    from public.rsvp_overview o
    order by o.household, o.household_id, o.sort_order, o.event_key;
end;
$$;
revoke execute on function public.admin_rsvp_overview() from public, anon;
grant execute on function public.admin_rsvp_overview() to authenticated;
