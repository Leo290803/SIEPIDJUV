alter table public.badge_templates
 add column reverse_background_id uuid references public.badge_art_assets(id);
alter table public.badge_template_versions
 add column reverse_background_id uuid references public.badge_art_assets(id);

create or replace function siep_private.badge_template_version_snapshot(p_version_id uuid) returns jsonb language sql stable security definer set search_path=pg_catalog as $$select jsonb_build_object('id',v.template_id,'version_id',v.id,'version',v.version,'role',v.role,'layout',v.layout,'background',case when a.id is null then null else jsonb_build_object('id',a.id,'bucket','siep-badge-art','objectPath',a.object_path,'name',a.original_name) end,'reverse_background',case when reverse_art.id is not null then jsonb_build_object('id',reverse_art.id,'bucket','siep-badge-art','objectPath',reverse_art.object_path,'name',reverse_art.original_name) end) from public.badge_template_versions v left join public.badge_art_assets a on a.id=v.background_id and a.status='uploaded' left join public.badge_art_assets reverse_art on reverse_art.id=v.reverse_background_id and reverse_art.status='uploaded' where v.id=p_version_id;$$;

create function public.siep_save_badge_template(
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
   where a.id=asset_id and a.institution_id=tenant and a.event_id=p_event_id and a.status='uploaded'
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

-- Preserve the reverse when an older client saves only the front.
create or replace function public.siep_save_badge_template(
 p_event_id uuid,p_role text,p_expected_version integer,p_layout jsonb,p_background_id uuid default null
) returns jsonb language sql security definer set search_path=pg_catalog as $$
 select public.siep_save_badge_template(p_event_id,p_role,p_expected_version,p_layout,p_background_id,
  (select t.reverse_background_id from public.badge_templates t
   where t.event_id=p_event_id and t.role=p_role and t.version=p_expected_version));
$$;

revoke all on function public.siep_save_badge_template(uuid,text,integer,jsonb,uuid,uuid) from public,anon;
grant execute on function public.siep_save_badge_template(uuid,text,integer,jsonb,uuid,uuid) to authenticated;
notify pgrst,'reload schema';
