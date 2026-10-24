import b4a from 'b4a';
// Application rules only. Cryptography, storage and replication belong to libraries.
export const PROTOCOL = 'sst-p2p-v2';
export const ROLES = Object.freeze(['admin', 'cadastro', 'sesmt', 'portaria']);
export const ENTITIES = Object.freeze(['terceiros', 'empresas', 'treinamentos', 'excecoes', 'metadata', 'documentos', 'documentChunks']);
export const MAX_OPERATION_BYTES = 128 * 1024;
const ID = /^[a-zA-Z0-9_-]{1,128}$/;
export function validId(id) { return typeof id === 'string' && ID.test(id) && !['__proto__', 'constructor', 'prototype'].includes(id); }
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
    if (op.permissions !== undefined && (!op.permissions || ['consultar', 'cadastrar', 'liberar'].some(k => typeof op.permissions[k] !== 'boolean') || Object.keys(op.permissions).some(k => !['consultar', 'cadastrar', 'liberar'].includes(k)))) throw Error('Permissões inválidas.');
    if (op.displayRole != null && !ROLES.includes(op.displayRole)) throw Error('Perfil inválido.');
  } else if (op.kind === 'member') {
    if (!validKey(op.writer) || (!ROLES.includes(op.role) && op.role !== null)) throw Error('Permissão inválida.');
  } else if (op.kind === 'batch') {
    if (!Array.isArray(op.mutations) || op.mutations.length < 1 || op.mutations.length > 500 || typeof op.reason !== 'string' || op.reason.trim().length < 3 || op.reason.length > 1000) throw Error('Lote ou motivo inválido.');
    const keys = new Set();
    for (const mutation of op.mutations) {
      if (!['put', 'delete'].includes(mutation.kind)) throw Error('Operação de lote inválida.');
      validateOperation({ ...mutation, protocol: PROTOCOL, id: op.id });
      const key = mutation.entity + '/' + mutation.recordId;
      if (keys.has(key)) throw Error('Registro repetido no lote.');
      keys.add(key);
    }
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

