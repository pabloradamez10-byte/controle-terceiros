import { ENTITIES, validId } from './protocol.mjs';

// Boundary for the existing SST features. No feature imports Hyperswarm/Corestore.
export class SstRepository {
  constructor(device) { this.device = device; }
  async execute(request) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw Error('Requisição inválida.');
    switch (request.command) {
      case 'status': return { ...this.device.status(), role: await this.device.role(), writerKey: this.device.writerKey };
      case 'get':
      case 'list': {
        // Portaria must use a separate, minimized access projection, not the
        // management dataset. This projection is not implemented in this phase.
        if (!['admin', 'cadastro', 'sesmt'].includes(await this.device.role())) throw Error('Consulta de gestão não autorizada.');
        return request.command === 'get'
          ? this.device.get(request.entity, request.recordId)
          : this.device.list(request.entity);
      }
      case 'put': return this.device.put(request.entity, request.recordId, request.value, request.previous ?? null);
      case 'delete': return this.device.remove(request.entity, request.recordId, request.previous);
      case 'receipt': return this.device.receipt(request.operationId);
      case 'grant': return this.device.grant(request.writerKey, request.role);
      default: throw Error('Comando não permitido.');
    }
  }
  async previewLegacyImport(state) {
    if (await this.device.role() !== 'admin') throw Error('Somente administrador importa.');
    if (!state || typeof state !== 'object') throw Error('Estado inválido.');
    const records = [];
    for (const entity of ENTITIES.filter(entity => entity !== 'excecoes')) {
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

