create extension if not exists pg_net with schema extensions;

alter table public.guests add column notified_at timestamptz;

create or replace function public.submit_rsvp(p_guest_id uuid, p_email text, p_responses jsonb)
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

  -- Email alert (async; a failure here never blocks the RSVP).
  begin
    perform net.http_post(
      url := 'https://mawdkpwegsjmdqoagevi.supabase.co/functions/v1/rsvp-notify',
      body := jsonb_build_object('guest_id', p_guest_id),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  exception when others then
    null;
  end;
end;
$$;
