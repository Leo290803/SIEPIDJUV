#!/usr/bin/env python3
"""Migrações via Management API. Nunca imprime credenciais. Padrão: valida e desfaz."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]

def request(path, payload=None):
    token = os.environ.get('SUPABASE_ACCESS_TOKEN')
    if not token:
        raise SystemExit('SUPABASE_ACCESS_TOKEN indisponível; use a credencial segura do ambiente.')
    req = urllib.request.Request('https://api.supabase.com/v1'+path,
        data=None if payload is None else json.dumps(payload).encode(),
        headers={'Authorization': 'Bearer '+token, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise SystemExit(f'API HTTP {error.code}: {error.read(2000).decode()}') from None

def literal(value):
    return "'" + value.replace("'", "''") + "'"

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project-ref', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    projects = request('/projects')
    project = next((p for p in projects if p['id'] == args.project_ref), None)
    if not project or project['status'] != 'ACTIVE_HEALTHY':
        raise SystemExit('Projeto ausente ou não saudável. Nenhuma alteração executada.')
    path = '/projects/'+args.project_ref+'/database/query'
    def query(sql, read_only=False):
        return request(path, {'query': sql, 'read_only': read_only})
    exists = query("select to_regclass('siep_migrations.applied') is not null as present", True)[0]['present']
    applied = {r['version']: r['checksum'] for r in query('select version, checksum from siep_migrations.applied', True)} if exists else {}
    statements = ["begin; set local lock_timeout = '5s'; set local statement_timeout = '30s';",
        "select pg_advisory_xact_lock(7391102026);",
        'create schema if not exists siep_migrations;',
        'revoke all on schema siep_migrations from public, anon, authenticated;',
        'create table if not exists siep_migrations.applied (version text primary key, checksum text not null, applied_at timestamptz not null default now());',
        'revoke all on siep_migrations.applied from public, anon, authenticated;']
    pending = []
    files = sorted((ROOT/'supabase/migrations').glob('*.sql'))
    known = {file.stem for file in files}
    if set(applied) - known:
        raise SystemExit('Banco contém migrações ausentes no checkout; atualize o repositório.')
    for file in files:
        content = file.read_text()
        checksum = hashlib.sha256(content.encode()).hexdigest()
        version = file.stem
        if version in applied:
            if applied[version] != checksum:
                raise SystemExit('Checksum divergente: '+version+'. Não edite migrações aplicadas.')
            continue
        pending.append(version)
        # A leitura anterior é apenas planejamento. Revalida sob a trava para
        # dois executores concorrentes nunca reaplicarem a mesma migração.
        tag = 'migration_' + checksum[:16]
        statements.append(f'''do ${tag}$
begin
 if exists(select 1 from siep_migrations.applied where version={literal(version)}) then
  if not exists(select 1 from siep_migrations.applied where version={literal(version)} and checksum={literal(checksum)}) then
   raise exception 'Checksum divergente sob trava: {version}';
  end if;
 else
  execute $sql_{tag}${content}$sql_{tag}$;
  insert into siep_migrations.applied(version,checksum) values ({literal(version)},{literal(checksum)});
 end if;
end ${tag}$;''')
    # Revalida invariantes inclusive após uma execução sem migrações pendentes.
    for test in sorted((ROOT/'supabase/tests').glob('*.sql')):
        statements.append(test.read_text())
    statements.append('commit;' if args.apply else 'rollback;')
    query('\n'.join(statements))
    print(json.dumps({'project':project['name'], 'ref':args.project_ref,
        'mode':'applied' if args.apply else 'validated_and_rolled_back',
        'migrations':pending, 'database_assertions':'passed'}, ensure_ascii=False))

if __name__ == '__main__':
    main()
