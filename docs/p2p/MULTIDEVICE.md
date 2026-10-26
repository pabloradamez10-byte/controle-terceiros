# SST: fonte compartilhada para PC e Android

## Escopo desta entrega

Somente código na branch `homologacao/p2p-local-first`. Nenhum APK, instalador, chave de assinatura ou dado real deve ser gerado ou migrado nesta etapa. Main e backup original permanecem em `3a53c180bd90e28fc5edeae9db66281d9c447430`.

## Organização e bibliotecas

- `src/platform/native/runtime.mjs`: ciclo de vida, perfis, fila serial de comandos, troca de grupo somente após aprovação e manutenção.
- `pairing.mjs`: `blind-pairing` 2.3.1 / `blind-pairing-core` 2.10.1 para convites, provas, resposta cifrada e descoberta HyperDHT. `qrcode-generator` 2.0.4 gera o QR; `jsqr` 1.4.0 lê imagens localmente. Não há câmera ao vivo nem envio de imagem a um serviço.
- `identity-vault.mjs`: Argon2id e XChaCha20-Poly1305 existentes; kit de recuperação transfere a mesma identidade Ed25519 para outra senha/aparelho.
- `sealed-store.mjs`: arquivos privados com escrita temporária, fsync e publicação atômica; exclusividade por hard link. No Windows o inicializador aplica ACL da conta atual; verificação POSIX de modo não é usada como se fosse ACL Windows.
- `journal.mjs`: intenção assinada cifrada antes de append; reenvio idempotente após interrupção e recibos de confirmação/conflito.
- `checkpoints.mjs`: cópias cifradas com objetos endereçados por conteúdo, sem duplicar os bytes de documentos em cada versão; somente estados assinados e disponíveis localmente. A prévia de recuperação não apaga registros atuais adicionais nem ressuscita liberações por exceção.
- `src/backend/p2p/*`: validação determinística de operações, convite de uso único, usuário + aparelho, revogação e transferência planejada de indexação.
- `src/backend/p2p-ui/devices.js`: telas nativas de vinculação, recuperação, rede, cópias e revisão de conflitos. Não é carregado no web backend anterior.
- `scripts/p2p/desktop.mjs`: processo local do PC, com interface no navegador exclusivamente em 127.0.0.1. O PC executa seu próprio núcleo; não há servidor central de dados. Ainda é fonte Node, não instalador Windows pronto.
- `android/worklet.mjs`: mesma implementação compartilhada dentro de Bare. `MainActivity.java` salva exclusivamente os artefatos de vinculação/recuperação aprovados pelo núcleo através de ACTION_CREATE_DOCUMENT. Não abre download genérico de documentos nem aceita conteúdo arbitrário para exportar.

Referências primárias: https://github.com/holepunchto/blind-pairing ; https://github.com/holepunchto/blind-pairing-core ; https://github.com/holepunchto/hyperswarm ; https://github.com/holepunchto/autobase . A lógica de aplicação é própria; criptografia, transporte, ordenação e QR são bibliotecas existentes.

## Vinculação

1. Administrador em aparelho autorizado cria convite, por rede ou arquivo. Validade de 10 minutos, uma aprovação; reiniciar o emissor invalida convites ainda não aprovados.
2. Aparelho sem grupo prepara identidade e writer locais e lê QR por imagem, cola código ou abre JSON. Identidade existente requer kit e código; uma senha não é enviada ao outro aparelho.
3. A tela mostra código de conferência derivado do pedido assinado. O candidato confirma o código e envia; pode salvar pedido JSON cifrado para transporte manual.
4. O administrador confere nome/aparelho/código e escolhe o limite do aparelho e perfil de uma identidade nova. Identidades existentes conservam permissões. Código errado, convite expirado/reutilizado, identidade revogada e writer já matriculado são recusados.
5. O núcleo registra autorização assinada e só então libera resposta cifrada contendo os dados necessários à replicação. A resposta por arquivo também é cifrada pela biblioteca. O novo aparelho conclui e passa a usar um perfil novo; o perfil anterior não é apagado ou sobrescrito.
6. Após a primeira sincronização, cada pessoa entra com senha local. Vinculação não significa login automático.

O convite contém uma capacidade temporária; não contém senha pessoal nem a chave do grupo em claro. Não publicá-lo em site, log ou repositório. O grupo já existente é recusado como alvo de substituição pela tela de vinculação.

## Rede e permissões

A descoberta usa infraestrutura DHT externa; dados persistem nos aparelhos. Não se promete comunicação direta em qualquer NAT, firewall, rede corporativa ou dados móveis. Redes distintas, suspensão do Android e necessidade de retransmissão externa exigem teste físico posterior.

