-- Crachás emitidos pela Secretaria: vínculo aprovado no evento e foto versionada.
create table public.event_badges (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id),
 event_id uuid not null,
 school_id uuid not null,
 person_id uuid not null,
 role text not null check(role in ('athlete','staff','responsible')),
 photo_id uuid not null references public.person_photos(id),
 version integer not null check(version>0),
 is_current boolean not null default true,
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 issued_by uuid not null references auth.users(id),
 issued_at timestamptz not null default now(),
 unique(event_id,school_id,person_id,role,version),
 foreign key(institution_id,event_id) references public.events(institution_id,id),
 foreign key(institution_id,school_id) references public.schools(institution_id,id),
 foreign key(institution_id,person_id) references public.people(institution_id,id)
);
create unique index event_badges_current on public.event_badges(event_id,school_id,person_id,role) where is_current;
create index event_badges_scope on public.event_badges(institution_id,event_id,issued_at);
alter table public.event_badges enable row level security;
revoke all on public.event_badges from public,anon,authenticated;
grant select on public.event_badges to authenticated;
create policy event_badges_read on public.event_badges for select to authenticated using(siep_private.is_staff(institution_id));
create trigger immutable_tenant before update on public.event_badges for each row execute function siep_private.immutable_tenant();
create trigger audit_changes after insert or update or delete on public.event_badges for each row execute function siep_private.audit_changes();
create function siep_private.immutable_badge_snapshot() returns trigger
language plpgsql set search_path=pg_catalog as $$
begin
 if (new.event_id,new.school_id,new.person_id,new.role,new.photo_id,new.version,new.snapshot,new.issued_by,new.issued_at) is distinct from (old.event_id,old.school_id,old.person_id,old.role,old.photo_id,old.version,old.snapshot,old.issued_by,old.issued_at) then raise exception 'A emissão de crachá é imutável; emita outra versão' using errcode='23514';end if;
 return new;
end $$;
create trigger immutable_badge_snapshot before update on public.event_badges for each row execute function siep_private.immutable_badge_snapshot();
revoke all on function siep_private.immutable_badge_snapshot() from public,anon,authenticated;

create function public.siep_badge_candidates(p_event_id uuid,p_school_id uuid default null,p_role text default null) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare event public.events;result jsonb;
begin
 select * into event from public.events where id=p_event_id;
 if not found then raise exception 'Evento indisponível' using errcode='P0002';end if;
 perform siep_private.require_staff(event.institution_id);
 if p_school_id is not null and not exists(select 1 from public.schools where id=p_school_id and institution_id=event.institution_id) then raise exception 'Escola de outra instituição' using errcode='42501';end if;
 if p_role is not null and p_role not in ('athlete','staff','responsible') then raise exception 'Papel inválido' using errcode='23514';end if;
 with approved as (
  select * from public.registrations where event_id=event.id and status='approved' and (p_school_id is null or school_id=p_school_id)
 ), eligible as (
  select r.school_id,a.person_id,'athlete'::text as role from approved r join public.registration_athletes a on a.registration_id=r.id where a.active
  union
  select r.school_id,s.person_id,'staff'::text from approved r join public.registration_staff s on s.registration_id=r.id
  union
  select distinct r.school_id,sp.person_id,'responsible'::text from approved r join public.school_people sp on sp.school_id=r.school_id where sp.role='responsible' and sp.status='approved' and not sp.archived and sp.user_id is not null
 )
 select coalesce(jsonb_agg(jsonb_build_object('person_id',p.id,'school_id',s.id,'role',e.role,'role_label',case e.role when 'athlete' then 'Atleta' when 'staff' then 'Comissão técnica' else 'Responsável escolar' end,'person_name',p.full_name,'school_name',s.name,'photo_id',f.id,'photo_bucket',f.bucket_id,'photo_path',f.object_path) order by s.name,p.full_name,e.role),'[]') into result
 from eligible e join public.people p on p.id=e.person_id and p.institution_id=event.institution_id join public.schools s on s.id=e.school_id and not s.archived
 left join public.person_photos f on f.person_id=p.id and f.is_current and f.status='uploaded'
 where not p.archived and (p_role is null or e.role=p_role) and exists(select 1 from public.school_people sp where sp.school_id=e.school_id and sp.person_id=e.person_id and sp.role=e.role and sp.status='approved' and not sp.archived);
 return result;
