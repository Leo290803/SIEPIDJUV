-- Identidade de acesso vem de vínculos do banco, nunca de metadados editáveis.
create function public.siep_my_access() returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is null then raise exception 'Conta autenticada necessária' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'name',i.name,'slug',i.slug,'branding',i.branding,'staff_role',(select m.role from public.institution_memberships m where m.institution_id=i.id and m.user_id=auth.uid() and m.status='approved'),'schools',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name),'[]') from public.school_people sp join public.schools s on s.id=sp.school_id join public.people p on p.id=sp.person_id where sp.institution_id=i.id and sp.user_id=auth.uid() and sp.role='responsible' and sp.status='approved' and not sp.archived and not p.archived and not s.archived)) order by i.name),'[]') from public.institutions i where siep_private.in_tenant(i.id));
end $$;
create function public.siep_staff_accounts(p_institution_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if not siep_private.is_staff(p_institution_id,true) then raise exception 'Apenas administrador da instituição' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'email',u.email,'name',u.raw_user_meta_data->>'display_name','role',m.role,'status',m.status,'user_id',m.user_id) order by u.email),'[]') from public.institution_memberships m join auth.users u on u.id=m.user_id where m.institution_id=p_institution_id);
end $$;
create function public.siep_set_staff_account(p_institution_id uuid,p_email text,p_role text,p_status text) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare account_uuid uuid;
begin
 if not siep_private.is_staff(p_institution_id,true) then raise exception 'Apenas administrador da instituição' using errcode='42501';end if;
 if p_role is null or p_role not in ('admin','manager') or p_status is null or p_status not in ('pending','approved','closed') then raise exception 'Papel ou situação inválido' using errcode='23514';end if;
 perform 1 from public.institutions where id=p_institution_id for update;
 select id into account_uuid from auth.users where lower(email)=lower(btrim(p_email)) and email_confirmed_at is not null;
 if account_uuid is null then raise exception 'Conta indisponível. O titular precisa criar a conta e confirmar o e-mail antes do vínculo.' using errcode='23514';end if;
 insert into public.institution_memberships(institution_id,user_id,role,status) values(p_institution_id,account_uuid,p_role,p_status) on conflict(institution_id,user_id) do update set role=excluded.role,status=excluded.status;
end $$;
revoke all on function public.siep_my_access(),public.siep_staff_accounts(uuid),public.siep_set_staff_account(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.siep_my_access(),public.siep_staff_accounts(uuid),public.siep_set_staff_account(uuid,text,text,text) to authenticated;

notify pgrst,'reload schema';
