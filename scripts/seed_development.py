#!/usr/bin/env python3
"""Exemplos pequenos para desenvolvimento. Padrão valida e desfaz; --apply persiste."""
import argparse
import json
import uuid
from pathlib import Path
from supabase_migrate import request, literal

SEED='siep-development-examples-v1'
EVENT_NAME='Exemplo — Jogos Escolares de Desenvolvimento'

def synthetic_cpf(number):
    result=str(number).zfill(9)
    for length in (9,10):
        digit=(sum(int(result[i])*(length+1-i) for i in range(length))*10%11)%10
        result+=str(digit)
    return result

def manifest(slug='idjuv'):
    def identity(key):return str(uuid.uuid5(uuid.NAMESPACE_URL,SEED+'/'+slug+'/'+key))
    schools=[];people=[];registrations=[]
    sports=[{'key':'futsal','name':'Futsal','classification':'collective','participation':'team','years':(12,14)},
            {'key':'athletics','name':'Atletismo','classification':'individual','participation':'individual','years':(12,14)},
            {'key':'badminton','name':'Badminton','classification':'individual','participation':'individual','years':(15,17)}]
    categories=[]
    for sport in sports:
        sport['id']=identity('sport/'+sport['key'])
        for sex,gender in [('M','Masculino'),('F','Feminino')]:
            category={**sport,'id':identity('category/'+sport['key']+'/'+sex),'modality_id':sport['id'],'sex':sex,'gender':gender}
            category['proofs']=[{'id':identity('proof/'+sex+'/'+key),'name':name} for key,name in [('100m','100 metros'),('long-jump','Salto em distância')]] if sport['key']=='athletics' else []
            categories.append(category)
    male=['Miguel','Arthur','Lucas','Davi','Pedro','Gabriel'];female=['Alice','Helena','Laura','Valentina','Sophia','Isabela']
    for school_number,(name,city) in enumerate([('Escola Horizonte','Boa Vista'),('Escola Estrela do Norte','Pacaraima'),('Escola Caminho do Sol','Rorainópolis')],1):
        school={'id':identity(f'school/{school_number}'),'name':'Exemplo — '+name,'city':city};schools.append(school)
        athletes=[]
        for sex,gender,names in [('M','Masculino',male),('F','Feminino',female)]:
            for index in range(6):
                person={'id':identity(f'athlete/{school_number}/{sex}/{index}'),'school_id':school['id'],'role':'athlete','name':f'Exemplo — {names[index]} {name.removeprefix("Escola ")} {index+1}',
                    'gender':gender,'age':14 if index<4 else 16,'month':index+1,'day':school_number+5,'cpf':synthetic_cpf(970000001+len(people)),'position':'','sex':sex,'index':index}
                person['categories']=[c['id'] for c in categories if c['sex']==sex and ((index<4 and c['key'] in ('futsal','athletics')) or (index>=4 and c['key']=='badminton'))]
                people.append(person);athletes.append(person)
        staff=[]
        for index,(name,gender,position) in enumerate([('Alex','Masculino','Técnico'),('Marina','Feminino','Auxiliar técnico')]):
            person={'id':identity(f'staff/{school_number}/{index}'),'school_id':school['id'],'role':'staff','name':f'Exemplo — {name} Comissão {school_number}','gender':gender,'age':30+index,'month':5,'day':12,'cpf':synthetic_cpf(970000001+len(people)),'position':position}
            people.append(person);staff.append(person)
        people.append({'id':identity(f'responsible/{school_number}'),'school_id':school['id'],'role':'responsible','name':f'Exemplo — Responsável da {school["name"].removeprefix("Exemplo — ")}',
            'gender':'Feminino','age':35,'month':8,'day':20,'cpf':synthetic_cpf(970000001+len(people)),'position':'Gestor escolar'})
        for category in categories:
            candidates=[p for p in athletes if p['sex']==category['sex'] and category['id'] in p['categories']]
            choices=[(None,candidates[:4])] if category['key']=='futsal' else [(proof,[candidates[index]]) for index,proof in enumerate(category['proofs'])] if category['proofs'] else [(None,[candidates[0]])]
            for proof,roster in choices:
                index=len(registrations)
                registrations.append({'school_id':school['id'],'category_id':category['id'],'proof_id':proof['id'] if proof else None,'athletes':[p['id'] for p in roster],
                    'staff':staff[0 if category['sex']=='M' else 1]['id'],'staff_role':'Técnico' if category['sex']=='M' else 'Auxiliar técnico','status':['draft','submitted','approved','correction_requested','rejected','cancelled'][index%6]})
    return {'version':SEED,'event':{'id':identity('event'),'name':EVENT_NAME},'sports':sports,'categories':categories,'schools':schools,'people':people,'registrations':registrations,
            'staff_roles':[{'id':identity('staff-role/'+name),'name':name} for name in ['Técnico','Auxiliar técnico']]}

