import { mkdir, open, lstat } from 'node:fs/promises';
import path from 'node:path';
import sodium from 'sodium-native';
import crypto from 'hypercore-crypto';
import b4a from 'b4a';
import { validKey } from '../../backend/p2p/protocol.mjs';

const FORMAT = 'sst-identity-v1';
const hex = bytes => b4a.toString(bytes, 'hex');
const unhex = value => b4a.from(value, 'hex');
function normalize(name) {
  if (typeof name !== 'string' || !/^[a-z0-9@._-]{3,120}$/i.test(name.trim())) throw Error('Identificação inválida.');
  return name.trim().toLowerCase();
}
async function derive(password, salt) {
  if (typeof password !== 'string' || b4a.byteLength(password) > 1024 || password.length < 10) throw Error('Senha deve ter de 10 caracteres a 1024 bytes.');
  const encoded = b4a.from(password), key = b4a.alloc(32);
  try {
    await sodium.crypto_pwhash_async(key, encoded, salt,
      sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE, sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
      sodium.crypto_pwhash_ALG_ARGON2ID13);
    return key;
  } catch (error) { key.fill(0); throw error; }
  finally { encoded.fill(0); }
}
const aad = entry => b4a.from(`${FORMAT}:${entry.name}:${entry.publicKey}`);

export class IdentityVault {
  constructor(directory) { this.directory = directory; }
  file(name) { return path.join(this.directory, hex(crypto.hash(b4a.from(normalize(name)))) + '.json'); }
  async create(name, password) {
    name = normalize(name);
    const pair = crypto.keyPair(), salt = crypto.randomBytes(sodium.crypto_pwhash_SALTBYTES);
    let key;
    try {
      key = await derive(password, salt);
      const entry = { format: FORMAT, name, publicKey: hex(pair.publicKey), salt: hex(salt), nonce: hex(crypto.randomBytes(24)) };
      const ciphertext = b4a.alloc(pair.secretKey.length + sodium.crypto_aead_xchacha20poly1305_ietf_ABYTES);
      sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(ciphertext, pair.secretKey, aad(entry), null, unhex(entry.nonce), key);
      entry.ciphertext = hex(ciphertext);
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const handle = await open(this.file(name), 'wx', 0o600);
      try { await handle.writeFile(JSON.stringify(entry)); await handle.sync(); } finally { await handle.close(); }
      return { name, publicKey: entry.publicKey };
    } finally { key?.fill(0); pair.secretKey.fill(0); }
  }
  async unlock(name, password) {
    let key, secretKey, stage = 'storage';
    try {
      name = normalize(name);
      const file = this.file(name), stat = await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8192 || (stat.mode & 0o077)) throw Error('Arquivo privado inválido.');
      const handle = await open(file, 'r');
      let entry;
      try { entry = JSON.parse(await handle.readFile('utf8')); } finally { await handle.close(); }
      if (entry.format !== FORMAT || entry.name !== name || !validKey(entry.publicKey) || !/^[a-f0-9]{32}$/.test(entry.salt) || !/^[a-f0-9]{48}$/.test(entry.nonce) || !/^[a-f0-9]{160}$/.test(entry.ciphertext)) throw Error('Credencial inválida.');
      stage = 'derive';
      key = await derive(password, unhex(entry.salt));
      stage = 'decrypt';
      secretKey = b4a.alloc(64);
      sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(secretKey, null, unhex(entry.ciphertext), aad(entry), unhex(entry.nonce), key);
      const pair = { publicKey: unhex(entry.publicKey), secretKey };
      if (!crypto.validateKeyPair(pair)) throw Error('Identidade inválida.');
      return pair;
    } catch (cause) {
      secretKey?.fill(0);
      // Fixed codes only: never forward filesystem paths, credential bytes or native errors.
      const code = stage === 'storage' && cause.code !== 'ENOENT' ? 'AUTH_STORAGE'
        : stage === 'derive' && typeof password === 'string' && password.length >= 10 && b4a.byteLength(password) <= 1024 ? 'AUTH_CRYPTO'
        : 'AUTH_CREDENTIALS';
      const error = Error('Usuário ou senha inválidos.'); error.code = code; throw error;
    } finally { key?.fill(0); }
  }
}
