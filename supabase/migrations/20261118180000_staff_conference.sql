-- Conferência por profissional/evento/escola, independente da inscrição do atleta.
create table public.staff_event_reviews (
 id uuid primary key default gen_random_uuid(), institution_id uuid not null,
 event_id uuid not null,school_id uuid not null,person_id uuid not null,
 status text not null check(status in ('approved','correction_requested','rejected')),
 revision integer not null check(revision>0),fingerprint text not null,
 reason text not null check(btrim(reason)<>''), reviewed_by uuid not null references auth.users(id),reviewed_at timestamptz not null default now(),
 unique(institution_id,event_id,school_id,person_id),
 foreign key(institution_id,event_id) references public.events(institution_id,id),
 foreign key(institution_id,school_id) references public.schools(institution_id,id),
 foreign key(institution_id,person_id) references public.people(institution_id,id)
);
create table public.staff_event_review_history (
 id uuid primary key default gen_random_uuid(),review_id uuid not null references public.staff_event_reviews(id),institution_id uuid not null references public.institutions(id),school_id uuid not null references public.schools(id),
 revision integer not null,status text not null,reason text not null, snapshot jsonb not null,actor_user_id uuid not null references auth.users(id),created_at timestamptz not null default now(), unique(review_id,revision)
);
alter table public.staff_event_reviews enable row level security;
alter table public.staff_event_review_history enable row level security;
create policy staff_reviews_read on public.staff_event_reviews for select to authenticated using(siep_private.can_school(institution_id,school_id));
create policy staff_review_history_read on public.staff_event_review_history for select to authenticated using(siep_private.can_school(institution_id,school_id));
revoke all on public.staff_event_reviews,public.staff_event_review_history from public,anon,authenticated;
grant select on public.staff_event_reviews,public.staff_event_review_history to authenticated;
create index staff_conference_scope_idx on public.registration_staff(institution_id,event_id,school_id,person_id);
create function siep_private.staff_conference_candidate(tenant uuid,ev uuid,school uuid,person uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
 select jsonb_build_object('event_id',ev,'school_id',school,'person_id',person,'event_name',e.name,'school_name',s.name,'person',to_jsonb(p),'link_id',sp.id,'active',not p.archived and not sp.archived and sp.status='approved' and not s.archived,'photo',(select jsonb_build_object('id',f.id,'bucket',f.bucket_id,'objectPath',f.object_path,'name',f.original_name) from public.person_photos f where f.institution_id=tenant and f.person_id=person and f.is_current and f.status='uploaded'),'roles',(select coalesce(jsonb_agg(x order by x->>'name'),'[]') from (select distinct jsonb_build_object('id',sr.id,'name',sr.name) x from public.registration_staff a join public.event_staff_roles sr on sr.id=a.staff_role_id where a.institution_id=tenant and a.event_id=ev and a.school_id=school and a.person_id=person) roles),'registration_count',(select count(distinct a.registration_id) from public.registration_staff a where a.institution_id=tenant and a.event_id=ev and a.school_id=school and a.person_id=person))
 from public.people p join public.school_people sp on sp.institution_id=p.institution_id and sp.person_id=p.id and sp.role='staff' and sp.school_id=school join public.events e on e.institution_id=tenant and e.id=ev join public.schools s on s.institution_id=tenant and s.id=school where p.institution_id=tenant and p.id=person and exists(select 1 from public.registration_staff a where a.institution_id=tenant and a.event_id=ev and a.school_id=school and a.person_id=person);
$$;
create function siep_private.staff_conference_fingerprint(candidate jsonb) returns text
language sql immutable set search_path=pg_catalog as $$
 select md5(jsonb_build_object('person',candidate->'person','photo',candidate->'photo','roles',candidate->'roles','active',candidate->'active','link_id',candidate->'link_id')::text);
$$;
create function siep_private.staff_conference_row(tenant uuid,ev uuid,school uuid,person uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare c jsonb;f text;r public.staff_event_reviews;
begin
 c:=siep_private.staff_conference_candidate(tenant,ev,school,person);if c is null then return null;end if;
 f:=siep_private.staff_conference_fingerprint(c);
 select * into r from public.staff_event_reviews where institution_id=tenant and event_id=ev and school_id=school and person_id=person;
 return c||jsonb_build_object('fingerprint',f,'revision',coalesce(r.revision,0),'status',case when r.fingerprint=f then r.status else 'pending' end,'outdated',r.id is not null and r.fingerprint<>f,'last_reason',r.reason,'reviewed_at',r.reviewed_at);
end $$;
create function public.siep_staff_conference_page(p_institution_id uuid,p_school_id uuid default null,p_filters jsonb default '{}',p_offset integer default 0,p_limit integer default 10) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare payload jsonb;total bigint;ev uuid;school uuid;state text:=coalesce(p_filters->>'status','all');q text:=siep_private.report_text(coalesce(p_filters->>'query',''));
begin
 if not siep_private.is_staff(p_institution_id) then
  if p_school_id is null then raise exception 'Escola obrigatória' using errcode='42501';end if;
  perform siep_private.require_school(p_institution_id,p_school_id);
 end if;
 if auth.uid() is null then raise exception 'Acesso indisponível' using errcode='42501';end if;
 if p_offset is null or p_offset not between 0 and 1000000 or p_limit is null or p_limit not between 1 and 50 or jsonb_typeof(p_filters)<>'object' or octet_length(p_filters::text)>2048 or state not in ('all','pending','approved','correction_requested','rejected') then raise exception 'Filtros inválidos' using errcode='22023';end if;
 ev:=nullif(p_filters->>'eventId','')::uuid;school:=coalesce(p_school_id,nullif(p_filters->>'schoolId','')::uuid);
 with candidates as materialized (select distinct a.event_id,a.school_id,a.person_id from public.registration_staff a join public.people p on p.id=a.person_id join public.schools s on s.id=a.school_id where a.institution_id=p_institution_id and (ev is null or a.event_id=ev) and (school is null or a.school_id=school) and (q='' or position(q in siep_private.report_text(p.full_name||' '||p.cpf||' '||s.name))>0)), rows as materialized (select siep_private.staff_conference_row(p_institution_id,c.event_id,c.school_id,c.person_id) item from candidates c), filtered as materialized (select item from rows where item is not null and (state='all' or item->>'status'=state))
 select count(*),coalesce((select jsonb_agg(item order by item->>'school_name',item#>>'{person,full_name}',item->>'event_id',item->>'person_id') from (select item from filtered order by item->>'school_name',item#>>'{person,full_name}',item->>'event_id',item->>'person_id' offset p_offset limit p_limit) page),'[]') into total,payload from filtered;
 return jsonb_build_object('rows',payload,'total',total);
end $$;
create function public.siep_staff_conference_detail(p_institution_id uuid,p_event_id uuid,p_school_id uuid,p_person_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare c jsonb;h jsonb;
begin
 perform siep_private.require_school(p_institution_id,p_school_id);
 c:=siep_private.staff_conference_row(p_institution_id,p_event_id,p_school_id,p_person_id);if c is null then raise exception 'Profissional indisponível neste evento e escola' using errcode='P0002';end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.revision desc),'[]') into h from public.staff_event_review_history x join public.staff_event_reviews r on r.id=x.review_id where r.institution_id=p_institution_id and r.event_id=p_event_id and r.school_id=p_school_id and r.person_id=p_person_id;
 return c||jsonb_build_object('history',h);
end $$;
create function public.siep_review_staff(p_institution_id uuid,p_event_id uuid,p_school_id uuid,p_person_id uuid,p_expected_revision integer,p_fingerprint text,p_status text,p_reason text) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare c jsonb;f text;r public.staff_event_reviews;v integer;
begin
 perform siep_private.require_staff(p_institution_id);
 if p_status is null or p_status not in ('approved','correction_requested','rejected') or btrim(coalesce(p_reason,''))='' or length(p_reason)>5000 then raise exception 'Decisão e justificativa obrigatórias' using errcode='23514';end if;
 -- Ordem fixa de locks por pessoa/escola/evento; serializa primeira decisão também.
 perform pg_advisory_xact_lock(hashtextextended(p_institution_id::text||':'||p_event_id||':'||p_school_id||':'||p_person_id,0));
 perform 1 from public.events where institution_id=p_institution_id and id=p_event_id for share;
 perform 1 from public.people where institution_id=p_institution_id and id=p_person_id for share;
 perform 1 from public.school_people where institution_id=p_institution_id and school_id=p_school_id and person_id=p_person_id and role='staff' for share;
 perform 1 from public.person_photos where institution_id=p_institution_id and person_id=p_person_id for share;
 c:=siep_private.staff_conference_candidate(p_institution_id,p_event_id,p_school_id,p_person_id);if c is null then raise exception 'Profissional indisponível' using errcode='P0002';end if;
 f:=siep_private.staff_conference_fingerprint(c);
 select * into r from public.staff_event_reviews where institution_id=p_institution_id and event_id=p_event_id and school_id=p_school_id and person_id=p_person_id for update;
 if p_expected_revision is distinct from coalesce(r.revision,0) or p_fingerprint is distinct from f then raise exception 'Cadastro ou análise alterados; recarregue a conferência' using errcode='40001';end if;
 if p_status='approved' and not (c->>'active')::boolean then raise exception 'Regularize o vínculo do profissional antes de aprovar' using errcode='23514';end if;
 insert into public.staff_event_reviews(institution_id,event_id,school_id,person_id,status,revision,fingerprint,reason,reviewed_by) values(p_institution_id,p_event_id,p_school_id,p_person_id,p_status,1,f,btrim(p_reason),auth.uid()) on conflict(institution_id,event_id,school_id,person_id) do update set status=excluded.status,revision=staff_event_reviews.revision+1,fingerprint=excluded.fingerprint,reason=excluded.reason,reviewed_by=excluded.reviewed_by,reviewed_at=now() returning * into r;
 insert into public.staff_event_review_history(review_id,institution_id,school_id,revision,status,reason,snapshot,actor_user_id) values(r.id,p_institution_id,p_school_id,r.revision,p_status,r.reason,c,auth.uid());
 insert into public.notifications(institution_id,recipient_user_id,kind,payload,deduplication_key)
 select p_institution_id,sp.user_id,'staff_review',jsonb_build_object('person_id',p_person_id,'person_name',c#>>'{person,full_name}','event_id',p_event_id,'event_name',c->>'event_name','school_id',p_school_id,'school_name',c->>'school_name','status',p_status),'staff-review:'||r.id||':'||r.revision
 from public.school_people sp join public.people p on p.id=sp.person_id where sp.institution_id=p_institution_id and sp.school_id=p_school_id and sp.role='responsible' and sp.status='approved' and sp.user_id is not null and not sp.archived and not p.archived
 on conflict(institution_id,recipient_user_id,deduplication_key) do nothing;
 return siep_private.staff_conference_row(p_institution_id,p_event_id,p_school_id,p_person_id);
end $$;
create function siep_private.staff_review_history_immutable() returns trigger language plpgsql set search_path=pg_catalog as $$begin raise exception 'Histórico imutável' using errcode='42501';end $$;
create trigger staff_review_history_immutable before update or delete on public.staff_event_review_history for each row execute function siep_private.staff_review_history_immutable();
revoke all on function siep_private.staff_conference_candidate(uuid,uuid,uuid,uuid),siep_private.staff_conference_fingerprint(jsonb),siep_private.staff_conference_row(uuid,uuid,uuid,uuid),siep_private.staff_review_history_immutable() from public,anon,authenticated;
revoke all on function public.siep_staff_conference_page(uuid,uuid,jsonb,integer,integer),public.siep_staff_conference_detail(uuid,uuid,uuid,uuid),public.siep_review_staff(uuid,uuid,uuid,uuid,integer,text,text,text) from public,anon;
grant execute on function public.siep_staff_conference_page(uuid,uuid,jsonb,integer,integer),public.siep_staff_conference_detail(uuid,uuid,uuid,uuid),public.siep_review_staff(uuid,uuid,uuid,uuid,integer,text,text,text) to authenticated;
notify pgrst,'reload schema';
