-- Require category on new athlete models and preserve all prior issuance snapshots.
create or replace function siep_private.validate_badge_layout(p_role text,p_layout jsonb) returns void language plpgsql set search_path=pg_catalog as $$declare f jsonb;k text;seen text[]:='{}';required text[]:=array['photo','person_name','school_name'];begin
 if p_role is null or p_role not in ('athlete','staff','responsible') or jsonb_typeof(p_layout)<>'object' or p_layout->>'width' is distinct from '86' or p_layout->>'height' is distinct from '130' or coalesce(p_layout->>'fit','') not in ('contain','cover') or jsonb_typeof(p_layout->'fields') is distinct from 'array' or jsonb_array_length(p_layout->'fields') not between 4 and 12 or octet_length(p_layout::text)>16384 or (p_layout ? 'theme' and p_layout->>'theme' is distinct from 'credential-v1') or p_layout-array['width','height','fit','fields','theme']<>'{}' then raise exception 'Modelo de crachá inválido' using errcode='23514';end if;
 required:=required||case p_role when 'athlete' then 'modalities' when 'staff' then 'functions' else 'role_label' end;
 for f in select value from jsonb_array_elements(p_layout->'fields') loop
  k:=f->>'key';if jsonb_typeof(f)<>'object' or k is null or k not in ('photo','person_name','school_name','role_label','event_name','edition','modalities','categories','proofs','functions','code','qr_code','cref') or (k='cref' and p_role<>'staff') or k=any(seen) or (p_role='athlete' and k='functions') or (p_role='staff' and k='proofs') or (p_role='responsible' and k in ('modalities','categories','proofs')) or f-array['key','x','y','w','h','fontSize','color','align']<>'{}' then raise exception 'Campo inválido para este perfil' using errcode='23514';end if;
  seen:=array_append(seen,k);
  if jsonb_typeof(f->'x') is distinct from 'number' or jsonb_typeof(f->'y') is distinct from 'number' or jsonb_typeof(f->'w') is distinct from 'number' or jsonb_typeof(f->'h') is distinct from 'number' or jsonb_typeof(f->'fontSize') is distinct from 'number' then raise exception 'Medidas inválidas' using errcode='23514';end if;
  if (f->>'x')::numeric<0 or (f->>'y')::numeric<0 or (f->>'w')::numeric<2 or (f->>'h')::numeric<2 or (f->>'x')::numeric+(f->>'w')::numeric>100 or (f->>'y')::numeric+(f->>'h')::numeric>100 or (f->>'fontSize')::numeric not between 6 and 28 or coalesce(f->>'color','') !~* '^#[0-9a-f]{6}$' or coalesce(f->>'align','') not in ('left','center','right') then raise exception 'Campos precisam caber no crachá' using errcode='23514';end if;
  if k='qr_code' and (round((f->>'w')::numeric*.86,1)<15 or round((f->>'h')::numeric*1.3,1)<15) then
   raise exception 'O QR Code precisa de pelo menos 15 mm de largura e altura' using errcode='23514';
  end if;
 end loop;
 if p_role='athlete' and not ('categories'=any(seen)) then
  raise exception 'Adicione o campo Categorias ao modelo de atleta' using errcode='23514';
 end if;
 if not required<@seen then raise exception 'Mantenha nome, foto, escola e campo obrigatório do perfil' using errcode='23514';end if;
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
  candidate:=candidate||siep_private.badge_dynamic_data(event.id,school_uuid,person_uuid,badge_role)||jsonb_build_object('badge_template',case when template is null then null else jsonb_build_object('id',template->'id','version_id',template->'version_id','version',template->'version') end);
  if badge_role='athlete' then
   if template is not null and not (template->'layout'->'fields') @> '[{"key":"categories"}]' then
    raise exception 'Adicione o campo Categorias ao modelo de atleta e salve antes de emitir' using errcode='23514';
   end if;
   if template is null then
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
