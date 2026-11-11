-- Contexto persistente por escola, mantendo a escolha de edição entre navegações.
create table public.school_event_contexts (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null,
 school_id uuid not null,
 event_id uuid not null,
 chosen_by uuid references auth.users(id),
 updated_at timestamptz not null default now(),
 unique(institution_id,id),
 unique(institution_id,school_id),
 foreign key(institution_id,school_id) references public.schools(institution_id,id),
 foreign key(institution_id,event_id) references public.events(institution_id,id)
);
alter table public.school_event_contexts enable row level security;
revoke all on public.school_event_contexts from anon,authenticated;
grant select on public.school_event_contexts to authenticated;
create policy school_context_read on public.school_event_contexts for select to authenticated using(siep_private.can_school(institution_id,school_id));
create trigger immutable_tenant before update on public.school_event_contexts for each row execute function siep_private.immutable_tenant();
create trigger audit_changes after insert or update or delete on public.school_event_contexts for each row execute function siep_private.audit_changes();
create function public.siep_set_active_event(p_school_id uuid,p_event_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare e public.events;
begin
 select * into e from public.events where id=p_event_id for share;
 if not found or e.status='archived' then raise exception 'Evento indisponível' using errcode='P0002'; end if;
 perform siep_private.require_school(e.institution_id,p_school_id);
 insert into public.school_event_contexts(institution_id,school_id,event_id,chosen_by) values(e.institution_id,p_school_id,e.id,auth.uid()) on conflict(institution_id,school_id) do update set event_id=excluded.event_id,chosen_by=excluded.chosen_by,updated_at=now();
end $$;
revoke all on function public.siep_set_active_event(uuid,uuid) from public,anon,authenticated;
grant execute on function public.siep_set_active_event(uuid,uuid) to authenticated;

-- Mapeamento legado aceita apenas alvos reais da mesma instituição.
create function siep_private.legacy_target_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare target_exists boolean;
begin
 if new.entity_type not in ('schools','people','school_people','events','event_modalities','event_categories','event_proofs','event_rules','event_fields','document_requirements','event_staff_roles','event_participations','participation_categories','participant_documents','registrations','registration_athletes','registration_staff') or btrim(new.source_namespace)='' or btrim(new.legacy_id)='' then raise exception 'Tipo/origem/identificador legado inválido' using errcode='23514'; end if;
 execute format('select exists(select 1 from public.%I where institution_id=$1 and id=$2)',new.entity_type) into target_exists using new.institution_id,new.target_id;
 if not target_exists then raise exception 'Alvo legado não existe nesta instituição' using errcode='23503'; end if;
 return new;
end $$;
create trigger legacy_target_guard before insert or update on public.legacy_id_mappings for each row execute function siep_private.legacy_target_guard();
create trigger immutable_tenant before update on public.legacy_id_mappings for each row execute function siep_private.immutable_tenant();
create trigger audit_changes after insert or update or delete on public.legacy_id_mappings for each row execute function siep_private.audit_changes();

-- Colunas de autoria/versão/data pertencem ao servidor.
revoke update on public.schools from authenticated;
grant update(name,kind,inep,archived,details) on public.schools to authenticated;
revoke insert on public.schools from authenticated;
grant insert(id,institution_id,name,kind,inep,archived,details) on public.schools to authenticated;
revoke insert on public.events from authenticated;
grant insert(id,institution_id,name,edition,status,registration_start,registration_end,correction_deadline,settings) on public.events to authenticated;

create function siep_private.touch_school() returns trigger language plpgsql set search_path=pg_catalog as $$
begin new.updated_at:=now(); return new; end $$;
create trigger touch_school before update on public.schools for each row execute function siep_private.touch_school();

-- Inscrições não podem trocar escola/edição por alteração indireta da participação.
create function siep_private.participation_context_guard() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if (new.institution_id,new.event_id,new.school_id,new.person_id) is distinct from (old.institution_id,old.event_id,old.school_id,old.person_id) then raise exception 'Contexto de participação é imutável; transferência preserva histórico' using errcode='23514'; end if;
 return new;
end $$;
create trigger participation_context_guard before update on public.event_participations for each row execute function siep_private.participation_context_guard();

revoke all on function siep_private.legacy_target_guard(),siep_private.touch_school(),siep_private.participation_context_guard() from public,anon,authenticated;

-- Uma identidade pode exercer mais de um papel, sem duplicar CPF/pessoa.
create function public.siep_link_person(p_institution_id uuid,p_school_id uuid,p_person_id uuid,p_role text) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare link_uuid uuid;
begin
 perform siep_private.require_school(p_institution_id,p_school_id);
 perform 1 from public.people where id=p_person_id and institution_id=p_institution_id and not archived for update;
 if not found or not siep_private.can_person(p_institution_id,p_person_id) then raise exception 'Pessoa indisponível' using errcode='42501'; end if;
 if p_role is null or p_role not in ('athlete','staff') then raise exception 'Este fluxo vincula apenas atleta ou profissional' using errcode='23514'; end if;
 if p_role='athlete' and exists(select 1 from public.school_people where institution_id=p_institution_id and person_id=p_person_id and role='athlete' and status='approved' and school_id<>p_school_id) then raise exception 'Atleta de outra escola exige transferência analisada' using errcode='23514'; end if;
 insert into public.school_people(institution_id,school_id,person_id,role,status) values(p_institution_id,p_school_id,p_person_id,p_role,'approved') on conflict(institution_id,school_id,person_id,role) do update set status='approved' returning id into link_uuid;
 return link_uuid;
end $$;
create function public.siep_archive_participation(p_participation_id uuid,p_archived boolean) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare p public.event_participations;
begin
 perform 1 from public.events e join public.event_participations ep on ep.event_id=e.id where ep.id=p_participation_id for update of e;
 select * into p from public.event_participations where id=p_participation_id for update;
 if not found then raise exception 'Cadastro indisponível' using errcode='P0002'; end if;
 perform siep_private.require_school(p.institution_id,p.school_id);
 if p_archived is null then raise exception 'Situação de arquivo obrigatória' using errcode='23514'; end if;
 if exists(select 1 from public.registration_athletes ra join public.registrations r on r.id=ra.registration_id where ra.participation_id=p.id and r.status not in ('cancelled','rejected')) then raise exception 'Cancele/revise inscrições ativas antes de arquivar' using errcode='23514'; end if;
 update public.event_participations set status=case when p_archived then 'archived' else 'draft' end,validated_configuration_version=null,updated_at=now() where id=p.id;
end $$;
revoke all on function public.siep_link_person(uuid,uuid,uuid,text),public.siep_archive_participation(uuid,boolean) from public,anon,authenticated;
grant execute on function public.siep_link_person(uuid,uuid,uuid,text),public.siep_archive_participation(uuid,boolean) to authenticated;

-- Limita as alterações diretas de configuração às colunas funcionais.
do $$ declare t text; columns_list text; insert_list text; begin
 foreach t in array array['event_modalities','event_categories','event_proofs','event_rules','event_fields','document_requirements','event_staff_roles'] loop
  select string_agg(quote_ident(a.attname),',' order by a.attnum) into columns_list from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=t and a.attnum>0 and not a.attisdropped and a.attname not in ('id','institution_id','event_id','created_at','updated_at');
  select string_agg(quote_ident(a.attname),',' order by a.attnum) into insert_list from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=t and a.attnum>0 and not a.attisdropped and a.attname not in ('created_at','updated_at');
  execute format('revoke insert,update on public.%I from authenticated',t);
  execute format('grant update(%s) on public.%I to authenticated',columns_list,t);
  execute format('grant insert(%s) on public.%I to authenticated',insert_list,t);
 end loop;
end $$;
revoke insert,update on public.institution_memberships from authenticated;
grant insert(id,institution_id,user_id,role,status),update(role,status) on public.institution_memberships to authenticated;

create trigger immutable_history before update or delete on public.school_link_requests for each row execute function siep_private.immutable_history();
create trigger audit_changes after insert on public.school_link_requests for each row execute function siep_private.audit_changes();
