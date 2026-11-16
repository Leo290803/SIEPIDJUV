#!/usr/bin/env python3
"""Associa duas imagens sintéticas aos exemplos, com bytes privados compartilhados."""
import argparse
import base64
import hashlib
import json
import uuid
from pathlib import Path
from supabase_migrate import request,literal
from seed_development import manifest,SEED

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--project-ref',required=True)
 parser.add_argument('--male',type=Path,required=True)
 parser.add_argument('--female',type=Path,required=True)
 parser.add_argument('--institution-slug',default='idjuv')
 args=parser.parse_args()
 path='/projects/'+args.project_ref+'/database/query'
 def query(sql,readonly=False):return request(path,{'query':sql,'read_only':readonly})
 images={}
 # Verifica ambos os arquivos antes de enviar qualquer byte.
 for gender,file in [('Masculino',args.male),('Feminino',args.female)]:
  content=file.read_bytes()
  if not content.startswith(b'\x89PNG\r\n\x1a\n') or not 0<len(content)<=5242880:raise SystemExit('Use imagens PNG válidas de até 5 MB.')
  sha=hashlib.sha256(content).hexdigest();asset=str(uuid.uuid5(uuid.NAMESPACE_URL,SEED+'/photo/'+sha))
  images[gender]={'content':content,'sha':sha,'asset':asset}
 migration=query("select exists(select 1 from siep_migrations.applied where version='20261116160000_development_photo_assets') as ready",True)[0]['ready']
 if not migration:raise SystemExit('Aplique a migração de fotos sintéticas antes de executar este script.')
 for gender,image in images.items():
  content,sha,asset=image['content'],image['sha'],image['asset']
  query(f"insert into siep_private.development_photo_assets(id,mime_type,sha256) values('{asset}','image/png','{sha}') on conflict(id) do nothing;")
  state=query(f"select octet_length(content) as size,ready,sha256 from siep_private.development_photo_assets where id='{asset}'",True)[0]
  if state['sha256']!=sha:raise SystemExit('Hash de imagem divergente.')
  if not state['ready']:
   offset=state['size']
   if offset>len(content):raise SystemExit('Upload parcial incompatível.')
   while offset<len(content):
    chunk=content[offset:offset+131072];encoded=base64.b64encode(chunk).decode('ascii')
    result=query(f"update siep_private.development_photo_assets set content=content||decode('{encoded}','base64') where id='{asset}' and not ready and octet_length(content)={offset} returning octet_length(content) as size;")
    if not result:raise SystemExit('Imagem alterada por outra execução. Execute novamente para retomar.')
    offset=result[0]['size']
   completed=query(f"update siep_private.development_photo_assets set ready=true where id='{asset}' and encode(sha256(content),'hex')='{sha}' returning id;")
   if not completed:raise SystemExit('Os bytes recebidos não correspondem à imagem original. Nenhuma foto foi associada.')
  print(json.dumps({'image':gender,'bytes':len(content),'ready':True}),flush=True)
 plan=manifest(args.institution_slug)
 people=[{'person_id':p['id'],'asset_id':images[p['gender']]['asset'],'photo_id':str(uuid.uuid5(uuid.NAMESPACE_URL,SEED+'/photo/'+p['id']+'/'+images[p['gender']]['sha']))} for p in plan['people']]
 payload=literal(json.dumps(people))
 result=query(f"""begin;
set local lock_timeout='5s';set local statement_timeout='20s';
do $photos$
declare tenant uuid;actor uuid;item jsonb;asset siep_private.development_photo_assets;person uuid;photo uuid;
begin
 select id into tenant from public.institutions where slug={literal(args.institution_slug)};
 select user_id into actor from public.institution_memberships where institution_id=tenant and role='admin' and status='approved' order by created_at,id limit 1;
 if actor is null then raise exception 'Administrador aprovado ausente';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform pg_advisory_xact_lock(hashtext('{SEED}'),hashtext(tenant::text));
 for item in select value from jsonb_array_elements({payload}::jsonb) loop
  person:=(item->>'person_id')::uuid;photo:=(item->>'photo_id')::uuid;
  perform 1 from public.people where id=person and institution_id=tenant and contact->>'development_seed'='{SEED}' for update;
  if not found then raise exception 'Este cadastro não pertence aos exemplos esperados';end if;
  if exists(select 1 from public.person_photos where person_id=person and is_current) then continue;end if;
  -- Uma foto removida pelo usuário não é recolocada na reexecução.
  if exists(select 1 from public.person_photos where id=photo) then continue;end if;
  select * into strict asset from siep_private.development_photo_assets where id=(item->>'asset_id')::uuid and ready;
  insert into public.person_photos(id,institution_id,person_id,bucket_id,object_path,original_name,mime_type,size_bytes,status,is_current,created_by,uploaded_at)
  values(photo,tenant,person,'siep-development-photos','development/'||photo||'.png','foto-ficticia-de-exemplo.png',asset.mime_type,octet_length(asset.content),'uploaded',true,actor,now());
  insert into siep_private.development_photo_links(photo_id,asset_id) values(photo,asset.id);
 end loop;
end $photos$;
select count(*) as example_photos from public.person_photos f join public.people p on p.id=f.person_id join public.institutions i on i.id=p.institution_id where i.slug={literal(args.institution_slug)} and p.contact->>'development_seed'='{SEED}' and f.is_current;
commit;""")
 print(json.dumps(result,ensure_ascii=False))

if __name__=='__main__':main()
