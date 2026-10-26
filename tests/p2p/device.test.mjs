import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'hypercore-crypto';
import b4a from 'b4a';
import { SstDevice } from '../../src/backend/p2p/device.mjs';
import { openFixtureDevice } from './fixtures.mjs';
import { SstRepository } from '../../src/backend/p2p/repository.mjs';

const key = () => b4a.toString(crypto.randomBytes(32), 'hex');
async function until(check, message) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) { if (await check()) return; await new Promise(r => setTimeout(r, 20)); }
  assert.fail(message);
}
function connect(a, b) {
  const left = a.replicationStream(true), right = b.replicationStream(false);
  left.on('error', () => {}); right.on('error', () => {});
  left.pipe(right).pipe(left);
  return () => { left.destroy(); right.destroy(); };
}

test('encrypted storage, signed two-peer replication, ACL, conflicts, tombstones and restart', { timeout: 60000 }, async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sst-p2p-'));
  const nodes = [], links = [];
  t.after(async () => {
    links.forEach(close => close());
    for (const device of nodes) await device.close();
    await rm(dir, { recursive: true, force: true });
  });
  const secret = key();
  const admin = await openFixtureDevice({ directory: path.join(dir, 'admin'), encryptionKey: secret }); nodes.push(admin);
  assert.equal(await admin.role(), 'admin');
  assert.equal(admin.status().networkStarted, false);
  await assert.rejects(SstDevice.open({ directory: path.join(dir, 'bad') }), /obrigatória/);
  const result = await admin.put('empresas', 'empresa1', { nome: 'Empresa fictícia' });
  assert.equal(result.accepted, true);
  const member = await openFixtureDevice({ directory: path.join(dir, 'member'), invitation: admin.invitation() }); nodes.push(member);
  links.push(connect(admin, member));
  await until(async () => { await member.base.update(); return !!await member.get('empresas', 'empresa1'); }, 'Replicação inicial não chegou.');
  await assert.rejects(member.put('empresas', 'negado', { nome: 'Sem autorização' }), /permissão/);
  await admin.grant(member.writerKey, 'cadastro');
  await until(async () => { await member.base.update(); return await member.role() === 'cadastro' && member.base.writable; }, 'Cadastro não autorizado.');
  const pending = await member.put('terceiros', 'pessoa1', { nome: 'Pessoa fictícia' });
  await until(async () => { await admin.base.update(); return !!await admin.get('terceiros', 'pessoa1'); }, 'Cadastro não replicou.');
  await until(async () => { await member.base.update(); return (await member.receipt(pending.id)).accepted === true; }, 'Confirmação não voltou.');
  await assert.rejects(member.put('excecoes', 'ex1', { motivo: 'não autorizado' }), /permissão/);
  await assert.rejects(member.grant(member.writerKey, 'admin'), /administrador/);
  // Bypass convenience API: the materializer must enforce ACL on signed log entries too.
  const denied = await member.append({ kind: 'member', writer: member.writerKey, role: 'admin' });
  await until(async () => { await admin.base.update(); return (await admin.receipt(denied.id, member.writerKey)).reason === 'permission-denied'; }, 'Escalada não rejeitada.');
  assert.equal(await admin.get('excecoes', 'ex1'), null);
  const old = await admin.get('empresas', 'empresa1');
  const update = await admin.put('empresas', 'empresa1', { nome: 'Revisada' }, old.revision);
  assert.equal(update.accepted, true);
  const conflict = await admin.put('empresas', 'empresa1', { nome: 'Sobrescrita antiga' }, old.revision);
  assert.equal(conflict.reason, 'revision-conflict');
  assert.equal((await admin.get('empresas', 'empresa1')).value.nome, 'Revisada');
  const removed = await admin.remove('empresas', 'empresa1', update.id);
  assert.equal(removed.accepted, true);
  assert.equal((await admin.get('empresas', 'empresa1')).deleted, true);
  assert.deepEqual(await admin.list('empresas'), []);
  assert.equal((await admin.put('empresas', 'empresa1', { nome: 'Ressuscitar' })).reason, 'revision-conflict');
  await assert.rejects(admin.put('empresas', '../inválido', {}), /inválido/);
  await assert.rejects(admin.put('empresas', 'grande', { texto: 'x'.repeat(140000) }), /limite/);
  await assert.rejects(admin.put('empresas', 'unicode', { texto: '😀'.repeat(40000) }), /limite/);
  await assert.rejects(admin.put('empresas', 'proto', JSON.parse('{"__proto__":{"admin":true}}')), /proibido/);
  // SESMT may release by exception, but may not edit registrations.
  await admin.grant(member.writerKey, 'sesmt');
  await until(async () => { await member.base.update(); return await member.role() === 'sesmt'; }, 'Perfil SESMT não chegou.');
  const exception = await member.put('excecoes', 'ex1', { motivo: 'Exceção fictícia', validade: '2026-10-25' });
  await until(async () => { await admin.base.update(); return !!await admin.get('excecoes', 'ex1'); }, 'Exceção não replicou.');
  assert.ok(exception.id);
  await assert.rejects(member.put('empresas', 'sesmt-negado', {}), /permissão/);
  await admin.grant(member.writerKey, 'portaria');
  await until(async () => { await member.base.update(); return await member.role() === 'portaria'; }, 'Perfil Portaria não chegou.');
  const portaria = new SstRepository(member);
  assert.equal((await portaria.execute({ command: 'list', entity: 'terceiros' })).length, 1);
  assert.equal((await portaria.execute({ command: 'get', entity: 'terceiros', recordId: 'pessoa1' })).value.nome, 'Pessoa fictícia');
  assert.equal((await portaria.execute({ command: 'get', entity: 'excecoes', recordId: 'ex1' })).value.motivo, 'Exceção fictícia');
  await assert.rejects(portaria.execute({ command: 'put', entity: 'terceiros', recordId: 'pessoa2', value: {} }), /permissão/);
  await assert.rejects(portaria.execute({ command: 'delete', entity: 'terceiros', recordId: 'pessoa1', previous: pending.id }), /permissão/);
  await assert.rejects(portaria.execute({ command: 'grant', writerKey: member.writerKey, role: 'admin' }), /administrador/);
  for (const command of ['download', 'export', 'downloadDocument']) await assert.rejects(portaria.execute({ command }), /não permitido/);
  const portariaBypass = await member.append({ kind: 'put', entity: 'terceiros', recordId: 'pessoa2', value: {}, previous: null });
  await until(async () => { await admin.base.update(); return (await admin.receipt(portariaBypass.id, member.writerKey)).reason === 'permission-denied'; }, 'Escrita direta de Portaria não rejeitada.');
  await assert.rejects(member.put('excecoes', 'portaria-negado', {}), /permissão/);
  // Revoke writes; old replicas cannot be erased remotely.
  await admin.grant(member.writerKey, null);
  await until(async () => { await member.base.update(); return await member.role() === null; }, 'Revogação não chegou.');
  await assert.rejects(portaria.execute({ command: 'list', entity: 'terceiros' }), /não autorizada/);
  await assert.rejects(member.put('empresas', 'revogado', {}), /permissão/);
  const rejected = await member.append({ kind: 'put', entity: 'empresas', recordId: 'revogado', value: {}, previous: null });
  await until(async () => { await admin.base.update(); return (await admin.receipt(rejected.id, member.writerKey)).reason === 'permission-denied'; }, 'Escrita revogada não rejeitada.');
  links.forEach(close => close()); links.length = 0;
  const before = admin.baseKey;
  await admin.close(); nodes.splice(nodes.indexOf(admin), 1);
  const reopened = await openFixtureDevice({ directory: path.join(dir, 'admin'), encryptionKey: secret }); nodes.push(reopened);
  assert.equal(reopened.baseKey, before);
  assert.equal((await reopened.get('terceiros', 'pessoa1')).value.nome, 'Pessoa fictícia');
  assert.equal((await reopened.get('empresas', 'empresa1')).deleted, true);
  assert.equal((await reopened.receipt(conflict.id)).reason, 'revision-conflict');
});

