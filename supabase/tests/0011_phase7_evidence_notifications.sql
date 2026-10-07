begin;

set local search_path = "$user", public, extensions;
create extension if not exists pgtap with schema extensions;

select plan(25);

create or replace function pg_temp.acting(p_profile uuid, p_sql text)
returns text language plpgsql as $$
declare v_value text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_profile, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_profile::text, true);
  set local role authenticated;
  execute p_sql into v_value;
  reset role;
  return v_value;
exception when others then
  reset role;
  raise;
end;
$$;

create or replace function pg_temp.anon(p_sql text)
returns text language plpgsql as $$
declare v_value text;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  set local role anon;
  execute p_sql into v_value;
  reset role;
  return v_value;
exception when others then
  reset role;
  raise;
end;
$$;

select is(
  (select public::text from storage.buckets where id = 'tenancy-evidence'),
  'false', 'evidence bucket is private'
);
select is(
  (select file_size_limit::text from storage.buckets where id = 'tenancy-evidence'),
  '10485760', 'bucket enforces the 10 MB maximum'
);
select is(
  (select array_to_string(allowed_mime_types, ',') from storage.buckets where id = 'tenancy-evidence'),
  'image/jpeg,image/png,image/webp', 'bucket only accepts supported image MIME types'
);
select is(
  public.evidence_path_tenancy_id('tenancies/cccccccc-cccc-4ccc-8ccc-cccccccccccc/move_in/ffffffff-ffff-4fff-8fff-ffffffffffff.jpg')::text,
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'path parser resolves a tenancy-scoped image path'
);
select is(
  public.evidence_path_tenancy_id('tenancies/../../profiles/private.png')::text,
  null, 'path parser rejects traversal and unsupported names'
);
select is(
  pg_temp.acting('11111111-1111-4111-8111-111111111111', $q$select public.can_read_evidence_object('tenancies/cccccccc-cccc-4ccc-8ccc-cccccccccccc/move_in/ffffffff-ffff-4fff-8fff-ffffffffffff.jpg')::text$q$),
  'true', 'a participant may request a signed read for their tenancy object'
);
select is(
  pg_temp.acting('44444444-4444-4444-8444-444444444444', $q$select public.can_read_evidence_object('tenancies/cccccccc-cccc-4ccc-8ccc-cccccccccccc/move_in/ffffffff-ffff-4fff-8fff-ffffffffffff.jpg')::text$q$),
  'false', 'an unrelated profile cannot read another tenancy object'
);
select ok(not has_function_privilege('anon', 'public.can_read_evidence_object(text)', 'EXECUTE'), 'anonymous users cannot invoke private evidence authorization');
select is(
  pg_temp.acting('11111111-1111-4111-8111-111111111111', $q$select public.can_upload_evidence_object('tenancies/cccccccc-cccc-4ccc-8ccc-cccccccccccc/move_in/ffffffff-ffff-4fff-8fff-ffffffffffff.jpg')::text$q$),
  'true', 'a participant may upload move-in evidence while protected'
);
select is(
  pg_temp.acting('11111111-1111-4111-8111-111111111111', $q$select public.can_upload_evidence_object('tenancies/cccccccc-cccc-4ccc-8ccc-cccccccccccc/move_out/ffffffff-ffff-4fff-8fff-ffffffffffff.jpg')::text$q$),
  'false', 'move-out uploads wait until review starts'
);
select is(
  pg_temp.acting('44444444-4444-4444-8444-444444444444', $q$select public.can_upload_evidence_object('tenancies/cccccccc-cccc-4ccc-8ccc-cccccccccccc/move_in/ffffffff-ffff-4fff-8fff-ffffffffffff.jpg')::text$q$),
  'false', 'outsiders cannot upload into another tenancy path'
);
select is(
  pg_temp.acting('11111111-1111-4111-8111-111111111111', $q$select public.can_delete_unattached_evidence_object('tenancies/cccccccc-cccc-4ccc-8ccc-cccccccccccc/move_in/ffffffff-ffff-4fff-8fff-ffffffffffff.jpg')::text$q$),
  'true', 'a participant may clean up their unattached upload before recording it'
);
select is(
  (select count(*)::text from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname in ('tenancy_evidence_select_participant', 'tenancy_evidence_insert_participant', 'tenancy_evidence_delete_unattached')),
  '3', 'storage has explicit private select, insert, and conservative delete policies'
);
select ok(not has_table_privilege('authenticated', 'public.evidence', 'INSERT'), 'clients cannot forge evidence metadata rows');
select ok(not has_table_privilege('authenticated', 'public.evidence', 'UPDATE'), 'participants cannot rewrite historical evidence metadata');
select ok(not has_table_privilege('authenticated', 'public.evidence', 'DELETE'), 'participants cannot erase evidence metadata');
select ok(not has_table_privilege('authenticated', 'public.activity_events', 'INSERT'), 'clients cannot manufacture timeline events or notifications');
select ok(not has_table_privilege('authenticated', 'public.notifications', 'INSERT'), 'clients cannot create notifications');

insert into public.evidence (
  id, tenancy_id, uploaded_by_profile_id, evidence_context, category,
  file_url, mime_type, file_size_bytes, caption
) values (
  'f0000001-0000-4000-8000-000000000099',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '11111111-1111-4111-8111-111111111111',
  'move_in', 'general',
  'tenancies/cccccccc-cccc-4ccc-8ccc-cccccccccccc/move_in/ffffffff-ffff-4fff-8fff-ffffffffffff.jpg',
  'image/jpeg', 4096, 'Freshly uploaded move-in image'
);

select is(
  (select count(*)::text from public.activity_events where metadata ->> 'evidence_id' = 'f0000001-0000-4000-8000-000000000099'),
  '1', 'each accepted evidence record adds one trusted timeline event'
);
select is(
  (select count(*)::text from public.notifications where event_key = (
    select id::text || ':22222222-2222-4222-8222-222222222222'
    from public.activity_events where metadata ->> 'evidence_id' = 'f0000001-0000-4000-8000-000000000099'
  )),
  '1', 'the other participant receives one evidence notification'
);
select is(
  (select count(*)::text from public.notifications where event_key = (
    select id::text || ':11111111-1111-4111-8111-111111111111'
    from public.activity_events where metadata ->> 'evidence_id' = 'f0000001-0000-4000-8000-000000000099'
  )),
  '0', 'the uploader does not receive a notification about their own evidence'
);
select is(
  pg_temp.acting('11111111-1111-4111-8111-111111111111', $q$select public.can_delete_unattached_evidence_object('tenancies/cccccccc-cccc-4ccc-8ccc-cccccccccccc/move_in/ffffffff-ffff-4fff-8fff-ffffffffffff.jpg')::text$q$),
  'false', 'recorded evidence can no longer be deleted from Storage'
);
select is(
  pg_temp.acting('11111111-1111-4111-8111-111111111111', $q$update public.notifications set read_at = now() where id = '90000001-0000-4000-8000-000000000001'::uuid returning id::text$q$),
  '90000001-0000-4000-8000-000000000001', 'a participant can mark their own notification as read'
);
select is(
  pg_temp.acting('44444444-4444-4444-8444-444444444444', $q$update public.notifications set read_at = now() where id = '90000001-0000-4000-8000-000000000001'::uuid returning id::text$q$),
  null, 'another profile cannot mark that notification as read'
);
select ok(exists (
  select 1 from pg_indexes where schemaname = 'public' and indexname = 'notifications_event_key_unique'
), 'notification event keys have a unique index for idempotency');

select * from finish();
rollback;
