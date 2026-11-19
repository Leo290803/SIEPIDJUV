-- Institution defaults share the same immutable version history as event models.
alter table public.badge_art_assets
 alter column event_id drop not null,
 add foreign key (institution_id) references public.institutions(id);
alter table public.badge_templates
 alter column event_id drop not null,
 add foreign key (institution_id) references public.institutions(id);
alter table public.badge_template_versions
 alter column event_id drop not null,
 add foreign key (institution_id) references public.institutions(id);

create unique index badge_templates_institution_default
 on public.badge_templates(institution_id,role) where event_id is null;

create function siep_private.initial_badge_layout(p_role text) returns jsonb
language sql immutable set search_path=pg_catalog as $$
 select jsonb_build_object(
  'width',86,'height',130,'fit','contain','theme','credential-v1',
  'fields',jsonb_agg(jsonb_build_object(
   'key',field_key,'x',x,'y',y,'w',w,'h',h,'fontSize',font_size,'color','#163453','align','center'
  ) order by position)
 )
 from (values
  (1,'event_name',45,5,49,15,12,null),
  (2,'photo',33,18,34,22.49,11,null),
  (3,'person_name',7,43,86,6,12,null),
  (4,'school_name',7,49.6,86,4.9,9,null),
  (5,'modalities',7,55,86,4.2,9,'athlete'),
  (5,'functions',7,55,86,4.2,9,'staff'),
  (6,'categories',7,59.7,86,4.1,9,'athlete'),
  (6,'cref',7,59.7,86,4.1,9,'staff'),
  (7,'qr_code',37,64,26,17.2,11,null),
  (8,'code',37,82,26,3,7,null),
  (9,'role_label',0,87,100,6,13,null)
 ) as fields(position,field_key,x,y,w,h,font_size,profile)
 where profile is null or profile=p_role;
$$;

create function siep_private.default_badge_template(p_institution_id uuid,p_role text) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
 select siep_private.badge_template_version_snapshot(v.id)
 from public.badge_templates t
 join public.badge_template_versions v on v.template_id=t.id and v.version=t.version
 where t.institution_id=p_institution_id and t.event_id is null and t.role=p_role;
$$;

create function siep_private.ensure_default_badge_template(p_institution_id uuid,p_role text) returns jsonb
language plpgsql set search_path=pg_catalog as $$
declare
 template jsonb;
 model public.badge_templates;
begin
 template:=siep_private.default_badge_template(p_institution_id,p_role);
 if template is not null then return template; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_institution_id::text,9192000));
 template:=siep_private.default_badge_template(p_institution_id,p_role);
 if template is not null then return template; end if;
 insert into public.badge_templates(institution_id,role,version,layout,updated_by)
 values(p_institution_id,p_role,1,siep_private.initial_badge_layout(p_role),auth.uid())
 returning * into model;
 insert into public.badge_template_versions(template_id,institution_id,role,version,layout,created_by)
 values(model.id,p_institution_id,p_role,1,model.layout,auth.uid());
 return siep_private.default_badge_template(p_institution_id,p_role);
end $$;

