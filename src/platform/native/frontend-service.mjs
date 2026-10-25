import canonicalize from 'canonicalize';
import crypto from 'hypercore-crypto';
import b4a from 'b4a';
import { createHash } from 'node:crypto';
import { validateFile } from '../../../supabase/functions/sst-documentos/validate.mjs';
import { validId, ROLES } from '../../backend/p2p/protocol.mjs';

// Reuse the app's existing eligibility evaluator and byte validator, not copies.
import '../../features/auditoria/relatorios.js';
const rules = globalThis.sstRelatorioCore;
const arrays = ['terceiros', 'empresas', 'treinamentos'];
const maps = ['anexosTerceiros', 'anexosEmpresas', 'arquivosTerceirosV16', 'arquivosEmpresasV26'];
const hex = bytes => b4a.toString(bytes, 'hex');
const digest = value => hex(crypto.hash(b4a.from(canonicalize(value))));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const defaults = {
  admin: { consultar: true, cadastrar: true, liberar: true }, cadastro: { consultar: true, cadastrar: true, liberar: false },
  sesmt: { consultar: true, cadastrar: false, liberar: true }, portaria: { consultar: true, cadastrar: false, liberar: false }
};
function flatten(state) {
  const flat = new Map();
  for (const entity of arrays) {
    if (!Array.isArray(state[entity])) throw Error('Lista ausente: ' + entity);
    for (const value of state[entity]) {
      const id = String(value?.id ?? '');
      if (!validId(id) || flat.has(entity + '/' + id)) throw Error('ID inválido ou repetido.');
      flat.set(entity + '/' + id, { entity, recordId: id, value });
    }
  }
  for (const field of maps) {
    const mapping = state[field] ?? {};
    if (typeof mapping !== 'object' || Array.isArray(mapping)) throw Error('Lista de documentos inválida.');
    for (const [ownerId, items] of Object.entries(mapping)) {
      if (!validId(ownerId) || !Array.isArray(items)) throw Error('Vínculo de documentos inválido.');
      const id = digest([field, ownerId]);
      flat.set('metadata/' + id, { entity: 'metadata', recordId: id, value: { field, ownerId, items } });
    }
  }
  return flat;
}

