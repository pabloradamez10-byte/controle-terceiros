# SST Android de homologação

O código fonte agora inclui a etapa multiaparelho descrita em [MULTIDEVICE.md](MULTIDEVICE.md). As evidências de APK abaixo são históricas da versão 0.1.1; nenhum APK desta etapa nova foi gerado.

Revisão atual: **SST Homologação 2**, versão 0.1.1, pacote `br.com.atlas.sst.homologacao.revisao2`. Instala em paralelo e começa com conta própria, preservando o aplicativo anterior. Investigação do login, limites e evidências desta revisão em [LOGIN-REVISAO-0.1.1.md](LOGIN-REVISAO-0.1.1.md). A causa relatada no celular físico ainda não foi confirmada.

O primeiro aplicativo usou `br.com.atlas.sst.homologacao`, nome **SST Homologação**. Reutiliza a interface isolada e o núcleo P2P real dentro de um Worklet Bare Kit. Não depende de servidor Node no notebook ou de site hospedado para funcionar. O primeiro APK é para dados fictícios e testes em um aparelho; descoberta/sincronização entre aparelhos permanece desabilitada nesta entrada, como no adaptador anterior.

## Fontes e compilação

`android/` é o proprietário da Activity Java, da ponte WebMessage e da entrada Bare. `android/scripts/prepare.cjs` reutiliza `scripts/p2p/build-ui.cjs` e gera interface/core em assets ignorados pelo Git. O projeto web padrão não muda de backend. As bibliotecas nativas vêm de seus pacotes existentes, ligadas por `patchelf`; a distribuição Bare Kit 2.5.5 é verificada por SHA-256 antes da extração. O exemplo oficial `holepunchto/bare-android` orientou Gradle/Worklet; código da aplicação e controles locais são próprios. Avisos/licenças em `android/THIRD_PARTY.md`.

```sh
npm ci
npm ci --prefix android
npm run build
node android/scripts/smoke.cjs
python3 deploy/internal/download-assets.py /CAMINHO/ocr-assets
python3 android/scripts/fetch-kit.py
SST_OCR_ASSETS=/CAMINHO/ocr-assets node android/scripts/prepare.cjs
python3 -m venv /CAMINHO/elf-tools
/CAMINHO/elf-tools/bin/pip install patchelf==0.19.1.0
PATCHELF=/CAMINHO/elf-tools/bin/patchelf node android/scripts/link-addons.cjs
node android/scripts/check-addons.cjs
cd android
./gradlew :app:assembleDebug :app:connectedDebugAndroidTest
```

A compilação exige JDK 17 e Android SDK 35. A workflow `android-homologacao.yml` faz isso num ambiente separado e somente na branch de homologação. Não publica produção. APK de teste assinado com chave debug do ambiente: não é uma política estável de assinatura de atualizações; resolver assinatura persistente antes de uso real. Não desinstalar uma versão com dados importantes para atualizar; desinstalar apaga os dados locais.

## Proteções e limites

- WebView usa origem local HTTPS `appassets.androidplatform.net`, arquivos empacotados e WebMessage limitado à origem e frame principal. Não usa servidor HTTP, `addJavascriptInterface`, acesso `file://` nem ponte para páginas externas. Navegação e requisições externas são bloqueadas.
- A sessão e autorização continuam no núcleo. A ponte valida tamanho, identifica respostas e descarta respostas de páginas anteriores. Pausa normal limpa a tela e solicita logout; a volta reconstrói a tela após o bloqueio. O seletor de arquivo do sistema mantém a operação de anexar, com expiração ainda verificada pelo núcleo.
- Dados ficam no armazenamento privado da aplicação e o backup automático Android/transferência está desabilitado. A chave do grupo ainda é um arquivo privado do protótipo; proteção adicional via Keystore não foi implementada. Não prometer resistência contra root/extração do aparelho.
- Portaria consulta todos os terceiros e visualiza documentos; escrita/download/exportação são recusados. Entrada permanece **NÃO CONFIRMADO**, sem prova temporal independente. Não usar na portaria real.
- Não há migração de dados/contas reais, recuperação/rotação de identidade, importação de backup nem substituição segura do indexador. Redes diferentes e segundo plano Android continuam pendentes.

## Testes

O teste Bare de computador executa cofre, Argon2id, gravações assinadas, anexos e integridade, reabertura e bloqueios de Portaria nas mesmas fontes. A entrada Bare usa apenas as bibliotecas de arquivo/caminho/texto necessárias; SHA-256 reutiliza sodium-native. O inventário confere todas as bibliotecas nativas exigidas pelo bundle para as duas arquiteturas. O adaptador de arquivos acrescenta `readFile/writeFile` ao FileHandle Bare mantendo o fd exclusivo; o adaptador de texto fornece latin1 usado pelo validador existente.

O teste instrumentado Android é separado: inicia o APK num emulador, cria conta pelo formulário, salva empresa/terceiro pelas telas, renderiza PDF em canvas, troca para Portaria, verifica bloqueios e reabre o aplicativo preservando os registros. Evidência final de compilação/emulador deve ser conferida na execução da workflow; existir o código de teste não comprova aprovação. Teste no celular de Pablo, seleção de anexos, teclado/rotação e redes diferentes exigem validação física posterior.

Backup `backup/pre-p2p-2026-10-24-3a53c18` e main permanecem preservados. As credenciais de teste são geradas apenas durante os ensaios; não há senha embutida no APK.

A primeira tentativa no emulador identificou corrupção de `.dynsym` pelo linker LIEF (mesmo sintoma do [issue 1309](https://github.com/lief-project/LIEF/issues/1309)). O empacotador passou a editar SONAME/NEEDED com patchelf 0.19.1.0 e verificar as tabelas de símbolos com readelf, sem alterar a implementação criptográfica.

## Resultado confirmado do APK 0.1.0

Código compilado: `5211d6535ad04c33ac79be012b1e688c5e933059`. A [execução Android 40159780237](https://github.com/pabloradamez10-byte/controle-terceiros/actions/runs/40159780237) concluiu com sucesso: compilação, cofre e banco reais no Bare, inventário/símbolos ELF, instalação no emulador Android 15 x86_64 e cenário instrumentado completo (1 aprovado, 0 falhas/pulos). A suíte existente/P2P também passou na checagem separada com assets verificados.

Foram conferidas as capturas de login, PDF e Portaria. O teste exige overlay visível, pixels do PDF desenhados, controles de exportação ocultos e rejeição real de escrita/download para Portaria; a reabertura confirmou persistência e novo login. O teste não comprova uso num aparelho físico arm64, seleção de arquivo, rotação ou ciclo de suspensão do sistema.

APK de 193.599.956 bytes, SHA-256 `34166846e47f6d13a147f0245adb8e9ace2dd8b525e3dd17830f0c0cdfe7774b`. O instalador contém arm64-v8a e x86_64. Nenhuma credencial de teste fica embutida; o administrador inicial é criado explicitamente na primeira abertura. Main e backup foram novamente conferidos no commit preservado.
