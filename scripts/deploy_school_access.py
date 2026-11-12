#!/usr/bin/env python3
"""Publica os dois endpoints de acesso escolar, sem criar usuários/enviar e-mails."""
import argparse,json,os,uuid,urllib.request,urllib.error
from pathlib import Path
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--project-ref',required=True)
parser.add_argument('--function',choices=['provision-school-access','cpf-login'])
args=parser.parse_args()
token=os.environ['SUPABASE_ACCESS_TOKEN']
root=Path(__file__).resolve().parents[1]
for slug in ([args.function] if args.function else ['provision-school-access','cpf-login']):
 boundary='siep-'+uuid.uuid4().hex
 metadata=json.dumps({'entrypoint_path':'index.ts','verify_jwt':False,'name':slug})
 content=(root/'supabase/functions'/slug/'index.ts').read_bytes()
 data=(f'--{boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n{metadata}\r\n--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="index.ts"\r\nContent-Type: application/typescript\r\n\r\n'.encode()+content+f'\r\n--{boundary}--\r\n'.encode())
 req=urllib.request.Request('https://api.supabase.com/v1/projects/'+args.project_ref+'/functions/deploy?slug='+slug,data=data,headers={'Authorization':'Bearer '+token,'Content-Type':'multipart/form-data; boundary='+boundary})
 try:
  with urllib.request.urlopen(req,timeout=60) as response: result=json.load(response)
 except urllib.error.HTTPError as error:raise SystemExit(f'Deploy HTTP {error.code}: {error.read(1500).decode()}') from None
 print(json.dumps({k:result.get(k) for k in ['slug','status','version']},ensure_ascii=False))