Cada aparelho tem identidade Noise persistida. A replicação é iniciada somente para uma identidade de transporte matriculada e não revogada; o primeiro sincronismo admite exclusivamente o patrocinador recebido na resposta cifrada. A revogação é reavaliada nas conexões durante manutenção. Operações continuam assinadas pelo usuário e vinculadas ao writer/grupo, com limite do perfil do aparelho. Portaria permanece consulta e visualização; escrita, exportação de documentos, cópias e administração são negadas no núcleo.

A sincronização não apaga remotamente dados já recebidos por um aparelho revogado e não promete impedir screenshots/root/extração por quem controla o sistema operacional. As duas réplicas compartilham os dados cifrados do grupo; a restrição de download do aplicativo não é DRM.

## Dois aparelhos, offline e confirmação

Autobase distingue alteração local/provisória de prefixo assinado definitivo. Somente checkpoints assinados são anunciados como cópias preservadas. A interface informa conexões, atualização recebida, pendências, conflitos e cópias; conexão por si só não significa sincronização completa. A manutenção solicita download dos blocos confirmados para a réplica local.

Com dois aparelhos não há failover automático seguro durante uma partição: não há como ambos confirmarem ordens diferentes e simultaneamente manter uma única ordem definitiva. Um não indexador preserva intenções assinadas cifradas, reapresenta após reconexão e trata conflito de revisão. Não há sobrescrita silenciosa nem anúncio de sucesso definitivo enquanto aguarda confirmação.

É possível transferir a indexação de forma planejada a outro aparelho administrador, com os dois conectados. Depois da transferência confirmada, o novo indexador confirma alterações com o criador desligado. Revogar o aparelho indexador exige transferir primeiro. O antigo criador pode ser revogado depois da transferência; sua antiga identidade de aparelho não conserva uma exceção permanente de acesso. Recuperação de perda inesperada do indexador ainda exige um procedimento específico; não há eleição automática, nem essa limitação deve ser escondida.

## Recuperação e cópias

O kit pessoal e um código aleatório separado permitem regravar a credencial mantendo a mesma chave pública, registros e permissões. O código não é enviado por e-mail nem recuperável pelo aplicativo; guardar arquivo e código separados. Quem possui os dois controla a identidade. A senha nova não revoga kits antigos: rotação da identidade criptográfica exige outro procedimento. Credenciais antigas preservadas para segurança da escrita ficam encapsuladas sob a senha nova, não legíveis somente com a senha antiga.

Checkpoints internos são históricos cifrados do estado confirmado, feitos antes/depois de alterações e durante manutenção. A restauração requer administrador, prévia, revisão atual e motivo, e cria novas operações auditáveis. Não restaura permissões nem exceções de entrada e não exclui cadastros atuais adicionais. Alterações grandes demais para um lote (500 mutações/128 KiB) são recusadas integralmente; restauração geral fracionada e importação de catástrofe não estão implementadas. Perder os dois aparelhos e suas chaves não é resolvido apenas por esse histórico interno; exportação completa externa cifrada ainda precisa de um fluxo próprio.

## PC e assinatura

Preparar interface: `SST_OCR_ASSETS=/caminho/verificado SST_NATIVE_UI_OUT=/caminho/ui npm run desktop:prepare`. Iniciar: `SST_DESKTOP_UI=/caminho/ui npm run desktop:start`. Node >=22 e dependências nativas necessários nesta fase; empacotamento em instalador será etapa posterior. O diretório padrão é LOCALAPPDATA/SST-Homologacao no Windows, ou ~/.local/share/SST-Homologacao nos demais sistemas. SST_DESKTOP_DATA pode selecionar outro perfil.

A configuração release exige SST_ANDROID_KEYSTORE e SST_ANDROID_STORE_PASSWORD, com SST_ANDROID_KEY_ALIAS / SST_ANDROID_KEY_PASSWORD opcionais. `android/scripts/create-signing-key.py` é uma ação explícita futura de operador, não executada automaticamente. A chave precisa de cópia externa cifrada e acesso restrito antes de qualquer APK. Não recupera assinaturas debug perdidas das versões anteriores, não implica atualização compatível delas e não foi criada nesta entrega.

`android-homologacao.yml` passa a ser somente workflow_dispatch. Os checks de fonte compilam Java e exercitam Bare sem empacotar APK.

## Validação

Registrar resultados finais em TEST_RESULTS.json e no PR. Separar os testes locais (criptografia, streams reais, Bare, telas JSDOM), a DHT local real do CI, a compilação Java sem APK e testes físicos ainda pendentes. A falha de login relatada na primeira instalação não deve ser declarada reproduzida ou corrigida no celular apenas pelos testes novos.
