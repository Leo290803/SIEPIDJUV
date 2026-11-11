-- Inscrições por categoria/prova; identidade e edição preservadas nas FKs.
alter table public.events add column configuration_version bigint not null default 1;
alter table public.events add column correction_deadline timestamptz;
alter table public.events add column updated_at timestamptz not null default now();
alter table public.people add column updated_at timestamptz not null default now();
alter table public.schools add column updated_at timestamptz not null default now();
alter table public.event_participations add column updated_at timestamptz not null default now();
alter table public.event_participations add column validated_configuration_version bigint;
alter table public.event_participations add constraint participation_data_object check (jsonb_typeof(additional_data)='object');
alter table public.people add constraint person_contact_object check (jsonb_typeof(contact)='object');
alter table public.schools add constraint school_details_object check (jsonb_typeof(details)='object');
alter table public.event_fields add constraint field_config_object check (jsonb_typeof(configuration)='object');
alter table public.event_fields add constraint field_key_nonempty check (btrim(field_key)<>'');
alter table public.event_fields add constraint fixed_identity_fields_required check (field_key not in ('name','full_name','birth','birth_date','cpf','gender') or requirement='required');
alter table public.school_people add column position text;
alter table public.school_people add constraint school_person_context unique(institution_id,school_id,person_id,role,id);
create unique index responsible_account_school on public.school_people(institution_id,school_id,user_id) where role='responsible' and user_id is not null;
create index school_people_access_idx on public.school_people(user_id,institution_id,school_id,status) where role='responsible';
create table public.school_link_requests (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null,
 school_person_id uuid not null,
 user_id uuid not null references auth.users(id),
 requested_identity jsonb not null check(jsonb_typeof(requested_identity)='object'),
 created_at timestamptz not null default now(),
 unique(institution_id,id),
 unique(school_person_id,user_id),
 foreign key(institution_id,school_person_id) references public.school_people(institution_id,id)
);
create index school_people_person_idx on public.school_people(institution_id,person_id);
create index event_participations_school_idx on public.event_participations(institution_id,event_id,school_id);
create index participation_categories_category_idx on public.participation_categories(institution_id,event_id,category_id);

create table public.registrations (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null,
 event_id uuid not null,
 school_id uuid not null,
 category_id uuid not null,
 proof_id uuid,
 status text not null default 'draft' check (status in ('draft','submitted','correction_requested','approved','rejected','cancelled')),
 revision integer not null default 1 check (revision>0),
 submitted_at timestamptz,
 correction_deadline timestamptz,
 created_by uuid references auth.users(id),
 updated_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(institution_id,id),
 unique(institution_id,event_id,id),
 unique(institution_id,event_id,school_id,id),
 foreign key(institution_id,event_id) references public.events(institution_id,id),
 foreign key(institution_id,school_id) references public.schools(institution_id,id),
 foreign key(institution_id,event_id,category_id) references public.event_categories(institution_id,event_id,id),
 foreign key(institution_id,event_id,category_id,proof_id) references public.event_proofs(institution_id,event_id,category_id,id)
);
create index registrations_event_idx on public.registrations(institution_id,event_id,school_id,status);
create index registrations_category_idx on public.registrations(institution_id,event_id,category_id,proof_id);

create table public.registration_athletes (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null,
 event_id uuid not null,
 school_id uuid not null,
 registration_id uuid not null,
 participation_id uuid not null,
 -- Campos derivados pelo trigger; não são aceitos como autoridade do cliente.
 person_id uuid not null,
 proof_id uuid,
 slot_number integer not null check(slot_number>0),
 active boolean not null default true,
 created_at timestamptz not null default now(),
 unique(institution_id,id),
 unique(institution_id,event_id,registration_id,participation_id),
 unique(institution_id,event_id,registration_id,slot_number),
 foreign key(institution_id,event_id,school_id,registration_id) references public.registrations(institution_id,event_id,school_id,id),
 foreign key(institution_id,event_id,school_id,participation_id) references public.event_participations(institution_id,event_id,school_id,id),
 foreign key(institution_id,person_id) references public.people(institution_id,id),
 foreign key(institution_id,event_id,proof_id) references public.event_proofs(institution_id,event_id,id)
);
-- Garantias concorrentes: uma pessoa e uma posição não podem ser duplicadas na prova.
create unique index proof_school_slot_unique on public.registration_athletes(institution_id,event_id,school_id,proof_id,slot_number) where active and proof_id is not null;
create unique index proof_person_unique on public.registration_athletes(institution_id,event_id,proof_id,person_id) where active and proof_id is not null;
create index registration_athletes_person_idx on public.registration_athletes(institution_id,event_id,person_id) where active;
create index registration_athletes_participation_idx on public.registration_athletes(institution_id,event_id,participation_id);

