-- Permissões baseadas em vínculos aprovados, nunca no seletor da demonstração.
create function siep_private.is_staff(tenant uuid, admin_only boolean default false) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from public.institution_memberships m where m.institution_id=tenant and m.user_id=auth.uid() and m.status='approved' and (not admin_only or m.role='admin'));
$$;
create function siep_private.can_school(tenant uuid,school uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select siep_private.is_staff(tenant) or exists(select 1 from public.school_people sp join public.schools s on s.id=sp.school_id join public.people p on p.id=sp.person_id where sp.institution_id=tenant and sp.school_id=school and sp.role='responsible' and sp.status='approved' and sp.user_id=auth.uid() and not s.archived and not p.archived);
$$;
create function siep_private.in_tenant(tenant uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select siep_private.is_staff(tenant) or exists(select 1 from public.school_people sp where sp.institution_id=tenant and sp.user_id=auth.uid() and sp.role='responsible' and sp.status='approved' and siep_private.can_school(tenant,sp.school_id));
$$;
create function siep_private.can_person(tenant uuid,person uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select siep_private.is_staff(tenant) or exists(select 1 from public.school_people sp where sp.institution_id=tenant and sp.person_id=person and sp.status='approved' and siep_private.can_school(tenant,sp.school_id));
$$;
create function siep_private.can_participation(participation uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from public.event_participations p where p.id=participation and siep_private.can_school(p.institution_id,p.school_id));
$$;

-- Escopo privado não é exposto como schema do PostgREST; somente predicados RLS recebem execução.
grant usage on schema siep_private to authenticated;
grant execute on function siep_private.is_staff(uuid,boolean),siep_private.can_school(uuid,uuid),siep_private.in_tenant(uuid),siep_private.can_person(uuid,uuid),siep_private.can_participation(uuid) to authenticated;

create policy institutions_read on public.institutions for select to authenticated using(siep_private.in_tenant(id));
create policy institutions_update on public.institutions for update to authenticated using(siep_private.is_staff(id,true)) with check(siep_private.is_staff(id,true));
grant select,update on public.institutions to authenticated;
create policy memberships_read on public.institution_memberships for select to authenticated using(siep_private.is_staff(institution_id,true) or user_id=auth.uid());
create policy memberships_admin on public.institution_memberships for all to authenticated using(siep_private.is_staff(institution_id,true)) with check(siep_private.is_staff(institution_id,true));
grant select,insert,update on public.institution_memberships to authenticated;
-- O primeiro administrador só é provisionado por operação administrativa auditada.
create policy people_read on public.people for select to authenticated using(siep_private.can_person(institution_id,id));
grant select on public.people to authenticated;
create policy schools_read on public.schools for select to authenticated using(siep_private.can_school(institution_id,id));
create policy schools_manage on public.schools for all to authenticated using(siep_private.is_staff(institution_id)) with check(siep_private.is_staff(institution_id));
grant select,insert,update on public.schools to authenticated;
create policy school_people_read on public.school_people for select to authenticated using(siep_private.can_school(institution_id,school_id) or (user_id=auth.uid() and role='responsible'));
grant select on public.school_people to authenticated;
create policy membership_decisions_read on public.membership_decisions for select to authenticated using(siep_private.is_staff(institution_id) or exists(select 1 from public.school_people sp where sp.id=school_person_id and sp.user_id=auth.uid()));
grant select on public.membership_decisions to authenticated;
create policy school_link_requests_read on public.school_link_requests for select to authenticated using(siep_private.is_staff(institution_id) or user_id=auth.uid());
grant select on public.school_link_requests to authenticated;

do $$ declare t text; begin
 foreach t in array array['events','event_modalities','event_categories','event_proofs','event_rules','event_fields','document_requirements','event_staff_roles'] loop
  execute format('create policy configuration_read on public.%I for select to authenticated using(siep_private.in_tenant(institution_id))',t);
  execute format('create policy configuration_manage on public.%I for all to authenticated using(siep_private.is_staff(institution_id)) with check(siep_private.is_staff(institution_id))',t);
  execute format('grant select,insert,update on public.%I to authenticated',t);
 end loop;
 foreach t in array array['event_participations','registrations','registration_athletes','registration_staff','registration_versions','registration_decisions'] loop
  execute format('create policy school_read on public.%I for select to authenticated using(siep_private.can_school(institution_id,school_id))',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy participation_categories_read on public.participation_categories for select to authenticated using(siep_private.can_participation(participation_id));
create policy participant_documents_read on public.participant_documents for select to authenticated using(siep_private.can_participation(participation_id));
grant select on public.participation_categories,public.participant_documents to authenticated;
create policy configuration_history_read on public.event_configuration_versions for select to authenticated using(siep_private.is_staff(institution_id));
create policy audit_read on public.audit_log for select to authenticated using(siep_private.is_staff(institution_id,true));
create policy transfers_read on public.athlete_transfer_requests for select to authenticated using(siep_private.can_school(institution_id,source_school_id) or siep_private.can_school(institution_id,target_school_id));
create policy notifications_read on public.notifications for select to authenticated using(recipient_user_id=auth.uid() and siep_private.in_tenant(institution_id));
grant select on public.event_configuration_versions,public.audit_log,public.athlete_transfer_requests,public.notifications to authenticated;

create function siep_private.require_school(tenant uuid,school uuid) returns void
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is null or not siep_private.can_school(tenant,school) then raise exception 'Acesso à escola não autorizado' using errcode='42501'; end if;
end $$;
create function siep_private.require_staff(tenant uuid) returns void
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is null or not siep_private.is_staff(tenant) then raise exception 'Acesso à secretaria não autorizado' using errcode='42501'; end if;
end $$;

create function siep_private.registration_snapshot(registration uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
 select jsonb_build_object('registration',to_jsonb(r),'school',(select jsonb_build_object('id',s.id,'name',s.name,'inep',s.inep,'kind',s.kind) from public.schools s where s.id=r.school_id),'event',jsonb_build_object('id',e.id,'name',e.name,'edition',e.edition),'category',(select to_jsonb(c) from public.event_categories c where c.id=r.category_id),'proof',(select to_jsonb(p) from public.event_proofs p where p.id=r.proof_id),'athletes',(select coalesce(jsonb_agg(jsonb_build_object('allocation',to_jsonb(ra),'person',to_jsonb(p),'participation',to_jsonb(ep),'documents',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from public.participant_documents d where d.participation_id=ep.id and d.status='uploaded'))),'[]') from public.registration_athletes ra join public.people p on p.id=ra.person_id join public.event_participations ep on ep.id=ra.participation_id where ra.registration_id=r.id),'staff',(select coalesce(jsonb_agg(jsonb_build_object('assignment',to_jsonb(rs),'person',to_jsonb(p))),'[]') from public.registration_staff rs join public.people p on p.id=rs.person_id where rs.registration_id=r.id),'configuration_version',e.configuration_version) from public.registrations r join public.events e on e.id=r.event_id where r.id=registration;
$$;
create function siep_private.record_registration(registration uuid) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare r public.registrations;
begin
 select * into strict r from public.registrations where id=registration;
 insert into public.registration_versions(institution_id,event_id,school_id,registration_id,revision,status,snapshot,actor_user_id) values(r.institution_id,r.event_id,r.school_id,r.id,r.revision,r.status,siep_private.registration_snapshot(r.id),auth.uid());
 insert into public.event_configuration_versions(institution_id,event_id,version,snapshot,actor_user_id) select e.institution_id,e.id,e.configuration_version,siep_private.event_snapshot(e.id),auth.uid() from public.events e where e.id=r.event_id on conflict(institution_id,event_id,version) do nothing;
end $$;

-- Salvar rascunho é atômico e usa versão esperada para evitar perda de edição.
create function public.siep_save_registration(p_event_id uuid,p_school_id uuid,p_category_id uuid,p_proof_id uuid,p_athletes jsonb,p_staff jsonb,p_registration_id uuid default null,p_expected_revision integer default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare e public.events; r public.registrations; item jsonb; issues jsonb;
begin
 select * into e from public.events where id=p_event_id for update;
 if not found then raise exception 'Evento indisponível' using errcode='P0002'; end if;
 perform siep_private.require_school(e.institution_id,p_school_id);
 if e.status='archived' or exists(select 1 from public.schools where id=p_school_id and archived) then raise exception 'Evento/escola arquivado' using errcode='23514'; end if;
 if jsonb_typeof(p_athletes) is distinct from 'array' or jsonb_typeof(p_staff) is distinct from 'array' then raise exception 'Integrantes devem ser listas' using errcode='23514'; end if;
 if jsonb_array_length(p_athletes)>1000 or jsonb_array_length(p_staff)>100 then raise exception 'Lista de integrantes excessiva' using errcode='23514'; end if;
 -- Mesma ordem de locks em todas as inscrições: evento, depois pessoas por UUID.
 perform 1 from public.people p where p.id in (
  select ep.person_id from public.event_participations ep join jsonb_array_elements(p_athletes) x on ep.id=(x->>'participation_id')::uuid
  union select (x->>'person_id')::uuid from jsonb_array_elements(p_staff) x
 ) order by p.id for share;
 if p_registration_id is null then
  insert into public.registrations(institution_id,event_id,school_id,category_id,proof_id,created_by,updated_by) values(e.institution_id,e.id,p_school_id,p_category_id,p_proof_id,auth.uid(),auth.uid()) returning * into r;
 else
  select * into r from public.registrations where id=p_registration_id and event_id=e.id and school_id=p_school_id for update;
  if not found then raise exception 'Inscrição indisponível' using errcode='P0002'; end if;
  if p_expected_revision is null or p_expected_revision<>r.revision then raise exception 'Inscrição alterada; recarregue a revisão atual' using errcode='40001'; end if;
  if r.status not in ('draft','correction_requested') then raise exception 'Inscrição não editável' using errcode='23514'; end if;
  if r.status='correction_requested' and (coalesce(r.correction_deadline,e.correction_deadline) is not null and now()>coalesce(r.correction_deadline,e.correction_deadline)) then raise exception 'Prazo de correção encerrado' using errcode='23514'; end if;
  if (r.category_id,r.proof_id) is distinct from (p_category_id,p_proof_id) then raise exception 'Categoria/prova imutáveis; cancele e crie outra inscrição' using errcode='23514'; end if;
  delete from public.registration_athletes where registration_id=r.id;
  delete from public.registration_staff where registration_id=r.id;
  update public.registrations set revision=revision+1,updated_at=now(),updated_by=auth.uid() where id=r.id returning * into r;
 end if;
 for item in select value from jsonb_array_elements(p_athletes) loop
  if jsonb_typeof(item)<>'object' or not (item ? 'participation_id' and item ? 'slot_number') then raise exception 'Atleta deve informar participação e vaga' using errcode='23514'; end if;
  insert into public.registration_athletes(institution_id,event_id,school_id,registration_id,participation_id,person_id,slot_number) values(e.institution_id,e.id,p_school_id,r.id,(item->>'participation_id')::uuid,gen_random_uuid(),(item->>'slot_number')::integer);
 end loop;
 for item in select value from jsonb_array_elements(p_staff) loop
  insert into public.registration_staff(institution_id,event_id,school_id,registration_id,person_id,staff_role_id) values(e.institution_id,e.id,p_school_id,r.id,(item->>'person_id')::uuid,(item->>'staff_role_id')::uuid);
 end loop;
 issues:=siep_private.registration_issues(r.id);
 perform siep_private.record_registration(r.id);
 return jsonb_build_object('id',r.id,'revision',r.revision,'status',r.status,'issues',issues);
end $$;

create function public.siep_registration_issues(p_registration_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare r public.registrations;
begin
 select * into r from public.registrations where id=p_registration_id;
 if not found then raise exception 'Inscrição indisponível' using errcode='P0002'; end if;
 perform siep_private.require_school(r.institution_id,r.school_id);
 return siep_private.registration_issues(r.id);
end $$;

create function public.siep_transition_registration(p_registration_id uuid,p_expected_revision integer,p_status text,p_reason text,p_correction_deadline timestamptz default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare r public.registrations; e public.events; old_status text; issues jsonb; recipient record; notification_uuid uuid;
begin
 -- Descobrir evento sem obter locks em ordem inversa.
 select e0.* into e from public.events e0 join public.registrations r0 on r0.event_id=e0.id where r0.id=p_registration_id for update of e0;
 if not found then raise exception 'Inscrição indisponível' using errcode='P0002'; end if;
 select * into strict r from public.registrations where id=p_registration_id for update;
 perform siep_private.require_school(r.institution_id,r.school_id);
 if p_expected_revision is null or p_expected_revision<>r.revision then raise exception 'Inscrição alterada; recarregue' using errcode='40001'; end if;
 if btrim(coalesce(p_reason,''))='' then raise exception 'Justificativa obrigatória' using errcode='23514'; end if;
 old_status:=r.status;
 if p_status='submitted' and r.status in ('draft','correction_requested') then
  if e.status<>'open' then raise exception 'Evento não está aberto' using errcode='23514'; end if;
  if r.status='draft' and ((e.registration_start is not null and now()<e.registration_start) or (e.registration_end is not null and now()>e.registration_end)) then raise exception 'Fora do prazo de inscrição' using errcode='23514'; end if;
  if r.status='correction_requested' and coalesce(r.correction_deadline,e.correction_deadline,e.registration_end) is not null and now()>coalesce(r.correction_deadline,e.correction_deadline,e.registration_end) then raise exception 'Prazo de correção encerrado' using errcode='23514'; end if;
 elsif p_status in ('approved','rejected','correction_requested') and r.status='submitted' then
  perform siep_private.require_staff(r.institution_id);
  if p_status='correction_requested' and (p_correction_deadline is null or p_correction_deadline<=now()) then raise exception 'Informe prazo futuro para correção' using errcode='23514'; end if;
 elsif p_status='cancelled' and r.status in ('draft','submitted','correction_requested','approved') then
  if r.status='approved' then perform siep_private.require_staff(r.institution_id); end if;
 else raise exception 'Transição de situação inválida' using errcode='23514'; end if;
 if p_status in ('submitted','approved') then
  perform 1 from public.people p where p.id in (select person_id from public.registration_athletes where registration_id=r.id union select person_id from public.registration_staff where registration_id=r.id) order by p.id for share;
  issues:=siep_private.registration_issues(r.id);
  if issues<>'[]'::jsonb then raise exception 'Pendências impedem envio/aprovação' using errcode='23514',detail=issues::text; end if;
 end if;
 update public.registrations set status=p_status,revision=revision+1,updated_at=now(),updated_by=auth.uid(),submitted_at=case when p_status='submitted' then now() else submitted_at end,correction_deadline=case when p_status='correction_requested' then p_correction_deadline else correction_deadline end where id=r.id returning * into r;
 perform siep_private.record_registration(r.id);
 insert into public.registration_decisions(institution_id,event_id,school_id,registration_id,revision,from_status,to_status,reason,actor_user_id) values(r.institution_id,r.event_id,r.school_id,r.id,r.revision,old_status,r.status,p_reason,auth.uid());
 for recipient in select distinct user_id from public.school_people sp where sp.institution_id=r.institution_id and sp.school_id=r.school_id and sp.role='responsible' and sp.status='approved' and sp.user_id is not null loop
  insert into public.notifications(institution_id,recipient_user_id,kind,payload,deduplication_key) values(r.institution_id,recipient.user_id,'registration_status',jsonb_build_object('registration_id',r.id,'status',r.status,'revision',r.revision),r.id::text||':'||r.revision) returning id into notification_uuid;
  insert into siep_private.notification_outbox(notification_id) values(notification_uuid);
 end loop;
 return jsonb_build_object('id',r.id,'revision',r.revision,'status',r.status);
end $$;

-- Dados de pessoa são reutilizáveis; ninguém seleciona o próprio papel administrativo.
create function public.siep_save_person(p_institution_id uuid,p_school_id uuid,p_role text,p_data jsonb,p_person_id uuid default null) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare person_uuid uuid; old_person public.people;
begin
 perform siep_private.require_school(p_institution_id,p_school_id);
 if p_role is null or p_role not in ('athlete','staff','responsible') then raise exception 'Papel inválido' using errcode='23514'; end if;
 if p_role='responsible' then perform siep_private.require_staff(p_institution_id); end if;
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Dados de pessoa inválidos' using errcode='23514'; end if;
 if p_person_id is null then
  -- Não retorna pessoa de outra escola ao descobrir CPF existente.
  insert into public.people(institution_id,full_name,birth_date,cpf,gender,contact) values(p_institution_id,p_data->>'full_name',(p_data->>'birth_date')::date,regexp_replace(p_data->>'cpf','[^0-9]','','g'),p_data->>'gender',coalesce(p_data->'contact','{}')) returning id into person_uuid;
 else
  select * into old_person from public.people where id=p_person_id and institution_id=p_institution_id for update;
  if not found or not siep_private.can_person(p_institution_id,p_person_id) or not exists(select 1 from public.school_people where institution_id=p_institution_id and school_id=p_school_id and person_id=p_person_id and role=p_role and (status='approved' or siep_private.is_staff(p_institution_id))) then raise exception 'Pessoa indisponível nesta escola' using errcode='42501'; end if;
  if exists(select 1 from public.registration_athletes ra join public.registrations r on r.id=ra.registration_id where ra.person_id=p_person_id and r.status in ('submitted','approved')) then raise exception 'Identidade em inscrição enviada; solicite correção antes de editar' using errcode='23514'; end if;
  if not siep_private.is_staff(p_institution_id) and exists(select 1 from public.school_people where institution_id=p_institution_id and person_id=p_person_id and role='responsible' and user_id is not null and user_id<>auth.uid()) then raise exception 'Identidade de outro responsável exige revisão pela secretaria' using errcode='42501'; end if;
  -- Reutilização não permite a uma escola alterar identidade compartilhada com outra.
  if not siep_private.is_staff(p_institution_id) and exists(select 1 from public.school_people where institution_id=p_institution_id and person_id=p_person_id and school_id<>p_school_id and status='approved') then raise exception 'Identidade compartilhada: solicite revisão à secretaria' using errcode='42501'; end if;
  update public.people set full_name=p_data->>'full_name',birth_date=(p_data->>'birth_date')::date,cpf=regexp_replace(p_data->>'cpf','[^0-9]','','g'),gender=p_data->>'gender',contact=coalesce(p_data->'contact','{}'),updated_at=now(),archived=coalesce((p_data->>'archived')::boolean,false) where id=old_person.id returning id into person_uuid;
 end if;
 if p_person_id is null then
  insert into public.school_people(institution_id,school_id,person_id,role,status,position,professional_registration) values(p_institution_id,p_school_id,person_uuid,p_role,case when p_role='responsible' then 'pending' else 'approved' end,p_data->>'position',p_data->>'professional_registration');
 end if;
 if p_person_id is not null and p_role='staff' then update public.school_people set position=p_data->>'position',professional_registration=p_data->>'professional_registration' where institution_id=p_institution_id and school_id=p_school_id and person_id=person_uuid and role='staff'; end if;
 return person_uuid;
end $$;

create function public.siep_save_participation(p_event_id uuid,p_school_id uuid,p_person_id uuid,p_category_ids uuid[],p_additional_data jsonb,p_complete boolean default false) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare e public.events; p public.event_participations; category uuid; issues jsonb;
begin
 select * into e from public.events where id=p_event_id for update;
 if not found then raise exception 'Evento indisponível' using errcode='P0002'; end if;
 perform siep_private.require_school(e.institution_id,p_school_id);
 if e.status='archived' then raise exception 'Evento arquivado' using errcode='23514'; end if;
 perform 1 from public.people where id=p_person_id and institution_id=e.institution_id for share;
 if not exists(select 1 from public.school_people where institution_id=e.institution_id and school_id=p_school_id and person_id=p_person_id and role='athlete' and status='approved') then raise exception 'Atleta sem vínculo aprovado' using errcode='42501'; end if;
 select * into p from public.event_participations where event_id=e.id and person_id=p_person_id for update;
 if found then
  if p.school_id<>p_school_id then raise exception 'Participação já vinculada a outra escola; transferência exige análise' using errcode='23514'; end if;
  if exists(select 1 from public.registration_athletes ra join public.registrations r on r.id=ra.registration_id where ra.participation_id=p.id and r.status in ('submitted','approved')) then raise exception 'Cadastro em inscrição enviada; solicite correção antes de editar' using errcode='23514'; end if;
  update public.event_participations set additional_data=p_additional_data,status='draft',validated_configuration_version=null,updated_at=now() where id=p.id returning * into p;
  delete from public.participation_categories where participation_id=p.id;
 else
  insert into public.event_participations(institution_id,event_id,school_id,person_id,additional_data) values(e.institution_id,e.id,p_school_id,p_person_id,p_additional_data) returning * into p;
 end if;
 foreach category in array coalesce(p_category_ids,array[]::uuid[]) loop
  insert into public.participation_categories(institution_id,event_id,participation_id,category_id) values(e.institution_id,e.id,p.id,category);
 end loop;
 issues:=siep_private.participation_issues(p.id);
 if p_complete then
  if issues<>'[]'::jsonb then raise exception 'Cadastro incompleto' using errcode='23514',detail=issues::text; end if;
  update public.event_participations set status='complete',validated_configuration_version=e.configuration_version where id=p.id;
 end if;
 return jsonb_build_object('id',p.id,'status',case when p_complete then 'complete' else 'draft' end,'issues',issues);
end $$;

-- Convite/autocadastro não concede acesso; vínculo nasce pendente para revisão.
create function public.siep_school_directory(p_institution_slug text) returns table(id uuid,name text,inep text)
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is null then raise exception 'Conta autenticada necessária' using errcode='42501'; end if;
 return query select s.id,s.name,s.inep from public.schools s join public.institutions i on i.id=s.institution_id where i.slug=p_institution_slug and not s.archived order by s.name limit 1000;
end $$;
create function public.siep_request_school_link(p_school_id uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare school public.schools; person_uuid uuid; link_uuid uuid;
begin
 if auth.uid() is null then raise exception 'Conta autenticada necessária' using errcode='42501'; end if;
 select * into school from public.schools where id=p_school_id and not archived;
 if not found then raise exception 'Escola indisponível' using errcode='P0002'; end if;
 if exists(select 1 from public.school_people where institution_id=school.institution_id and school_id=school.id and user_id=auth.uid() and role='responsible') then raise exception 'Solicitação já existe; acompanhe a situação atual' using errcode='23514'; end if;
 if jsonb_typeof(p_data) is distinct from 'object' or btrim(coalesce(p_data->>'full_name',''))='' or not coalesce(siep_private.valid_cpf(regexp_replace(p_data->>'cpf','[^0-9]','','g')),false) or coalesce(p_data->>'gender','') not in ('Masculino','Feminino') or coalesce(p_data->>'birth_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Os quatro dados pessoais válidos são obrigatórios' using errcode='23514'; end if;
 if (p_data->>'birth_date')::date not between date '1900-01-01' and current_date then raise exception 'Nascimento inválido' using errcode='23514'; end if;
 -- CPF conhecido não autoriza consultar identidade. Vínculo depende sempre da secretaria.
 select id into person_uuid from public.people where institution_id=school.institution_id and cpf=regexp_replace(p_data->>'cpf','[^0-9]','','g');
 if person_uuid is null then
  insert into public.people(institution_id,full_name,birth_date,cpf,gender,contact) values(school.institution_id,p_data->>'full_name',(p_data->>'birth_date')::date,regexp_replace(p_data->>'cpf','[^0-9]','','g'),p_data->>'gender',coalesce(p_data->'contact','{}')) returning id into person_uuid;
 end if;
 select id into link_uuid from public.school_people where institution_id=school.institution_id and school_id=school.id and person_id=person_uuid and role='responsible' and status='pending' and user_id is null for update;
 if link_uuid is null then
  insert into public.school_people(institution_id,school_id,person_id,role,status,user_id) values(school.institution_id,school.id,person_uuid,'responsible','pending',auth.uid()) returning id into link_uuid;
 else update public.school_people set user_id=auth.uid() where id=link_uuid; end if;
 insert into public.school_link_requests(institution_id,school_person_id,user_id,requested_identity) values(school.institution_id,link_uuid,auth.uid(),p_data);
 insert into public.membership_decisions(institution_id,school_person_id,status,reason,actor_user_id) values(school.institution_id,link_uuid,'pending','Solicitação de vínculo',auth.uid());
 return link_uuid;
end $$;
create function public.siep_decide_school_link(p_link_id uuid,p_status text,p_reason text) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare link public.school_people;
begin
 select * into link from public.school_people where id=p_link_id for update;
 if not found then raise exception 'Vínculo indisponível' using errcode='P0002'; end if;
 perform siep_private.require_staff(link.institution_id);
 if link.role<>'responsible' or p_status is null or p_status not in ('approved','refused','closed','pending') or p_status=link.status or btrim(coalesce(p_reason,''))='' then raise exception 'Decisão inválida ou sem justificativa' using errcode='23514'; end if;
 if (link.status='pending' and p_status not in ('approved','refused')) or (link.status='approved' and p_status<>'closed') or (link.status in ('closed','refused') and p_status<>'pending') then raise exception 'Transição de vínculo inválida' using errcode='23514'; end if;
 if p_status='approved' and (link.user_id is null or not exists(select 1 from public.people p where p.id=link.person_id and not p.archived)) then raise exception 'Conta e identidade válidas são necessárias' using errcode='23514'; end if;
 update public.school_people set status=p_status where id=link.id;
 insert into public.membership_decisions(institution_id,school_person_id,status,reason,actor_user_id) values(link.institution_id,link.id,p_status,p_reason,auth.uid());
end $$;

-- Nenhuma função SECURITY DEFINER recebe EXECUTE público implícito.
revoke all on all functions in schema siep_private from public,anon,authenticated;
grant execute on function siep_private.is_staff(uuid,boolean),siep_private.can_school(uuid,uuid),siep_private.in_tenant(uuid),siep_private.can_person(uuid,uuid),siep_private.can_participation(uuid) to authenticated;
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'siep\_%' escape '\' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
