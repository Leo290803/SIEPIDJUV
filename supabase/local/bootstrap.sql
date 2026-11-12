-- Somente para PostgreSQL descartável local. Nunca executar no Supabase.
-- Stubs mínimos de Auth/Storage: os mesmos contratos são testados também no
-- projeto Supabase real com rollback. Não simula HTTP, login ou upload de bytes.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to public;
create schema storage;
create table storage.buckets(id text primary key,name text not null,public boolean not null default false,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null,owner_id text,metadata jsonb,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated;
grant select,insert,update,delete on storage.objects to authenticated;
create schema siep_migrations;
revoke all on schema siep_migrations from public,anon,authenticated;
create table siep_migrations.applied(version text primary key,checksum text not null,applied_at timestamptz not null default now());
revoke all on siep_migrations.applied from public,anon,authenticated;