create table public.registration_staff (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null,
 event_id uuid not null,
 school_id uuid not null,
 registration_id uuid not null,
 person_id uuid not null,
 staff_role_id uuid not null,
 created_at timestamptz not null default now(),
 unique(institution_id,id),
 unique(institution_id,event_id,registration_id,person_id),
 foreign key(institution_id,event_id,school_id,registration_id) references public.registrations(institution_id,event_id,school_id,id),
 foreign key(institution_id,person_id) references public.people(institution_id,id),
 foreign key(institution_id,event_id,staff_role_id) references public.event_staff_roles(institution_id,event_id,id)
);
create index registration_staff_person_idx on public.registration_staff(institution_id,person_id);

create table public.registration_versions (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null,
 event_id uuid not null,
 school_id uuid not null,
 registration_id uuid not null,
 revision integer not null check(revision>0),
 status text not null,
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 actor_user_id uuid references auth.users(id),
 created_at timestamptz not null default now(),
 unique(institution_id,id),
 unique(institution_id,event_id,registration_id,revision),
 foreign key(institution_id,event_id,school_id,registration_id) references public.registrations(institution_id,event_id,school_id,id)
);
create table public.registration_decisions (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null,
 event_id uuid not null,
 school_id uuid not null,
 registration_id uuid not null,
 revision integer not null,
 from_status text not null,
 to_status text not null,
 reason text not null check(btrim(reason)<>''),
 actor_user_id uuid references auth.users(id),
 created_at timestamptz not null default now(),
 unique(institution_id,id),
 foreign key(institution_id,event_id,school_id,registration_id) references public.registrations(institution_id,event_id,school_id,id),
 foreign key(institution_id,event_id,registration_id,revision) references public.registration_versions(institution_id,event_id,registration_id,revision)
);

-- Revisões de arquivos não substituem silenciosamente um documento anterior.
alter table public.participant_documents add column status text not null default 'pending' check(status in ('pending','uploaded','superseded','rejected'));
alter table public.participant_documents add column replaced_document_id uuid;
alter table public.participant_documents add column uploaded_at timestamptz;
alter table public.participant_documents add constraint replaced_document_fk foreign key(institution_id,event_id,replaced_document_id) references public.participant_documents(institution_id,event_id,id);
create unique index document_current_unique on public.participant_documents(institution_id,event_id,participation_id,requirement_id) where status in ('pending','uploaded');
create index participant_documents_participation_idx on public.participant_documents(institution_id,event_id,participation_id,status);

create table public.event_configuration_versions (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null,
 event_id uuid not null,
 version bigint not null,
 snapshot jsonb not null,
 actor_user_id uuid references auth.users(id),
 created_at timestamptz not null default now(),
 unique(institution_id,id),
 unique(institution_id,event_id,version),
 foreign key(institution_id,event_id) references public.events(institution_id,id)
);
create table public.audit_log (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id),
 actor_user_id uuid references auth.users(id),
 entity_type text not null,
 entity_id uuid not null,
 action text not null,
 before_data jsonb,
 after_data jsonb,
 created_at timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log(institution_id,entity_type,entity_id,created_at);

-- Transferências exigem decisão; não mudam a escola automaticamente.
create table public.athlete_transfer_requests (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null,
 person_id uuid not null,
 source_school_id uuid not null,
 target_school_id uuid not null,
 status text not null default 'pending' check(status in ('pending','approved','refused','cancelled')),
 request_reason text not null check(btrim(request_reason)<>''),
 decision_reason text,
 requested_by uuid references auth.users(id),
 decided_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 decided_at timestamptz,
 unique(institution_id,id),
 check(source_school_id<>target_school_id),
 check(status='pending' or btrim(coalesce(decision_reason,''))<>''),
 foreign key(institution_id,person_id) references public.people(institution_id,id),
 foreign key(institution_id,source_school_id) references public.schools(institution_id,id),
 foreign key(institution_id,target_school_id) references public.schools(institution_id,id)
);
create unique index athlete_transfer_pending_unique on public.athlete_transfer_requests(institution_id,person_id) where status='pending';

-- Caixa de saída transacional: persistência; nenhum e-mail é enviado pela migração.
create table public.notifications (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id),
 recipient_user_id uuid not null references auth.users(id),
 kind text not null,
 payload jsonb not null default '{}' check(jsonb_typeof(payload)='object'),
 deduplication_key text not null,
 read_at timestamptz,
 created_at timestamptz not null default now(),
 unique(institution_id,id),
 unique(institution_id,recipient_user_id,deduplication_key)
);
create table siep_private.notification_outbox (
 id uuid primary key default gen_random_uuid(),
 notification_id uuid not null unique references public.notifications(id),
 status text not null default 'pending' check(status in ('pending','processing','sent','failed')),
 attempts integer not null default 0 check(attempts>=0),
 available_at timestamptz not null default now(),
 locked_at timestamptz,
 last_error text,
 sent_at timestamptz
);
create index notification_outbox_pending_idx on siep_private.notification_outbox(available_at) where status in ('pending','failed');
revoke all on siep_private.notification_outbox from public,anon,authenticated;

do $$ declare t text; begin
 foreach t in array array['registrations','registration_athletes','registration_staff','registration_versions','registration_decisions','event_configuration_versions','audit_log','athlete_transfer_requests','notifications','school_link_requests'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
 end loop;
end $$;
