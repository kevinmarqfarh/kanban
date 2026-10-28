create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule(
  'forma-push-every-minute',
  '* * * * *',
  $job$
    select net.http_post(
      url := 'https://rucwlpzrumxejvhwazat.supabase.co/functions/v1/forma-push',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-forma-cron', (select cron_token from public.forma_push_config where id = true)),
      body := '{"action":"dispatch"}'::jsonb,
      timeout_milliseconds := 30000
    );
  $job$
);
