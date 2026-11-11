-- Base SIEP. Aplicada em transação pelo executor de migrações.
-- Sem dados de demonstração; nenhuma estrutura existente é substituída.
create schema siep_private;
revoke all on schema siep_private from public, anon, authenticated;
create function siep_private.valid_cpf(cpf text) returns boolean
language plpgsql immutable strict set search_path = pg_catalog as $$
declare n integer; s integer; i integer;
begin
 if cpf !~ '^[0-9]{11}$' or cpf = repeat(left(cpf,1),11) then return false; end if;
 for n in 9..10 loop
  s := 0;
  for i in 1..n loop s := s + substr(cpf,i,1)::integer * (n+2-i); end loop;
  if (s*10 % 11) % 10 <> substr(cpf,n+1,1)::integer then return false; end if;
 end loop;
 return true;
end $$;
revoke all on function siep_private.valid_cpf(text) from public, anon, authenticated;
create table public.institutions (
 id uuid primary key default gen_random_uuid(), name text not null check (btrim(name) <> ''),
 slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 branding jsonb not null default '{}' check (jsonb_typeof(branding) = 'object'),
 created_at timestamptz not null default now()
);
create table public.institution_memberships (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id),
 user_id uuid not null references auth.users(id),
 role text not null check (role in ('admin','manager')),
 status text not null default 'pending' check (status in ('pending','approved','closed')),
 created_at timestamptz not null default now(),
 unique (institution_id,id),
 unique(institution_id,user_id)
);
create index institution_memberships_institution_idx on public.institution_memberships(institution_id);
create table public.schools (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id),
 name text not null check (btrim(name) <> ''),
 kind text not null default 'school' check (kind in ('school','club','municipality','other')),
 inep text check (inep ~ '^[0-9]{8}$'),
 archived boolean not null default false,
 details jsonb not null default '{}',
 created_at timestamptz not null default now(),
 unique (institution_id,id),
 unique(institution_id,inep)
);
create index schools_institution_idx on public.schools(institution_id);
create table public.people (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id),
 full_name text not null check (btrim(full_name) <> ''),
 birth_date date not null check (birth_date >= date '1900-01-01' and birth_date <= current_date),
 cpf text not null check (siep_private.valid_cpf(cpf)),
 gender text not null check (gender in ('Masculino','Feminino')),
 contact jsonb not null default '{}',
 archived boolean not null default false,
 created_at timestamptz not null default now(),
 unique (institution_id,id),
 unique(institution_id,cpf)
);
create index people_institution_idx on public.people(institution_id);
create table public.school_people (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id),
 school_id uuid not null,
 person_id uuid not null,
 role text not null check (role in ('athlete','responsible','staff')),
 status text not null default 'pending' check (status in ('pending','approved','refused','closed')),
 user_id uuid references auth.users(id),
 professional_registration text,
 created_at timestamptz not null default now(),
 unique (institution_id,id),
 unique(institution_id,school_id,person_id,role),
 foreign key (institution_id,school_id) references public.schools(institution_id,id),
 foreign key (institution_id,person_id) references public.people(institution_id,id)
);
create index school_people_institution_idx on public.school_people(institution_id);
create table public.membership_decisions (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id),
 school_person_id uuid not null,
 status text not null check (status in ('pending','approved','refused','closed')),
 reason text not null check (btrim(reason) <> ''),
 actor_user_id uuid references auth.users(id),
 created_at timestamptz not null default now(),
 unique (institution_id,id),
 foreign key (institution_id,school_person_id) references public.school_people(institution_id,id)
);
create index membership_decisions_institution_idx on public.membership_decisions(institution_id);
create table public.events (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id),
 name text not null check (btrim(name) <> ''),
 edition text,
 status text not null default 'draft' check (status in ('draft','open','closed','archived')),
 registration_start timestamptz,
 registration_end timestamptz,
 settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object'),
 created_at timestamptz not null default now(),
 unique (institution_id,id),
 check (registration_start is null or registration_end is null or registration_start <= registration_end)
);
create index events_institution_idx on public.events(institution_id);
create table public.event_modalities (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id),
 event_id uuid not null,
 name text not null check (btrim(name) <> ''),
 classification text not null check (classification in ('individual','collective')),
 enabled boolean not null default true,
 created_at timestamptz not null default now(),
 unique (institution_id,id),
 unique(institution_id,event_id,id),
 unique(institution_id,event_id,name),
 foreign key (institution_id,event_id) references public.events(institution_id,id)
);
create index event_modalities_institution_idx on public.event_modalities(institution_id);
create table public.event_categories (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id),
 event_id uuid not null,
 modality_id uuid not null,
 name text not null check (btrim(name) <> ''),
 participation text not null check (participation in ('individual','team')),
 birth_year_start integer,
 birth_year_end integer,
 gender text check (gender in ('Masculino','Feminino')),
 min_athletes integer check (min_athletes >= 0),
 max_athletes integer check (max_athletes >= 0),
 enabled boolean not null default true,
 created_at timestamptz not null default now(),
 unique (institution_id,id),
 unique(institution_id,event_id,id),
 foreign key (institution_id,event_id,modality_id) references public.event_modalities(institution_id,event_id,id),
 check ((birth_year_start is null and birth_year_end is null) or (birth_year_start is not null and birth_year_end is not null and birth_year_start between 1900 and 9999 and birth_year_end between birth_year_start and 9999)),
 check (min_athletes is null or max_athletes is null or min_athletes <= max_athletes),
 foreign key (institution_id,event_id) references public.events(institution_id,id)
);
create index event_categories_institution_idx on public.event_categories(institution_id);
create table public.event_proofs (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id),
 event_id uuid not null,
 category_id uuid not null,
 name text not null check (btrim(name) <> ''),
 kind text not null check (kind in ('individual','relay')),
 slots_per_school integer check (slots_per_school >= 0),
 min_athletes integer check (min_athletes >= 0),
 gender text check (gender in ('Masculino','Feminino')),
 enabled boolean not null default true,
 created_at timestamptz not null default now(),
 unique (institution_id,id),
 unique(institution_id,event_id,id),
 unique(institution_id,event_id,category_id,id),
 foreign key (institution_id,event_id,category_id) references public.event_categories(institution_id,event_id,id),
 check (min_athletes is null or slots_per_school is null or min_athletes <= slots_per_school),
 foreign key (institution_id,event_id) references public.events(institution_id,id)
);
create index event_proofs_institution_idx on public.event_proofs(institution_id);
create table public.event_rules (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id),
 event_id uuid not null,
 kind text not null check (kind in ('modalities','athleteCategories','proofs','proofEntries','roster','schoolEntries','age','staffLimits')),
 category_id uuid,
 proof_id uuid,
 enabled boolean not null default true,
 parameters jsonb not null check (jsonb_typeof(parameters) = 'object'),
 created_at timestamptz not null default now(),
 unique (institution_id,id),
 unique(institution_id,event_id,id),
 foreign key (institution_id,event_id,category_id) references public.event_categories(institution_id,event_id,id),
 foreign key (institution_id,event_id,category_id,proof_id) references public.event_proofs(institution_id,event_id,category_id,id),
 check (proof_id is null or category_id is not null),
 check ((kind in ('modalities','athleteCategories') and category_id is null and proof_id is null) or (kind = 'proofs' and category_id is not null and proof_id is null) or (kind = 'proofEntries' and proof_id is not null) or (kind in ('roster','schoolEntries','age','staffLimits') and category_id is not null)),
 foreign key (institution_id,event_id) references public.events(institution_id,id)
);
create index event_rules_institution_idx on public.event_rules(institution_id);
create table public.event_fields (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id),
 event_id uuid not null,
 field_key text not null,
 requirement text not null check (requirement in ('hidden','optional','required')),
 configuration jsonb not null default '{}',
 created_at timestamptz not null default now(),
 unique (institution_id,id),
 unique(institution_id,event_id,id),
 unique(institution_id,event_id,field_key),
 foreign key (institution_id,event_id) references public.events(institution_id,id)
);
create index event_fields_institution_idx on public.event_fields(institution_id);
create table public.document_requirements (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id),
 event_id uuid not null,
 name text not null check (btrim(name) <> ''),
 required boolean not null default false,
 image_only boolean not null default false,
 max_bytes integer not null default 5242880 check (max_bytes between 1 and 5242880),
 category_id uuid,
 created_at timestamptz not null default now(),
 unique (institution_id,id),
 unique(institution_id,event_id,id),
 foreign key (institution_id,event_id,category_id) references public.event_categories(institution_id,event_id,id),
 foreign key (institution_id,event_id) references public.events(institution_id,id)
);
create index document_requirements_institution_idx on public.document_requirements(institution_id);
create table public.event_staff_roles (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id),
 event_id uuid not null,
 name text not null check (btrim(name) <> ''),
 enabled boolean not null default true,
 created_at timestamptz not null default now(),
 unique (institution_id,id),
 unique(institution_id,event_id,id),
 unique(institution_id,event_id,name),
 foreign key (institution_id,event_id) references public.events(institution_id,id)
);
create index event_staff_roles_institution_idx on public.event_staff_roles(institution_id);
create table public.event_participations (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id),
 event_id uuid not null,
 school_id uuid not null,
 person_id uuid not null,
 status text not null default 'draft' check (status in ('draft','complete','archived')),
 additional_data jsonb not null default '{}',
 created_at timestamptz not null default now(),
 unique (institution_id,id),
 unique(institution_id,event_id,id),
 unique(institution_id,event_id,person_id),
 unique(institution_id,event_id,school_id,id),
 foreign key (institution_id,event_id) references public.events(institution_id,id),
 foreign key (institution_id,school_id) references public.schools(institution_id,id),
 foreign key (institution_id,person_id) references public.people(institution_id,id)
);
create index event_participations_institution_idx on public.event_participations(institution_id);
create table public.participation_categories (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id),
 event_id uuid not null,
 participation_id uuid not null,
 category_id uuid not null,
 created_at timestamptz not null default now(),
 unique (institution_id,id),
 unique(institution_id,event_id,id),
 foreign key (institution_id,event_id,participation_id) references public.event_participations(institution_id,event_id,id),
 foreign key (institution_id,event_id,category_id) references public.event_categories(institution_id,event_id,id),
 unique(institution_id,event_id,participation_id,category_id),
 foreign key (institution_id,event_id) references public.events(institution_id,id)
);
create index participation_categories_institution_idx on public.participation_categories(institution_id);
create table public.participant_documents (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id),
 event_id uuid not null,
 participation_id uuid not null,
 requirement_id uuid not null,
 bucket_id text not null default 'siep-documents' check (bucket_id = 'siep-documents'),
 object_path text not null unique,
 mime_type text not null check (mime_type in ('application/pdf','image/png','image/jpeg')),
 size_bytes integer not null check (size_bytes between 1 and 5242880),
 original_name text not null,
 created_at timestamptz not null default now(),
 unique (institution_id,id),
 unique(institution_id,event_id,id),
 foreign key (institution_id,event_id,participation_id) references public.event_participations(institution_id,event_id,id),
 foreign key (institution_id,event_id,requirement_id) references public.document_requirements(institution_id,event_id,id),
 check (split_part(object_path,'/',1) = institution_id::text and split_part(object_path,'/',2) = event_id::text),
 foreign key (institution_id,event_id) references public.events(institution_id,id)
);
create index participant_documents_institution_idx on public.participant_documents(institution_id);
create table public.legacy_id_mappings (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id),
 source_namespace text not null,
 entity_type text not null,
 legacy_id text not null,
 target_id uuid not null,
 created_at timestamptz not null default now(),
 unique (institution_id,id),
 unique(institution_id,source_namespace,entity_type,legacy_id)
);
create index legacy_id_mappings_institution_idx on public.legacy_id_mappings(institution_id);
alter table public.institutions enable row level security;
revoke all on public.institutions from anon, authenticated;
alter table public.institution_memberships enable row level security;
revoke all on public.institution_memberships from anon, authenticated;
alter table public.schools enable row level security;
revoke all on public.schools from anon, authenticated;
alter table public.people enable row level security;
revoke all on public.people from anon, authenticated;
alter table public.school_people enable row level security;
revoke all on public.school_people from anon, authenticated;
alter table public.membership_decisions enable row level security;
revoke all on public.membership_decisions from anon, authenticated;
alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;
alter table public.event_modalities enable row level security;
revoke all on public.event_modalities from anon, authenticated;
alter table public.event_categories enable row level security;
revoke all on public.event_categories from anon, authenticated;
alter table public.event_proofs enable row level security;
revoke all on public.event_proofs from anon, authenticated;
alter table public.event_rules enable row level security;
revoke all on public.event_rules from anon, authenticated;
alter table public.event_fields enable row level security;
revoke all on public.event_fields from anon, authenticated;
alter table public.document_requirements enable row level security;
revoke all on public.document_requirements from anon, authenticated;
alter table public.event_staff_roles enable row level security;
revoke all on public.event_staff_roles from anon, authenticated;
alter table public.event_participations enable row level security;
revoke all on public.event_participations from anon, authenticated;
alter table public.participation_categories enable row level security;
revoke all on public.participation_categories from anon, authenticated;
alter table public.participant_documents enable row level security;
revoke all on public.participant_documents from anon, authenticated;
alter table public.legacy_id_mappings enable row level security;
revoke all on public.legacy_id_mappings from anon, authenticated;
-- Acesso administrativo apenas nesta fase; nenhuma política pública permissiva.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('siep-documents','siep-documents',false,5242880,array['application/pdf','image/png','image/jpeg']);
