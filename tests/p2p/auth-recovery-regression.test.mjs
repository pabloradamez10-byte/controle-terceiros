import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { DeviceRuntime } from '../../src/platform/native/runtime.mjs';

const oldCredential = 'homologacao-acesso-antigo-2026';
const newCredential = 'homologacao-acesso-novo-2026';
const email = 'owner@sst.local';

test('recuperação funciona com o aplicativo bloqueado, troca a credencial e preserva identidade e permissões', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sst-auth-recovery-'));
  const runtime = await DeviceRuntime.open(directory);
  t.after(async () => {
    await runtime.close();
    await rm(directory, { recursive: true, force: true });
  });

  await runtime.execute({ action: 'initializeOwner', body: { email, password: oldCredential } });
  const before = await runtime.execute({ action: 'membership' });
  const originalPublicKey = before.user.id;
  assert.ok(originalPublicKey);
  assert.equal(before.role, 'admin');
  assert.equal(before.permissoes.consultar, true);
  assert.equal(before.permissoes.cadastrar, true);
  assert.equal(before.permissoes.liberar, true);

  const recovery = await runtime.execute({ action: 'recoveryCreate', body: { password: oldCredential } });
  assert.equal(recovery.kit.publicKey, originalPublicKey);
  assert.ok(recovery.code);

  await runtime.execute({ action: 'logout' });
  assert.equal((await runtime.execute({ action: 'status' })).locked, true);

  const restored = await runtime.execute({
    action: 'recoveryRestore',
    body: { kit: recovery.kit, code: recovery.code, password: newCredential }
  });
  assert.equal(restored.publicKey, originalPublicKey);
  assert.equal((await runtime.execute({ action: 'status' })).locked, true, 'recuperar não deve autenticar automaticamente');

  await assert.rejects(
    runtime.execute({ action: 'login', body: { email, password: oldCredential } }),
    /inválidos|AUTH_CREDENTIALS/
  );
  const relogin = await runtime.execute({ action: 'login', body: { email, password: newCredential } });
  assert.equal(relogin.publicKey, originalPublicKey);

  const after = await runtime.execute({ action: 'membership' });
  assert.deepEqual(after.permissoes, before.permissoes);
  assert.equal(after.role, before.role);
  assert.equal(after.user.id, before.user.id);

  await runtime.execute({ action: 'logout' });
  const secondLogin = await runtime.execute({ action: 'login', body: { email, password: newCredential } });
  assert.equal(secondLogin.publicKey, originalPublicKey, 'a credencial nova deve continuar válida após sair e entrar novamente');
});

test('tela de login mantém a recuperação conectada ao fluxo real', async () => {
  const source = await readFile(path.resolve('src/backend/p2p-ui/bootstrap.js'), 'utf8');
  assert.match(source, /tss-auth-recover'[\s\S]*showRecoveryRestore\(\)/);
  assert.doesNotMatch(source, /recuperação de identidade P2P ainda não está disponível/i);
});
