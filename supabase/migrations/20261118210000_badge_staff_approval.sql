-- Novas emissões da comissão exigem conferência própria aprovada e atual.
-- Listagem de crachás limitada; emissão continua validada no servidor.
create or replace function siep_private.badge_rows(event_uuid uuid,school_uuid uuid,requested_role text,search text)
returns table(person_id uuid,school_id uuid,role text,role_label text,person_name text,school_name text,photo_id uuid,photo_bucket text,photo_path text)
language sql stable set search_path=pg_catalog as $$
 with approved as (
  select r.* from public.registrations r where r.event_id=event_uuid and r.status='approved' and (school_uuid is null or r.school_id=school_uuid)
 ), eligible as (
  select r.school_id,a.person_id,'athlete'::text as role from approved r join public.registration_athletes a on a.registration_id=r.id where a.active
  union select r.school_id,a.person_id,'staff'::text from approved r join public.registration_staff a on a.registration_id=r.id
  union select r.school_id,sp.person_id,'responsible'::text from approved r join public.school_people sp on sp.school_id=r.school_id where sp.role='responsible' and sp.status='approved' and not sp.archived and sp.user_id is not null
 )
 select p.id,s.id,e.role,case e.role when 'athlete' then 'Atleta' when 'staff' then 'Comissão técnica' else 'Responsável escolar' end,p.full_name,s.name,f.id,f.bucket_id,f.object_path
 from eligible e join public.people p on p.id=e.person_id join public.schools s on s.id=e.school_id and s.institution_id=p.institution_id and not s.archived
 left join public.person_photos f on f.person_id=p.id and f.is_current and f.status='uploaded'
 where not p.archived and (requested_role is null or e.role=requested_role) and exists(select 1 from public.school_people sp where sp.school_id=s.id and sp.person_id=p.id and sp.role=e.role and sp.status='approved' and not sp.archived)
 and case when e.role='staff' then (siep_private.staff_conference_row(p.institution_id,event_uuid,s.id,p.id)->>'status')='approved' else true end
 and (coalesce(search,'')='' or strpos(siep_private.report_text(p.full_name||' '||s.name),siep_private.report_text(search))>0)
$$;
revoke all on function siep_private.badge_rows(uuid,uuid,text,text) from public,anon,authenticated;

-- Compatibilidade: o endpoint anterior usa a mesma regra da página/emissão.
create or replace function public.siep_badge_candidates(p_event_id uuid,p_school_id uuid default null,p_role text default null) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare tenant uuid;result jsonb;
begin
 select institution_id into tenant from public.events where id=p_event_id;
 if tenant is null then raise exception 'Evento indisponível' using errcode='P0002';end if;
 perform siep_private.require_staff(tenant);
 if p_school_id is not null and not exists(select 1 from public.schools where id=p_school_id and institution_id=tenant) then raise exception 'Escola de outra instituição' using errcode='42501';end if;
 if p_role is not null and p_role not in ('athlete','staff','responsible') then raise exception 'Papel inválido' using errcode='23514';end if;
 select coalesce(jsonb_agg(to_jsonb(c) order by c.school_name,c.person_name,c.role,c.person_id),'[]') into result from siep_private.badge_rows(p_event_id,p_school_id,p_role,'') c;
 return result;
end $$;
revoke all on function public.siep_badge_candidates(uuid,uuid,text) from public,anon;
grant execute on function public.siep_badge_candidates(uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';
