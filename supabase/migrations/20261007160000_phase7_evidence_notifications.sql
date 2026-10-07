-- Phase 7: private tenancy evidence and trusted in-app notifications.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tenancy-evidence',
  'tenancy-evidence',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.evidence
  add column mime_type text,
  add column file_size_bytes bigint,
  add constraint evidence_mime_type_allowed check (
    mime_type is null or mime_type in ('image/jpeg', 'image/png', 'image/webp')
  ),
  add constraint evidence_file_size_valid check (
    file_size_bytes is null or file_size_bytes between 1 and 10485760
  );

comment on column public.evidence.file_url is
  'For uploaded evidence this stores the private Supabase Storage object path, never a temporary signed URL. Legacy local demo URLs remain readable.';
comment on column public.evidence.mime_type is
  'Verified supported image MIME type for private tenancy evidence.';
comment on column public.evidence.file_size_bytes is
  'Uploaded object size in bytes, capped by the private tenancy-evidence bucket.';

create or replace function public.evidence_path_tenancy_id(p_name text)
returns uuid
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_parts text[];
begin
  if p_name is null then return null; end if;
  v_parts := string_to_array(p_name, '/');
  if array_length(v_parts, 1) <> 4
     or v_parts[1] <> 'tenancies'
     or v_parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or v_parts[3] not in ('move_in', 'move_out', 'deduction', 'dispute')
     or v_parts[4] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$' then
    return null;
  end if;
  return v_parts[2]::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create or replace function public.can_read_evidence_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
     and public.evidence_path_tenancy_id(p_name) is not null
     and public.is_tenancy_participant(public.evidence_path_tenancy_id(p_name), auth.uid());
$$;

create or replace function public.can_upload_evidence_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with parsed as (
    select public.evidence_path_tenancy_id(p_name) as tenancy_id,
           (string_to_array(p_name, '/'))[3] as evidence_context
  )
  select auth.uid() is not null
     and parsed.tenancy_id is not null
     and exists (
       select 1
       from parsed
       join public.tenancies t on t.id = parsed.tenancy_id
       where public.is_tenancy_participant(t.id, auth.uid())
         and t.status not in ('draft', 'awaiting_tenant', 'closed', 'cancelled')
         and case parsed.evidence_context
           when 'move_in' then t.status in ('awaiting_deposit', 'protected')
           when 'move_out' then t.status in ('move_out_review', 'deduction_proposed', 'settlement_pending', 'disputed')
           when 'deduction' then t.status in ('move_out_review', 'deduction_proposed', 'settlement_pending')
           when 'dispute' then t.status in ('move_out_review', 'deduction_proposed', 'settlement_pending', 'disputed')
           else false
         end
     )
  from parsed;
$$;

create or replace function public.can_delete_unattached_evidence_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
     and public.evidence_path_tenancy_id(p_name) is not null
     and exists (
       select 1
       from public.tenancies t
       where t.id = public.evidence_path_tenancy_id(p_name)
         and t.status not in ('disputed', 'closed', 'cancelled')
         and public.is_tenancy_participant(t.id, auth.uid())
         and not exists (
           select 1 from public.evidence e
           where e.tenancy_id = t.id and e.file_url = p_name
         )
     );
$$;

create or replace function public.evidence_storage_owner_matches(p_name text, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, storage, pg_temp
as $$
  select exists (
    select 1 from storage.objects o
    where o.bucket_id = 'tenancy-evidence'
      and o.name = p_name
      and o.owner_id = p_profile_id::text
  );
$$;

revoke all on function public.evidence_path_tenancy_id(text) from public, anon;
revoke all on function public.can_read_evidence_object(text) from public, anon;
revoke all on function public.can_upload_evidence_object(text) from public, anon;
revoke all on function public.can_delete_unattached_evidence_object(text) from public, anon;
revoke all on function public.evidence_storage_owner_matches(text, uuid) from public, anon, authenticated;
grant execute on function public.evidence_path_tenancy_id(text) to authenticated, service_role;
grant execute on function public.can_read_evidence_object(text) to authenticated, service_role;
grant execute on function public.can_upload_evidence_object(text) to authenticated, service_role;
grant execute on function public.can_delete_unattached_evidence_object(text) to authenticated, service_role;
grant execute on function public.evidence_storage_owner_matches(text, uuid) to service_role;

drop policy if exists tenancy_evidence_select_participant on storage.objects;
drop policy if exists tenancy_evidence_insert_participant on storage.objects;
drop policy if exists tenancy_evidence_delete_unattached on storage.objects;
create policy tenancy_evidence_select_participant on storage.objects
  for select to authenticated
  using (bucket_id = 'tenancy-evidence' and public.can_read_evidence_object(name));
create policy tenancy_evidence_insert_participant on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tenancy-evidence'
    and owner_id = auth.uid()::text
    and public.can_upload_evidence_object(name)
  );
