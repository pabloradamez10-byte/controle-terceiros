import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { DeviceRuntime } from '../../src/platform/native/runtime.mjs';

const oldPassword = 'Senha-ficticia-2026';
const newPassword = 'Senha-recuperada-2026';
const email = 'owner@sst.local';

test('recuperação funciona com o aplicativo bloqueado, troca a senha e preserva identidade e permissões', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sst-auth-recovery-'));
  const runtime = await DeviceRuntime.open(directory);
  t.after(async () => {
    await runtime.close();
    await rm(directory, { recursive: true, force: true });
  });

  const original = await runtime.execute({
    action: 'initializeOwner',
    body: { email, password: oldPassword }
  });
  const before = await runtime.execute({ action: 'membership' });
  assert.equal(before.role, 'admin');
  assert.equal(before.permissoes.consultar, true);
  assert.equal(before.permissoes.cadastrar, true);
  assert.equal(before.permissoes.liberar, true);

  const recovery = await runtime.execute({
    action: 'recoveryCreate',
    body: { password: oldPassword }
  });
  assert.equal(recovery.kit.publicKey, original.publicKey);
  assert.ok(recovery.code);

  await runtime.execute({ action: 'logout' });
  assert.equal((await runtime.execute({ action: 'status' })).locked, true);

  const restored = await runtime.execute({
    action: 'recoveryRestore',
    body: { kit: recovery.kit, code: recovery.code, password: newPassword }
  });
  assert.equal(restored.publicKey, original.publicKey);
  assert.equal((await runtime.execute({ action: 'status' })).locked, true, 'recuperar não deve autenticar automaticamente');

  await assert.rejects(
    runtime.execute({ action: 'login', body: { email, password: oldPassword } }),
    /inválidos|AUTH_CREDENTIALS/
  );
  const relogin = await runtime.execute({ action: 'login', body: { email, password: newPassword } });
  assert.equal(relogin.publicKey, original.publicKey);

  const after = await runtime.execute({ action: 'membership' });
  assert.deepEqual(after.permissoes, before.permissoes);
  assert.equal(after.role, before.role);
  assert.equal(after.user.id, before.user.id);

  await runtime.execute({ action: 'logout' });
  const secondLogin = await runtime.execute({ action: 'login', body: { email, password: newPassword } });
  assert.equal(secondLogin.publicKey, original.publicKey, 'a senha nova deve continuar válida após sair e entrar novamente');
});

test('tela de login mantém a recuperação conectada ao fluxo real', async () => {
  const source = await readFile(path.resolve('src/backend/p2p-ui/bootstrap.js'), 'utf8');
  assert.match(source, /tss-auth-recover'[\s\S]*showRecoveryRestore\(\)/);
  assert.doesNotMatch(source, /recuperação de identidade P2P ainda não está disponível/i);
});
