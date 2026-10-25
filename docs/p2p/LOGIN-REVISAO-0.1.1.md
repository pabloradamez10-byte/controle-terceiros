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

Build APK e instrumentação Android desta revisão: verificar o resultado do workflow do commit. Não declarar que a falha do aparelho físico foi resolvida sem reproduzir ou validar naquele aparelho.