def build_sql(slug='idjuv',admin_email=None,apply=False):
    payload=literal(json.dumps(manifest(slug),ensure_ascii=False))
    email_filter=" and lower(u.email)="+literal(admin_email.lower()) if admin_email else ""
    return f"""begin;
set local lock_timeout='5s';set local statement_timeout='30s';
do $seed$
declare plan jsonb:={payload}::jsonb;tenant uuid;actor uuid;item jsonb;person jsonb;category jsonb;proof jsonb;entry jsonb;result jsonb;reg jsonb;athletes jsonb;staff_role uuid;birth date;event_uuid uuid:=(plan#>>'{{event,id}}')::uuid;reg_count integer;
begin
 select id into tenant from public.institutions where slug={literal(slug)};
 if tenant is null then raise exception 'Instituição ausente';end if;
 select m.user_id into actor from public.institution_memberships m join auth.users u on u.id=m.user_id where m.institution_id=tenant and m.role='admin' and m.status='approved' {email_filter} order by m.created_at,m.id limit 1;
 if actor is null then raise exception 'Administrador aprovado ausente';end if;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform pg_advisory_xact_lock(hashtext('{SEED}'),hashtext(tenant::text));
 if exists(select 1 from public.events where id=event_uuid) then
  if not exists(select 1 from public.events where id=event_uuid and institution_id=tenant and settings->>'development_seed'='{SEED}') then raise exception 'Identificador já utilizado fora deste conjunto de exemplos';end if;
  return; -- Reexecução preserva inclusive alterações feitas pelo usuário nos exemplos.
 end if;
 insert into public.events(id,institution_id,name,edition,status,registration_start,registration_end,settings) values(event_uuid,tenant,plan#>>'{{event,name}}',extract(year from current_date)::text,'open',now()-interval '7 days',now()+interval '90 days',jsonb_build_object('type','Competição esportiva','development_seed','{SEED}'));
 for item in select value from jsonb_array_elements(plan->'schools') loop
  insert into public.schools(id,institution_id,name,details) values((item->>'id')::uuid,tenant,item->>'name',jsonb_build_object('city',item->>'city','development_seed','{SEED}'));
 end loop;
 for item in select value from jsonb_array_elements(plan->'sports') loop
  insert into public.event_modalities(id,institution_id,event_id,name,classification) values((item->>'id')::uuid,tenant,event_uuid,item->>'name',item->>'classification');
 end loop;
 for category in select value from jsonb_array_elements(plan->'categories') loop
  insert into public.event_categories(id,institution_id,event_id,modality_id,name,participation,birth_year_start,birth_year_end,gender,min_athletes,max_athletes)
  values((category->>'id')::uuid,tenant,event_uuid,(category->>'modality_id')::uuid,(category#>>'{{years,0}}')||' a '||(category#>>'{{years,1}}')||' anos · '||(category->>'gender'),category->>'participation',extract(year from current_date)::int-(category#>>'{{years,1}}')::int,extract(year from current_date)::int-(category#>>'{{years,0}}')::int,category->>'gender',case when category->>'key'='futsal' then 3 else 1 end,case when category->>'key'='futsal' then 5 else 1 end);
  for proof in select value from jsonb_array_elements(category->'proofs') loop
   insert into public.event_proofs(id,institution_id,event_id,category_id,name,kind,slots_per_school,min_athletes,gender) values((proof->>'id')::uuid,tenant,event_uuid,(category->>'id')::uuid,proof->>'name','individual',2,1,category->>'gender');
  end loop;
 end loop;
 for item in select value from jsonb_array_elements(plan->'staff_roles') loop
  insert into public.event_staff_roles(id,institution_id,event_id,name) values((item->>'id')::uuid,tenant,event_uuid,item->>'name');
 end loop;
 insert into public.event_rules(institution_id,event_id,kind,parameters) values(tenant,event_uuid,'modalities','{{"total":2,"individual":1,"collective":1}}');
 for person in select value from jsonb_array_elements(plan->'people') loop
  birth:=make_date(extract(year from current_date)::int-(person->>'age')::int,(person->>'month')::int,(person->>'day')::int);
  result:=public.siep_save_connected_person(tenant,(person->>'school_id')::uuid,person->>'role',jsonb_build_object('full_name',person->>'name','birth_date',birth,'cpf',person->>'cpf','gender',person->>'gender','position',person->>'position','contact',jsonb_build_object('development_seed','{SEED}')),p_create_id=>(person->>'id')::uuid);
  if result->>'person_id'<>person->>'id' then raise exception 'CPF sintético já utilizado; nenhum dado foi alterado';end if;
  if person->>'role'='athlete' then
   perform public.siep_save_participation(event_uuid,(person->>'school_id')::uuid,(person->>'id')::uuid,array(select value::uuid from jsonb_array_elements_text(person->'categories')),'{{}}',true);
  end if;
 end loop;
 for entry in select value from jsonb_array_elements(plan->'registrations') loop
  select coalesce(jsonb_agg(jsonb_build_object('participation_id',ep.id,'slot_number',p.ordinality) order by p.ordinality),'[]') into athletes from jsonb_array_elements_text(entry->'athletes') with ordinality p(id,ordinality) join public.event_participations ep on ep.event_id=event_uuid and ep.person_id=p.id::uuid;
  select id into staff_role from public.event_staff_roles where event_id=event_uuid and name=entry->>'staff_role';
  reg:=public.siep_save_registration(event_uuid,(entry->>'school_id')::uuid,(entry->>'category_id')::uuid,(entry->>'proof_id')::uuid,athletes,jsonb_build_array(jsonb_build_object('person_id',entry->>'staff','staff_role_id',staff_role)));
  if reg->'issues'<>'[]'::jsonb then raise exception 'Exemplo inválido: %',reg->'issues';end if;
  if entry->>'status' not in ('draft','cancelled') then reg:=public.siep_transition_registration((reg->>'id')::uuid,(reg->>'revision')::integer,'submitted','Exemplo de envio para análise');end if;
  if entry->>'status' in ('approved','correction_requested','rejected','cancelled') then
   reg:=public.siep_transition_registration((reg->>'id')::uuid,(reg->>'revision')::integer,entry->>'status','Exemplo de situação para explorar o sistema',case when entry->>'status'='correction_requested' then now()+interval '30 days' else null end);
  end if;
 end loop;
 for item in select value from jsonb_array_elements(plan->'schools') loop
  perform public.siep_set_active_event((item->>'id')::uuid,event_uuid);
 end loop;
 select count(*) into reg_count from public.registrations where event_id=event_uuid;
 if reg_count<>24 then raise exception 'Quantidade inesperada de inscrições';end if;
 if exists(select 1 from public.registrations r where r.event_id=event_uuid and r.status in ('submitted','approved') and siep_private.registration_issues(r.id)<>'[]') then raise exception 'Inscrição enviada/aprovada com pendências';end if;
end $seed$;
select jsonb_build_object('mode',{literal('applied' if apply else 'validated_and_rolled_back')},'event_id',{literal(manifest(slug)['event']['id'])},'event_name',{literal(EVENT_NAME)},'schools',3,'athletes',36,'staff',6,'responsibles_without_login',3,'registrations',24,'emails_sent',false) as result;
{'commit' if apply else 'rollback'};
"""

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project-ref')
    parser.add_argument('--institution-slug',default='idjuv')
    parser.add_argument('--admin-email',help='Opcional; por padrão usa o primeiro administrador aprovado da instituição.')
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--output-sql',type=Path)
    args=parser.parse_args()
    sql=build_sql(args.institution_slug,args.admin_email,args.apply)
    if args.output_sql:
        args.output_sql.write_text(sql);print('SQL de exemplos escrito para teste local.');return
    if not args.project_ref:parser.error('--project-ref é obrigatório para acessar o banco')
    projects=request('/projects')
    if not any(p['id']==args.project_ref and p['status']=='ACTIVE_HEALTHY' for p in projects):raise SystemExit('Projeto ausente ou não saudável')
    result=request('/projects/'+args.project_ref+'/database/query',{'query':sql,'read_only':False})
    print(json.dumps(result,ensure_ascii=False))

if __name__=='__main__':main()
