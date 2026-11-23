-- Local-only migration validation. Run against a disposable PostgreSQL 14 database.
-- No Production/UAT connection or data is used.

\set ON_ERROR_STOP on

-- Deterministic 43-character opaque tokens.
delete from public.line_auth_entry_sessions;
delete from public.line_auth_handoffs;

insert into public.line_auth_handoffs (token, payload, expires_at, consumed_at) values
  ('HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH', '{"targetStep":2,"designSnapshot":{"version":1,"design":{"wristSize":16,"components":[]}}}'::jsonb, now() + interval '10 minutes', null),
  ('EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE', '{"targetStep":2}'::jsonb, now() - interval '1 minute', null),
  ('CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC', '{"targetStep":2}'::jsonb, now() + interval '10 minutes', now());

-- Valid creation returns session metadata and clamps to handoff expiry.
do $$
declare
  r record;
begin
  select * into r from public.create_line_auth_entry_session(
    'sssssssssssssssssssssssssssssssssssssssssss',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'ttttttttttttttttttttttttttttttttttttttttttt',
    'HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH',
    600
  );
  if r.session_id is null or r.expires_at is null then
    raise exception 'valid create returned no session';
  end if;
  if r.expires_at > now() + interval '10 minutes 1 second' then
    raise exception 'session expiry exceeded handoff expiry';
  end if;
end
$$;

-- Duplicate pending session for the same browser/tab must not create a second row.
do $$
declare
  r record;
  n integer;
begin
  select * into r from public.create_line_auth_entry_session(
    'ddddddddddddddddddddddddddddddddddddddddddd',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'ttttttttttttttttttttttttttttttttttttttttttt',
    'HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH',
    600
  );
  select count(*) into n from public.line_auth_entry_sessions
   where browser_id = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
     and tab_session_id = 'ttttttttttttttttttttttttttttttttttttttttttt'
     and consumed_at is null;
  if n <> 1 then
    raise exception 'duplicate pending session count was %', n;
  end if;
end
$$;

-- Expired and already-consumed handoffs cannot create a session.
do $$
declare
  r record;
begin
  select * into r from public.create_line_auth_entry_session(
    'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    'yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy',
    'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
    'EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE',
    600
  );
  if r.session_id is not null then
    raise exception 'expired handoff created a session';
  end if;
  select * into r from public.create_line_auth_entry_session(
    '1111111111111111111111111111111111111111111',
    '2222222222222222222222222222222222222222222',
    '3333333333333333333333333333333333333333333',
    'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
    600
  );
  if r.session_id is not null then
    raise exception 'consumed handoff created a session';
  end if;
end
$$;

-- Wrong browser cannot consume. Correct browser consumes once; replay returns no payload.
do $$
declare
  r record;
begin
  select * into r from public.consume_line_auth_entry_session(
    'sssssssssssssssssssssssssssssssssssssssssss',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'ttttttttttttttttttttttttttttttttttttttttttt'
  );
  if r.payload is not null then
    raise exception 'wrong browser consumed the session';
  end if;

  select * into r from public.consume_line_auth_entry_session(
    'sssssssssssssssssssssssssssssssssssssssssss',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'ttttttttttttttttttttttttttttttttttttttttttt'
  );
  if r.payload is null then
    raise exception 'correct browser did not consume the session';
  end if;

  select * into r from public.consume_line_auth_entry_session(
    'sssssssssssssssssssssssssssssssssssssssssss',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'ttttttttttttttttttttttttttttttttttttttttttt'
  );
  if r.payload is not null then
    raise exception 'replayed consume returned a payload';
  end if;

  if not exists (
    select 1 from public.line_auth_handoffs
     where token = 'HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH'
       and consumed_at is not null
  ) then
    raise exception 'bound handoff was not consumed atomically';
  end if;
end
$$;

-- An expired session cannot be consumed.
do $$
declare
  r record;
begin
  update public.line_auth_entry_sessions
     set expires_at = now() - interval '1 second'
   where session_id = 'sssssssssssssssssssssssssssssssssssssssssss';
  select * into r from public.consume_line_auth_entry_session(
    'sssssssssssssssssssssssssssssssssssssssssss',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'ttttttttttttttttttttttttttttttttttttttttttt'
  );
  if r.payload is not null then
    raise exception 'expired session returned a payload';
  end if;
end
$$;

-- RLS is enabled and customer roles have no table grants.
do $$
declare
  rls boolean;
  anon_grants integer;
begin
  select relrowsecurity into rls
    from pg_class
   where oid = 'public.line_auth_entry_sessions'::regclass;
  if rls is not true then
    raise exception 'RLS is not enabled';
  end if;
  select count(*) into anon_grants
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name = 'line_auth_entry_sessions'
     and grantee in ('anon','authenticated');
  if anon_grants <> 0 then
    raise exception 'anon/authenticated grants remain: %', anon_grants;
  end if;
end
$$;

-- Cleanup function is callable with a valid retention window.
select public.cleanup_line_auth_entry_sessions(24);

select 'MIGRATION_VALIDATION_PASS' as result;

-- If the bound handoff expires between session creation and consume, the
-- consume transaction must roll back the session update instead of leaving a
-- consumed session with no payload.
do $$
declare
  v_session text := 'rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr';
  v_browser text := 'qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';
  v_tab text := 'ppppppppppppppppppppppppppppppppppppppppppp';
  v_handoff text := 'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn';
  v_consumed timestamptz;
begin
  insert into public.line_auth_handoffs (token, payload, expires_at)
  values (v_handoff, '{"targetStep":2,"designSnapshot":{"version":1,"design":{"components":[]}}}'::jsonb, now() + interval '10 minutes');
  perform public.create_line_auth_entry_session(v_session, v_browser, v_tab, v_handoff, 600);
  update public.line_auth_handoffs set expires_at = now() - interval '1 second' where token = v_handoff;
  begin
    perform public.consume_line_auth_entry_session(v_session, v_browser, v_tab);
    raise exception 'expected bound handoff failure';
  exception when others then
    null;
  end;
  select consumed_at into v_consumed from public.line_auth_entry_sessions where session_id = v_session;
  if v_consumed is not null then
    raise exception 'session update was not rolled back';
  end if;
end
$$;

select 'MIGRATION_VALIDATION_PASS' as result;
