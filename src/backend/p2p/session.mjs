// Local credentials adapter handles password cryptography. Nothing secret is replicated.
export class SstSession {
  constructor(device, vault, { clock = Date.now, ttlMs = 15 * 60 * 1000 } = {}) {
    this.device = device; this.vault = vault; this.clock = clock; this.ttlMs = ttlMs;
    this.lastUse = 0; this.failures = 0; this.blockedUntil = 0; this.identity = null;
  }
  logout() {
    this.device.setIdentity(null); this.identity?.secretKey.fill(0);
    this.identity = null; this.lastUse = 0;
  }
  async createIdentity(name, password) { return this.vault.create(name, password); }
  async initializeOwner(name, password) {
    this.logout();
    if (this.device.writerKey !== this.device.baseKey || await this.device.base.view.get('policy/owner')) throw Error('Inicialização de administrador indisponível.');
    await this.vault.create(name, password);
    this.identity = await this.vault.unlock(name, password);
    this.device.setIdentity(this.identity);
    try {
      const result = await this.device.bootstrapUser(name);
      if (!result.accepted) throw Error('Administrador não autorizado.');
      this.lastUse = this.clock();
      return { user: await this.device.user(), ...result };
    } catch (error) { this.logout(); throw error; }
  }
  async login(name, password) {
    this.logout();
    if (this.clock() < this.blockedUntil) throw Error('Aguarde antes de tentar entrar novamente.');
    let stage = 'credentials';
    try {
      this.identity = await this.vault.unlock(name, password);
      stage = 'state';
      await this.device.base.update();
      this.device.setIdentity(this.identity);
      stage = 'access';
      const user = await this.device.requireUser();
      if (!await this.device.role()) throw Error('Aparelho não autorizado.');
      this.lastUse = this.clock(); this.failures = 0;
      return user;
    } catch (cause) {
      this.logout(); this.failures++;
      if (this.failures >= 5) { this.blockedUntil = this.clock() + 30000; this.failures = 0; }
      const code = stage === 'state' ? 'AUTH_STATE' : stage === 'access' ? 'AUTH_ACCESS'
        : ['AUTH_STORAGE', 'AUTH_CRYPTO'].includes(cause.code) ? cause.code : 'AUTH_CREDENTIALS';
      const message = {
        AUTH_STORAGE: 'Não foi possível ler a credencial local. Preserve os dados do aplicativo.',
        AUTH_CRYPTO: 'Não foi possível abrir a credencial neste aparelho. Feche e abra o aplicativo.',
        AUTH_STATE: 'Não foi possível atualizar as autorizações locais. Feche e abra o aplicativo.',
        AUTH_ACCESS: 'A credencial foi aberta, mas a autorização local não foi confirmada.',
        AUTH_CREDENTIALS: 'Usuário ou senha inválidos. Confira o e-mail e a senha criada neste APK.'
      }[code];
      throw Object.assign(Error(`${message} [${code}]`), { code });
    }
  }
  async require({ touch = true } = {}) {
    if (!this.identity || this.device.identity !== this.identity || this.clock() - this.lastUse >= this.ttlMs) { this.logout(); throw Error('Entre novamente para continuar.'); }
    const user = await this.device.user();
    if (!user || user.permissions?.consultar === false || !await this.device.role()) { this.logout(); throw Error('Usuário ou aparelho revogado.'); }
    if (touch) this.lastUse = this.clock();
    return user;
  }
  async peek() {
    if (!this.identity || this.device.identity !== this.identity || this.clock() - this.lastUse >= this.ttlMs || !(await this.device.user())?.role || (await this.device.user())?.permissions?.consultar === false || !await this.device.role()) { this.logout(); return false; }
    return true;
  }
}
