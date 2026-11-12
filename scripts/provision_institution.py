#!/usr/bin/env python3
"""Prepara o primeiro cliente/admin sem senha e sem enviar e-mail."""
import argparse
import json
import uuid
from supabase_migrate import request,literal

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--project-ref',required=True)
parser.add_argument('--email',required=True)
parser.add_argument('--slug',default='idjuv')
parser.add_argument('--name',default='IDJUV')
args=parser.parse_args()
email=args.email.strip().lower()
if '@' not in email:raise SystemExit('E-mail inválido')
tag='provision_'+uuid.uuid4().hex
query=f"""begin;
select pg_advisory_xact_lock(7391102026);
insert into public.institutions(name,slug,branding) values({literal(args.name)},{literal(args.slug)},'{{"subtitle":"Governo de Roraima"}}') on conflict(slug) do nothing;
do ${tag}$ declare institution_uuid uuid; existing text; user_uuid uuid;
begin
 select id into institution_uuid from public.institutions where slug={literal(args.slug)};
 select email into existing from siep_private.bootstrap_administrators where institution_id=institution_uuid;
 if existing is not null and existing<>{literal(email)} then raise exception 'Administrador já reservado; não substituir automaticamente'; end if;
 if existing is null and exists(select 1 from public.institution_memberships where institution_id=institution_uuid and role='admin' and status='approved') then raise exception 'Instituição já tem administrador; usar gestão de contas existente'; end if;
 insert into siep_private.bootstrap_administrators(institution_id,email) values(institution_uuid,{literal(email)}) on conflict(institution_id) do nothing;
 select id into user_uuid from auth.users where lower(email)={literal(email)} and email_confirmed_at is not null;
 if user_uuid is not null and exists(select 1 from siep_private.bootstrap_administrators where institution_id=institution_uuid and assigned_user_id is null) then
  insert into public.institution_memberships(institution_id,user_id,role,status) values(institution_uuid,user_uuid,'admin','approved') on conflict(institution_id,user_id) do update set role='admin',status='approved';
  update siep_private.bootstrap_administrators set assigned_user_id=user_uuid,assigned_at=now() where institution_id=institution_uuid;
 end if;
end ${tag}$;
commit;"""
request('/projects/'+args.project_ref+'/database/query',{'query':query,'read_only':False})
print(json.dumps({'institution':args.slug,'administrator':'reserved_for_confirmed_email','password_created':False,'email_sent':False}))
