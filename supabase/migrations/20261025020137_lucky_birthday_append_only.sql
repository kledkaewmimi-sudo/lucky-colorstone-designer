-- Append-only Birthday collection. Raw records are available only to the trusted backend.
create table if not exists public.lucky_birthday_submissions (
  id uuid primary key default gen_random_uuid(),
  collection_key text not null unique,
  analytics_session_id text not null,
  birth_date date not null check (birth_date >= date '1900-01-01'),
  birth_weekday smallint not null check (birth_weekday between 0 and 6),
  consent_version text not null check (char_length(consent_version) between 1 and 80),
  source text not null default 'lucky' check (source = 'lucky'),
  created_at timestamptz not null default now()
);

alter table public.lucky_birthday_submissions enable row level security;
revoke all on table public.lucky_birthday_submissions from anon, authenticated, public;
grant select, insert, delete on table public.lucky_birthday_submissions to service_role;

create index if not exists idx_lucky_birthday_submissions_created_at
  on public.lucky_birthday_submissions (created_at desc);
create index if not exists idx_lucky_birthday_submissions_session
  on public.lucky_birthday_submissions (analytics_session_id);

comment on table public.lucky_birthday_submissions is
  'Restricted append-only Lucky birthday submissions. Raw dates are never exposed through public APIs.';

-- Restricted, caller-selected retention run. The owner supplies the period in days.
create or replace function public.lucky_birthday_prune(retention_days integer)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  deleted_count integer;
begin
  if retention_days is null or retention_days < 1 then
    raise exception 'retention_days must be a positive integer' using errcode = '22023';
  end if;
  delete from public.lucky_birthday_submissions
  where created_at < now() - make_interval(days => retention_days);
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
revoke all on function public.lucky_birthday_prune(integer) from public, anon, authenticated;
grant execute on function public.lucky_birthday_prune(integer) to service_role;

-- Service-role-only aggregate. It returns no raw date or identifier.
create or replace function public.lucky_birthday_demographics(
  report_start date,
  report_end date,
  report_date date default (timezone('Asia/Bangkok', now()))::date,
  minimum_cohort_size integer default 10
)
returns jsonb
language sql
security invoker
set search_path = public
as $$
with bounds as (
  select report_start as start_date, report_end as end_date, report_date as age_date,
    greatest(minimum_cohort_size, 10) as threshold
), birthdays as (
  select b.*, extract(year from age(bounds.age_date, b.birth_date))::integer as age
  from lucky_birthday_submissions b cross join bounds
  where b.created_at >= (bounds.start_date::timestamp at time zone 'Asia/Bangkok')
    and b.created_at < ((bounds.end_date + 1)::timestamp at time zone 'Asia/Bangkok')
), grouped as (
  select analytics_session_id, birth_weekday,
    case when age < 18 then 'under_18' when age between 18 and 24 then '18_24'
         when age between 25 and 34 then '25_34' when age between 35 and 44 then '35_44'
         when age between 45 and 54 then '45_54' else '55_plus' end as age_group,
    (created_at at time zone 'Asia/Bangkok')::date as submitted_date
  from birthdays
), generation as (
  select distinct e.session_id
  from analytics_events e cross join bounds
  where e.event_name = 'lumi_generation_completed'
    and e.created_at >= (bounds.start_date::timestamp at time zone 'Asia/Bangkok')
    and e.created_at < ((bounds.end_date + 1)::timestamp at time zone 'Asia/Bangkok')
), age_rows as (
  select age_group, count(*)::integer as submitted, count(g.session_id)::integer as generated
  from grouped left join generation g on g.session_id = grouped.analytics_session_id
  group by age_group
), weekday_rows as (
  select birth_weekday, count(*)::integer as submitted from grouped group by birth_weekday
), daily_rows as (
  select submitted_date, count(*)::integer as submitted, count(distinct analytics_session_id)::integer as distinct_sessions
  from grouped group by submitted_date
)
select jsonb_build_object(
  'report_timezone', 'Asia/Bangkok',
  'report_date', (select age_date from bounds),
  'minimum_cohort_size', (select threshold from bounds),
  'age_groups', coalesce((select jsonb_agg(jsonb_build_object('age_group', age_group, 'submitted', submitted, 'generation_conversion_rate', round(generated::numeric / nullif(submitted, 0), 4)) order by age_group)
    from age_rows where submitted >= (select threshold from bounds)), '[]'::jsonb),
  'birth_weekdays', coalesce((select jsonb_agg(jsonb_build_object('weekday', birth_weekday, 'submitted', submitted) order by birth_weekday)
    from weekday_rows where submitted >= (select threshold from bounds)), '[]'::jsonb),
  'daily_submissions', coalesce((select jsonb_agg(jsonb_build_object('date', submitted_date, 'submitted', submitted, 'distinct_sessions', distinct_sessions) order by submitted_date)
    from daily_rows where submitted >= (select threshold from bounds)), '[]'::jsonb)
);
$$;
revoke all on function public.lucky_birthday_demographics(date, date, date, integer) from public, anon, authenticated;
grant execute on function public.lucky_birthday_demographics(date, date, date, integer) to service_role;
