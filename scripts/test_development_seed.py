#!/usr/bin/env python3
"""Verifica exemplos de desenvolvimento em banco local descartável, nunca no Supabase."""
import json
import subprocess
import time
from pathlib import Path
import test_database as db
from seed_development import build_sql,manifest
ADMIN_EMAIL="development-admin@example.invalid"
ROOT=Path(__file__).resolve().parents[1]

def main():
 try:
  db.docker('run','--rm','-d','--name',db.NAME,'-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17')
  for _ in range(60):
   try:db.docker('exec',db.NAME,'pg_isready','-h','127.0.0.1','-U','postgres');break
   except subprocess.CalledProcessError:time.sleep(.25)
  db.sql((ROOT/'supabase/local/bootstrap.sql').read_text())
  db.sql('begin;\n'+'\n'.join(p.read_text() for p in sorted((ROOT/'supabase/migrations').glob('*.sql')))+'\ncommit;')
  db.sql(f"""insert into auth.users(id,email) values('11111111-1111-4111-8111-111111111111','{ADMIN_EMAIL}');
insert into public.institutions(id,name,slug) values('22222222-2222-4222-8222-222222222222','Desenvolvimento','idjuv');
insert into public.institution_memberships(institution_id,user_id,role,status) values('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','admin','approved');""")
  plan=manifest();event=plan['event']['id']
  db.sql(build_sql(apply=False))
  assert db.sql('select count(*) from public.people')=='0','Validação persistiu pessoas'
  db.sql(build_sql(apply=True))
  counts=json.loads(db.sql(f"select jsonb_build_object('people',(select count(*) from public.people),'schools',(select count(*) from public.schools),'registrations',(select count(*) from public.registrations where event_id='{event}'),'versions',(select count(*) from public.registration_versions))"))
  assert counts['people']==45 and counts['schools']==3 and counts['registrations']==24,counts
  db.sql(build_sql(apply=True))
  assert db.sql('select count(*) from public.people')=='45','Reexecução duplicou cadastros'
  assert db.sql('select count(*) from public.registration_versions')==str(counts['versions']),'Reexecução alterou histórico'
  status=json.loads(db.sql(f"select jsonb_object_agg(status,total) from(select status,count(*) total from public.registrations where event_id='{event}' group by status) s"))
  assert len(status)==6 and set(status.values())=={4},status
  report=json.loads(db.sql(f"begin;select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);select public.siep_report_page('22222222-2222-4222-8222-222222222222','{{\"eventId\":\"{event}\",\"type\":\"participants\"}}');rollback;").splitlines()[-1])
  assert report['summary']['registrations']==24 and report['summary']['people']==30,report['summary']
  print(json.dumps({'result':'passed','people':45,'athletes':36,'staff':6,'responsibles':3,'registrations':24,'statuses':status,'no_duplicate_on_rerun':True,'dry_run_rolled_back':True},ensure_ascii=False))
 except subprocess.CalledProcessError as error:
  print(error.stderr);raise
 finally:
  db.docker('rm','-f',db.NAME)

if __name__=='__main__':main()