export class NativeFrontendService {
  constructor(device, session) { this.device = device; this.session = session; this.queue = Promise.resolve(); }
  execute(request) {
    const next = this.queue.catch(() => {}).then(() => this.dispatch(request));
    this.queue = next; return next;
  }
  async membership() {
    const user = await this.session.require({ touch: false }), deviceRole = await this.device.role();
    const permissions = Object.fromEntries(Object.keys(defaults.admin).map(key => [key, !!defaults[user.role]?.[key] && !!defaults[deviceRole]?.[key] && user.permissions?.[key] !== false]));
    return { role: deviceRole === 'portaria' || user.role === 'portaria' ? 'portaria' : user.role === 'admin' ? deviceRole : user.role, permissoes: permissions, ativo: true, user: { id: user.publicKey, email: user.name } };
  }
  async snapshot() {
    await this.device.base.update();
    const state = { schema: 'controle-terceiros-sst-v2', updatedAt: new Date().toISOString(), updatedBy: (await this.device.user())?.publicKey, historico: [] };
    const rows = new Map();
    for (const entity of [...arrays, 'metadata', 'excecoes']) {
      if (arrays.includes(entity)) state[entity] = [];
      for await (const { key, value } of this.device.base.view.createReadStream({ gte: 'record/' + entity + '/', lt: 'record/' + entity + '0' })) {
        const id = key.slice(('record/' + entity + '/').length);
        rows.set(entity + '/' + id, value);
        if (!value.deleted && arrays.includes(entity)) state[entity].push(value.value);
      }
    }
    for (const field of maps) state[field] = Object.create(null);
    const exceptions = Object.create(null);
    for (const [key, row] of rows) {
      if (row.deleted) continue;
      if (key.startsWith('metadata/') && maps.includes(row.value.field) && validId(row.value.ownerId)) state[row.value.field][row.value.ownerId] = row.value.items;
      if (key.startsWith('excecoes/')) exceptions[key.slice(9)] = row.value;
    }
    const version = digest([...rows].map(([key, row]) => [key, row.revision, row.deleted]).sort());
    for await(const {value:event} of this.device.base.view.createReadStream({gte:'audit/',lt:'audit0',limit:1000})){
      if(!event.accepted)continue;
      for(const [index,change] of (event.changes||[]).entries())state.historico.push({id:event.operationId+'_'+index,entidade:change.entity==='terceiros'?'terceiro':change.entity==='empresas'?'empresa':change.entity,entidadeId:change.id,data:event.reportedAt,descricao:(event.reasonText||'Alteração registrada')+' — '+(event.actorName||event.actor)});
    }
    state.historico.sort((a,b)=>String(b.data).localeCompare(String(a.data)));
    return { state, exceptions, rows, version };
  }
  async confirmed(result) {
    if (!result.accepted) throw Error(result.reason === 'revision-conflict' ? 'Outra alteração chegou antes. Recarregue os dados; seu rascunho não foi confirmado.' : 'Operação recusada pelo núcleo: ' + result.reason);
    let receipt = result;
    const until = Date.now() + 2000;
    while (!receipt.finalized && Date.now() < until) {
      await new Promise(resolve => setTimeout(resolve, 25)); await this.device.base.update();
      receipt = await this.device.receipt(result.id);
      if (receipt.accepted === false) throw Error('Alteração recusada após sincronização: ' + receipt.reason);
    }
    if (!receipt.finalized) throw Error('Alteração registrada localmente, aguardando confirmação do indexador. Não foi anunciada como concluída.');
    return receipt;
  }
  async saveState(state, expected, reason) {
    const before = await this.snapshot();
    if (expected !== before.version) throw Error('A base mudou. Recarregue antes de salvar para não sobrescrever alterações.');
    const previous = flatten(before.state), next = flatten(state), mutations = [];
    const companies=new Set(state.empresas.map(company=>String(company.id))),trainings=new Set(state.treinamentos.map(training=>String(training.id)));
    for(const person of state.terceiros)if(!companies.has(String(person.empresaId)))throw Error('Terceiro sem empresa válida. Nenhuma alteração foi gravada.');
    for(const company of state.empresas)if((company.treinamentosObrigatorios||[]).some(id=>!trainings.has(String(id))))throw Error('Treinamento vinculado não encontrado.');
    for (const [key, entry] of next) {
      if (canonicalize(entry.value) === canonicalize(previous.get(key)?.value ?? null)) continue;
      // New file bytes must go through the validated native document store.
      if (entry.entity === 'metadata') for (const item of entry.value.items) {
        if (item.dataUrl) throw Error('Anexos novos devem usar o armazenamento privado.');
        if (item.storageId) {
          const meta = await this.device.get('documentos', String(item.storageId));
          const kind = entry.value.field.includes('Empresas') ? 'empresa' : 'terceiro';
          if (!meta || meta.deleted || meta.value.ownerId !== entry.value.ownerId || meta.value.kind !== kind || meta.value.sha256 !== item.sha256) throw Error('Vínculo ou integridade documental inválidos.');
        }
      }
      mutations.push({ ...entry, kind: 'put', previous: before.rows.get(key)?.revision ?? null });
    }
    for (const [key, entry] of previous) if (!next.has(key)) mutations.push({ kind: 'delete', entity: entry.entity, recordId: entry.recordId, previous: before.rows.get(key).revision });
    if (mutations.length) await this.confirmed(await this.device.commit(mutations, reason));
    return (await this.snapshot()).version;
  }
  async documents(body, membership) {
    if (body.action === 'upload') {
      if (!membership.permissoes.cadastrar) throw Error('Envio não autorizado.');
      const owner=await this.device.get(body.kind === 'empresa' ? 'empresas' : 'terceiros',String(body.ownerId));
      if (!['terceiro', 'empresa'].includes(body.kind) || !validId(String(body.ownerId)) || !owner || owner.deleted) throw Error('Salve o cadastro antes de anexar o documento.');
      if (typeof body.base64 !== 'string' || body.base64.length > 1200000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.base64)) throw Error('Arquivo inválido.');
      const bytes = b4a.from(body.base64, 'base64'); validateFile(bytes, body.filename, body.mime);
      const id = hex(crypto.randomBytes(16)), chunks = [];
      for (let offset = 0; offset < bytes.length; offset += 48000) {
        const chunkId = id + '_' + chunks.length;
        await this.confirmed(await this.device.put('documentChunks', chunkId, { base64: b4a.toString(bytes.subarray(offset, offset + 48000), 'base64') }));
        chunks.push(chunkId);
      }
      const meta = { kind: body.kind, ownerId: String(body.ownerId), nome: body.filename, mime: body.mime, tamanho: bytes.length, sha256: sha256(bytes), chunks, criadoEm: new Date().toISOString() };
      await this.confirmed(await this.device.put('documentos', id, meta));
      return { storageId: id, ...meta, chunks: undefined };
    }
    if (!['view', 'download'].includes(body.action) || !validId(body.id)) throw Error('Operação documental inválida.');
    if (body.action === 'download' && membership.role === 'portaria') throw Error('Portaria pode visualizar, sem baixar documentos.');
    const meta = (await this.device.get('documentos', body.id))?.value;
    if (!meta) throw Error('Documento não encontrado.');
    const chunks = [];
    for (const id of meta.chunks) {
      const chunk = (await this.device.get('documentChunks', id))?.value;
      if (!chunk) throw Error('Documento ainda não disponível neste aparelho.');
      chunks.push(b4a.from(chunk.base64, 'base64'));
    }
    const bytes = b4a.concat(chunks);
    if (bytes.length !== meta.tamanho || sha256(bytes) !== meta.sha256) throw Error('Integridade do documento não confirmada.');
    validateFile(bytes,meta.nome,meta.mime);
    return { dataUrl: 'data:' + meta.mime + ';base64,' + b4a.toString(bytes, 'base64') };
  }
  async users(body, membership) {
    if (membership.role !== 'admin') throw Error('Administração de usuários exige ADM.');
    if (!body) {
      const users = [];
      for await (const { key, value } of this.device.base.view.createReadStream({ gte: 'user/', lt: 'user0' })) users.push({ user_id: key.slice(5), email: value.name, role: value.role ?? value.displayRole ?? 'cadastro', ativo: !!value.role, permissoes: value.permissions ?? defaults[value.role] ?? defaults.portaria });
      return { users };
    }
    if (body.action === 'delete') {
      const target = (await this.device.base.view.get('user/' + body.user_id))?.value;
      if (!target) throw Error('Usuário não encontrado.');
      await this.confirmed(await this.device.authorizeUser(body.user_id, null, target.name));
      return { message: 'Acesso revogado; o histórico foi preservado.' };
    }
    if(!ROLES.includes(body.role)||typeof body.ativo!=='boolean'||!body.permissoes||Object.keys(defaults.admin).some(key=>typeof body.permissoes[key]!=='boolean'||(body.permissoes[key]&&!defaults[body.role][key])))throw Error('As permissões devem respeitar o perfil selecionado.');
    const existing = (await this.users(null, membership)).users.find(user => user.email.toLowerCase() === String(body.email).toLowerCase());
    let identity=existing;
    if(!identity){
      try{identity=await this.session.createIdentity(body.email,body.password);}
      catch(error){if(error.code!=='EEXIST')throw error;const pair=await this.session.vault.unlock(body.email,body.password);identity={publicKey:hex(pair.publicKey)};pair.secretKey.fill(0);}
    }
    const userKey = existing?.user_id ?? identity.publicKey;
    await this.confirmed(await this.device.authorizeUser(userKey, body.ativo ? body.role : null, body.email, body.permissoes, body.role));
    return { message: 'Usuário salvo neste aparelho. Vinculação a outro aparelho deve ser autorizada separadamente.' };
  }
  async auditRows() {
    const events = await this.device.audit();
    return events.flatMap(event => (event.changes?.length ? event.changes : [{ entity: event.kind, id: event.operationId, before: null, after: null }]).map(change => ({
      id: event.operationId, action: event.accepted ? change.kind ?? event.kind : 'REJEITADA', entity_type: change.entity, entity_id: change.id,
      actor_email: event.actorName||event.actor, occurred_at: event.reportedAt, reason: event.reasonText ?? event.reason ?? 'Operação do núcleo', before_data: change.before, after_data: change.after
    }))).reverse();
  }
  async dispatch(request) {
    if (!request || typeof request.action !== 'string') throw Error('Requisição inválida.');
    const { action, body } = request;
    if (action === 'status') return { ...this.device.status(), locked: !await this.session.peek(), needsOwner: this.device.writerKey === this.device.baseKey && !await this.device.base.view.get('policy/owner') };
    if (action === 'login') return this.session.login(body.email, body.password);
    if (action === 'initializeOwner') return this.session.initializeOwner(body.email, body.password);
    if (action === 'logout') { this.session.logout(); return { locked: true }; }
    await this.session.require({ touch: !['state', 'membership', 'exceptions', 'access'].includes(action) });
    const membership = await this.membership();
    if (action === 'membership') return membership;
    if (action === 'activity') return { active: true };
    if (action === 'state') { const data = await this.snapshot(); return [{ data: data.state, updated_at: data.version }]; }
    if (action === 'saveState') {
      if (!membership.permissoes.cadastrar) throw Error('Sem permissão para cadastrar.');
      return this.saveState(body.p_data, body.p_expected, body.p_reason);
    }
    if (action === 'exceptions') return Object.entries((await this.snapshot()).exceptions).map(([terceiro_id, dados]) => ({ terceiro_id, dados }));
    if (action === 'saveException') {
      if (!membership.permissoes.liberar) throw Error('Sem permissão para liberar.');
      const id = String(body.p_id), previous = await this.device.get('excecoes', id);
      if (!await this.device.get('terceiros', id)) throw Error('Terceiro não encontrado.');
      await this.confirmed(await this.device.commit([{ kind: 'put', entity: 'excecoes', recordId: id, value: body.p_data, previous: previous?.revision ?? null }], body.p_reason));
      return { saved: true };
    }
    if (action === 'documents') return this.documents(body, membership);
    if (action === 'users') return this.users(body, membership);
    if (action === 'audit') return this.auditRows();
    if (action === 'historicalReport') throw Error('Relatório histórico P2P ainda não disponível: versões anteriores não foram migradas.');
    if (action === 'access') {
      const snapshot = await this.snapshot(), day = rules.day(new Date().toISOString());
      return { local: true, version: snapshot.version, statuses: Object.fromEntries(snapshot.state.terceiros.map(person => [person.id, rules.evaluate(person, snapshot.state, snapshot.exceptions, day)])) };
    }
    throw Error('Comando de interface não permitido.');
  }
}
