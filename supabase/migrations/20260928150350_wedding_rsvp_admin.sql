-- Only users listed here can read RSVPs from the admin page. Being signed in
-- is not enough on its own (public sign-ups would otherwise count).
create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;

create function public.admin_rsvp_overview()
returns table (
  name text, event_key text, response text, meal_choice text,
  kosher_meal boolean, kids_meal boolean, kids_ages text,
  notes text, email text, updated_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.admin_users a where a.user_id = auth.uid()) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
    select o.name, o.event_key, o.response, o.meal_choice, o.kosher_meal,
           o.kids_meal, o.kids_ages, o.notes, o.email, o.updated_at
    from public.rsvp_overview o;
end;
$$;

revoke execute on function public.admin_rsvp_overview() from public, anon;
grant execute on function public.admin_rsvp_overview() to authenticated;
