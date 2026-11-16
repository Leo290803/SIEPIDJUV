-- Consultas limitadas no servidor. Nenhum cadastro existente é regravado.
create index registrations_created_scope on public.registrations(institution_id,created_at,id);
create index registration_athletes_registration on public.registration_athletes(registration_id,person_id);
create index registration_staff_registration on public.registration_staff(registration_id,person_id);
create index school_people_role_school on public.school_people(institution_id,role,school_id,id);
create index membership_decisions_link on public.membership_decisions(school_person_id,created_at);
create index event_participations_person_school on public.event_participations(institution_id,person_id,school_id);
create index audit_log_scope_time on public.audit_log(institution_id,created_at desc);

create function siep_private.report_text(value text) returns text language sql immutable parallel safe set search_path=pg_catalog as $$
 select translate(lower(coalesce(value,'')),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')
$$;
create function siep_private.report_rows(tenant uuid,f jsonb)
returns table(key text,cells jsonb,person_ids uuid[],school_ids uuid[],registration_ids uuid[])
language plpgsql stable set search_path=pg_catalog as $function$
begin
 -- Plano específico para estes filtros, sem interpolar texto do usuário.
 -- Evita plano genérico com junções quadráticas e ramos de outros relatórios.
 return query execute $query$
with params as not materialized (
 select coalesce(nullif($2->>'type',''),'participants') as kind,
 nullif($2->>'eventId','')::uuid as event_id,nullif($2->>'schoolId','')::uuid as school_id,
 nullif($2->>'modalityId','')::uuid as modality_id,nullif($2->>'categoryId','')::uuid as category_id,nullif($2->>'proofId','')::uuid as proof_id,
 nullif($2->>'gender','') as gender,nullif($2->>'city','') as city,nullif($2->>'status','') as status,
 nullif($2->>'from','')::date as date_from,nullif($2->>'to','')::date as date_to,
 nullif($2->>'yearFrom','')::integer as year_from,nullif($2->>'yearTo','')::integer as year_to,
 nullif($2->>'photo','') as photo,coalesce(($2->>'includeArchived')::boolean,false) as archived,
 nullif($2->>'profileStatus','') as profile_status,
 coalesce($2->>'eventId','')<>'' or coalesce($2->>'modalityId','')<>'' or coalesce($2->>'categoryId','')<>'' or coalesce($2->>'proofId','')<>'' or coalesce($2->>'status','')<>'' or coalesce($2->>'from','')<>'' or coalesce($2->>'to','')<>'' as registration_context,
 coalesce($2->>'gender','')<>'' or coalesce($2->>'yearFrom','')<>'' or coalesce($2->>'yearTo','')<>'' or coalesce($2->>'photo','')<>'' as subject_filter
), persons as materialized (
 select p.*,ph.id as photo_id,
 (x.gender is null or p.gender=x.gender) and (x.year_from is null or p.birth_date>=make_date(x.year_from,1,1)) and (x.year_to is null or p.birth_date<make_date(x.year_to+1,1,1)) and (x.photo is null or (x.photo='with' and ph.id is not null) or (x.photo='without' and ph.id is null)) as matches,
 jsonb_build_object('name',p.full_name,'gender',p.gender,'birth',to_char(p.birth_date,'DD/MM/YYYY'),'birthYear',to_char(p.birth_date,'YYYY'),'cpf',p.cpf,'phone',coalesce(p.contact->>'phone',''),'email',coalesce(p.contact->>'email',''),'photo',case when ph.id is null then 'Sem foto' else 'Com foto' end) as person_cells
 from public.people p cross join params x left join public.person_photos ph on ph.person_id=p.id and ph.is_current and ph.status='uploaded'
 where p.institution_id=$1
), regs as materialized (
 select r.*,jsonb_build_object('event',e.name,'edition',coalesce(e.edition,''),'school',s.name,'city',coalesce(s.details->>'city','Não informado'),'modality',m.name,'category',c.name,'proof',coalesce(pr.name,'Sem prova'),'status',case r.status when 'draft' then 'Rascunho' when 'submitted' then 'Enviada' when 'correction_requested' then 'Correção solicitada' when 'approved' then 'Aprovada' when 'rejected' then 'Indeferida' when 'cancelled' then 'Cancelada' end,'created',to_char(r.created_at at time zone 'America/Manaus','DD/MM/YYYY'),'reference',r.id) as context_cells
 from public.registrations r cross join params x join public.events e on e.id=r.event_id join public.schools s on s.id=r.school_id join public.event_categories c on c.id=r.category_id join public.event_modalities m on m.id=c.modality_id left join public.event_proofs pr on pr.id=r.proof_id
 where r.institution_id=$1 and (x.event_id is null or r.event_id=x.event_id) and (x.school_id is null or r.school_id=x.school_id) and (x.city is null or s.details->>'city'=x.city) and (x.modality_id is null or c.modality_id=x.modality_id) and (x.category_id is null or r.category_id=x.category_id) and (x.proof_id is null or r.proof_id=x.proof_id) and (x.status is null or r.status=x.status)
 and (x.date_from is null or r.created_at >= (x.date_from::timestamp at time zone 'America/Manaus')) and (x.date_to is null or r.created_at < ((x.date_to+1)::timestamp at time zone 'America/Manaus'))
), roster as materialized (
 select a.*,p.person_cells,p.gender,p.matches from regs r join public.registration_athletes a on a.registration_id=r.id join persons p on p.id=a.person_id where a.active or r.status in ('cancelled','rejected')
), filtered_regs as materialized (
 select r.* from regs r cross join params x where not x.subject_filter or exists(select 1 from roster a where a.registration_id=r.id and a.matches)
), profile_relations as materialized (
 select distinct a.person_id,a.school_id,'athlete'::text as role,a.registration_id from roster a
 union all select a.person_id,a.school_id,'staff',a.registration_id from public.registration_staff a join regs r on r.id=a.registration_id
 union all select sp.person_id,sp.school_id,'responsible',r.id from public.school_people sp join regs r on r.school_id=sp.school_id where sp.institution_id=$1 and sp.role='responsible'
), raw_rows as (
 select a.id::text as key,a.person_cells||r.context_cells||jsonb_build_object('slot',a.slot_number) as cells,array[a.person_id] as person_ids,array[r.school_id] as school_ids,array[r.id] as registration_ids
 from roster a join regs r on r.id=a.registration_id cross join params x where x.kind='participants' and a.matches
 union all
 select a.id::text,p.person_cells||r.context_cells||jsonb_build_object('position',sf.name),array[p.id],array[r.school_id],array[r.id]
 from regs r join public.registration_staff a on a.registration_id=r.id join persons p on p.id=a.person_id join public.event_staff_roles sf on sf.id=a.staff_role_id cross join params x where x.kind='staffEntries' and p.matches
 union all
 select r.id::text,r.context_cells||jsonb_build_object('athletes',count(a.id) filter(where a.matches),'totalAthletes',count(a.id),'athleteNames',coalesce(string_agg(distinct a.person_cells->>'name','; ') filter(where a.matches),''),'gender',coalesce(string_agg(distinct a.gender,' / ') filter(where a.matches),'Sem atletas')),
 coalesce(array_agg(distinct a.person_id) filter(where a.matches),'{}'),array[r.school_id],array[r.id]
 from filtered_regs r cross join params x left join roster a on a.registration_id=r.id where x.kind='registrations' group by r.id,r.school_id,r.context_cells
 union all
 select sp.id::text,p.person_cells||jsonb_build_object('school',s.name,'city',coalesce(s.details->>'city','Não informado'),'position',coalesce(sp.position,'Não informado'),'status',case sp.status when 'pending' then 'Pendente' when 'approved' then 'Aprovado' when 'refused' then 'Recusado' when 'closed' then 'Encerrado' end,'relatedEvents',coalesce(string_agg(distinct r.context_cells->>'event','; '),''),'relatedCategories',coalesce(string_agg(distinct r.context_cells->>'category','; '),'')),array[p.id],array[sp.school_id],coalesce(array_agg(distinct rel.registration_id) filter(where rel.registration_id is not null),'{}')
 from public.school_people sp join persons p on p.id=sp.person_id join public.schools s on s.id=sp.school_id cross join params x left join profile_relations rel on rel.person_id=p.id and rel.school_id=sp.school_id and rel.role=sp.role left join regs r on r.id=rel.registration_id
 where sp.institution_id=$1 and sp.role=case x.kind when 'athletes' then 'athlete' when 'staff' then 'staff' when 'responsibles' then 'responsible' end
 and p.matches and (x.school_id is null or sp.school_id=x.school_id) and (x.city is null or s.details->>'city'=x.city)
 and (x.archived or not (p.archived or sp.archived or (sp.role in ('athlete','staff') and sp.status<>'approved')))
 and (x.profile_status is null or sp.status=case x.profile_status when 'Pendente' then 'pending' when 'Aprovado' then 'approved' when 'Recusado' then 'refused' when 'Encerrado' then 'closed' else 'invalid' end)
 and (not x.registration_context or rel.registration_id is not null)
 group by sp.id,sp.school_id,sp.position,sp.status,p.id,p.person_cells,s.name,s.details
 union all
 select s.id::text,jsonb_build_object('school',s.name,'city',coalesce(s.details->>'city','Não informado'),'inep',coalesce(s.inep,''),'status',case when s.archived then 'Arquivada' else 'Ativa' end,'registrations',count(distinct r.id),'people',count(distinct a.person_id),'male',count(distinct a.person_id) filter(where a.gender='Masculino'),'female',count(distinct a.person_id) filter(where a.gender='Feminino')),
 coalesce(array_agg(distinct a.person_id) filter(where a.person_id is not null),'{}'),array[s.id],coalesce(array_agg(distinct r.id) filter(where r.id is not null),'{}')
 from public.schools s cross join params x left join filtered_regs r on r.school_id=s.id left join roster a on a.registration_id=r.id and a.matches
 where x.kind='schools' and s.institution_id=$1 and (x.archived or not s.archived) and (x.school_id is null or s.id=x.school_id) and (x.city is null or s.details->>'city'=x.city) and (not (x.registration_context or x.subject_filter) or r.id is not null)
 group by s.id,s.name,s.details,s.inep,s.archived
 union all
 select e.id::text,jsonb_build_object('event',e.name,'edition',coalesce(e.edition,''),'status',case e.status when 'draft' then 'Rascunho' when 'open' then 'Inscrições abertas' when 'closed' then 'Encerrado' else 'Arquivado' end,'start',coalesce(to_char(e.registration_start at time zone 'America/Manaus','DD/MM/YYYY'),'Não informado'),'end',coalesce(to_char(e.registration_end at time zone 'America/Manaus','DD/MM/YYYY'),'Não informado'),'schools',count(distinct r.school_id),'registrations',count(distinct r.id),'people',count(distinct a.person_id)),coalesce(array_agg(distinct a.person_id) filter(where a.person_id is not null),'{}'),coalesce(array_agg(distinct r.school_id) filter(where r.school_id is not null),'{}'),coalesce(array_agg(distinct r.id) filter(where r.id is not null),'{}')
 from public.events e cross join params x left join filtered_regs r on r.event_id=e.id left join roster a on a.registration_id=r.id and a.matches
 where x.kind='events' and e.institution_id=$1 and (x.archived or e.status<>'archived') and (x.event_id is null or e.id=x.event_id) and (not (x.school_id is not null or x.city is not null or x.modality_id is not null or x.category_id is not null or x.proof_id is not null or x.status is not null or x.date_from is not null or x.date_to is not null or x.subject_filter) or r.id is not null)
 group by e.id,e.name,e.edition,e.status,e.registration_start,e.registration_end
)
select * from raw_rows r where coalesce($2->>'query','')='' or exists(select 1 from jsonb_each_text(r.cells) v where strpos(siep_private.report_text(v.value),siep_private.report_text($2->>'query'))>0) or (r.cells ? 'cpf' and regexp_replace($2->>'query','[^0-9]','','g')<>'' and $2->>'query' ~ '^[0-9. /-]+$' and strpos(r.cells->>'cpf',regexp_replace($2->>'query','[^0-9]','','g'))>0)
$query$ using tenant,f;
end
$function$;
revoke all on function siep_private.report_text(text),siep_private.report_rows(uuid,jsonb) from public,anon,authenticated;

create function public.siep_report_page(p_institution_id uuid,p_filters jsonb default '{}',p_group text default '',p_sort text default 'name',p_direction text default 'asc',p_offset integer default 0,p_limit integer default 25,p_snapshot text default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog set statement_timeout='15s' as $$
declare result jsonb; snapshot text; k text; v text;kind text:=coalesce(p_filters->>'type','participants');
begin
 perform siep_private.require_staff(p_institution_id);
 if jsonb_typeof(p_filters) is distinct from 'object' or octet_length(p_filters::text)>4096 then raise exception 'Filtros inválidos' using errcode='22023';end if;
 if kind not in ('participants','registrations','athletes','staff','staffEntries','responsibles','schools','events') then raise exception 'Tipo inválido' using errcode='22023';end if;
 if p_limit is null or p_limit not between 1 and 500 or p_offset is null or p_offset not between 0 and 1000000 or p_direction not in ('asc','desc') then raise exception 'Paginação inválida' using errcode='22023';end if;
 if p_group not in ('','gender','school','city','modality','category','proof','status','photo') or length(p_sort)>40 then raise exception 'Apresentação inválida' using errcode='22023';end if;
 if p_group<>'' and ((kind='registrations' and p_group in ('gender','photo')) or (kind='schools' and p_group not in ('city','status')) or (kind='events' and p_group<>'status') or (kind in ('athletes','staff','responsibles') and p_group not in ('gender','school','city','status','photo'))) then raise exception 'Agrupamento incompatível' using errcode='22023';end if;
 if length(coalesce(p_filters->>'query',''))>200 then raise exception 'Pesquisa muito longa' using errcode='22023';end if;
 foreach k in array array['yearFrom','yearTo'] loop
  v:=nullif(p_filters->>k,'');if v is not null and (v !~ '^[0-9]{4}$' or v::integer not between 1900 and extract(year from current_date)::integer) then raise exception 'Ano de nascimento inválido' using errcode='22023';end if;
 end loop;
 if nullif(p_filters->>'from','')::date>nullif(p_filters->>'to','')::date or nullif(p_filters->>'yearFrom','')::int>nullif(p_filters->>'yearTo','')::int then raise exception 'Intervalo inválido' using errcode='22023';end if;
 -- O marcador detecta mudanças entre páginas da exportação; não é uma credencial.
 select count(*)::text||':'||coalesce(max(created_at)::text,'') into snapshot from public.audit_log where institution_id=p_institution_id;
 if p_snapshot is not null and p_snapshot<>snapshot then raise exception 'Os dados mudaram durante a exportação. Atualize e tente novamente.' using errcode='40001';end if;
 with records as materialized(select * from siep_private.report_rows(p_institution_id,p_filters)),
 summary as (select jsonb_build_object('records',(select count(*) from records),'people',(select count(distinct id) from records r cross join lateral unnest(r.person_ids) id),'schools',(select count(distinct id) from records r cross join lateral unnest(r.school_ids) id),'registrations',(select count(distinct id) from records r cross join lateral unnest(r.registration_ids) id)) as value),
 group_keys as (select cells->>p_group as key,count(*) as records from records where p_group<>'' group by cells->>p_group),
 group_people as(select cells->>p_group as key,count(distinct id) as total from records cross join lateral unnest(person_ids) id where p_group<>'' group by cells->>p_group),
 group_schools as(select cells->>p_group as key,count(distinct id) as total from records cross join lateral unnest(school_ids) id where p_group<>'' group by cells->>p_group),
 group_registrations as(select cells->>p_group as key,count(distinct id) as total from records cross join lateral unnest(registration_ids) id where p_group<>'' group by cells->>p_group),
 grouped as (
  select g.key,jsonb_build_object('name',g.key,'records',g.records,'people',coalesce(p.total,0),'schools',coalesce(s.total,0),'registrations',coalesce(r.total,0)) as cells from group_keys g left join group_people p using(key) left join group_schools s using(key) left join group_registrations r using(key)
 ), output as (select key,cells from records where p_group='' union all select key,cells from grouped),
 ordered as (select key,cells,row_number() over(order by
 case when p_direction='asc' then case when p_sort in ('birth','created','start','end') and cells->>p_sort ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' then to_jsonb(to_date(cells->>p_sort,'DD/MM/YYYY')) else cells->p_sort end end asc nulls last,
 case when p_direction='desc' then case when p_sort in ('birth','created','start','end') and cells->>p_sort ~ '^[0-9]{2}/[0-9]{2}/[0-9]{4}$' then to_jsonb(to_date(cells->>p_sort,'DD/MM/YYYY')) else cells->p_sort end end desc nulls last,key) as position from output),
 page as(select * from ordered order by position offset p_offset limit p_limit)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('key',key,'cells',cells) order by position) from page),'[]'),'summary',(select value from summary),'total',(select count(*) from output),'snapshot',snapshot) into result;
 return result;
end $$;
revoke all on function public.siep_report_page(uuid,jsonb,text,text,text,integer,integer,text) from public,anon;
grant execute on function public.siep_report_page(uuid,jsonb,text,text,text,integer,integer,text) to authenticated;
