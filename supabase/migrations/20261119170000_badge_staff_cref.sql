-- Add the staff registration to new issuance snapshots and allow it in staff templates.
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
 end loop;if not required<@seen then raise exception 'Mantenha nome, foto, escola e campo obrigatório do perfil' using errcode='23514';end if;
end $$;

create or replace function siep_private.badge_dynamic_data(ev uuid,school uuid,person uuid,profile text) returns jsonb language sql stable set search_path=pg_catalog as $$
 with involved as(select r.* from public.registrations r where r.event_id=ev and r.school_id=school and r.status='approved' and case when profile='athlete' then exists(select 1 from public.registration_athletes a where a.registration_id=r.id and a.person_id=person and a.active) when profile='staff' then exists(select 1 from public.registration_staff a where a.registration_id=r.id and a.person_id=person) else false end)
 select jsonb_build_object('modalities',(select string_agg(distinct m.name,' / ' order by m.name) from involved r join public.event_categories c on c.id=r.category_id join public.event_modalities m on m.id=c.modality_id),'categories',(select string_agg(distinct c.name,' / ' order by c.name) from involved r join public.event_categories c on c.id=r.category_id),'proofs',(select string_agg(distinct p.name,' / ' order by p.name) from involved r join public.event_proofs p on p.id=r.proof_id),'cref',case when profile='staff' then (
  select nullif(btrim(sp.professional_registration),'')
  from public.school_people sp
  join public.events e on e.id=ev and e.institution_id=sp.institution_id
  where sp.school_id=school and sp.person_id=person and sp.role='staff'
 ) end, 'functions',case when profile='responsible' then coalesce((select nullif(sp.position,'') from public.school_people sp where sp.school_id=school and sp.person_id=person and sp.role='responsible'),'Responsável escolar') else (select string_agg(distinct f.name,' / ' order by f.name) from involved r join public.registration_staff a on a.registration_id=r.id and a.person_id=person join public.event_staff_roles f on f.id=a.staff_role_id) end);
$$;
