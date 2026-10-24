import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { SstDevice } from '../../src/backend/p2p/device.mjs';
import { SstRepository } from '../../src/backend/p2p/repository.mjs';
import { openDeviceConfig, writeInvitation } from '../../src/platform/native/device-files.mjs';

test('legacy import preview preserves IDs, refuses duplicates, never mutates source or imports access exceptions', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sst-preview-'));
  const settings = await openDeviceConfig(dir);
  const device = await SstDevice.open({ directory: settings.directory, ...settings.config });
  t.after(async () => { await device.close(); await rm(dir, { recursive: true, force: true }); });
  const repo = new SstRepository(device);
  const source = { terceiros: [{ id: 123, nome: 'Fictício' }], empresas: [{ id: 'e1' }], treinamentos: [], liberacoesExcecao: { 123: true } };
  const original = JSON.stringify(source);
  const preview = await repo.previewLegacyImport(source);
  assert.equal(preview.count, 2); assert.equal(preview.writesPerformed, false);
  assert.equal(preview.records[0].recordId, '123');
  assert.equal(preview.records[0].value.id, 123);
  assert.equal(JSON.stringify(source), original);
  preview.records[0].value.nome = 'Mudança na prévia';
  assert.equal(source.terceiros[0].nome, 'Fictício');
  assert.deepEqual(await device.list('terceiros'), []);
  await assert.rejects(repo.previewLegacyImport({ ...source, terceiros: [{ id: 1 }, { id: 1 }] }), /duplicado/);
  await assert.rejects(repo.execute({ command: 'append', role: 'admin' }), /não permitido/);
  assert.equal((await repo.execute({ command: 'status' })).productionReady, false);
});

test('device config persists identity secret, creates private invitation file and never overwrites it', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sst-files-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = path.join(dir, 'owner');
  const first = await openDeviceConfig(root), second = await openDeviceConfig(root);
  assert.deepEqual(first.config, second.config);
  assert.equal((await stat(path.join(root, 'device.json'))).mode & 0o777, 0o600);
  const invitation = { protocol: 'sst-p2p-v1', baseKey: 'a'.repeat(64), encryptionKey: 'b'.repeat(64) };
  const file = path.join(dir, 'fixture.invitation.json');
  await writeInvitation(file, invitation);
  const bytes = await readFile(file);
  await assert.rejects(writeInvitation(file, invitation), { code: 'EEXIST' });
  assert.deepEqual(await readFile(file), bytes);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  const peer = await openDeviceConfig(path.join(dir, 'peer'), file);
  assert.deepEqual(peer.config.invitation, invitation);
  await assert.rejects(openDeviceConfig(root, file), /outro convite/);
});

test('native stdio bridge performs writes and restarts without a network or Supabase', { timeout: 15000 }, async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'sst-bridge-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  function run(lines) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['scripts/p2p/device.mjs', dir], { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '', stderr = '';
      child.stdout.on('data', data => stdout += data);
      child.stderr.on('data', data => stderr += data);
      child.on('error', reject);
      child.on('close', code => code === 0 ? resolve(stdout.trim().split('\n').map(JSON.parse)) : reject(Error(stderr)));
      child.stdin.end(lines.map(JSON.stringify).join('\n') + '\n');
    });
  }
  const replies = await run([
    { command: 'put', requestId: 1, entity: 'empresas', recordId: 'e1', value: { nome: 'Empresa fictícia' } },
    { command: 'get', requestId: 2, entity: 'empresas', recordId: 'e1' },
    { command: 'invitation', requestId: 3 }
  ]);
  assert.equal(replies[0].ready, true);
  assert.equal(replies[1].result.accepted, true);
  assert.equal(replies[2].result.value.nome, 'Empresa fictícia');
  assert.equal(replies[3].ok, false);
  const next = await run([{ command: 'get', entity: 'empresas', recordId: 'e1' }]);
  assert.equal(next[0].status.writerKey, replies[0].status.writerKey);
  assert.equal(next[1].result.value.nome, 'Empresa fictícia');
  const config = JSON.parse(await readFile(path.join(dir, 'device.json')));
  assert.ok(!JSON.stringify(replies).includes(config.encryptionKey));
});
