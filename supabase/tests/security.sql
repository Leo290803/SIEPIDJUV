-- Verificações estruturais de toda a superfície exposta ao portal.
do $$ declare row_record record;
begin
 if exists(select 1 from pg_tables where schemaname='public' and tablename in ('registrations','registration_athletes','registration_staff','registration_versions','registration_decisions','event_configuration_versions','audit_log','athlete_transfer_requests','notifications','school_link_requests','school_event_contexts') and not rowsecurity) then raise exception 'Nova tabela sem RLS'; end if;
 for row_record in select c.oid,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' loop
  if has_table_privilege('anon',row_record.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'Anon possui permissão na tabela %',row_record.relname; end if;
 end loop;
 for row_record in select p.oid,p.proname,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','siep_private') and (p.proname like 'siep\_%' escape '\' or n.nspname='siep_private') loop
  if has_function_privilege('anon',row_record.oid,'EXECUTE') then raise exception 'Função executável por anon: %',row_record.proname; end if;
  if not coalesce(row_record.proconfig @> array['search_path=pg_catalog'],false) then raise exception 'Função sem search_path fixo: %',row_record.proname; end if;
 end loop;
 if has_table_privilege('authenticated','public.registrations','INSERT,UPDATE,DELETE') or has_table_privilege('authenticated','public.registration_athletes','INSERT,UPDATE,DELETE') or has_table_privilege('authenticated','public.school_people','INSERT,UPDATE,DELETE') then raise exception 'Fluxo transacional pode ser contornado'; end if;
 if has_schema_privilege('anon','siep_private','USAGE') or has_schema_privilege('authenticated','siep_migrations','USAGE') then raise exception 'Schema privado/histórico exposto'; end if;
 if has_function_privilege('authenticated','siep_private.claim_notifications(integer)','EXECUTE') then raise exception 'Worker acessível ao portal'; end if;
 if exists(select 1 from pg_policies where schemaname='storage' and policyname like 'siep_document_%' and cmd in ('UPDATE','DELETE','ALL')) then raise exception 'Objetos de documento podem ser sobrescritos'; end if;
end $$;
