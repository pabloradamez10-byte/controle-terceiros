import Hyperbee from 'hyperbee';
import b4a from 'b4a';
import { validateOperation, permission } from './protocol.mjs';
import { verifyOperation } from './signatures.mjs';

export function openView(store) {
  return new Hyperbee(store.get('sst-records-v2'), { keyEncoding: 'utf-8', valueEncoding: 'json' });
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
    const role = member ? member.value.role : writer === root ? 'admin' : null;
    const owner = (await view.get('policy/owner'))?.value;
    const user = typeof op.actor === 'string' ? (await view.get(`user/${op.actor}`))?.value : null;
    const signatureVerified = verifyOperation(op, root, writer);
    let reason = null;
    const changes = [];
    if (!signatureVerified) reason = 'signature-invalid';
    else if (op.kind === 'bootstrap') {
      if (writer !== root || owner) reason = 'bootstrap-denied';
      else {
        await view.put('policy/owner', { userKey: op.actor });
        await view.put(`user/${op.actor}`, { role: 'admin', name: op.name });
      }
    } else if (!user?.role || user.permissions?.consultar === false) reason = 'user-not-authorized';
    else if (!role) reason = 'permission-denied';
    else if (op.kind === 'user') {
      if (role !== 'admin' || user.role !== 'admin') reason = 'permission-denied';
      else if (op.userKey === owner.userKey) reason = 'owner-is-fixed';
      else {
        const previousUser=(await view.get(`user/${op.userKey}`))?.value;
        await view.put(`user/${op.userKey}`, { role: op.role, displayRole: op.role??op.displayRole??previousUser?.displayRole??previousUser?.role??'cadastro', name: op.name, permissions: op.permissions ?? null });
      }
    } else if(op.kind==='transport'){
      const existing=await view.get('transport/'+op.transportKey);
      if(existing&&existing.value.writer!==writer)reason='transport-in-use';
      else await view.put('transport/'+op.transportKey,{writer});
    } else if(op.kind==='enroll'){
      const existing=(await view.get('user/'+op.userKey))?.value;
      if(role!=='admin'||user.role!=='admin')reason='permission-denied';
      else if(await view.get('invite/'+op.inviteId))reason='invite-used';
      else if(await view.get('transport/'+op.transportKey))reason='transport-in-use';
      else if(op.writer===root||await view.get('member/'+op.writer))reason='writer-already-enrolled';
      else if(existing&&(!existing.role||existing.name.toLowerCase()!==op.name.toLowerCase()))reason='identity-mismatch';
      else{
        let duplicate=false;
        for await(const entry of view.createReadStream({gte:'user/',lt:'user0'}))if(entry.value.name.toLowerCase()===op.name.toLowerCase()&&entry.key!=='user/'+op.userKey)duplicate=true;
        if(duplicate)reason='identity-already-exists';
        else{
          await host.addWriter(b4a.from(op.writer,'hex'),{indexer:false});
          await view.put('member/'+op.writer,{role:op.role,label:op.label,transportKey:op.transportKey});
          await view.put('transport/'+op.transportKey,{writer:op.writer});
          if(!existing)await view.put('user/'+op.userKey,{role:op.userRole,name:op.name});
          await view.put('invite/'+op.inviteId,{writer:op.writer,userKey:op.userKey});
        }
      }
    } else if(op.kind==='handover'){
      const target=(await view.get('member/'+op.writer))?.value;
      if(role!=='admin'||user.role!=='admin'||writer!==((await view.get('policy/indexer'))?.value?.writer??root)||target?.role!=='admin'||op.writer===writer)reason='handover-denied';
      else{
        await host.addWriter(b4a.from(op.writer,'hex'),{indexer:true});
        await host.removeWriter(b4a.from(writer,'hex'));
        await host.addWriter(b4a.from(writer,'hex'),{indexer:false});
        await view.put('policy/indexer',{writer:op.writer});
      }
    } else if (op.kind === 'member') {
      if (role !== 'admin' || user.role !== 'admin') reason = 'permission-denied';
      else if(op.role===null&&op.writer===((await view.get('policy/indexer'))?.value.writer??root))reason='transfer-indexer-first';
      else {
        const previous = await view.get(`member/${op.writer}`);
        if (op.role !== null && !previous?.value?.role) await host.addWriter(b4a.from(op.writer, 'hex'), { indexer: false });
        // Keep revoked writers in the authenticated log so their subsequent
        // operations are rejected deterministically on every peer, rather than
        // claiming that revocation erases copies or instantly reaches offline peers.
        await view.put(`member/${op.writer}`, { ...previous?.value, role: op.role });
      }
    } else if (op.kind === 'batch') {
      // Validate the entire UI transaction before changing any record.
      for (const mutation of op.mutations) {
        const capability = mutation.entity === 'excecoes' ? 'liberar' : 'cadastrar';
        if (!permission(role, mutation.entity, mutation.kind) || !permission(user.role, mutation.entity, mutation.kind) || user.permissions?.[capability] === false) { reason = 'permission-denied'; break; }
        const key = `record/${mutation.entity}/${mutation.recordId}`;
        const previous = await view.get(key);
        if ((previous?.value?.revision ?? null) !== mutation.previous) { reason = 'revision-conflict'; break; }
        changes.push({ mutation, key, before: previous?.value?.value ?? null });
      }
      if (!reason) for (const { mutation, key } of changes) await view.put(key, {
        revision: op.id, author: writer, actor: op.actor, deleted: mutation.kind === 'delete',
        value: mutation.kind === 'delete' ? null : mutation.value
      });
    } else if (!permission(role, op.entity, op.kind) || !permission(user.role, op.entity, op.kind) || user.permissions?.[op.entity === 'excecoes' ? 'liberar' : 'cadastrar'] === false) reason = 'permission-denied';
    else {
      const key = `record/${op.entity}/${op.recordId}`;
      const previous = await view.get(key);
      if ((previous?.value?.revision ?? null) !== op.previous) reason = 'revision-conflict';
      else await view.put(key, {
        revision: op.id, author: writer, actor: op.actor, deleted: op.kind === 'delete',
        value: op.kind === 'delete' ? null : op.value
      });
    }
    // Rejections also have receipts; transport success is never treated as approval.
    const receipt = { accepted: reason === null, reason, actor: signatureVerified ? op.actor : null };
    await view.put(receiptKey, receipt);
    await view.put(`audit/${writer}/${op.id}`, {
      ...receipt, writer, operationId: op.id, kind: op.kind,
      entity: op.entity ?? null, recordId: op.recordId ?? null,
      signatureVerified, claimedActor: signatureVerified ? null : op.actor ?? null,
      // Informational client timestamp, never an authoritative ordering/expiry clock.
      reportedAt: typeof op.reportedAt === 'string' ? op.reportedAt : null,
      actorName: signatureVerified ? user?.name ?? (op.kind==='bootstrap'?op.name:null) : null,
      reasonText: typeof op.reason === 'string' ? op.reason : null,
      changes: reason ? [] : changes.filter(c => c.mutation.entity !== 'documentChunks').map(c => ({ entity: c.mutation.entity, id: c.mutation.recordId, kind: c.mutation.kind, before: c.before, after: c.mutation.kind === 'delete' ? null : c.mutation.value }))
    });
  }
}

