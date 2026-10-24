import { validId } from './protocol.mjs';

// Boundary for the existing SST features. No feature imports Hyperswarm/Corestore.
export class SstRepository {
  constructor(device, session, { invitationWriter } = {}) { this.device = device; this.session = session; this.invitationWriter = invitationWriter; }
  async execute(request) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw Error('Requisição inválida.');
    if (request.command === 'status') return { ...this.device.status(), locked: !await this.session?.peek() };
    if (request.command === 'createIdentity') return this.session.createIdentity(request.name, request.password);
    if (request.command === 'initializeOwner') return this.session.initializeOwner(request.name, request.password);
    if (request.command === 'login') return this.session.login(request.name, request.password);
    if (request.command === 'logout') { this.session.logout(); return { locked: true }; }
    if (!['get', 'list', 'put', 'delete', 'receipt', 'grant', 'authorizeUser', 'audit', 'identity', 'createInvitation'].includes(request.command)) throw Error('Comando não permitido.');
    const user = this.session ? await this.session.require() : await this.device.requireUser();
    switch (request.command) {
      case 'identity': return { user, writerKey: this.device.writerKey, deviceRole: await this.device.role() };
      case 'get':
      case 'list': {
        // Portaria can consult all third parties and their documentation.
        // Write permissions are enforced again by the signed-log materializer.
        if (!['admin', 'cadastro', 'sesmt', 'portaria'].includes(await this.device.role())) throw Error('Consulta não autorizada.');
        return request.command === 'get'
          ? this.device.get(request.entity, request.recordId)
          : this.device.list(request.entity);
      }
      case 'put': return this.device.put(request.entity, request.recordId, request.value, request.previous ?? null);
      case 'delete': return this.device.remove(request.entity, request.recordId, request.previous);
      case 'receipt': return this.device.receipt(request.operationId);
      case 'grant': return this.device.grant(request.writerKey, request.role);
      case 'authorizeUser': return this.device.authorizeUser(request.userKey, request.role, request.name);
      case 'audit': return this.device.audit();
      case 'createInvitation':
        if (user.role !== 'admin' || await this.device.role() !== 'admin') throw Error('Convite exige administrador.');
        if (!this.invitationWriter) throw Error('Emissão de convite indisponível nesta plataforma.');
        return this.invitationWriter(this.device.invitation());
      default: throw Error('Comando não permitido.');
    }
  }
  async previewLegacyImport(state) {
    const user = this.session ? await this.session.require() : await this.device.requireUser();
    if (await this.device.role() !== 'admin' || user.role !== 'admin') throw Error('Somente administrador importa.');
    if (!state || typeof state !== 'object') throw Error('Estado inválido.');
    const records = [];
    for (const entity of ['terceiros', 'empresas', 'treinamentos']) {
      if (!Array.isArray(state[entity])) throw Error(`Lista ausente: ${entity}`);
      const seen = new Set();
      for (const original of state[entity]) {
        // Existing IDs are preserved; invalid/duplicate IDs stop preparation.
        const recordId = String(original?.id ?? '');
        if (!validId(recordId) || seen.has(recordId)) throw Error(`ID inválido ou duplicado: ${entity}`);
        seen.add(recordId);
        records.push({ entity, recordId, value: structuredClone(original) });
      }
    }
    return {
      records, count: records.length, writesPerformed: false,
      warnings: ['Prévia somente: anexos, usuários, histórico e exceções exigem migração própria; nenhuma liberação antiga é importada como autorização.']
    };
  }
}

