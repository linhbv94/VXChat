#!/usr/bin/env python3
"""VXChat own stable self-signed identity; isolated temporary signing keychain.
No trust/TCC changes. Own temporary search-list entry is removed in finally.
No private material enters the repo.
"""
import argparse,hashlib,json,os,secrets,shlex,shutil,signal,subprocess,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
def interrupted(_signal,_frame):raise KeyboardInterrupt('Signing session interrupted')
signal.signal(signal.SIGTERM,interrupted)
signal.signal(signal.SIGHUP,interrupted)
parser=argparse.ArgumentParser();parser.add_argument('--prepare-only',action='store_true');parser.add_argument('--evidence',type=Path);parser.add_argument('command',nargs=argparse.REMAINDER);args=parser.parse_args()
secret_dir=Path.home()/'.config/vxchat/signing'
manifest=ROOT/'packaging/signing_identity.json'
os.umask(0o077)
def run(command,**kwargs):
 result=subprocess.run(command,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=45,**kwargs)
 if result.returncode: raise RuntimeError(command[0]+' '+command[1]+' failed: '+result.stderr.decode(errors='replace')[:1500])
 return result.stdout
secret_dir.mkdir(parents=True,exist_ok=True,mode=0o700)
if secret_dir.is_symlink():raise RuntimeError('Signing directory must not be a symlink')
key=secret_dir/'vxchat_private_key.pem';cert=secret_dir/'vxchat_certificate.pem'
if key.exists()!=cert.exists():raise RuntimeError('Incomplete existing identity; never rotate automatically')
incoming=os.environ.get('VXCHAT_SIGNING_KEY_PEM')
if not key.exists() and incoming:
 work=Path(tempfile.mkdtemp(prefix='import_',dir=secret_dir))
 try:
  (work/'key.pem').write_text(incoming)
  public_cert=ROOT/'packaging/vxchat_signing_certificate.pem'
  if run(['openssl','pkey','-in',str(work/'key.pem'),'-pubout'])!=run(['openssl','x509','-in',str(public_cert),'-pubkey','-noout']):raise RuntimeError('Imported key does not match the pinned certificate')
  os.rename(work/'key.pem',key);cert.write_bytes(public_cert.read_bytes())
 finally:shutil.rmtree(work)
if not key.exists():
 if manifest.exists():raise RuntimeError('Pinned VXChat private key is missing; restore it, do not generate a replacement')
 work=Path(tempfile.mkdtemp(prefix='identity_',dir=secret_dir))
 try:
  run(['openssl','genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:3072','-out',str(work/'key.pem')])
  run(['openssl','req','-new','-x509','-key',str(work/'key.pem'),'-sha256','-days','3650','-subj','/CN=VXChat Code Signing/O=VXChat','-addext','basicConstraints=critical,CA:FALSE','-addext','keyUsage=critical,digitalSignature','-addext','extendedKeyUsage=codeSigning','-out',str(work/'cert.pem')])
  os.rename(work/'key.pem',key);os.rename(work/'cert.pem',cert)
 finally:shutil.rmtree(work)
for file in [key,cert]:
 if not file.is_file() or file.is_symlink():raise RuntimeError('Invalid signing identity file')
 os.chmod(file,0o600)
