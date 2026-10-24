import Corestore from 'corestore';
import Autobase from 'autobase';
import Hyperswarm from 'hyperswarm';
import crypto from 'hypercore-crypto';
import b4a from 'b4a';
import { openView, applyOperations } from './materializer.mjs';
import { PROTOCOL, validKey, validId, ENTITIES, permission, validateOperation } from './protocol.mjs';

const hex = value => b4a.toString(value, 'hex');
const unhex = value => b4a.from(value, 'hex');

export class SstDevice {
  static async open({ directory, invitation, encryptionKey, network = false }) {
    if (invitation && (invitation.protocol !== PROTOCOL || !validKey(invitation.baseKey) || !validKey(invitation.encryptionKey))) throw Error('Convite inválido.');
    const secret = invitation?.encryptionKey ?? encryptionKey;
    if (secret && !validKey(secret)) throw Error('Chave inválida.');
    if (!secret) throw Error('Chave de armazenamento obrigatória.');
    const store = new Corestore(directory);
    let base;
    try {
      base = new Autobase(store, invitation ? unhex(invitation.baseKey) : null, {
        open: openView, apply: applyOperations, valueEncoding: 'json',
        encryptionKey: unhex(secret), ackInterval: 100
      });
      await base.ready();
      const device = new SstDevice(store, base, secret);
      if (network) await device.startNetwork();
      return device;
    } catch (error) { await base?.close().catch(() => {}); await store.close().catch(() => {}); throw error; }
  }
  constructor(store, base, secret) {
    this.store = store; this.base = base; this.secret = secret; this.swarm = null;
    this.connections = new Set(); this.lastNetworkError = null;
  }
  get writerKey() { return hex(this.base.local.key); }
  get baseKey() { return hex(this.base.key); }
  // This descriptor contains a secret. Hand off out of band; never put in URLs or logs.
  invitation() { return { protocol: PROTOCOL, baseKey: this.baseKey, encryptionKey: this.secret }; }
  async role() {
    if (this.writerKey === this.baseKey) return 'admin';
    return (await this.base.view.get(`member/${this.writerKey}`))?.value?.role ?? null;
  }
  async grant(writer, role) {
    if (await this.role() !== 'admin') throw Error('Somente administrador autoriza aparelhos.');
    return this.append({ kind: 'member', writer, role });
  }
  async append(fields) {
    const op = validateOperation({ ...fields, protocol: PROTOCOL, id: hex(crypto.randomBytes(16)) });
    await this.base.append(op);
    await this.base.update();
    return { id: op.id, ...await this.receipt(op.id) };
  }
  async put(entity, recordId, value, previous = null) {
    if (!permission(await this.role(), entity)) throw Error('Perfil sem permissão de escrita.');
    return this.append({ kind: 'put', entity, recordId, value, previous });
  }
  async remove(entity, recordId, previous) {
    if (!permission(await this.role(), entity)) throw Error('Perfil sem permissão de escrita.');
    return this.append({ kind: 'delete', entity, recordId, previous });
  }
  async get(entity, recordId) {
    if (!ENTITIES.includes(entity) || !validId(recordId)) throw Error('Registro inválido.');
    return (await this.base.view.get(`record/${entity}/${recordId}`))?.value ?? null;
  }
  async list(entity) {
    if (!ENTITIES.includes(entity)) throw Error('Entidade inválida.');
    const rows = [];
    for await (const { key, value } of this.base.view.createReadStream({ gte: `record/${entity}/`, lt: `record/${entity}0` })) {
      if (!value.deleted) rows.push({ id: key.slice(`record/${entity}/`.length), ...value });
    }
    return rows;
  }
  async receipt(id, writer = this.writerKey) {
    if (!validId(id) || !validKey(writer)) throw Error('Operação inválida.');
    const entry = await this.base.view.get(`operation/${writer}/${id}`);
    if (!entry) return { accepted: null, reason: 'awaiting-indexer', finalized: false };
    // A local view may be speculative and later reordered by Autobase.
    // Only a receipt within the signed view prefix is stable.
    return { ...entry.value, finalized: entry.seq < this.base.view.core.signedLength };
  }
  replicationStream(initiator) { return this.store.replicate(initiator); }
  async startNetwork(options = {}) {
    if (this.swarm) return;
    const swarm = new Hyperswarm(options);
    this.swarm = swarm;
    swarm.on('error', error => { this.lastNetworkError = error.code ?? 'network-error'; });
    swarm.on('connection', socket => {
      this.connections.add(socket);
      socket.on('error', error => { this.lastNetworkError = error.code ?? 'connection-error'; });
      socket.on('close', () => this.connections.delete(socket));
      this.store.replicate(socket);
    });
    this.discovery = swarm.join(this.base.discoveryKey, { server: true, client: true });
    // No unbounded flushed() wait: an unavailable network must not block local use.
  }
  status() {
    return { mode: 'homologacao', protocol: PROTOCOL, networkStarted: !!this.swarm,
      peers: this.connections.size, lastNetworkError: this.lastNetworkError,
      signedLength: this.base.signedLength, localLength: this.base.length,
      productionReady: false };
  }
  async close() {
    await this.swarm?.destroy(); this.swarm = null;
    await this.base.close(); await this.store.close();
  }
}

