#!/usr/bin/env python3
"""Explicit operator action. No key is created during build, CI, or application startup."""
import getpass, os, pathlib, subprocess, sys
if len(sys.argv)!=2:
    raise SystemExit('Uso: python3 create-signing-key.py /PASTA/PRIVADA/sst-signing.p12')
target=pathlib.Path(sys.argv[1]).expanduser().resolve()
if target.exists():
    raise SystemExit('Arquivo já existe. A chave não será substituída.')
password=getpass.getpass('Senha da chave (mínimo 16 caracteres): ')
if len(password)<16 or getpass.getpass('Confirme a senha: ')!=password:
    raise SystemExit('Senha curta ou confirmação diferente.')
target.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
env=dict(os.environ,SST_SIGNING_PASSWORD=password)
subprocess.run(['keytool','-genkeypair','-storetype','PKCS12','-keystore',str(target),'-alias','sst-homologacao','-keyalg','RSA','-keysize','3072','-validity','3650','-storepass:env','SST_SIGNING_PASSWORD','-keypass:env','SST_SIGNING_PASSWORD','-dname','CN=SST Homologacao, OU=Testes, O=Atlas SST, C=BR'],env=env,check=True)
os.chmod(target,0o600)
print('Chave criada. Guarde uma cópia cifrada e a senha fora do repositório antes de gerar APKs.')
