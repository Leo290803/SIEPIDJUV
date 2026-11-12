-- Cadastro público encerrado. Vínculos e históricos anteriores preservados.
revoke execute on function public.siep_request_school_access(uuid,text),public.siep_request_school_link(uuid,jsonb),public.siep_school_directory(text) from public,anon,authenticated;

create function siep_private.password_change_required() returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from auth.users where id=auth.uid() and raw_app_meta_data->>'siep_initial_password'='true');
$$;
create function public.siep_password_change_required() returns boolean
language sql stable security definer set search_path=pg_catalog as $$ select siep_private.password_change_required(); $$;
create function siep_private.clear_initial_password() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if old.encrypted_password is distinct from new.encrypted_password then
  new.raw_app_meta_data:=coalesce(new.raw_app_meta_data,'{}')-'siep_initial_password';
 end if;
 return new;
end $$;
create trigger clear_siep_initial_password before update of encrypted_password on auth.users for each row execute function siep_private.clear_initial_password();
revoke all on function siep_private.password_change_required(),siep_private.clear_initial_password(),public.siep_password_change_required() from public,anon,authenticated;
grant execute on function public.siep_password_change_required() to authenticated;

create or replace function siep_private.is_staff(tenant uuid,admin_only boolean default false) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select not siep_private.password_change_required() and exists(select 1 from public.institution_memberships m where m.institution_id=tenant and m.user_id=auth.uid() and m.status='approved' and (not admin_only or m.role='admin'));
$$;
create or replace function siep_private.can_school(tenant uuid,school uuid) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select not siep_private.password_change_required() and (siep_private.is_staff(tenant) or exists(select 1 from public.school_people sp join public.schools s on s.id=sp.school_id join public.people p on p.id=sp.person_id where sp.institution_id=tenant and sp.school_id=school and sp.role='responsible' and sp.status='approved' and sp.user_id=auth.uid() and not sp.archived and not s.archived and not p.archived));
$$;

create function public.siep_school_access_context(p_link_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare link public.school_people;person public.people;school public.schools;account_uuid uuid;
begin
 select * into link from public.school_people where id=p_link_id and role='responsible' and not archived;
 if not found then raise exception 'Responsável indisponível' using errcode='P0002';end if;
 perform siep_private.require_staff(link.institution_id);
 select * into school from public.schools where id=link.school_id and not archived;
 select * into person from public.people where id=link.person_id and not archived;
 if school.id is null or person.id is null or link.status not in ('pending','approved') then raise exception 'Reabra o vínculo e confira o cadastro antes de gerar o acesso' using errcode='23514';end if;
 if person.cpf is null or person.birth_date is null then raise exception 'Complete CPF e nascimento do responsável' using errcode='23514';end if;
 account_uuid:=link.user_id;
 if account_uuid is null then select id into account_uuid from auth.users where email=person.cpf||'@cpf.siep.invalid';end if;
 return jsonb_build_object('cpf',person.cpf,'birth_date',person.birth_date,'name',person.full_name,'school',school.name,'account_id',account_uuid);
end $$;

create function public.siep_authorize_school_account(p_link_id uuid,p_actor_id uuid,p_account_id uuid,p_cpf text) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare link public.school_people;person public.people;
begin
 select * into link from public.school_people where id=p_link_id and role='responsible' and not archived for update;
 if not found then raise exception 'Responsável indisponível' using errcode='P0002';end if;
 perform 1 from public.institution_memberships where institution_id=link.institution_id and user_id=p_actor_id and status='approved' and role in ('admin','manager') for share;
 if not found then raise exception 'Acesso exclusivo da Secretaria' using errcode='42501';end if;
 perform 1 from public.schools where id=link.school_id and not archived for share;
 if not found or link.status not in ('pending','approved') then raise exception 'Escola ou vínculo indisponível' using errcode='23514';end if;
 select * into person from public.people where id=link.person_id and not archived for share;
 if person.id is null or person.cpf is distinct from p_cpf or person.birth_date is null then raise exception 'Cadastro alterado; confira os dados e tente novamente' using errcode='40001';end if;
 perform 1 from auth.users where id=p_account_id and (email=person.cpf||'@cpf.siep.invalid' or id=link.user_id);
 if not found then raise exception 'Conta não corresponde ao responsável' using errcode='23514';end if;
 if link.user_id is not null and link.user_id<>p_account_id then raise exception 'Vínculo associado a outra conta' using errcode='23514';end if;
 if exists(select 1 from public.school_people where school_id=link.school_id and user_id=p_account_id and role='responsible' and id<>link.id) then raise exception 'Esta conta já possui vínculo com a escola; revise o cadastro existente' using errcode='23514';end if;
 if link.user_id is distinct from p_account_id or link.status<>'approved' then
  update public.school_people set user_id=p_account_id,status='approved' where id=link.id;
  insert into public.membership_decisions(institution_id,school_person_id,status,reason,actor_user_id) values(link.institution_id,link.id,'approved','Acesso gerado e autorizado pela Secretaria',p_actor_id);
 end if;
end $$;

-- Limita tentativas por CPF sem expor e-mail/identidade ao cliente anônimo.
create table siep_private.cpf_login_throttle (key text primary key,window_start timestamptz not null,attempts integer not null);
revoke all on siep_private.cpf_login_throttle from public,anon,authenticated;
create function public.siep_cpf_login_account(p_cpf text) returns text
language plpgsql security definer set search_path=pg_catalog as $$
declare count_attempts integer;emails text[];
begin
 if p_cpf is null or p_cpf !~ '^[0-9]{11}$' then return null;end if;
 insert into siep_private.cpf_login_throttle as throttle values(md5(p_cpf),clock_timestamp(),1)
 on conflict(key) do update set attempts=case when throttle.window_start<clock_timestamp()-interval '15 minutes' then 1 else throttle.attempts+1 end,window_start=case when throttle.window_start<clock_timestamp()-interval '15 minutes' then clock_timestamp() else throttle.window_start end returning attempts into count_attempts;
 if count_attempts>10 then return null;end if;
 select array_agg(distinct u.email) into emails from public.people p join public.school_people sp on sp.person_id=p.id join public.schools s on s.id=sp.school_id join auth.users u on u.id=sp.user_id where p.cpf=p_cpf and not p.archived and sp.role='responsible' and sp.status='approved' and not sp.archived and not s.archived;
 if cardinality(emails)=1 then return emails[1];end if;
 return null;
end $$;
revoke all on function public.siep_school_access_context(uuid),public.siep_authorize_school_account(uuid,uuid,uuid,text),public.siep_cpf_login_account(text) from public,anon,authenticated;
grant execute on function public.siep_school_access_context(uuid) to authenticated;
grant execute on function public.siep_authorize_school_account(uuid,uuid,uuid,text),public.siep_cpf_login_account(text) to service_role;
notify pgrst,'reload schema';
