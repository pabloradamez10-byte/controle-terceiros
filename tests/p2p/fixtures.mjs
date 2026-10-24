import crypto from 'hypercore-crypto';
import b4a from 'b4a';
import { SstDevice } from '../../src/backend/p2p/device.mjs';

// Existing replication tests explicitly provision test-only individual signing
// identities. Production has no auto-login; the stdio bridge uses IdentityVault.
const identities = new Map(), owners = new Map();
export async function openFixtureDevice(options) {
  const device = await SstDevice.open(options);
  let pair = identities.get(options.directory);
  if (!pair) { pair = crypto.keyPair(); identities.set(options.directory, pair); }
  device.setIdentity(pair);
  if (options.invitation) {
    const owner = owners.get(options.invitation.baseKey);
    await owner.authorizeUser(b4a.toString(pair.publicKey, 'hex'), 'admin', 'Identidade fictícia');
  } else {
    if (!await device.base.view.get('policy/owner')) await device.bootstrapUser('Administrador fictício');
    owners.set(device.baseKey, device);
  }
  return device;
}
