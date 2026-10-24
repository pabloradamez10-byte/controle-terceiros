import { createInterface } from 'node:readline';
import { SstDevice } from '../../src/backend/p2p/device.mjs';
import { SstRepository } from '../../src/backend/p2p/repository.mjs';
import { openDeviceConfig, writeInvitation } from '../../src/platform/native/device-files.mjs';

// Local stdio bridge only: no HTTP listener, public port or central backend.
const [directory, ...flags] = process.argv.slice(2);
if (!directory) { console.error('Uso: npm run p2p:device -- DIRETORIO [--network] [--join ARQUIVO] [--invite-out ARQUIVO]'); process.exit(1); }
const option = name => { const i = flags.indexOf(name); if (i === -1) return undefined; if (!flags[i + 1] || flags[i + 1].startsWith('--')) throw Error('Argumento ausente.'); return flags[i + 1]; };
let device;
try {
  const settings = await openDeviceConfig(directory, option('--join'));
  device = await SstDevice.open({ directory: settings.directory, ...settings.config, network: flags.includes('--network') });
  const inviteFile = option('--invite-out');
  if (inviteFile) {
    if (await device.role() !== 'admin') throw Error('Somente administrador emite convite.');
    await writeInvitation(inviteFile, device.invitation());
  }
  const repository = new SstRepository(device);
  const output = value => process.stdout.write(JSON.stringify(value) + '\n');
  output({ ready: true, status: await repository.execute({ command: 'status' }) });
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  process.once('SIGINT', () => input.close());
  process.once('SIGTERM', () => input.close());
  for await (const line of input) {
    let id = null;
    try {
      if (line.length > 140000) throw Error('Requisição excede o limite.');
      const request = JSON.parse(line); id = request.requestId ?? null;
      const result = await repository.execute(request);
      output({ requestId: id, ok: true, result });
    } catch (error) { output({ requestId: id, ok: false, error: error.message }); }
  }
} catch (error) {
  // Never print config/invites/key material or arbitrary exception objects.
  console.error('Não foi possível iniciar o aparelho de homologação:', error.code ?? 'configuration-error');
  process.exitCode = 1;
} finally { await device?.close(); }

