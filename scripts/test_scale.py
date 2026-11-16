#!/usr/bin/env python3
"""Volume somente em PostgreSQL local descartável. Nunca usa credenciais/Supabase."""
import argparse
import json
import time
import subprocess
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import test_database as db

ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--athletes',type=int,default=10000)
    parser.add_argument('--keep',action='store_true',help='Mantém o container local para diagnóstico.')
    parser.add_argument('--reuse',action='store_true',help='Reusa somente o container local registrado em /tmp/siep-scale-ids.json.')
    args=parser.parse_args()
    if not 100<=args.athletes<=20000: raise SystemExit('Use entre 100 e 20000 atletas locais.')
    saved=json.loads(Path('/tmp/siep-scale-ids.json').read_text()) if args.reuse else None
    if saved:db.NAME=saved['container']
    ids={key:str(uuid.uuid4()) for key in ['tenant','user','event','modality','category1','category2']}
    if saved:ids={k:saved[k] for k in ids}
    t,u,e,m,c1,c2=["'"+ids[key]+"'" for key in ids]
    Path('/tmp/siep-scale-ids.json').write_text(json.dumps({'container':db.NAME,**ids}))
    try:
        if not args.reuse:
            db.docker('info','--format','{{.ServerVersion}}')
            db.docker('run','--rm','-d','--name',db.NAME,'-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17')
            for _ in range(60):
                try:
                    db.docker('exec',db.NAME,'pg_isready','-h','127.0.0.1','-U','postgres');break
                except subprocess.CalledProcessError:pass
                time.sleep(.25)
            db.sql((ROOT/'supabase/local/bootstrap.sql').read_text())
            db.sql('begin;\n'+'\n'.join(p.read_text() for p in sorted((ROOT/'supabase/migrations').glob('*.sql')))+'\ncommit;')
            db.sql(f"""
    create function public.test_cpf(base text) returns text language plpgsql as $$
    declare s integer;digit integer;n integer;result text:=base;begin
     for n in 9..10 loop select sum(substr(result,i,1)::int*(n+2-i)) into s from generate_series(1,n) i;digit:=(s*10%11)%10;result:=result||digit;end loop;return result;end $$;
    create table public.test_schools as select g,gen_random_uuid() as id from generate_series(1,100) g;
    create table public.test_people as select g,gen_random_uuid() as id,gen_random_uuid() as part_id,(select id from public.test_schools where g=((n.g-1)%100)+1) as school_id from generate_series(1,{args.athletes}) n(g);
    create table public.test_regs as select p.id as person_id,p.part_id,p.school_id,c.id as category_id,gen_random_uuid() as id from public.test_people p cross join (values({c1}::uuid),({c2}::uuid)) c(id);
    insert into auth.users(id) values({u});
    insert into public.institutions(id,name,slug) values({t},'Teste local de volume','local-volume');
    insert into public.institution_memberships(institution_id,user_id,role,status) values({t},{u},'admin','approved');
    insert into public.schools(id,institution_id,name,details) select id,{t},'Escola '||g,jsonb_build_object('city','Boa Vista') from public.test_schools;
    insert into public.events(id,institution_id,name,edition,status) values({e},{t},'Jogos locais','2026','open');
    insert into public.event_modalities(id,institution_id,event_id,name,classification) values({m},{t},{e},'Atletismo','individual');
    insert into public.event_categories(id,institution_id,event_id,modality_id,name,participation) values({c1},{t},{e},{m},'Categoria 1','individual'),({c2},{t},{e},{m},'Categoria 2','individual');
    insert into public.people(id,institution_id,full_name,birth_date,cpf,gender) select id,{t},'Atleta teste '||lpad(g::text,5,'0'),'2012-01-01',public.test_cpf((100000000+g)::text),case when (g/100)%2=0 then 'Feminino' else 'Masculino' end from public.test_people;
    insert into public.school_people(institution_id,school_id,person_id,role,status) select {t},school_id,id,'athlete','approved' from public.test_people;
    insert into public.event_participations(id,institution_id,event_id,school_id,person_id,status) select part_id,{t},{e},school_id,id,'complete' from public.test_people;
    insert into public.participation_categories(institution_id,event_id,participation_id,category_id) select {t},{e},part_id,category_id from public.test_regs;
    insert into public.registrations(id,institution_id,event_id,school_id,category_id,status) select id,{t},{e},school_id,category_id,'approved' from public.test_regs;
    insert into public.registration_athletes(institution_id,event_id,school_id,registration_id,participation_id,person_id,slot_number) select {t},{e},school_id,id,part_id,person_id,1 from public.test_regs;
    analyze;
    """)
        auth=f"begin;set local statement_timeout='20s';select set_config('request.jwt.claim.sub',{u},true);set local role authenticated;"
        def query(sql):
            output=db.sql(auth+sql+';rollback;')
            return json.loads(output.splitlines()[-1])
        measured=[]
        def measure(label,sql,check):
            start=time.monotonic();result=query('select '+sql);ms=round((time.monotonic()-start)*1000,1)
            check(result);print(label+': '+str(ms)+' ms',flush=True);measured.append({'consulta':label,'ms_com_cliente_psql':ms,'bytes_resposta':len(json.dumps(result).encode())});return result
        def equal(actual,expected):
            if actual!=expected:raise AssertionError(f'{actual} != {expected}')
        measure('painel sem cadastros',f"public.siep_portal_page({t},'dashboard')",lambda r:equal(len(r['tables']['people']),0))
        measure('cadastros: página de 25',f"public.siep_portal_page({t},'people',null,'athlete')",lambda r:(equal(r['total'],args.athletes),equal(len(r['tables']['people']),25)))
        measure('inscrições: página de 25',f"public.siep_portal_page({t},'registrations')",lambda r:(equal(r['total'],args.athletes*2),equal(len(r['tables']['registrations']),25)))
        options=json.dumps({'type':'participants','eventId':ids['event']})
        measure('relatório: 20 mil linhas, retorno 25',f"public.siep_report_page({t},'{options}')",lambda r:(equal(r['total'],args.athletes*2),equal(r['summary']['people'],args.athletes),equal(len(r['rows']),25)))
        measure('resumo por sexo',f"public.siep_report_page({t},'{options}','gender')",lambda r:equal(r['total'],2))
        measure('resumo por escola',f"public.siep_report_page({t},'{options}','school')",lambda r:equal(r['total'],100))
        school=db.sql('select id from public.test_schools order by g limit 1')
        filtered=json.dumps({'type':'participants','eventId':ids['event'],'schoolId':school,'gender':'Feminino','categoryId':ids['category1']})
        measure('escola + sexo + categoria',f"public.siep_report_page({t},'{filtered}')",lambda r:equal(r['total'],args.athletes//200))
        measure('crachás: página de 25',f"public.siep_badge_page({e})",lambda r:(equal(r['total'],args.athletes),equal(len(r['rows']),25)))
        start=time.monotonic()
        with ThreadPoolExecutor(max_workers=4) as pool:
            results=list(pool.map(lambda _:query(f"select public.siep_report_page({t},'{filtered}')"),range(4)))
        if not all(r['total']==args.athletes//200 for r in results):raise AssertionError('Concorrência de leitura inconsistente')
        output={'ambiente':'PostgreSQL 17 local descartável; não representa o hardware/plano Supabase','atletas':args.athletes,'inscricoes':args.athletes*2,'consultas':measured,'quatro_leituras_simultaneas_ms':round((time.monotonic()-start)*1000,1)}
        Path('/tmp/siep-scale-result.json').write_text(json.dumps(output,ensure_ascii=False,indent=2))
        print(json.dumps(output,ensure_ascii=False,indent=2))
    except subprocess.CalledProcessError as error:
        print(error.stderr);raise
    finally:
        if args.keep:print('Container local para diagnóstico: '+db.NAME,flush=True)
        else:
            try:db.docker('rm','-f',db.NAME)
            except Exception:pass

if __name__=='__main__':main()
