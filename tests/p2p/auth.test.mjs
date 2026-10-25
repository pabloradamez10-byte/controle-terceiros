import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import b4a from 'b4a';
import crypto from 'hypercore-crypto';
import { IdentityVault } from '../../src/platform/native/identity-vault.mjs';
import { SstSession } from '../../src/backend/p2p/session.mjs';
import { SstDevice } from '../../src/backend/p2p/device.mjs';
import { SstRepository } from '../../src/backend/p2p/repository.mjs';
import { signOperation } from '../../src/backend/p2p/signatures.mjs';
import { PROTOCOL } from '../../src/backend/p2p/protocol.mjs';
import { spawn } from 'node:child_process';
import { openDeviceConfig } from '../../src/platform/native/device-files.mjs';

const password = 'Senha-ficticia-longa-2026';
const hex = bytes => b4a.toString(bytes, 'hex');

test('owner keeps the same identity and records after abrupt process termination; login errors do not leak secrets', {timeout:20000}, async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sst-owner-restart-'));
  t.after(() => rm(dir, {recursive:true,force:true}));
  const moduleURL = relative => new URL(relative, import.meta.url).href;
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import {openDeviceConfig} from ${JSON.stringify(moduleURL('../../src/platform/native/device-files.mjs'))};
    import {SstDevice} from ${JSON.stringify(moduleURL('../../src/backend/p2p/device.mjs'))};
    import {SstSession} from ${JSON.stringify(moduleURL('../../src/backend/p2p/session.mjs'))};
    import {IdentityVault} from ${JSON.stringify(moduleURL('../../src/platform/native/identity-vault.mjs'))};
    const dir=${JSON.stringify(dir)}, settings=await openDeviceConfig(dir);
    const device=await SstDevice.open({...settings.config,directory:settings.directory});
    const session=new SstSession(device,new IdentityVault(dir+'/identities'));
    await session.initializeOwner('Owner@sst.local',${JSON.stringify(password)});
    await device.put('empresas','retained',{razao:'Empresa fictícia preservada'});
    process.send('saved');setInterval(()=>{},1000);
  `], {stdio:['ignore','ignore','pipe','ipc']});
  t.after(() => {if(child.exitCode===null)child.kill('SIGKILL');});
  await new Promise((resolve,reject)=>{
    child.on('error',reject);
    child.on('message',()=>child.kill('SIGKILL'));
    child.on('exit',(_code,signal)=>signal==='SIGKILL'?resolve():reject(Error('Child initialization failed')));
  });
  const settings=await openDeviceConfig(dir),device=await SstDevice.open({...settings.config,directory:settings.directory});
  const vault=new IdentityVault(path.join(dir,'identities')),session=new SstSession(device,vault);
  t.after(async()=>{session.logout();await device.close();});
  const original=await readFile(vault.file('owner@sst.local'),'utf8');
  const user=await session.login('owner@sst.local',password);
  assert.equal(user.publicKey,JSON.parse(original).publicKey);assert.equal(user.role,'admin');
  assert.equal((await device.get('empresas','retained')).value.razao,'Empresa fictícia preservada');
  session.logout();
  await assert.rejects(session.login('owner@sst.local','Senha-incorreta-2026'),error=>error.code==='AUTH_CREDENTIALS'&&!error.message.includes(dir)&&!error.message.includes(password));
  await session.login('OWNER@sst.local',password);
  assert.equal(await readFile(vault.file('owner@sst.local'),'utf8'),original);
});
async function until(check) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) { if (await check()) return; await new Promise(r => setTimeout(r, 20)); }
  assert.fail('Proteção não convergiu entre os nós.');
}
function connect(a, b) {
  const left = a.replicationStream(true), right = b.replicationStream(false);
  left.on('error', () => {}); right.on('error', () => {});
  left.pipe(right).pipe(left);
  return () => { left.destroy(); right.destroy(); };
}
async function setup(directory, invitation) {
  const device = await SstDevice.open({ directory: path.join(directory, 'db'), invitation, encryptionKey: invitation ? undefined : hex(crypto.randomBytes(32)) });
  const vault = new IdentityVault(path.join(directory, 'identities'));
  const session = new SstSession(device, vault);
  const repository = new SstRepository(device, session);
  return { device, vault, session, repository };
}

test('password-encrypted identity survives restart, rejects bad passwords/tampering and cannot overwrite an account', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sst-identity-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const vault = new IdentityVault(dir);
  const registered = await vault.create('Pessoa.Teste', password);
  const file = vault.file('pessoa.teste'), original = await readFile(file, 'utf8');
  const pair = await vault.unlock('pessoa.teste', password);
  assert.equal(hex(pair.publicKey), registered.publicKey);
  assert.ok(!original.includes(password)); assert.ok(!original.includes(hex(pair.secretKey)));
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  pair.secretKey.fill(0);
  await assert.rejects(vault.unlock('pessoa.teste', 'Senha-errada-2026'), /inválidos/);
  await assert.rejects(vault.unlock('inexistente', password), /inválidos/);
  await assert.rejects(vault.create('pessoa.teste', password), { code: 'EEXIST' });
  assert.equal(await readFile(file, 'utf8'), original);
  const tampered = JSON.parse(original); tampered.ciphertext = '0'.repeat(160);
  await writeFile(file, JSON.stringify(tampered));
  await assert.rejects(vault.unlock('pessoa.teste', password), /inválidos/);
  await writeFile(file, original);
  const restored = await new IdentityVault(dir).unlock('pessoa.teste', password);
  assert.equal(hex(restored.publicKey), registered.publicKey); restored.secretKey.fill(0);
  await assert.rejects(vault.create('fraca', '123'), /Senha/);
});

test('session locks on logout/expiry and throttles repeated login failures without retaining the signing secret', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sst-session-'));
  const env = await setup(dir);
  let now = 100;
  env.session.clock = () => now; env.session.ttlMs = 1000;
  t.after(async () => { env.session.logout(); await env.device.close(); await rm(dir, { recursive: true, force: true }); });
  await assert.rejects(env.repository.execute({ command: 'list', entity: 'terceiros' }), /Entre novamente/);
  await env.repository.execute({ command: 'initializeOwner', name: 'administrador', password });
  const initialKey = env.session.identity.secretKey;
  const status = await env.repository.execute({ command: 'status' });
  assert.equal(status.locked, false);
  await env.repository.execute({ command: 'logout' });
  assert.ok(initialKey.every(byte => byte === 0));
  await assert.rejects(env.repository.execute({ command: 'put', entity: 'empresas', recordId: 'e1', value: {} }), /Entre novamente/);
  await env.repository.execute({ command: 'login', name: 'administrador', password });
  const sessionKey = env.session.identity.secretKey;
  now += 1001;
  assert.equal((await env.repository.execute({ command: 'status' })).locked, true);
  assert.ok(sessionKey.every(byte => byte === 0));
  for (let i = 0; i < 5; i++) await assert.rejects(env.session.login('administrador', 'Senha-errada-2026'), /inválidos/);
  await assert.rejects(env.session.login('administrador', password), /Aguarde/);
  now += 30001;
  await env.session.login('administrador', password);
  assert.equal((await env.session.require()).role, 'admin');
  assert.equal((await env.device.bootstrapUser('Outra pessoa')).reason, 'bootstrap-denied');
});

test('individual identity, role intersection, forgery/replay rejection, audit and user revocation propagate over real replication', { timeout: 40000 }, async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sst-users-'));
  const owner = await setup(path.join(dir, 'a'));
  await owner.session.initializeOwner('administrador', password);
  const peer = await setup(path.join(dir, 'b'), owner.device.invitation());
  const disconnect = connect(owner.device, peer.device);
  t.after(async () => {
    disconnect(); owner.session.logout(); peer.session.logout();
    await owner.device.close(); await peer.device.close(); await rm(dir, { recursive: true, force: true });
  });
  const cadastro = await peer.session.createIdentity('cadastro.teste', password);
  const portaria = await peer.session.createIdentity('portaria.teste', password);
  await owner.device.authorizeUser(cadastro.publicKey, 'cadastro', 'Pessoa Cadastro');
  await owner.device.authorizeUser(portaria.publicKey, 'portaria', 'Pessoa Portaria');
  await owner.device.grant(peer.device.writerKey, 'admin');
  await until(async () => { await peer.device.base.update(); return peer.device.base.writable && !!await peer.device.base.view.get(`user/${cadastro.publicKey}`); });
  await peer.session.login('cadastro.teste', password);
  const created = await peer.repository.execute({ command: 'put', entity: 'terceiros', recordId: 'p1', value: { nome: 'Pessoa fictícia' } });
  await until(async () => { await owner.device.base.update(); return !!await owner.device.get('terceiros', 'p1'); });
  assert.equal((await owner.device.get('terceiros', 'p1')).actor, cadastro.publicKey);
  await assert.rejects(peer.repository.execute({ command: 'delete', entity: 'terceiros', recordId: 'p1', previous: created.id }), /permissão/);
  await assert.rejects(peer.repository.execute({ command: 'authorizeUser', userKey: cadastro.publicKey, role: 'admin', name: 'Ataque' }), /administrador/);
  await assert.rejects(peer.repository.execute({ command: 'put', entity: 'excecoes', recordId: 'x1', value: {} }), /permissão/);
  await peer.session.login('portaria.teste', password);
  assert.equal((await peer.repository.execute({ command: 'get', entity: 'terceiros', recordId: 'p1' })).value.nome, 'Pessoa fictícia');
  await assert.rejects(peer.repository.execute({ command: 'put', entity: 'terceiros', recordId: 'p2', value: {} }), /permissão/);
  await assert.rejects(peer.repository.execute({ command: 'createInvitation' }), /administrador/);
  for (const command of ['download', 'export', 'downloadDocument']) await assert.rejects(peer.repository.execute({ command }), /não permitido/);

  // Valid device, no user signature: cannot inherit device-admin authority.
  const unsigned = { protocol: PROTOCOL, id: 'unsigned', group: owner.device.baseKey, kind: 'put', entity: 'terceiros', recordId: 'attack', previous: null, value: {} };
  await peer.device.base.append(unsigned);
  const forged = signOperation({ ...unsigned, id: 'forged' }, peer.session.identity, peer.device.baseKey, peer.device.writerKey);
  forged.actor = (await owner.device.user()).publicKey;
  await peer.device.base.append(forged);
  const replay = signOperation({ ...unsigned, id: 'cross-group' }, peer.session.identity, hex(crypto.randomBytes(32)), peer.device.writerKey);
  await peer.device.base.append(replay);
  const copiedFromAnotherDevice = signOperation({ ...unsigned, id: 'cross-device' }, owner.session.identity, owner.device.baseKey, owner.device.writerKey);
  await peer.device.base.append(copiedFromAnotherDevice);
  const stranger = crypto.keyPair();
  const unapproved = signOperation({ ...unsigned, id: 'unapproved' }, stranger, peer.device.baseKey, peer.device.writerKey);
  stranger.secretKey.fill(0);
  await peer.device.base.append(unapproved);
  await until(async () => {
    await owner.device.base.update();
    return (await owner.device.receipt('unapproved', peer.device.writerKey)).reason === 'user-not-authorized';
  });
  for (const id of ['unsigned', 'forged', 'cross-group', 'cross-device']) assert.equal((await owner.device.receipt(id, peer.device.writerKey)).reason, 'signature-invalid');
  assert.equal(await owner.device.get('terceiros', 'attack'), null);
  const audit = await owner.device.audit();
  assert.ok(audit.some(event => event.operationId === created.id && event.actor === cadastro.publicKey && event.writer === peer.device.writerKey && event.accepted));
  assert.ok(audit.some(event => event.operationId === 'forged' && !event.accepted));
  assert.equal(audit.find(event => event.operationId === 'forged').actor, null);
  assert.equal(audit.find(event => event.operationId === 'forged').signatureVerified, false);
  assert.ok(!JSON.stringify(audit).includes(password));

  await peer.session.login('cadastro.teste', password);
  const oldSessionSecret = peer.session.identity.secretKey;
  // Build while authorized, submit only after revocation is replicated.
  const late = signOperation({ ...unsigned, id: 'late-revoked-user' }, peer.session.identity, peer.device.baseKey, peer.device.writerKey);
  await owner.device.authorizeUser(cadastro.publicKey, null, 'Pessoa Cadastro');
  await until(async () => { await peer.device.base.update(); return (await peer.device.base.view.get(`user/${cadastro.publicKey}`))?.value?.role === null; });
  await assert.rejects(peer.repository.execute({ command: 'list', entity: 'terceiros' }), /revogado/);
  assert.ok(oldSessionSecret.every(byte => byte === 0));
  await peer.device.base.append(late);
  await until(async () => { await owner.device.base.update(); return (await owner.device.receipt(late.id, peer.device.writerKey)).reason === 'user-not-authorized'; });
  await assert.rejects(peer.session.login('cadastro.teste', password), /AUTH_ACCESS/);
  await peer.session.login('portaria.teste', password);
  assert.equal((await peer.repository.execute({ command: 'list', entity: 'terceiros' })).length, 1);
});
