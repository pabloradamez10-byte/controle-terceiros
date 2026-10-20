import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const url = Deno.env.get('SUPABASE_URL') ?? ''
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const origin = 'https://pabloradamez10-byte.github.io'
const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })
  if (!['GET', 'POST'].includes(req.method)) return json({ error: 'Método inválido' }, 405)
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'Faça login novamente' }, 401)
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } })
    const { data: auth, error: authError } = await userClient.auth.getUser(token)
    if (authError || !auth.user) return json({ error: 'Sessão inválida' }, 401)
    const { data: actor, error: actorError } = await userClient.from('sst_members').select('role,ativo').eq('user_id', auth.user.id).single()
    if (actorError) { console.error('sst-usuarios actor:', actorError); return json({ error: 'Falha ao verificar permissões' }, 500) }
    if (actor?.role !== 'admin' || !actor.ativo) return json({ error: 'Somente ADM pode gerenciar usuários' }, 403)
    const admin = createClient(url, serviceKey)

    if (req.method === 'GET') {
      const { data, error } = await admin.from('sst_members').select('user_id,email,role,permissoes,ativo').order('email')
      if (error) throw error
      return json({ users: data })
    }

    const body = await req.json()
    const reason = String(body.motivo || '').trim()
    if (reason.length < 3 || reason.length > 1000) return json({ error: 'Informe o motivo (3 a 1000 caracteres)' }, 400)
    if (body.action === 'delete') {
      const userId = String(body.user_id || '')
      if (userId === auth.user.id) return json({ error: 'Você não pode excluir seu próprio acesso' }, 400)
      const { data: target, error: targetError } = await admin.from('sst_members').select('user_id').eq('user_id', userId).single()
      if (targetError || !target) return json({ error: 'Usuário não encontrado' }, 404)
      const { error: memberDeleteError } = await userClient.rpc('sst_save_member', { p_data: {user_id:userId}, p_reason:reason, p_delete:true })
      if (memberDeleteError) throw memberDeleteError
      const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId)
      if (authDeleteError) return json({ error: 'Acesso removido e auditado. Falhou a exclusão da conta de autenticação.' }, 500)
      return json({ ok: true })
    }
    const email = String(body.email || '').trim().toLowerCase()
    const role = String(body.role || '')
    const allowedRoles = ['admin', 'cadastro', 'sesmt', 'portaria']
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !allowedRoles.includes(role)) return json({ error: 'E-mail ou perfil inválido' }, 400)
    const permissions = {
      consultar: body.permissoes?.consultar === true,
      cadastrar: body.permissoes?.cadastrar === true,
      liberar: body.permissoes?.liberar === true,
    }
    if (!permissions.consultar && (permissions.cadastrar || permissions.liberar)) return json({ error: 'Cadastrar e liberar exigem consulta' }, 400)
    if (role === 'admin' && !Object.values(permissions).every(Boolean)) return json({ error: 'ADM precisa das três permissões' }, 400)
    const active = body.ativo !== false
    const { data: existing } = await admin.from('sst_members').select('user_id').ilike('email', email).maybeSingle()
    if (existing?.user_id === auth.user.id && (!active || role !== 'admin')) return json({ error: 'O administrador não pode retirar o próprio acesso' }, 400)
    let userId = existing?.user_id
    let needsInvite = false
    if (!userId) {
      for (let page = 1; page <= 10 && !userId; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 })
        if (error) throw error
        const found = data.users.find(u => u.email?.toLowerCase() === email)
        if (found) { userId = found.id; needsInvite = !found.email_confirmed_at }
        if (data.users.length < 100) break
      }
      if (!userId) {
        // Save the account independently of email delivery. No password or
        // email confirmation is granted before the recipient accepts the invite.
        const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: false })
        if (error || !data.user) throw error || new Error('Conta não criada')
        userId = data.user.id
        needsInvite = true
      }
    } else {
      const { data, error } = await admin.auth.admin.getUserById(userId)
      if (error) throw error
      needsInvite = !data.user.email_confirmed_at
    }
    const { error } = await userClient.rpc('sst_save_member', { p_data:{ user_id:userId,email,role,permissoes:permissions,ativo:active },p_reason:reason,p_delete:false })
    if (error) throw error
    let invited = false
    let invitationPending = false
    if (needsInvite && active) {
      const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: origin + '/controle-terceiros/' })
      if (inviteError) {
        console.warn('sst-usuarios convite pendente:', inviteError.code || inviteError.status)
        invitationPending = true
      } else {
        invited = true
      }
    }
    return json({ ok: true, invited, invitationPending,
      message: invitationPending
        ? 'Usuário salvo. O convite não foi enviado agora; tente Salvar usuário mais tarde para reenviar. A pessoa precisa definir a senha antes de entrar.'
        : invited ? 'Usuário salvo e convite enviado.' : 'Permissões atualizadas.' })

  } catch (error) {
    console.error('sst-usuarios:', error)
    return json({ error: 'Não foi possível salvar o usuário' }, 500)
  }
})