test('offline edits converge after reconnect; concurrent revision is reported instead of silently overwritten', { timeout: 40000 }, async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sst-offline-'));
  const a = await openFixtureDevice({ directory: path.join(dir, 'a'), encryptionKey: key() });
  const b = await openFixtureDevice({ directory: path.join(dir, 'b'), invitation: a.invitation() });
  let disconnect = connect(a, b);
  t.after(async () => { disconnect(); await a.close(); await b.close(); await rm(dir, { recursive: true, force: true }); });
  await a.grant(b.writerKey, 'cadastro');
  const first = await a.put('empresas', 'same', { nome: 'Inicial' });
  await until(async () => { await b.base.update(); return (await b.get('empresas', 'same'))?.revision === first.id && b.base.writable; }, 'Base inicial não chegou.');
  disconnect();
  const ownerChange = await a.put('empresas', 'same', { nome: 'Alterado no A' }, first.id);
  const peerChange = await b.put('empresas', 'same', { nome: 'Alterado no B' }, first.id);
  const independent = await b.put('terceiros', 'offline', { nome: 'Criado sem conexão' });
  assert.equal(peerChange.finalized, false, 'Escrita sem indexador não pode ser anunciada como definitiva.');
  disconnect = connect(a, b);
  await until(async () => { await a.base.update(); return !!await a.get('terceiros', 'offline'); }, 'Escrita offline não chegou.');
  await until(async () => {
    await b.base.update();
    return (await b.receipt(peerChange.id)).finalized === true && (await b.receipt(independent.id)).finalized === true;
  }, 'Confirmações offline não chegaram.');
  const aRecord = await a.get('empresas', 'same'), bRecord = await b.get('empresas', 'same');
  assert.deepEqual(aRecord, bRecord);
  assert.ok([ownerChange.id, peerChange.id].includes(aRecord.revision));
  const receipts = [await a.receipt(ownerChange.id), await a.receipt(peerChange.id, b.writerKey)];
  assert.equal(receipts.filter(result => result.accepted).length, 1);
  assert.equal(receipts.filter(result => result.reason === 'revision-conflict').length, 1);
  const invalidId = 'invalid-version';
  await b.base.append({ protocol: 'future-protocol', id: invalidId, kind: 'put', entity: 'empresas', recordId: 'future', previous: null, value: {} });
  await b.base.update(); await a.base.update();
  assert.equal(await a.get('empresas', 'future'), null);
});

test('different encrypted groups do not replicate business records', { timeout: 25000 }, async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sst-p2p-isolation-'));
  const a = await openFixtureDevice({ directory: path.join(dir, 'a'), encryptionKey: key() });
  const b = await openFixtureDevice({ directory: path.join(dir, 'b'), encryptionKey: key() });
  const disconnect = connect(a, b);
  t.after(async () => { disconnect(); await a.close(); await b.close(); await rm(dir, { recursive: true, force: true }); });
  await a.put('terceiros', 'private', { nome: 'Só grupo A' });
  await b.base.update();
  assert.equal(await b.get('terceiros', 'private'), null);
  assert.notEqual(a.baseKey, b.baseKey);
});
