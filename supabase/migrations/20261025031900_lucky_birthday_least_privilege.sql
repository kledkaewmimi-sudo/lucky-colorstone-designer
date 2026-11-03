-- Remove Supabase default privileges so the backend role cannot mutate submitted records.
revoke all on table public.lucky_birthday_submissions from service_role;
grant select, insert, delete on table public.lucky_birthday_submissions to service_role;

revoke all on function public.lucky_birthday_demographics(date, date, date, integer) from service_role;
grant execute on function public.lucky_birthday_demographics(date, date, date, integer) to service_role;

revoke all on function public.lucky_birthday_prune(integer) from service_role;
grant execute on function public.lucky_birthday_prune(integer) to service_role;
