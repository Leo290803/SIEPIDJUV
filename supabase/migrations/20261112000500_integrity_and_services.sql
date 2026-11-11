-- Consultas para os N seletores de vagas. Nunca devolvem CPF ou contato.
create function public.siep_eligible_athletes(p_event_id uuid,p_school_id uuid,p_category_id uuid,p_proof_id uuid default null,p_registration_id uuid default null) returns table(participation_id uuid,person_id uuid,full_name text,birth_date date,gender text)
language plpgsql stable security definer set search_path=pg_catalog as $$
declare e public.events; category public.event_categories; proof public.event_proofs;
begin
 select * into e from public.events where id=p_event_id;
 if not found then raise exception 'Evento indisponível' using errcode='P0002'; end if;
 perform siep_private.require_school(e.institution_id,p_school_id);
 select * into category from public.event_categories where id=p_category_id and event_id=e.id;
 if not found then raise exception 'Categoria indisponível' using errcode='P0002'; end if;
 if p_proof_id is not null then
  select * into proof from public.event_proofs where id=p_proof_id and category_id=category.id;
  if not found then raise exception 'Prova indisponível' using errcode='P0002'; end if;
 end if;
 if p_registration_id is not null and not exists(select 1 from public.registrations r where r.id=p_registration_id and r.event_id=e.id and r.school_id=p_school_id and r.category_id=category.id and r.proof_id is not distinct from p_proof_id) then raise exception 'Inscrição indisponível' using errcode='42501'; end if;
 return query select ep.id,p.id,p.full_name,p.birth_date,p.gender from public.event_participations ep join public.people p on p.id=ep.person_id join public.participation_categories pc on pc.participation_id=ep.id and pc.category_id=category.id where ep.event_id=e.id and ep.school_id=p_school_id and ep.status='complete' and category.enabled and (p_proof_id is null or proof.enabled) and siep_private.participation_issues(ep.id)='[]'::jsonb and (category.gender is null or category.gender=p.gender) and (proof.gender is null or proof.gender=p.gender) and siep_private.candidate_athlete_issues(e.id,p.id,category.id,p_proof_id,p_registration_id)='[]'::jsonb and not exists(select 1 from public.registration_athletes ra where ra.event_id=e.id and ra.proof_id=p_proof_id and ra.person_id=p.id and ra.active and (p_registration_id is null or ra.registration_id<>p_registration_id)) order by p.full_name,p.id;
 -- A prévia abaixo também verifica mínimos e comissão do conjunto candidato.
end $$;

