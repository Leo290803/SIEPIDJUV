-- Imagens sintéticas compartilhadas de desenvolvimento; não alteram uploads normais.
-- Dois arquivos compartilhados são mantidos no schema privado, sem duplicar bytes por pessoa.
create table siep_private.development_photo_assets (
 id uuid primary key,
 mime_type text not null check(mime_type in ('image/png','image/jpeg')),
 content bytea not null default ''::bytea check(octet_length(content)<=5242880),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 ready boolean not null default false,
 check(not ready or encode(sha256(content),'hex')=sha256)
);
create table siep_private.development_photo_links (
 photo_id uuid primary key references public.person_photos(id),
 asset_id uuid not null references siep_private.development_photo_assets(id)
);
revoke all on siep_private.development_photo_assets,siep_private.development_photo_links from public,anon,authenticated;
alter table public.person_photos drop constraint person_photos_bucket_id_check;
alter table public.person_photos add constraint person_photos_bucket_id_check check(bucket_id in ('siep-person-photos','siep-development-photos'));

create function public.siep_read_development_photo(p_path text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog as $$
declare photo public.person_photos;asset siep_private.development_photo_assets;
begin
 if auth.uid() is null then raise exception 'Conta autenticada necessária' using errcode='42501';end if;
 select * into photo from public.person_photos where object_path=p_path and bucket_id='siep-development-photos';
 if not found or photo.status not in ('uploaded','superseded') or not siep_private.can_person(photo.institution_id,photo.person_id) then raise exception 'Foto indisponível para esta conta' using errcode='42501';end if;
 if not siep_private.is_staff(photo.institution_id) and exists(select 1 from public.people where id=photo.person_id and archived) then raise exception 'Foto arquivada indisponível' using errcode='42501';end if;
 select a.* into asset from siep_private.development_photo_links l join siep_private.development_photo_assets a on a.id=l.asset_id where l.photo_id=photo.id and a.ready;
 if not found then raise exception 'Imagem de exemplo ainda não está disponível' using errcode='P0002';end if;
 return jsonb_build_object('mime_type',asset.mime_type,'base64',encode(asset.content,'base64'));
end $$;
revoke all on function public.siep_read_development_photo(text) from public,anon;
grant execute on function public.siep_read_development_photo(text) to authenticated;
