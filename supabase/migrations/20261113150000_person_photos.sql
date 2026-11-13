-- Foto de identificação compartilhada pelos papéis da mesma pessoa.
-- Cada versão tem objeto próprio, referenciável por futuros crachás do evento.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('siep-person-photos','siep-person-photos',false,5242880,array['image/png','image/jpeg']) on conflict(id) do nothing;
do $$ begin if exists(select 1 from storage.buckets where id='siep-person-photos' and public) then raise exception 'O bucket de fotos precisa ser privado';end if;end $$;
create table public.person_photos (
 id uuid primary key default gen_random_uuid(),
 institution_id uuid not null references public.institutions(id),
 person_id uuid not null,
 bucket_id text not null default 'siep-person-photos' check(bucket_id='siep-person-photos'),
 object_path text not null unique,
 original_name text not null check(length(btrim(original_name)) between 1 and 255),
 mime_type text not null check(mime_type in ('image/png','image/jpeg')),
 size_bytes integer not null check(size_bytes between 1 and 5242880),
 status text not null default 'pending' check(status in ('pending','uploaded','superseded')),
 is_current boolean not null default false check(not is_current or status='uploaded'),
 expected_photo_id uuid references public.person_photos(id),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 uploaded_at timestamptz,
 foreign key(institution_id,person_id) references public.people(institution_id,id)
);
create unique index person_photos_current on public.person_photos(person_id) where is_current;
create index person_photos_scope on public.person_photos(institution_id,person_id);
alter table public.person_photos enable row level security;
revoke all on public.person_photos from public,anon,authenticated;
grant select on public.person_photos to authenticated;
create policy person_photos_read on public.person_photos for select to authenticated using(siep_private.can_person(institution_id,person_id));
create trigger immutable_tenant before update on public.person_photos for each row execute function siep_private.immutable_tenant();
create trigger audit_changes after insert or update or delete on public.person_photos for each row execute function siep_private.audit_changes();

create function siep_private.require_photo_person(p_person_id uuid) returns uuid
language plpgsql security definer set search_path=pg_catalog as $$
declare tenant uuid;
begin
 select institution_id into tenant from public.people where id=p_person_id and not archived for update;
 if tenant is null or not siep_private.can_person(tenant,p_person_id) then raise exception 'Sem permissão para a foto deste cadastro' using errcode='42501';end if;
 return tenant;
end $$;
create function public.siep_prepare_person_photo(p_person_id uuid,p_name text,p_mime_type text,p_size_bytes integer,p_expected_photo_id uuid default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare tenant uuid;photo_uuid uuid:=gen_random_uuid();current_uuid uuid;path text;
begin
 tenant:=siep_private.require_photo_person(p_person_id);
 if p_mime_type is null or p_mime_type not in ('image/png','image/jpeg') or p_size_bytes is null or p_size_bytes not between 1 and 5242880 or length(btrim(coalesce(p_name,''))) not between 1 and 255 then raise exception 'Use uma foto PNG ou JPEG de até 5 MB' using errcode='23514';end if;
 select id into current_uuid from public.person_photos where person_id=p_person_id and is_current;
 if current_uuid is distinct from p_expected_photo_id then raise exception 'Foto alterada por outro usuário; reabra o cadastro' using errcode='40001';end if;
 path:=tenant::text||'/'||p_person_id||'/'||photo_uuid||case p_mime_type when 'image/png' then '.png' else '.jpg' end;
 insert into public.person_photos(id,institution_id,person_id,object_path,original_name,mime_type,size_bytes,expected_photo_id,created_by) values(photo_uuid,tenant,p_person_id,path,btrim(p_name),p_mime_type,p_size_bytes,p_expected_photo_id,auth.uid());
 return jsonb_build_object('id',photo_uuid,'bucket','siep-person-photos','path',path);
end $$;
create function public.siep_finalize_person_photo(p_photo_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare photo public.person_photos;current_uuid uuid;metadata jsonb;
begin
 select * into photo from public.person_photos where id=p_photo_id;
 if not found then raise exception 'Foto indisponível' using errcode='P0002';end if;
 perform siep_private.require_photo_person(photo.person_id);
 select * into photo from public.person_photos where id=p_photo_id for update;
 if photo.status<>'pending' or photo.created_by<>auth.uid() then raise exception 'Upload indisponível para esta conta' using errcode='42501';end if;
 select id into current_uuid from public.person_photos where person_id=photo.person_id and is_current;
 if current_uuid is distinct from photo.expected_photo_id then raise exception 'Foto alterada por outro usuário; reabra o cadastro' using errcode='40001';end if;
 select o.metadata into metadata from storage.objects o where o.bucket_id=photo.bucket_id and o.name=photo.object_path;
 if metadata is null or coalesce(metadata->>'size','') !~ '^[0-9]+$' then raise exception 'Upload não encontrado ou tamanho não verificado' using errcode='23514';end if;
 if (metadata->>'size')::bigint<>photo.size_bytes or metadata->>'mimetype' is distinct from photo.mime_type then raise exception 'Metadados do upload não correspondem à foto' using errcode='23514';end if;
 update public.person_photos set is_current=false,status='superseded' where person_id=photo.person_id and is_current;
 update public.person_photos set is_current=true,status='uploaded',uploaded_at=now() where id=photo.id;
end $$;
create function public.siep_remove_person_photo(p_person_id uuid,p_expected_photo_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog as $$
declare current_uuid uuid;
begin
 perform siep_private.require_photo_person(p_person_id);
 select id into current_uuid from public.person_photos where person_id=p_person_id and is_current;
 if current_uuid is distinct from p_expected_photo_id then raise exception 'Foto alterada por outro usuário; reabra o cadastro' using errcode='40001';end if;
 update public.person_photos set is_current=false,status='superseded' where id=current_uuid;
end $$;
create function siep_private.person_photo_access(p_path text,p_upload boolean default false) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select exists(select 1 from public.person_photos f join public.people p on p.id=f.person_id where f.object_path=p_path and not p.archived and siep_private.can_person(f.institution_id,f.person_id) and case when p_upload then f.status='pending' and f.created_by=auth.uid() else f.status in ('uploaded','superseded') end);
$$;
create policy person_photo_download on storage.objects for select to authenticated using(bucket_id='siep-person-photos' and siep_private.person_photo_access(name));
create policy person_photo_upload on storage.objects for insert to authenticated with check(bucket_id='siep-person-photos' and owner_id=auth.uid()::text and siep_private.person_photo_access(name,true));
-- Sem UPDATE/DELETE dos objetos: substituir/remover mantém versões anteriores privadas.
revoke all on function siep_private.require_photo_person(uuid),siep_private.person_photo_access(text,boolean),public.siep_prepare_person_photo(uuid,text,text,integer,uuid),public.siep_finalize_person_photo(uuid),public.siep_remove_person_photo(uuid,uuid) from public,anon,authenticated;
grant execute on function siep_private.person_photo_access(text,boolean),public.siep_prepare_person_photo(uuid,text,text,integer,uuid),public.siep_finalize_person_photo(uuid),public.siep_remove_person_photo(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