create policy tenancy_evidence_delete_unattached on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'tenancy-evidence'
    and owner_id = auth.uid()::text
    and public.can_delete_unattached_evidence_object(name)
  );

-- Uploaded evidence is an append-only record. Users can add a new file but
-- cannot rewrite or erase an accepted record, particularly after a dispute.
drop policy if exists evidence_update_uploader on public.evidence;
drop policy if exists evidence_delete_uploader on public.evidence;
revoke insert, update, delete on public.evidence from anon, authenticated;
grant select on public.evidence to authenticated;
grant select, insert, update, delete on public.evidence to service_role;
create unique index evidence_storage_path_unique
  on public.evidence(tenancy_id, file_url)
  where file_url like 'tenancies/%';

-- The activity log is written by trusted invitation, deposit, settlement, and
-- evidence workflows. Prevent clients from manufacturing events/notifications.
drop policy if exists activity_insert_participant on public.activity_events;
revoke insert, update, delete on public.activity_events from anon, authenticated;
grant select on public.activity_events to authenticated;
grant insert, select on public.activity_events to service_role;

alter table public.notifications
  add column event_key text,
  add constraint notifications_event_key_length check (
    event_key is null or char_length(event_key) <= 300
  );
create unique index notifications_event_key_unique
  on public.notifications(event_key) where event_key is not null;
alter table public.notifications drop constraint notifications_type;
alter table public.notifications add constraint notifications_type check (type in (
  'tenant_invited', 'tenant_invitation_accepted', 'tenant_invitation_declined',
  'deposit_ready_to_fund', 'deposit_protected', 'evidence_added',
  'move_out_review_started', 'full_return_proposed', 'deduction_proposed',
  'settlement_proposal_withdrawn', 'settlement_approved', 'deduction_challenged',
  'settlement_completed', 'deduction_resolved', 'dispute_opened',
  'dispute_resolved', 'settlement_ready', 'tenancy_closed', 'system'
));

create or replace function public.create_activity_notification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_landlord uuid;
  v_tenant uuid;
  v_type text;
  v_title text;
  v_body text;
  v_recipient uuid;
  v_recipients uuid[];
