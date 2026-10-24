import canonicalize from 'canonicalize';
import crypto from 'hypercore-crypto';
import b4a from 'b4a';
import { validKey } from './protocol.mjs';

const hex = value => b4a.toString(value, 'hex');
function message(operation) {
  const { signature, ...body } = operation;
  return b4a.from(canonicalize(body), 'utf8');
}
export function signOperation(body, keyPair, group, deviceKey) {
  if (!keyPair || !validKey(group) || !validKey(deviceKey)) throw Error('Autenticação individual necessária.');
  const operation = { ...body, group, deviceKey, actor: hex(keyPair.publicKey) };
  return { ...operation, signature: hex(crypto.sign(message(operation), keyPair.secretKey)) };
}
export function verifyOperation(operation, group, deviceKey) {
  if (operation.group !== group || operation.deviceKey !== deviceKey || !validKey(operation.actor) || typeof operation.signature !== 'string' || !/^[a-f0-9]{128}$/.test(operation.signature)) return false;
  try {
    return crypto.verify(message(operation), b4a.from(operation.signature, 'hex'), b4a.from(operation.actor, 'hex'));
  } catch { return false; }
}
