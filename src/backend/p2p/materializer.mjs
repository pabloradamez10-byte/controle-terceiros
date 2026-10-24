import Hyperbee from 'hyperbee';
import b4a from 'b4a';
import { validateOperation, permission } from './protocol.mjs';

export function openView(store) {
  return new Hyperbee(store.get('sst-records-v1'), { keyEncoding: 'utf-8', valueEncoding: 'json' });
}

// Autobase may undo/replay this function. No filesystem, clocks, UI or network effects here.
export async function applyOperations(nodes, view, host) {
  for (const node of nodes) {
    if (node.value === null) continue;
    const writer = b4a.toString(node.from.key, 'hex');
    const root = b4a.toString(host.key, 'hex');
    const op = node.value;
    try { validateOperation(op); } catch { continue; }
    const receiptKey = `operation/${writer}/${op.id}`;
    if (await view.get(receiptKey)) continue;
    const member = await view.get(`member/${writer}`);
    const role = writer === root ? 'admin' : member?.value?.role;
    let reason = null;
    if (op.kind === 'member') {
      if (role !== 'admin') reason = 'permission-denied';
      else if (op.writer === root) reason = 'root-is-fixed';
      else {
        const previous = await view.get(`member/${op.writer}`);
        if (op.role !== null && !previous?.value?.role) await host.addWriter(b4a.from(op.writer, 'hex'), { indexer: false });
        // Keep revoked writers in the authenticated log so their subsequent
        // operations are rejected deterministically on every peer, rather than
        // claiming that revocation erases copies or instantly reaches offline peers.
        await view.put(`member/${op.writer}`, { role: op.role });
      }
    } else if (!permission(role, op.entity)) reason = 'permission-denied';
    else {
      const key = `record/${op.entity}/${op.recordId}`;
      const previous = await view.get(key);
      if ((previous?.value?.revision ?? null) !== op.previous) reason = 'revision-conflict';
      else await view.put(key, {
        revision: op.id, author: writer, deleted: op.kind === 'delete',
        value: op.kind === 'delete' ? null : op.value
      });
    }
    // Rejections also have receipts; transport success is never treated as approval.
    await view.put(receiptKey, { accepted: reason === null, reason });
  }
}

