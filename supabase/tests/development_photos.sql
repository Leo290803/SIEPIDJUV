do $$
declare tenant uuid:=gen_random_uuid();u uuid:=gen_random_uuid();outsider uuid:=gen_random_uuid();school uuid:=gen_random_uuid();p uuid:=gen_random_uuid();photo uuid:=gen_random_uuid();asset uuid:=gen_random_uuid();result jsonb;path text;denied boolean;
begin
 begin
 insert into auth.users(id) values(u),(outsider);
 insert into public.institutions(id,name,slug) values(tenant,'Fotos de exemplo','example-photos-'||tenant);
 insert into public.institution_memberships(institution_id,user_id,role,status) values(tenant,u,'admin','approved');
 insert into public.schools(id,institution_id,name) values(school,tenant,'Escola de exemplo');
 insert into public.people(id,institution_id,full_name,birth_date,cpf,gender) values(p,tenant,'Pessoa fictícia','2012-01-01','52998224725','Feminino');
 insert into public.school_people(institution_id,school_id,person_id,role,status) values(tenant,school,p,'athlete','approved');
 insert into siep_private.development_photo_assets(id,mime_type,content,sha256,ready) values(asset,'image/png',decode('01020304','hex'),encode(sha256(decode('01020304','hex')),'hex'),true);
 path:='development/'||photo||'.png';
 insert into public.person_photos(id,institution_id,person_id,bucket_id,object_path,original_name,mime_type,size_bytes,status,is_current,created_by,uploaded_at) values(photo,tenant,p,'siep-development-photos',path,'foto-exemplo.png','image/png',4,'uploaded',true,u,now());
 insert into siep_private.development_photo_links(photo_id,asset_id) values(photo,asset);
 perform set_config('request.jwt.claim.sub',u::text,true);
 execute 'set local role authenticated';
 result:=public.siep_read_development_photo(path);
 if decode(result->>'base64','base64')<>decode('01020304','hex') or result->>'mime_type'<>'image/png' then raise exception 'Bytes incorretos';end if;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 denied:=false;begin perform public.siep_read_development_photo(path);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Outra conta leu foto privada';end if;
 perform set_config('request.jwt.claim.sub','',true);
 denied:=false;begin perform public.siep_read_development_photo(path);exception when insufficient_privilege then denied:=true;end;if not denied then raise exception 'Anônimo leu foto';end if;
 if has_function_privilege('anon','public.siep_read_development_photo(text)','execute') or has_table_privilege('authenticated','siep_private.development_photo_assets','select') then raise exception 'Foto de exemplo exposta';end if;
 raise exception 'rollback_development_photos' using errcode='ZX001';
 exception when sqlstate 'ZX001' then null;
 end;
end $$;