end $$;

create function public.siep_issue_event_badges(p_event_id uuid,p_entries jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare event public.events;institution public.institutions;entry jsonb;candidate jsonb;candidates jsonb;result jsonb:='[]';badge public.event_badges;next_version integer;person_uuid uuid;school_uuid uuid;badge_role text;seen text[]:=array[]::text[];key text;
begin
 select * into event from public.events where id=p_event_id for update;
 if not found then raise exception 'Evento indisponível' using errcode='P0002';end if;
 perform siep_private.require_staff(event.institution_id);
 if event.status='archived' then raise exception 'Evento arquivado não recebe novas emissões' using errcode='23514';end if;
 if jsonb_typeof(p_entries) is distinct from 'array' then raise exception 'Selecione as pessoas para emitir' using errcode='23514';end if;
 if jsonb_array_length(p_entries) not between 1 and 50 then raise exception 'Emita de 1 a 50 crachás por lote' using errcode='23514';end if;
 select * into institution from public.institutions where id=event.institution_id;
 candidates:=public.siep_badge_candidates(event.id);
 for entry in select value from jsonb_array_elements(p_entries) loop
  person_uuid:=(entry->>'person_id')::uuid;school_uuid:=(entry->>'school_id')::uuid;badge_role:=entry->>'role';
  key:=coalesce(person_uuid::text,'')||':'||coalesce(school_uuid::text,'')||':'||coalesce(badge_role,'');
  if key=any(seen) then raise exception 'Não repita uma pessoa/papel no lote' using errcode='23514';end if;
  seen:=array_append(seen,key);
  select value into candidate from jsonb_array_elements(candidates) where value->>'person_id'=person_uuid::text and value->>'school_id'=school_uuid::text and value->>'role'=badge_role;
  if candidate is null then raise exception 'Pessoa sem vínculo e inscrição aprovados neste evento' using errcode='23514';end if;
  if candidate->>'photo_id' is null then raise exception 'Complete a foto de identificação antes de emitir o crachá' using errcode='23514';end if;
  select coalesce(max(version),0)+1 into next_version from public.event_badges where event_id=event.id and school_id=school_uuid and person_id=person_uuid and role=badge_role;
  update public.event_badges set is_current=false where event_id=event.id and school_id=school_uuid and person_id=person_uuid and role=badge_role and is_current;
  insert into public.event_badges(institution_id,event_id,school_id,person_id,role,photo_id,version,snapshot,issued_by)
  values(event.institution_id,event.id,school_uuid,person_uuid,badge_role,(candidate->>'photo_id')::uuid,next_version,candidate||jsonb_build_object('event_name',event.name,'edition',event.edition,'institution_name',institution.name,'event_id',event.id),auth.uid()) returning * into badge;
  result:=result||jsonb_build_array(to_jsonb(badge));
 end loop;
 return result;
end $$;
revoke all on function public.siep_badge_candidates(uuid,uuid,text),public.siep_issue_event_badges(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.siep_badge_candidates(uuid,uuid,text),public.siep_issue_event_badges(uuid,jsonb) to authenticated;

-- A Secretaria pode reimprimir a foto histórica, inclusive de identidade arquivada.
create or replace function siep_private.person_photo_access(p_path text,p_upload boolean default false) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from public.person_photos f join public.people p on p.id=f.person_id where f.object_path=p_path and (not p.archived or (not p_upload and siep_private.is_staff(f.institution_id))) and siep_private.can_person(f.institution_id,f.person_id) and case when p_upload then f.status='pending' and f.created_by=auth.uid() else f.status in ('uploaded','superseded') end);
$$;
notify pgrst,'reload schema';