create function public.siep_preview_registration(p_event_id uuid,p_school_id uuid,p_category_id uuid,p_proof_id uuid,p_athletes jsonb,p_staff jsonb,p_registration_id uuid default null,p_expected_revision integer default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 begin
  result:=public.siep_save_registration(p_event_id,p_school_id,p_category_id,p_proof_id,p_athletes,p_staff,p_registration_id,p_expected_revision);
  raise exception using errcode='Z0002',message='preview rollback';
 exception when sqlstate 'Z0002' then null; end;
 return result-'id'-'revision'-'status';
end $$;

-- Recibo persistente e consultável apenas por quem pode ler a inscrição.
create function public.siep_registration_receipt(p_registration_id uuid,p_revision integer default null) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare r public.registrations; version public.registration_versions;
begin
 select * into r from public.registrations where id=p_registration_id;
 if not found then raise exception 'Inscrição indisponível' using errcode='P0002'; end if;
 perform siep_private.require_school(r.institution_id,r.school_id);
 select * into version from public.registration_versions where registration_id=r.id and revision=coalesce(p_revision,r.revision);
 if not found then raise exception 'Versão indisponível' using errcode='P0002'; end if;
 return jsonb_build_object('registration_id',r.id,'revision',version.revision,'status',version.status,'recorded_at',version.created_at,'snapshot',version.snapshot);
end $$;

-- Nenhuma redução de capacidade pode deixar posições ocupadas fora dos N seletores.
create function siep_private.proof_capacity_guard() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if new.slots_per_school is not null and exists(select 1 from public.registration_athletes ra where ra.proof_id=new.id and ra.active and ra.slot_number>new.slots_per_school) then raise exception 'Capacidade menor que vagas já selecionadas; revise inscrições antes' using errcode='23514'; end if;
 return new;
end $$;
create trigger proof_capacity_guard before update on public.event_proofs for each row execute function siep_private.proof_capacity_guard();

-- Protege atributos que não fazem parte do formulário de edição da secretaria.
revoke update on public.events from authenticated;
grant update(name,edition,status,registration_start,registration_end,correction_deadline,settings) on public.events to authenticated;
revoke update on public.institutions from authenticated;
grant update(name,slug,branding) on public.institutions to authenticated;

-- Não permitir remover o último administrador aprovado, mesmo por engano.
create function siep_private.guard_last_admin() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform 1 from public.institutions where id=old.institution_id for update;
 if old.status='approved' and old.role='admin' and (tg_op='DELETE' or new.status<>'approved' or new.role<>'admin') and not exists(select 1 from public.institution_memberships m where m.institution_id=old.institution_id and m.id<>old.id and m.role='admin' and m.status='approved') then raise exception 'Instituição precisa manter um administrador aprovado' using errcode='23514'; end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger guard_last_admin before update or delete on public.institution_memberships for each row execute function siep_private.guard_last_admin();

-- Integridade adicional para caminhos e versões de documento.
create function siep_private.document_integrity() returns trigger language plpgsql security definer set search_path=pg_catalog as $$
declare requirement public.document_requirements; p public.event_participations;
begin
 select * into requirement from public.document_requirements where id=new.requirement_id;
 select * into p from public.event_participations where id=new.participation_id;
 if (tg_op='INSERT' or (new.status='uploaded' and old.status='pending')) and (new.size_bytes>requirement.max_bytes or (requirement.image_only and new.mime_type not in ('image/png','image/jpeg'))) then raise exception 'Documento incompatível com a exigência' using errcode='23514'; end if;
 if split_part(new.object_path,'/',3)<>p.id::text then raise exception 'Caminho não pertence ao cadastro' using errcode='23514'; end if;
 if new.replaced_document_id is not null and not exists(select 1 from public.participant_documents d where d.id=new.replaced_document_id and d.participation_id=new.participation_id and d.requirement_id=new.requirement_id and d.id<>new.id) then raise exception 'Documento anterior de outro cadastro/exigência' using errcode='23514'; end if;
 if tg_op='UPDATE' and (new.institution_id,new.event_id,new.participation_id,new.requirement_id,new.bucket_id,new.object_path,new.mime_type,new.size_bytes,new.original_name,new.replaced_document_id) is distinct from (old.institution_id,old.event_id,old.participation_id,old.requirement_id,old.bucket_id,old.object_path,old.mime_type,old.size_bytes,old.original_name,old.replaced_document_id) then raise exception 'Metadados são imutáveis; crie nova versão' using errcode='23514'; end if;
 return new;
end $$;
create trigger document_integrity before insert or update on public.participant_documents for each row execute function siep_private.document_integrity();

-- Entrega de e-mail será feita por worker externo, sem tokens de provedor no banco.
alter table siep_private.notification_outbox add column claim_token uuid;
create function siep_private.claim_notifications(batch_size integer default 20) returns setof siep_private.notification_outbox
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if batch_size is null or batch_size not between 1 and 100 then raise exception 'Lote deve conter de 1 a 100 notificações' using errcode='23514'; end if;
 return query with candidates as (
  select o.id from siep_private.notification_outbox o where o.attempts<10 and ((o.status in ('pending','failed') and o.available_at<=now()) or (o.status='processing' and o.locked_at<now()-interval '5 minutes')) order by o.available_at,o.id for update skip locked limit batch_size
 ) update siep_private.notification_outbox o set status='processing',locked_at=now(),claim_token=gen_random_uuid(),attempts=attempts+1 from candidates c where o.id=c.id returning o.*;
end $$;
create function siep_private.finish_notification(outbox_id uuid,token uuid,error_message text default null) returns void
language plpgsql security definer set search_path=pg_catalog as $$
begin
 update siep_private.notification_outbox set status=case when error_message is null then 'sent' else 'failed' end,sent_at=case when error_message is null then now() else null end,last_error=left(error_message,1000),available_at=now()+interval '5 minutes',locked_at=null,claim_token=null where id=outbox_id and status='processing' and claim_token=token;
 if not found then raise exception 'Notificação não está reservada por este worker' using errcode='40001'; end if;
end $$;

create index institution_memberships_user_idx on public.institution_memberships(user_id,institution_id,status);
create index registration_versions_lookup_idx on public.registration_versions(institution_id,event_id,school_id,registration_id,revision);
create index registration_decisions_lookup_idx on public.registration_decisions(institution_id,event_id,school_id,registration_id);
create index notifications_recipient_idx on public.notifications(recipient_user_id,created_at desc);
create index school_link_requests_owner_idx on public.school_link_requests(user_id,institution_id);

revoke all on all functions in schema siep_private from public,anon,authenticated;
grant execute on function siep_private.is_staff(uuid,boolean),siep_private.can_school(uuid,uuid),siep_private.in_tenant(uuid),siep_private.can_person(uuid,uuid),siep_private.can_participation(uuid),siep_private.document_access(text,boolean) to authenticated;
grant usage on schema siep_private to service_role;
grant select on siep_private.notification_outbox,public.notifications to service_role;
grant execute on function siep_private.claim_notifications(integer),siep_private.finish_notification(uuid,uuid,text) to service_role;
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'siep\_%' escape '\' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
