-- UAT-only analytics idempotency correction.
--
-- The old unique constraint (journey_id, event_name, stage_key) rejected
-- legitimate repeated events, including repeated views and stage events in
-- one journey. Event ID is already the primary key, so event-level retries
-- remain idempotent through the server's on_conflict=event_id write.
--
-- Never run this against Production.
begin;

alter table public.uat_analytics_events
  drop constraint if exists uat_analytics_events_journey_id_event_name_stage_key_key;

commit;