create function public.siep_default_badge_template(p_institution_id uuid,p_role text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 perform siep_private.require_staff(p_institution_id);
 return siep_private.default_badge_template(p_institution_id,p_role);
end $$;

create function public.siep_prepare_default_badge_art(p_institution_id uuid,p_name text,p_mime_type text,p_size_bytes int) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare
 asset_id uuid:=gen_random_uuid();
 path text;
begin
 perform siep_private.require_staff(p_institution_id);
 if p_mime_type is null or p_mime_type not in ('image/png','image/jpeg') or p_size_bytes is null
  or p_size_bytes not between 1 and 5242880 or length(btrim(coalesce(p_name,''))) not between 1 and 255 then
  raise exception 'Use arte PNG ou JPEG de até 5 MB' using errcode='23514';
 end if;
 path:=p_institution_id||'/padrao/'||asset_id||case when p_mime_type='image/png' then '.png' else '.jpg' end;
 insert into public.badge_art_assets(id,institution_id,object_path,original_name,mime_type,size_bytes,created_by)
 values(asset_id,p_institution_id,path,btrim(p_name),p_mime_type,p_size_bytes,auth.uid());
 return jsonb_build_object('id',asset_id,'bucket','siep-badge-art','path',path);
end $$;

create function public.siep_save_default_badge_template(
 p_institution_id uuid,p_role text,p_expected_version integer,p_layout jsonb,
 p_background_id uuid,p_reverse_background_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
 model public.badge_templates;
begin
 perform siep_private.require_staff(p_institution_id);
 perform siep_private.validate_badge_layout(p_role,p_layout);
 if p_layout->>'theme' is distinct from 'credential-v1' then
  raise exception 'Use o modelo frente e verso como padrão' using errcode='23514';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_institution_id::text,9192000));
 select * into model from public.badge_templates
 where institution_id=p_institution_id and event_id is null and role=p_role for update;
 if p_expected_version is distinct from coalesce(model.version,0) then
  raise exception 'Modelo alterado; recarregue antes de salvar' using errcode='40001';
 end if;
 if exists (
  select 1 from unnest(array[p_background_id,p_reverse_background_id]) as backgrounds(asset_id)
  where asset_id is not null and not exists (
   select 1 from public.badge_art_assets a
   where a.id=asset_id and a.institution_id=p_institution_id and a.event_id is null and a.status='uploaded'
  )
 ) then
  raise exception 'Use uma arte do modelo padrão desta instituição' using errcode='23514';
 end if;
 insert into public.badge_templates(institution_id,role,version,layout,background_id,reverse_background_id,updated_by)
 values(p_institution_id,p_role,1,p_layout,p_background_id,p_reverse_background_id,auth.uid())
 on conflict(institution_id,role) where event_id is null do update set
  version=badge_templates.version+1,layout=excluded.layout,background_id=excluded.background_id,
  reverse_background_id=excluded.reverse_background_id,updated_by=auth.uid(),updated_at=now()
 returning * into model;
 insert into public.badge_template_versions(template_id,institution_id,role,version,layout,background_id,reverse_background_id,created_by)
 values(model.id,p_institution_id,p_role,model.version,p_layout,p_background_id,p_reverse_background_id,auth.uid());
 return siep_private.default_badge_template(p_institution_id,p_role);
end $$;

revoke all on function siep_private.initial_badge_layout(text),siep_private.default_badge_template(uuid,text),
 siep_private.ensure_default_badge_template(uuid,text) from public,anon,authenticated;
revoke all on function public.siep_default_badge_template(uuid,text),public.siep_prepare_default_badge_art(uuid,text,text,int),
 public.siep_save_default_badge_template(uuid,text,integer,jsonb,uuid,uuid) from public,anon;
grant execute on function public.siep_default_badge_template(uuid,text),public.siep_prepare_default_badge_art(uuid,text,text,int),
 public.siep_save_default_badge_template(uuid,text,integer,jsonb,uuid,uuid) to authenticated;

-- An event override may keep the institution's artwork when it changes only the layout.
create or replace function public.siep_save_badge_template(
 p_event_id uuid,p_role text,p_expected_version integer,p_layout jsonb,
 p_background_id uuid,p_reverse_background_id uuid
) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
 tenant uuid;
 model public.badge_templates;
begin
 select institution_id into tenant from public.events where id=p_event_id for update;
 perform siep_private.require_staff(tenant);
 perform siep_private.validate_badge_layout(p_role,p_layout);
 select * into model from public.badge_templates where event_id=p_event_id and role=p_role for update;
 if p_expected_version is distinct from coalesce(model.version,0) then
  raise exception 'Modelo alterado; recarregue antes de salvar' using errcode='40001';
 end if;
 if p_reverse_background_id is not null and p_layout->>'theme' is distinct from 'credential-v1' then
  raise exception 'Use o modelo frente e verso para salvar a arte do verso' using errcode='23514';
 end if;
 if exists (
  select 1 from unnest(array[p_background_id,p_reverse_background_id]) as backgrounds(asset_id)
  where asset_id is not null and not exists (
   select 1 from public.badge_art_assets a
   where a.id=asset_id and a.institution_id=tenant and (a.event_id=p_event_id or a.event_id is null) and a.status='uploaded'
  )
 ) then
  raise exception 'Arte não pertence a este evento ou não foi confirmada' using errcode='23514';
 end if;
 insert into public.badge_templates(institution_id,event_id,role,version,layout,background_id,reverse_background_id,updated_by)
 values(tenant,p_event_id,p_role,1,p_layout,p_background_id,p_reverse_background_id,auth.uid())
 on conflict(event_id,role) do update set
  version=badge_templates.version+1,layout=excluded.layout,background_id=excluded.background_id,
  reverse_background_id=excluded.reverse_background_id,updated_by=auth.uid(),updated_at=now()
 returning * into model;
 insert into public.badge_template_versions(template_id,institution_id,event_id,role,version,layout,background_id,reverse_background_id,created_by)
 values(model.id,tenant,p_event_id,p_role,model.version,p_layout,p_background_id,p_reverse_background_id,auth.uid());
 return siep_private.badge_template_snapshot(p_event_id,p_role);
