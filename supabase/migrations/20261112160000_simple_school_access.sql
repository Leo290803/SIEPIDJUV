-- Responsáveis podem solicitar acesso antes de completar a identidade civil.
-- Nunca inventar CPF, nascimento ou sexo. Cadastros esportivos continuam completos.
alter table public.people alter column birth_date drop not null, alter column cpf drop not null, alter column gender drop not null;
alter table public.people add constraint people_identity_complete_or_deferred check (
 (birth_date is not null and cpf is not null and gender is not null) or
 (birth_date is null and cpf is null and gender is null)
);
create function siep_private.require_complete_sports_identity() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare needs_complete boolean:=true;
begin
 if tg_table_name='people' then
  if (new.cpf is null or new.birth_date is null or new.gender is null) and
   (exists(select 1 from public.school_people where person_id=new.id and role in ('athlete','staff')) or exists(select 1 from public.event_participations where person_id=new.id)) then
   raise exception 'Identidade completa obrigatória para cadastro esportivo' using errcode='23514';
  end if;
 else
  if tg_table_name='school_people' then needs_complete:=new.role in ('athlete','staff');end if;
  if needs_complete then
  perform 1 from public.people where id=new.person_id and cpf is not null and birth_date is not null and gender is not null for share;
  if not found and exists(select 1 from public.people where id=new.person_id) then raise exception 'Identidade completa obrigatória para cadastro esportivo' using errcode='23514';end if;
  end if;
 end if;
 return new;
end $$;
create trigger people_complete_sports_identity before update on public.people for each row execute function siep_private.require_complete_sports_identity();
create trigger school_people_complete_sports_identity before insert or update on public.school_people for each row execute function siep_private.require_complete_sports_identity();
create trigger participation_complete_sports_identity before insert or update on public.event_participations for each row execute function siep_private.require_complete_sports_identity();
revoke all on function siep_private.require_complete_sports_identity() from public,anon,authenticated;

create function public.siep_request_school_access(p_school_id uuid,p_full_name text) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare school public.schools;person_uuid uuid;link_uuid uuid;
begin
 if auth.uid() is null then raise exception 'Conta autenticada necessária' using errcode='42501';end if;
 if btrim(coalesce(p_full_name,''))='' or length(p_full_name)>160 then raise exception 'Informe o nome completo do responsável' using errcode='23514';end if;
 -- Serializa pedidos da mesma conta, inclusive em escolas diferentes.
 perform 1 from auth.users where id=auth.uid() and email_confirmed_at is not null for update;
 if not found then raise exception 'Confirme o e-mail da conta' using errcode='42501';end if;
 select * into school from public.schools where id=p_school_id and not archived for share;
 if not found then raise exception 'Escola indisponível' using errcode='P0002';end if;
 if exists(select 1 from public.school_people where school_id=school.id and user_id=auth.uid() and role='responsible') then raise exception 'Solicitação já existe; procure a Secretaria para acompanhar o vínculo' using errcode='23514';end if;
 -- Reusa somente a identidade já associada à própria conta; nunca pelo nome.
 select person_id into person_uuid from public.school_people where institution_id=school.institution_id and user_id=auth.uid() and role='responsible' order by created_at limit 1;
 if person_uuid is null then
  insert into public.people(institution_id,full_name) values(school.institution_id,btrim(p_full_name)) returning id into person_uuid;
 end if;
 insert into public.school_people(institution_id,school_id,person_id,role,status,user_id) values(school.institution_id,school.id,person_uuid,'responsible','pending',auth.uid()) returning id into link_uuid;
 insert into public.school_link_requests(institution_id,school_person_id,user_id,requested_identity) values(school.institution_id,link_uuid,auth.uid(),jsonb_build_object('full_name',btrim(p_full_name)));
 insert into public.membership_decisions(institution_id,school_person_id,status,reason,actor_user_id) values(school.institution_id,link_uuid,'pending','Solicitação de acesso escolar',auth.uid());
 return link_uuid;
end $$;
revoke all on function public.siep_request_school_access(uuid,text) from public,anon,authenticated;
grant execute on function public.siep_request_school_access(uuid,text) to authenticated;
notify pgrst,'reload schema';