begin
  select landlord_profile_id, tenant_profile_id
    into v_landlord, v_tenant
    from public.tenancies where id = new.tenancy_id;
  if not found then return new; end if;

  v_type := case new.event_type
    when 'tenant_invited' then 'tenant_invited'
    when 'tenant_accepted' then 'tenant_invitation_accepted'
    when 'tenant_declined' then 'tenant_invitation_declined'
    when 'deposit_vault_initialized' then 'deposit_ready_to_fund'
    when 'deposit_protected' then 'deposit_protected'
    when 'evidence_added' then 'evidence_added'
    when 'move_out_started' then 'move_out_review_started'
    when 'full_return_proposed' then 'full_return_proposed'
    when 'deduction_proposed' then 'deduction_proposed'
    when 'settlement_proposal_withdrawn' then 'settlement_proposal_withdrawn'
    when 'settlement_approved' then 'settlement_approved'
    when 'deduction_challenged' then 'deduction_challenged'
    when 'settlement_completed' then 'settlement_completed'
    when 'tenancy_closed' then 'tenancy_closed'
    else null
  end;
  if v_type is null then return new; end if;
  if new.event_type = 'tenancy_closed' and exists (
    select 1 from public.activity_events e
    where e.tenancy_id = new.tenancy_id
      and e.event_type = 'settlement_completed'
      and e.id <> new.id
  ) then
    return new;
  end if;

  v_title := case v_type
    when 'tenant_invited' then 'You have a tenancy invitation'
    when 'tenant_invitation_accepted' then 'Tenancy invitation accepted'
    when 'tenant_invitation_declined' then 'Tenancy invitation declined'
    when 'deposit_ready_to_fund' then 'Deposit ready to fund'
    when 'deposit_protected' then 'Deposit protected'
    when 'evidence_added' then 'New tenancy evidence added'
    when 'move_out_review_started' then 'Move-out review started'
    when 'full_return_proposed' then 'Full deposit return proposed'
    when 'deduction_proposed' then 'Deduction proposed'
    when 'settlement_proposal_withdrawn' then 'Settlement proposal withdrawn'
    when 'settlement_approved' then 'Settlement approved'
    when 'deduction_challenged' then 'Deduction challenged'
    when 'settlement_completed' then 'Settlement completed'
    when 'tenancy_closed' then 'Tenancy closed'
    else 'Tenancy updated'
  end;
  v_body := coalesce(nullif(btrim(new.description), ''), new.title);

  if new.event_type = 'settlement_completed' then
    v_recipients := array[v_landlord, v_tenant];
  elsif new.event_type = 'deposit_vault_initialized' then
    v_recipients := array[v_tenant];
  elsif new.event_type = 'tenant_invited' then
    v_recipients := array[v_tenant];
  elsif new.actor_profile_id = v_landlord then
    v_recipients := array[v_tenant];
  elsif new.actor_profile_id = v_tenant then
    v_recipients := array[v_landlord];
  else
    v_recipients := array[v_landlord, v_tenant];
  end if;

  foreach v_recipient in array v_recipients loop
    if v_recipient is null then continue; end if;
    insert into public.notifications (profile_id, tenancy_id, type, title, body, event_key)
    values (
      v_recipient,
      new.tenancy_id,
      v_type,
      v_title,
      v_body,
      new.id::text || ':' || v_recipient::text
    ) on conflict (event_key) where event_key is not null do nothing;
  end loop;
  return new;
end;
$$;

drop trigger if exists activity_events_create_notifications on public.activity_events;
create trigger activity_events_create_notifications
  after insert on public.activity_events
  for each row execute function public.create_activity_notification();

create or replace function public.create_evidence_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_title text;
  v_context text;
begin
  v_context := case new.evidence_context
    when 'move_in' then 'Move-in condition'
    when 'move_out' then 'Move-out condition'
    when 'deduction' then 'Deduction'
    when 'dispute' then 'Dispute'
    else 'Tenancy'
  end;
  v_title := v_context || ' evidence added';
  insert into public.activity_events (
    tenancy_id, actor_profile_id, event_type, title, description, metadata
  ) values (
    new.tenancy_id,
    new.uploaded_by_profile_id,
    'evidence_added',
    v_title,
    coalesce(nullif(btrim(new.caption), ''), v_title),
    jsonb_build_object('evidence_id', new.id, 'category', new.category, 'context', new.evidence_context)
  );
  return new;
end;
$$;

drop trigger if exists evidence_create_activity on public.evidence;
create trigger evidence_create_activity
  after insert on public.evidence
  for each row execute function public.create_evidence_activity();

-- Notifications are immutable except that their recipient may mark read_at.
create or replace function public.guard_notification_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if current_user in ('postgres', 'service_role') then return new; end if;
  if new.profile_id is distinct from old.profile_id
     or new.tenancy_id is distinct from old.tenancy_id
     or new.type is distinct from old.type
     or new.title is distinct from old.title
     or new.body is distinct from old.body
     or new.event_key is distinct from old.event_key
     or new.created_at is distinct from old.created_at
     or (old.read_at is not null and new.read_at is distinct from old.read_at) then
    raise exception 'Only an unread notification may be marked read' using errcode = '42501';
  end if;
  if new.read_at is null then
    raise exception 'A notification can only be marked read' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_guard_update on public.notifications;
create trigger notifications_guard_update
  before update on public.notifications
  for each row execute function public.guard_notification_update();

drop policy if exists notifications_delete_own on public.notifications;
revoke insert, delete on public.notifications from anon, authenticated;
revoke update on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant select, insert, update, delete on public.notifications to service_role;
