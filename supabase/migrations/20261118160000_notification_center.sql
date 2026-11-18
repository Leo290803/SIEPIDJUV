-- Avisos de entrada para Secretaria e lembretes pessoais, sem envio externo.
create function siep_private.notification_context() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
declare context jsonb;
begin
 select jsonb_build_object('school_id',r.school_id,'school_name',s.name,'event_name',e.name,'deadline',r.correction_deadline) into context from public.registrations r join public.events e on e.id=r.event_id join public.schools s on s.id=r.school_id where r.id::text=new.payload->>'registration_id' and r.institution_id=new.institution_id;
 if context is not null then new.payload:=new.payload||context;end if;
 return new;
end $$;
revoke all on function siep_private.notification_context() from public,anon,authenticated;
create trigger notification_context before insert on public.notifications for each row execute function siep_private.notification_context();
create function siep_private.notify_submission() returns trigger
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if new.to_status='submitted' then
  insert into public.notifications(institution_id,recipient_user_id,kind,payload,deduplication_key)
  select new.institution_id,m.user_id,'registration_submitted',jsonb_build_object('registration_id',new.registration_id,'status',new.to_status,'revision',new.revision,'resubmitted',new.from_status='correction_requested'), 'staff:'||new.registration_id||':'||new.revision
  from public.institution_memberships m where m.institution_id=new.institution_id and m.status='approved'
  on conflict(institution_id,recipient_user_id,deduplication_key) do nothing;
 end if;
 return new;
end $$;
revoke all on function siep_private.notify_submission() from public,anon,authenticated;
create trigger registration_submission_notification after insert on public.registration_decisions for each row execute function siep_private.notify_submission();
create index registration_correction_reminder_idx on public.registrations(institution_id,school_id,correction_deadline) where status='correction_requested';
create index notification_unread_user_idx on public.notifications(institution_id,recipient_user_id) where read_at is null;
create function public.siep_notification_center(p_institution_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 if auth.uid() is null or not siep_private.in_tenant(p_institution_id) then raise exception 'Acesso indisponível' using errcode='42501';end if;
 -- Lembretes são gerados ao consultar o sino, só para o próprio destinatário
 -- aprovado. A unicidade impede duplicação entre abas/consultas concorrentes.
 insert into public.notifications(institution_id,recipient_user_id,kind,payload,deduplication_key)
 select r.institution_id,auth.uid(),'correction_deadline',jsonb_build_object('registration_id',r.id,'status',r.status,'revision',r.revision,'deadline',r.correction_deadline), 'deadline:'||r.id||':'||r.revision||':'||r.correction_deadline::text
 from public.registrations r where r.institution_id=p_institution_id and r.status='correction_requested' and r.correction_deadline>now() and r.correction_deadline<=now()+interval '24 hours'
 and exists(select 1 from public.school_people sp join public.people p on p.id=sp.person_id join public.schools s on s.id=sp.school_id where sp.institution_id=r.institution_id and sp.school_id=r.school_id and sp.role='responsible' and sp.status='approved' and sp.user_id=auth.uid() and not p.archived and not s.archived)
 on conflict(institution_id,recipient_user_id,deduplication_key) do nothing;
 select jsonb_build_object('unread',(select count(*) from public.notifications where institution_id=p_institution_id and recipient_user_id=auth.uid() and read_at is null),'rows',coalesce((select jsonb_agg(to_jsonb(n)||jsonb_build_object('payload',n.payload||jsonb_strip_nulls(jsonb_build_object('event_name',e.name,'school_name',s.name,'school_id',r.school_id,'deadline',coalesce(n.payload->>'deadline',r.correction_deadline::text)))) order by n.created_at desc,n.id desc) from (select * from public.notifications where institution_id=p_institution_id and recipient_user_id=auth.uid() order by created_at desc,id desc limit 10) n left join public.registrations r on r.id::text=n.payload->>'registration_id' and r.institution_id=n.institution_id left join public.events e on e.id=r.event_id left join public.schools s on s.id=r.school_id),'[]')) into result;
 return result;
end $$;
revoke all on function public.siep_notification_center(uuid) from public,anon;
grant execute on function public.siep_notification_center(uuid) to authenticated;
notify pgrst,'reload schema';
