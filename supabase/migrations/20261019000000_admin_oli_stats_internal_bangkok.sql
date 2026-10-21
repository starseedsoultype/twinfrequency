-- Oli stats for admin.html: leave out internal (test and owner) accounts, count days in Bangkok time.
create or replace function public.admin_oli_stats()
 returns json
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  oli constant uuid := '29ccb8b2-586a-464f-8635-f1c98bc3172a';
  tz constant text := 'Asia/Bangkok';
  today date := (now() at time zone 'Asia/Bangkok')::date;
  result json;
begin
  if not public.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;

  with admins as (
    select id from profiles where is_admin or is_internal
  ),
  oli_matches as (
    select id, user_id from (
      select id, case when user1 = oli then user2 else user1 end as user_id
      from matches where user1 = oli or user2 = oli
    ) m where user_id not in (select id from admins)
  ),
  talk as (
    select m.sender_id as user_id, m.created_at, (m.created_at at time zone tz)::date as day
    from messages m join oli_matches om on om.id = m.match_id
    where m.sender_id <> oli
  ),
  per_user as (
    select user_id, count(*) as msgs, min(day) as first_day, max(day) as last_day, count(distinct day) as days
    from talk group by user_id
  ),
  oli_said as (
    select m.content, m.meta from messages m join oli_matches om on om.id = m.match_id where m.sender_id = oli
  ),
  page_users as (
    select id, created_at, raw_user_meta_data from auth.users where raw_user_meta_data->>'source' = 'oli' and id not in (select id from admins)
  )
  select json_build_object(
    'talkers',          (select count(*) from per_user),
    'from_oli_page',    (select count(*) from page_users),
    'new_page_7d',      (select count(*) from page_users where created_at > now() - interval '7 days'),
    'consented',        (select count(*) from auth.users where raw_user_meta_data ? 'ai_consent_at' and id not in (select id from admins)),
    'active_today',     (select count(distinct user_id) from talk where day = today),
    'active_7d',        (select count(distinct user_id) from talk where created_at > now() - interval '7 days'),
    'came_back',        (select count(*) from per_user where days >= 2),
    'came_back_week',   (select count(*) from per_user where last_day - first_day >= 7),
    'avg_msgs',         (select round(avg(msgs), 1) from per_user),
    'messages_total',   (select count(*) from talk),
    'reading_presses',  (select count(*) from messages m join oli_matches om on om.id = m.match_id where m.meta->>'action' = 'pdf_accept'),
    'pdf_requests',     (select count(*) from pdf_requests where user_id not in (select id from admins)),
    'crisis_replies',   (select count(*) from oli_said where content like '%findahelpline.com%'),
    'limit_hits',       (select count(*) from oli_said where meta->>'action' = 'upgrade'),
    'daily', (
      select json_agg(json_build_object('day', g.d::date, 'active', coalesce(a.n, 0), 'new', coalesce(f.n, 0)) order by g.d)
      from generate_series(today - 13, today, interval '1 day') as g(d)
      left join (select day, count(distinct user_id) n from talk group by day) a on a.day = g.d::date
      left join (select first_day, count(*) n from per_user group by first_day) f on f.first_day = g.d::date
    )
  ) into result;

  return result;
end
$function$;
