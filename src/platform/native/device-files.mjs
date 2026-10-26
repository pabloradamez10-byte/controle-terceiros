import { mkdir, open, readFile, chmod, lstat } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'hypercore-crypto';
import b4a from 'b4a';
import { PROTOCOL, validKey } from '../../backend/p2p/protocol.mjs';

export async function openDeviceConfig(directory, invitationPath) {
  const root = path.resolve(directory);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const stat = await lstat(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw Error('Diretório de aparelho inválido.');
  await chmod(root, 0o700);
  const file = path.join(root, 'device.json');
  let config;
  try { config = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const invitation = invitationPath ? JSON.parse(await readFile(invitationPath, 'utf8')) : null;
    if (invitation && (invitation.protocol !== PROTOCOL || !validKey(invitation.baseKey) || !validKey(invitation.encryptionKey))) throw Error('Convite inválido.');
    config = invitation
      ? { protocol: PROTOCOL, invitation }
      : { protocol: PROTOCOL, encryptionKey: b4a.toString(crypto.randomBytes(32), 'hex') };
    const handle = await open(file, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(config)); await handle.sync(); } finally { await handle.close(); }
  }
  if (config.protocol !== PROTOCOL || (!validKey(config.encryptionKey) && !(validKey(config.invitation?.baseKey) && validKey(config.invitation?.encryptionKey) && config.invitation?.protocol === PROTOCOL))) throw Error('Configuração inválida.');
  if (invitationPath) {
    const supplied = JSON.parse(await readFile(invitationPath, 'utf8'));
    if (JSON.stringify(supplied) !== JSON.stringify(config.invitation)) throw Error('Aparelho existente pertence a outro convite; use outro diretório.');
  }
  return { directory: path.join(root, 'store'), config };
}

export async function writeInvitation(file, invitation) {
  const handle = await open(file, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(invitation)); await handle.sync(); } finally { await handle.close(); }
}

