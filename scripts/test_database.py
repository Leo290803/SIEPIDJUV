#!/usr/bin/env python3
"""PostgreSQL 17 descartável: migrações, RLS, fluxos e concorrência real."""
import json
import os
from pathlib import Path
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
DOCKER = ['docker', '--host=unix:///var/run/docker.sock']
ENV = {k:v for k,v in os.environ.items() if k not in ('DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH')}
NAME = 'siep-db-test-'+uuid.uuid4().hex[:10]

def docker(*args, **kwargs):
    return subprocess.run(DOCKER+list(args), env=ENV, check=True, text=True, capture_output=True, **kwargs)

def sql(command):
    return docker('exec','-i',NAME,'psql','-X','-qAt','-U','postgres','-v','ON_ERROR_STOP=1', input=command).stdout.strip()

def concurrent_sql(command):
    process = subprocess.Popen(DOCKER+['exec','-i',NAME,'psql','-X','-qAt','-U','postgres','-v','ON_ERROR_STOP=1'],env=ENV,text=True,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    process.stdin.write(command)
    process.stdin.close()
    process.stdin = None
    return process

def main():
    try:
        docker('info','--format','{{.ServerVersion}}')
        docker('run','--rm','-d','--name',NAME,'-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17')
        for attempt in range(60):
            ready = subprocess.run(DOCKER+['exec',NAME,'pg_isready','-h','127.0.0.1','-U','postgres'],env=ENV,capture_output=True)
            if ready.returncode == 0:
                break
            time.sleep(.25)
        else:
            raise RuntimeError('PostgreSQL não iniciou')
        sql((ROOT/'supabase/local/bootstrap.sql').read_text())
        migrations = sorted((ROOT/'supabase/migrations').glob('*.sql'))
        sql('begin;\n'+'\n'.join(p.read_text() for p in migrations)+'\ncommit;')
        for test in sorted((ROOT/'supabase/tests').glob('*.sql')):
            sql('begin;\n'+test.read_text()+'\nrollback;')
            print(test.name+': passou', flush=True)

        # Fixtures persistem apenas no container descartável, nunca no Supabase.
        ids = {k:str(uuid.uuid4()) for k in ['tenant','user','school','event','modality','category','proof','person1','person2','part1','part2']}
        def v(key): return "'"+ids[key]+"'"
        sql(f"""
insert into auth.users(id) values({v('user')});
insert into public.institutions(id,name,slug) values({v('tenant')},'Concorrência','concurrency-test');
insert into public.institution_memberships(institution_id,user_id,role,status) values({v('tenant')},{v('user')},'admin','approved');
insert into public.schools(id,institution_id,name) values({v('school')},{v('tenant')},'Escola');
insert into public.people(id,institution_id,full_name,birth_date,cpf,gender) values({v('person1')},{v('tenant')},'Atleta 1','2012-01-01','52998224725','Feminino'),({v('person2')},{v('tenant')},'Atleta 2','2012-01-01','11144477735','Feminino');
insert into public.school_people(institution_id,school_id,person_id,role,status) values({v('tenant')},{v('school')},{v('person1')},'athlete','approved'),({v('tenant')},{v('school')},{v('person2')},'athlete','approved');
insert into public.events(id,institution_id,name,status) values({v('event')},{v('tenant')},'Evento','open');
insert into public.event_modalities(id,institution_id,event_id,name,classification) values({v('modality')},{v('tenant')},{v('event')},'Atletismo','individual');
insert into public.event_categories(id,institution_id,event_id,modality_id,name,participation) values({v('category')},{v('tenant')},{v('event')},{v('modality')},'Categoria','individual');
insert into public.event_proofs(id,institution_id,event_id,category_id,name,kind,slots_per_school) values({v('proof')},{v('tenant')},{v('event')},{v('category')},'100 m','individual',1);
insert into public.event_participations(id,institution_id,event_id,school_id,person_id,status) values({v('part1')},{v('tenant')},{v('event')},{v('school')},{v('person1')},'complete'),({v('part2')},{v('tenant')},{v('event')},{v('school')},{v('person2')},'complete');
insert into public.participation_categories(institution_id,event_id,participation_id,category_id) values({v('tenant')},{v('event')},{v('part1')},{v('category')}),({v('tenant')},{v('event')},{v('part2')},{v('category')});
""")
        def save(part):
            athletes = json.dumps([{'participation_id':ids[part],'slot_number':1}])
            return f"select public.siep_save_registration({v('event')},{v('school')},{v('category')},{v('proof')},'{athletes}','[]');"
        auth = f"select set_config('request.jwt.claim.sub',{v('user')},true); set local role authenticated;"
        # A segura a trava do evento; B disputa a mesma vaga em outra conexão.
        first = concurrent_sql('begin; '+auth+save('part1')+" select pg_sleep(1.5); commit;")
        # Aguarda a trava efetiva, sem depender apenas de temporização.
        for _ in range(100):
            if sql("select exists(select 1 from pg_stat_activity where query like '%select pg_sleep(1.5)%' and wait_event='PgSleep');") == 't':
                break
            time.sleep(.02)
        else:
            raise RuntimeError('Primeira transação não obteve a trava esperada')
        second = concurrent_sql('begin; '+auth+save('part2')+' commit;')
        out1, err1 = first.communicate(timeout=20)
        out2, err2 = second.communicate(timeout=20)
        if first.returncode or second.returncode == 0 or 'proof_school_slot_unique' not in err2:
            raise RuntimeError('Disputa de vaga não teve exatamente um vencedor: '+err1+err2)
        if sql(f"select count(*) from public.registration_athletes where event_id={v('event')} and active;") != '1':
            raise RuntimeError('Mais de uma vaga ocupada')
        print('concorrência: uma vaga, duas conexões, um vencedor; passou', flush=True)
        registration = sql(f"select id from public.registrations where event_id={v('event')} and status='draft';")
        def edit():
            athletes = json.dumps([{'participation_id':ids['part1'],'slot_number':1}])
            return f"select public.siep_save_registration({v('event')},{v('school')},{v('category')},{v('proof')},'{athletes}','[]','{registration}',1);"
        first = concurrent_sql('begin; '+auth+edit()+" select pg_sleep(1.5); commit;")
        for _ in range(100):
            if sql("select exists(select 1 from pg_stat_activity where query like '%select pg_sleep(1.5)%' and wait_event='PgSleep');") == 't':
                break
            time.sleep(.02)
        else:
            raise RuntimeError('Edição concorrente não obteve trava')
        second = concurrent_sql('begin; '+auth+edit()+' commit;')
        _, err1 = first.communicate(timeout=20)
        _, err2 = second.communicate(timeout=20)
        if first.returncode or second.returncode == 0 or 'Inscrição alterada' not in err2:
            raise RuntimeError('Edição concorrente perdeu atualização: '+err1+err2)
        if sql(f"select revision from public.registrations where id='{registration}';") != '2':
            raise RuntimeError('Revisão concorrente incorreta')
        print('concorrência: duas edições, revisão antiga rejeitada; passou', flush=True)
        # Cancela e reutiliza a prova: mesma pessoa disputa posições distintas.
        sql('begin; '+auth+f"select public.siep_transition_registration('{registration}',2,'cancelled','Teste'); commit;")
        sql(f"update public.event_proofs set slots_per_school=2 where id={v('proof')};")
        first = concurrent_sql('begin; '+auth+save('part1')+" select pg_sleep(1.5); commit;")
        for _ in range(100):
            if sql("select exists(select 1 from pg_stat_activity where query like '%select pg_sleep(1.5)%' and wait_event='PgSleep');") == 't':
                break
            time.sleep(.02)
        else:
            raise RuntimeError('Reserva de pessoa não obteve trava')
        athletes = json.dumps([{'participation_id':ids['part1'],'slot_number':2}])
        second = concurrent_sql('begin; '+auth+f"select public.siep_save_registration({v('event')},{v('school')},{v('category')},{v('proof')},'{athletes}','[]'); commit;")
        _, err1 = first.communicate(timeout=20)
        _, err2 = second.communicate(timeout=20)
        if first.returncode or second.returncode == 0 or 'proof_person_unique' not in err2:
            raise RuntimeError('Pessoa ocupou duas vagas: '+err1+err2)
        print('concorrência: mesma pessoa em vagas diferentes bloqueada; passou', flush=True)
        print('PostgreSQL local: todos os testes passaram', flush=True)
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.stderr or error.stdout) from None
    finally:
        subprocess.run(DOCKER+['rm','-f',NAME],env=ENV,capture_output=True)

if __name__ == '__main__':
    main()
