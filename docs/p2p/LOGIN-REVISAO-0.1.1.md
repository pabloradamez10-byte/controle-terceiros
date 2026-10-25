# Revisão Android 0.1.1 — investigação do login

Pablo relatou que a mesma senha do primeiro acesso foi recusada após sair, sem editar usuários. A mensagem da versão 0.1.0 agrupava falha de credencial, leitura de arquivo, criptografia, leitura de estado e autorização. A causa específica no aparelho físico ainda não foi reproduzida nem confirmada.

## Mudanças

- Atualizar a projeção Autobase antes de consultar a autorização no login.
- Separar erros por códigos fixos AUTH_CREDENTIALS, AUTH_STORAGE, AUTH_CRYPTO, AUTH_STATE e AUTH_ACCESS, sem expor senha, chaves, arquivos ou mensagens nativas.
- Mostrar senha opcionalmente e serializar tentativas na tela. A senha continua sendo apagada após a tentativa; falhas continuam bloqueando o acesso.
- Testar administrador após logout, senha incorreta e reabertura, além da Portaria.

## Preservação

A primeira versão foi assinada com chave debug temporária de um runner que não foi preservada. Esta revisão usa applicationId `br.com.atlas.sst.homologacao.revisao2`, nome SST Homologação 2 e instalação paralela. Não substitui, não lê e não apaga os dados privados da primeira instalação. Exige criar uma conta de teste própria. Não recupera automaticamente o acesso ou os cadastros da versão anterior. Não desinstalar nem limpar os dados da primeira instalação.

Não altera main nem backup/pre-p2p-2026-10-24-3a53c18. Não utiliza dados reais. Assinatura estável, migração entre instalações, recuperação de identidade, rede entre aparelhos e validação física continuam pendentes.

## Verificação local

- npm run build: passou.
- npm test com SST_TEST_OCR_ASSETS: passou, 13 testes P2P sem falhas e sem skips, além das verificações existentes.
- node android/scripts/smoke.cjs: passou no Bare real, inclusive mesma identidade do administrador após logout e reabertura.
- Teste de encerramento abrupto: processo filho cria administrador e registro, é encerrado com SIGKILL, novo processo reabre, valida a mesma identidade e registro; senha errada é recusada sem modificar a credencial.

## APK final verificado

- Código compilado: `a8f00e73260c40c8c94e47650455d75492a7f779`.
- CI Android: https://github.com/pabloradamez10-byte/controle-terceiros/actions/runs/40244915751 — passou.
- CI regressão: https://github.com/pabloradamez10-byte/controle-terceiros/actions/runs/40244915737 — passou.
- Instrumentação Android 15 x86_64: 1 teste, 0 falhas, 0 erros, 0 skips; 27,147 segundos. Administrador após logout/reabertura, senha incorreta/duplo envio, dados preservados, PDF e Portaria.
- Captura da tela final de login inspecionada: nome da revisão e mostrar senha alinhados.
- Artefato APK: `12618571356`, nome `SST-homologacao-0.1.1`.
- Artefato de resultados: `12618860673`.
- APK: 193.600.912 bytes, SHA-256 `eae56068374acdcf98d070f8e79904cbe7de6b628757b7a70a2021a65d5e79fb`.
- Download GitHub (ZIP contendo app-debug.apk): https://github.com/pabloradamez10-byte/controle-terceiros/actions/runs/40244915751/artifacts/12618571356

A causa da falha do aparelho físico continua sem confirmação. Esta revisão melhora atualização de autorização e diagnóstico; não declarar a falha física corrigida sem validar no celular de Pablo.
