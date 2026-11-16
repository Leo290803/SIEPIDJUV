#!/usr/bin/env python3
"""Adiciona somente atletas fictícios a uma escola existente. Padrão: rollback."""
import argparse,json,uuid
from supabase_migrate import request,literal
from seed_development import synthetic_cpf

SEED='siep-school-athletes-v1'
def build_sql(school_id,apply=False):
 school_id=str(uuid.UUID(school_id))
 people=[]
 for gender,names in [('Feminino',['Alice','Helena','Laura','Valentina','Sophia','Isabela']),('Masculino',['Miguel','Arthur','Lucas','Davi','Pedro','Gabriel'])]:
  for index,name in enumerate(names):
   number=len(people)
   people.append({'id':str(uuid.uuid5(uuid.NAMESPACE_URL,SEED+'/'+school_id+'/'+str(number))),'name':'Atleta Teste — '+name+' Monteiro','gender':gender,'age':12+index,'month':index+1,'cpf':synthetic_cpf(980000101+number)})
 payload=literal(json.dumps(people,ensure_ascii=False))
 return f"""begin;
set local lock_timeout='5s';set local statement_timeout='15s';
do $athletes$
declare school public.schools;actor uuid;item jsonb;result jsonb;person uuid;before_reg bigint;before_auth bigint;before_links bigint;before_parts bigint;
begin
 select * into school from public.schools where id='{school_id}' and not archived;
 if not found then raise exception 'Escola ativa não encontrada';end if;
 select user_id into actor from public.institution_memberships where institution_id=school.institution_id and role='admin' and status='approved' order by created_at,id limit 1;
 if actor is null then raise exception 'Administrador aprovado não encontrado';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform pg_advisory_xact_lock(hashtext('{SEED}'),hashtext(school.id::text));
 select count(*) into before_reg from public.registrations where school_id=school.id;
 select count(*) into before_auth from auth.users;
 select count(*) into before_links from public.school_people where school_id=school.id and role<>'athlete';
 select count(*) into before_parts from public.event_participations where school_id=school.id;
 for item in select value from jsonb_array_elements({payload}::jsonb) loop
  person:=(item->>'id')::uuid;
  if exists(select 1 from public.people where id=person) then
   if not exists(select 1 from public.people p join public.school_people sp on sp.person_id=p.id where p.id=person and p.institution_id=school.institution_id and p.contact->>'development_seed'='{SEED}' and sp.school_id=school.id and sp.role='athlete') then raise exception 'Identificador ocupado fora deste conjunto';end if;
   continue;
  end if;
  result:=public.siep_save_connected_person(school.institution_id,school.id,'athlete',jsonb_build_object('full_name',item->>'name','cpf',item->>'cpf','gender',item->>'gender','birth_date',make_date(extract(year from current_date)::int-(item->>'age')::int,(item->>'month')::int,10),'contact',jsonb_build_object('development_seed','{SEED}')),p_create_id=>person);
  if result->>'person_id'<>item->>'id' then raise exception 'CPF sintético já utilizado';end if;
 end loop;
 if (select count(*) from public.registrations where school_id=school.id)<>before_reg or (select count(*) from auth.users)<>before_auth or (select count(*) from public.school_people where school_id=school.id and role<>'athlete')<>before_links or (select count(*) from public.event_participations where school_id=school.id)<>before_parts then raise exception 'A operação deve criar somente atletas';end if;
end $athletes$;
select jsonb_build_object('mode',{literal('applied' if apply else 'validated_and_rolled_back')},'school',s.name,'test_athletes',(select count(*) from public.school_people sp join public.people p on p.id=sp.person_id where sp.school_id=s.id and sp.role='athlete' and p.contact->>'development_seed'='{SEED}')) as result from public.schools s where s.id='{school_id}';
{'commit' if apply else 'rollback'};
"""

def main():
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('--project-ref',required=True)
 parser.add_argument('--school-id',required=True)
 parser.add_argument('--apply',action='store_true')
 args=parser.parse_args()
 result=request('/projects/'+args.project_ref+'/database/query',{'query':build_sql(args.school_id,args.apply),'read_only':False})
 print(json.dumps(result,ensure_ascii=False))
if __name__=='__main__':main()
