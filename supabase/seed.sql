-- ============================================================================
-- DepositLock — Phase 3A local seed
--
-- One coherent story, no filler rows:
--
--   * 18 Camden Street, Dublin 2  — Michael O'Connor (landlord) lets to
--     Sarah Byrne (tenant). Deposit €1,800, rent €2,100/mo, status
--     `protected`, move-in evidence captured.
--   * 7 Stoneybatter Lane, Dublin 7 — Sarah Byrne is the LANDLAND here and
--     lets to Aoife Kelly. Deposit €1,200, rent €1,450/mo, status
--     `awaiting_deposit`. This is what proves roles are tenancy-scoped:
--     Sarah is a tenant on one record and a landlord on another.
--   * Niamh Fitzgerald has no tenancy at all — the negative-access subject
--     used by the RLS tests.
--
-- Wallet addresses are obviously development-only (`DEVWALLET-…`); no real
-- keys, no signing material. Fixed UUIDs keep the seed idempotent to read.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

insert into public.profiles (id, wallet_address, full_name, email, avatar_url)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'DEVWALLET-00000000000000000000SARAH00001',
    'Sarah Byrne',
    'sarah.byrne@example.ie',
    null
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'DEVWALLET-00000000000000000000MICHAEL01',
    'Michael O''Connor',
    'michael.oconnor@example.ie',
    null
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    'DEVWALLET-00000000000000000000AOIFE0001',
    'Aoife Kelly',
    'aoife.kelly@example.ie',
    null
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    'DEVWALLET-00000000000000000000NIAMH0001',
    'Niamh Fitzgerald',
    'niamh.fitzgerald@example.ie',
    null
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Properties
-- ---------------------------------------------------------------------------