end $$;

create or replace function public.siep_issue_event_badges(p_event_id uuid,p_entries jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare event public.events;institution public.institutions;entry jsonb;candidate jsonb;candidates jsonb;result jsonb:='[]';badge public.event_badges;next_version integer;person_uuid uuid;school_uuid uuid;badge_role text;seen text[]:=array[]::text[];key text;template jsonb;
begin
 select * into event from public.events where id=p_event_id for update;
 if not found then raise exception 'Evento indisponível' using errcode='P0002';end if;
 perform siep_private.require_staff(event.institution_id);
 if event.status='archived' then raise exception 'Evento arquivado não recebe novas emissões' using errcode='23514';end if;
 if jsonb_typeof(p_entries) is distinct from 'array' then raise exception 'Selecione as pessoas para emitir' using errcode='23514';end if;
 if jsonb_array_length(p_entries) not between 1 and 50 then raise exception 'Emita de 1 a 50 crachás por lote' using errcode='23514';end if;
 select * into institution from public.institutions where id=event.institution_id;
 select coalesce(jsonb_agg(to_jsonb(c)),'[]') into candidates from siep_private.badge_rows(event.id,null,null,'') c where exists(select 1 from jsonb_array_elements(p_entries) e where e->>'person_id'=c.person_id::text and e->>'school_id'=c.school_id::text and e->>'role'=c.role);
 for entry in select value from jsonb_array_elements(p_entries) loop
  person_uuid:=(entry->>'person_id')::uuid;school_uuid:=(entry->>'school_id')::uuid;badge_role:=entry->>'role';
  key:=coalesce(person_uuid::text,'')||':'||coalesce(school_uuid::text,'')||':'||coalesce(badge_role,'');
  if key=any(seen) then raise exception 'Não repita uma pessoa/papel no lote' using errcode='23514';end if;
  seen:=array_append(seen,key);
  select value into candidate from jsonb_array_elements(candidates) where value->>'person_id'=person_uuid::text and value->>'school_id'=school_uuid::text and value->>'role'=badge_role;
  if candidate is null then raise exception 'Pessoa sem vínculo e inscrição aprovados neste evento' using errcode='23514';end if;
  if candidate->>'photo_id' is null then raise exception 'Complete a foto de identificação antes de emitir o crachá' using errcode='23514';end if;
  template:=siep_private.badge_template_snapshot(event.id,badge_role);
  if template is null then
   template:=siep_private.ensure_default_badge_template(event.institution_id,badge_role);
  end if;
  candidate:=candidate||siep_private.badge_dynamic_data(event.id,school_uuid,person_uuid,badge_role)||jsonb_build_object('badge_template',case when template is null then null else jsonb_build_object('id',template->'id','version_id',template->'version_id','version',template->'version') end);
  if badge_role='athlete' then
   if template is not null and not (template->'layout'->'fields') @> '[{"key":"categories"}]' then
    raise exception 'Adicione o campo Categorias ao modelo de atleta e salve antes de emitir' using errcode='23514';
   end if;
   if template is null then
    if template is null then
   template:=siep_private.ensure_default_badge_template(event.institution_id,badge_role);
  end if;
  candidate:=candidate||jsonb_build_object('athlete_category',candidate->'categories');
   end if;
  end if;
  select coalesce(max(version),0)+1 into next_version from public.event_badges where event_id=event.id and school_id=school_uuid and person_id=person_uuid and role=badge_role;
  update public.event_badges set is_current=false where event_id=event.id and school_id=school_uuid and person_id=person_uuid and role=badge_role and is_current;
  insert into public.event_badges(institution_id,event_id,school_id,person_id,role,photo_id,version,snapshot,issued_by,template_version_id)
  values(event.institution_id,event.id,school_uuid,person_uuid,badge_role,(candidate->>'photo_id')::uuid,next_version,candidate||jsonb_build_object('event_name',event.name,'edition',event.edition,'institution_name',institution.name,'event_id',event.id),auth.uid(),(template->>'version_id')::uuid) returning * into badge;
  result:=result||jsonb_build_array(to_jsonb(badge)||jsonb_build_object('snapshot',badge.snapshot||jsonb_build_object('badge_template',template)));
 end loop;
 return result;
end $$;

notify pgrst,'reload schema';
