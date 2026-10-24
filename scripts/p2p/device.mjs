import { createInterface } from 'node:readline';
import { SstDevice } from '../../src/backend/p2p/device.mjs';
import { SstRepository } from '../../src/backend/p2p/repository.mjs';
import { openDeviceConfig, writeInvitation } from '../../src/platform/native/device-files.mjs';
import { IdentityVault } from '../../src/platform/native/identity-vault.mjs';
import { SstSession } from '../../src/backend/p2p/session.mjs';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import crypto from 'hypercore-crypto';
import b4a from 'b4a';

// Local stdio bridge only: no HTTP listener, public port or central backend.
const [directory, ...flags] = process.argv.slice(2);
if (!directory) { console.error('Uso: npm run p2p:device -- DIRETORIO [--network] [--join ARQUIVO] [--invite-out ARQUIVO]'); process.exit(1); }
const option = name => { const i = flags.indexOf(name); if (i === -1) return undefined; if (!flags[i + 1] || flags[i + 1].startsWith('--')) throw Error('Argumento ausente.'); return flags[i + 1]; };
let device, session;
try {
  const settings = await openDeviceConfig(directory, option('--join'));
  device = await SstDevice.open({ directory: settings.directory, ...settings.config, network: flags.includes('--network') });
  if (option('--invite-out')) throw Error('Convites agora exigem sessão individual de administrador.');
  session = new SstSession(device, new IdentityVault(path.resolve(directory, 'identities')));
  const repository = new SstRepository(device, session, { invitationWriter: async invitation => {
    const folder = path.resolve(directory, 'invitations');
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const file = path.join(folder, b4a.toString(crypto.randomBytes(16), 'hex') + '.invitation.json');
    await writeInvitation(file, invitation);
    return { file };
  } });
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
} finally { session?.logout(); await device?.close(); }