insert into public.properties (
  id, created_by_profile_id, address_line_1, address_line_2, city, county,
  postal_code, country, property_type, cover_image_url
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '22222222-2222-4222-8222-222222222222',
    '18 Camden Street', null, 'Dublin', 'Dublin',
    'D02 XY34', 'IE', 'apartment', '/properties/camden-street.jpg'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '11111111-1111-4111-8111-111111111111',
    '7 Stoneybatter Lane', null, 'Dublin', 'Dublin',
    'D07 K2R4', 'IE', 'house', '/properties/stoneybatter-lane.jpg'
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Tenancies
-- ---------------------------------------------------------------------------

insert into public.tenancies (
  id, property_id, landlord_profile_id, tenant_profile_id,
  start_date, end_date, monthly_rent_amount, deposit_amount,
  display_currency, settlement_token, status, activated_at, closed_at
)
values
  -- Protected: the main demo record.
  (
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
    date '2026-09-01',
    date '2027-08-31',
    2100.00,
    1800.00,
    'EUR',
    'USDC',
    'protected',
    timestamptz '2026-09-01T10:00:00+01:00',
    null
  ),
  -- Awaiting deposit: a second state for list/filter testing, and the record
  -- where Sarah is the landlord.
  (
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    '11111111-1111-4111-8111-111111111111',
    '33333333-3333-4333-8333-333333333333',
    date '2026-11-01',
    date '2027-10-31',
    1450.00,
    1200.00,
    'EUR',
    'USDC',
    'awaiting_deposit',
    null,
    null
  )
on conflict (id) do nothing;

-- The participant rows above are produced automatically by the
-- `sync_tenancy_participants` trigger on insert.

-- ---------------------------------------------------------------------------
-- Activity timeline — the story so far
-- ---------------------------------------------------------------------------

insert into public.activity_events (
  id, tenancy_id, actor_profile_id, event_type, title, description,
  metadata, created_at
)
values
  (
    'e0000001-0000-4000-8000-000000000001',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '22222222-2222-4222-8222-222222222222',
    'tenancy_created',
    'Tenancy created',
    '18 Camden Street, Dublin 2 added to the record.',
    '{"stage": "agreement"}'::jsonb,
    timestamptz '2026-08-18T09:15:00+01:00'
  ),
  (
    'e0000001-0000-4000-8000-000000000002',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '22222222-2222-4222-8222-222222222222',
    'tenant_invited',
    'Tenant invited',
    'Sarah Byrne was invited to review and accept the tenancy terms.',
    '{"channel": "in_app"}'::jsonb,
    timestamptz '2026-08-18T09:16:00+01:00'
  ),
  (
    'e0000001-0000-4000-8000-000000000003',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '11111111-1111-4111-8111-111111111111',
    'tenant_accepted',
    'Tenant accepted',
    'Sarah Byrne accepted the tenancy terms.',
    '{}'::jsonb,
    timestamptz '2026-08-19T18:40:00+01:00'
  ),
  (
    'e0000001-0000-4000-8000-000000000004',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    null,
    'deposit_protected',
    'Deposit protected',
    'Deposit of €1,800.00 moved into the protected state.',
    '{"amount": "1800.00", "currency": "EUR"}'::jsonb,
    timestamptz '2026-08-26T11:05:00+01:00'
  ),
  (
    'e0000001-0000-4000-8000-000000000005',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '11111111-1111-4111-8111-111111111111',
    'evidence_added',
    'Move-in evidence added',
    'Sarah Byrne uploaded move-in photographs for the kitchen, living room and bedroom.',
    '{"context": "move_in", "count": 3}'::jsonb,
    timestamptz '2026-09-01T10:12:00+01:00'
  ),
  (
    'e0000001-0000-4000-8000-000000000006',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    '11111111-1111-4111-8111-111111111111',
    'tenancy_created',
    'Tenancy created',
    '7 Stoneybatter Lane, Dublin 7 added to the record.',
    '{"stage": "agreement"}'::jsonb,
    timestamptz '2026-10-01T14:30:00+01:00'
  ),
  (
    'e0000001-0000-4000-8000-000000000007',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    '11111111-1111-4111-8111-111111111111',
    'tenant_invited',
    'Tenant invited',
    'Aoife Kelly was invited to review and accept the tenancy terms.',
    '{"channel": "in_app"}'::jsonb,
    timestamptz '2026-10-01T14:31:00+01:00'
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Move-in evidence (local placeholder URLs only — storage is out of scope)
-- ---------------------------------------------------------------------------

insert into public.evidence (
  id, tenancy_id, uploaded_by_profile_id, evidence_context, category,
  file_url, caption, created_at
)
values
  (
    'f0000001-0000-4000-8000-000000000001',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '11111111-1111-4111-8111-111111111111',
    'move_in',
    'kitchen',
    '/evidence/move-in-kitchen.jpg',
    'Worktops, appliances and tiling at move-in',
    timestamptz '2026-09-01T10:12:00+01:00'
  ),
  (
    'f0000001-0000-4000-8000-000000000002',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '11111111-1111-4111-8111-111111111111',
    'move_in',
    'living_room',
    '/evidence/move-in-living.jpg',
    'Living room walls, flooring and windows at move-in',
    timestamptz '2026-09-01T10:14:00+01:00'
  ),
  (
    'f0000001-0000-4000-8000-000000000003',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '11111111-1111-4111-8111-111111111111',
    'move_in',
    'bedroom',
    '/evidence/move-in-bedroom.jpg',
    'Main bedroom wardrobe doors and carpet at move-in',
    timestamptz '2026-09-01T10:16:00+01:00'
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Notifications (persistence only — nothing is sent anywhere)
-- ---------------------------------------------------------------------------

insert into public.notifications (
  id, profile_id, tenancy_id, type, title, body, read_at, created_at
)
values
  (
    '90000001-0000-4000-8000-000000000001',
    '11111111-1111-4111-8111-111111111111',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'tenant_invited',
    'You have been invited to 18 Camden Street',
    'Review the tenancy terms and accept to continue.',
    null,
    timestamptz '2026-08-18T09:16:00+01:00'
  ),
  (
    '90000001-0000-4000-8000-000000000002',
    '22222222-2222-4222-8222-222222222222',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    'deposit_protected',
    'Deposit protected at 18 Camden Street',
    '€1,800.00 is now protected for the tenancy.',
    timestamptz '2026-08-26T11:06:00+01:00',
    timestamptz '2026-08-26T11:05:00+01:00'
  ),
  (
    '90000001-0000-4000-8000-000000000003',
    '33333333-3333-4333-8333-333333333333',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'tenant_invited',
    'You have been invited to 7 Stoneybatter Lane',
    'Review the tenancy terms and accept to continue.',
    null,
    timestamptz '2026-10-01T14:31:00+01:00'
  )
on conflict (id) do nothing;
