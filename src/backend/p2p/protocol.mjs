import b4a from 'b4a';
// Application rules only. Cryptography, storage and replication belong to libraries.
export const PROTOCOL = 'sst-p2p-v2';
export const ROLES = Object.freeze(['admin', 'cadastro', 'sesmt', 'portaria']);
export const ENTITIES = Object.freeze(['terceiros', 'empresas', 'treinamentos', 'excecoes']);
export const MAX_OPERATION_BYTES = 128 * 1024;
const ID = /^[a-zA-Z0-9_-]{1,128}$/;
export function validId(id) { return typeof id === 'string' && ID.test(id); }
export function validKey(key) { return typeof key === 'string' && /^[a-f0-9]{64}$/.test(key); }
export function permission(role, entity, action = 'put') {
  if (action === 'delete' && entity !== 'excecoes') return role === 'admin';
  return role === 'admin' || (entity === 'excecoes' ? role === 'sesmt' : role === 'cadastro');
}
export function validateOperation(op) {
  if (!op || op.protocol !== PROTOCOL || !validId(op.id)) throw Error('Operação ou versão inválida.');
  if (b4a.byteLength(JSON.stringify(op), 'utf8') > MAX_OPERATION_BYTES) throw Error('Operação excede o limite.');
  if (op.kind === 'bootstrap') {
    if (typeof op.name !== 'string' || op.name.length < 1 || op.name.length > 120) throw Error('Nome inválido.');
  } else if (op.kind === 'user') {
    if (!validKey(op.userKey) || (!ROLES.includes(op.role) && op.role !== null) || typeof op.name !== 'string' || op.name.length < 1 || op.name.length > 120) throw Error('Usuário inválido.');
  } else if (op.kind === 'member') {
    if (!validKey(op.writer) || (!ROLES.includes(op.role) && op.role !== null)) throw Error('Permissão inválida.');
  } else if (op.kind === 'put' || op.kind === 'delete') {
    if (!ENTITIES.includes(op.entity) || !validId(op.recordId)) throw Error('Registro inválido.');
    if (op.previous !== null && !validId(op.previous)) throw Error('Revisão inválida.');
    if (op.kind === 'put' && (!op.value || Array.isArray(op.value) || typeof op.value !== 'object')) throw Error('Conteúdo inválido.');
    // Reject keys unsafe to project into legacy JavaScript objects at every depth.
    const check = value => {
      if (!value || typeof value !== 'object') return;
      for (const key of Object.keys(value)) {
        if (['__proto__', 'constructor', 'prototype'].includes(key)) throw Error('Campo proibido.');
        check(value[key]);
      }
    };
    check(op.value);
  } else throw Error('Tipo de operação inválido.');
  return op;
}