public_key=run(['openssl','pkey','-in',str(key),'-pubout'])
if public_key!=run(['openssl','x509','-in',str(cert),'-pubkey','-noout']):raise RuntimeError('Certificate/private key mismatch')
der=run(['openssl','x509','-in',str(cert),'-outform','DER']);fingerprint=hashlib.sha1(der).hexdigest().upper()
public={'schema_version':1,'mode':'self_signed','common_name':'VXChat Code Signing','app_id':'com.vxutilities.vxmesschat','certificate_sha1':fingerprint,'certificate_sha256':hashlib.sha256(der).hexdigest(),'notarized':False,'user_authorized_at':'2026-11-06'}
if manifest.exists() and json.loads(manifest.read_text())['certificate_sha1']!=fingerprint:raise RuntimeError('Pinned identity differs; explicit migration required')
manifest.write_text(json.dumps(public,indent=2)+'\n');os.chmod(manifest,0o644)
public_cert=ROOT/'packaging/vxchat_signing_certificate.pem';public_cert.write_bytes(cert.read_bytes());os.chmod(public_cert,0o644)
print(json.dumps({'identity':'VXChat Code Signing','certificate_sha1':fingerprint,'private_key_outside_repo':True,'rotated':False}),flush=True)
if args.prepare_only:raise SystemExit(0)
command=args.command[1:] if args.command[:1]==['--'] else args.command
if not command:raise RuntimeError('Missing build command')
work=Path(tempfile.mkdtemp(prefix='vxchat_sign_',dir='/private/tmp'));chain=work/'signing.keychain-db';password=secrets.token_urlsafe(32);created=False;result={}
try:
 before=shlex.split(run(['security','list-keychains','-d','user']).decode())
 env={**os.environ,'VXCHAT_TEMP_P12_PASS':password}
 run(['openssl','pkcs12','-export','-legacy','-inkey',str(key),'-in',str(cert),'-out',str(work/'identity.p12'),'-passout','env:VXCHAT_TEMP_P12_PASS'],env=env)
 run(['security','create-keychain','-p',password,str(chain)]);created=True
 run(['security','set-keychain-settings','-lut','1200',str(chain)])
 run(['security','unlock-keychain','-p',password,str(chain)])
 run(['security','import',str(work/'identity.p12'),'-k',str(chain),'-P',password,'-T','/usr/bin/codesign'])
 run(['security','set-key-partition-list','-S','apple-tool:,apple:,codesign:','-s','-k',password,str(chain)])
 run(['security','list-keychains','-d','user','-s',str(chain)])
 result['identities']=run(['security','find-identity','-p','codesigning',str(chain)]).decode()
 (work/'identity.p12').unlink()
 probe=work/'probe';probe.write_bytes(Path('/usr/bin/true').read_bytes());os.chmod(probe,0o700)
 run(['codesign','--force','--keychain',str(chain),'--sign',fingerprint,'--timestamp=none',str(probe)])
 run(['codesign','--verify','--strict','-R','=certificate leaf = H"'+fingerprint+'"',str(probe)])
 result['probe_signed_and_pinned']=True
 child_env={k:v for k,v in os.environ.items() if k!='VXCHAT_SIGNING_KEY_PEM'};child_env['VXCHAT_SIGNING_KEYCHAIN']=str(chain)
 with subprocess.Popen(command,env=child_env,start_new_session=True) as child:
  try:code=child.wait(timeout=1200)
  except BaseException:
   os.killpg(child.pid,signal.SIGTERM)
   try:child.wait(timeout=10)
   except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);child.wait()
   raise RuntimeError('Build interrupted or timed out') from None
 result['command_exit']=code
 if code:raise RuntimeError('Build/sign command failed')
except Exception as error:
 result['error']=str(error);print(str(error),flush=True)
finally:
 if created:
  try:
   current=shlex.split(run(['security','list-keychains','-d','user']).decode())
   if current==[str(chain)]:run(['security','list-keychains','-d','user','-s',*before])
   else:run(['security','list-keychains','-d','user','-s',*dict.fromkeys(before+[x for x in current if x!=str(chain)])])
   result['own_search_entry_removed']=True
  except Exception as error:result['search_cleanup_error']=str(error)
  try:run(['security','delete-keychain',str(chain)]);result['temporary_keychain_deleted']=True
  except Exception as error:result['cleanup_error']=str(error)
 after=shlex.split(run(['security','list-keychains','-d','user']).decode());result['search_list_restored']=before==after
 shutil.rmtree(work);result['temporary_search_list_entry_used']=True;result['trust_or_tcc_modified']=False
 if args.evidence:args.evidence.write_text(json.dumps(result,indent=2)+'\n')
if 'error' in result or result.get('cleanup_error') or result.get('search_cleanup_error') or not result.get('search_list_restored'):raise SystemExit(1)
