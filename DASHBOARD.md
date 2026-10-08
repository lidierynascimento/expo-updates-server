# Painel OTA

## Implantação
Usar a branch main após integração. Dockerfile e contexto na raiz. Porta 3000.
Manter volume /app/updates, com permissões para UID/GID 1000:1000.

```env
HOSTNAME=https://expo.vdigitalslab.com
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=SUBSTITUA_POR_UMA_SENHA_FORTE
NEXT_TELEMETRY_DISABLED=1
```

Não guardar senha no Git. O login usa sessão de 8 horas com cookie Secure/HttpOnly/SameSite.
O limite de tentativas fica na memória de uma instância e reinicia com o processo.
Este painel foi preparado para um administrador e uma instância do serviço.

## Projetos
Entrar no painel, clicar em Novo projeto e informar nome e slug no modal.
Os cards abrem a visão geral do aplicativo. O seletor e o menu lateral mantêm
credenciais, tokens, dispositivos e variáveis separados por projeto.
Cada projeto tem diretório próprio e URL de manifesto mostrada em Configuração.
O aplicativo legado mantém a URL sem project; os novos usam ?project=SLUG.
Alterar updates.url no aplicativo exige um novo build nativo.

## Publicar
No computador do projeto Expo:

```sh
npx expo export --platform all --output-dir dist
npx expo config --type public --json > dist/expoConfig.json
```

O expoConfig.json deve conter runtimeVersion como string, igual ao runtime informado.
Se o projeto usa uma política de runtime, use o runtime efetivamente resolvido pelo build.
Selecionar o projeto, informar runtime, escolher a pasta dist e publicar.
Limite desta versão: 32 MB e 3000 arquivos por export. Upload é pela pasta, não ZIP.
Os metadados, bundles e assets são validados antes de gravar. O diretório final é ativado
por rename após a gravação completa. Cada publicação passa a ser a mais recente do runtime.
Isso altera o que todos os clientes desse projeto/runtime recebem.

## Rollback
Voltar à versão instalada publica a diretiva rollBackToEmbedded para o runtime.
Ela exige protocolo Expo Updates 1 e volta ao bundle embarcado, não a qualquer release histórica.
Há confirmação antes da operação. As versões existentes são preservadas.

## Escopo
Inclui login/sair, projetos, publicação, histórico, endpoint por projeto e rollback ao bundle embarcado.
Não inclui builds APK/IPA, SSO, membros, billing, canais, rollout percentual ou métricas de instalação.
O estado de metadados disponíveis não comprova instalação no celular.
Assinatura OTA exige chave privada própria montada e certificado correspondente no app.

## Configurações por projeto
- Credenciais Android e iOS: guardar, consultar, baixar e excluir JKS/keystore/P12/mobileprovision (até 2 MB). A assinatura e a validade do arquivo não são verificadas e o arquivo não é aplicado automaticamente a builds.
- Variáveis: guardar por ambiente (development/preview/production), consultar e excluir. Não há injeção automática em exports/builds. EXPO_PUBLIC_ será público se incorporado ao aplicativo.
- Dispositivos Apple: cadastrar nome e UDID localmente; isso não registra o dispositivo no portal Apple Developer.
- Tokens: criar com validade de 30, 90 ou 365 dias e revogar. O token completo aparece apenas uma vez; somente seu hash fica armazenado.

Arquivos de credenciais, senhas e valores de variáveis são criptografados com AES-256-GCM.
A chave é gerada no servidor e persistida em /app/updates/.admin/master-key (permissão 0600).
Faça backup do volume completo, incluindo .admin e a chave; perder a chave impede recuperar esses segredos.
A criptografia não protege contra alguém com acesso completo ao servidor ou ao backup com a chave.
As APIs de consulta de segredos exigem a sessão do administrador e a origem do painel.

## Publicação com token
Enviar POST /api/admin/releases com Authorization: Bearer TOKEN e JSON:

```json
{"action":"publish","project":"SLUG","runtime":"1.0.0","files":[{"path":"metadata.json","data":"BASE64"}]}
```

O exemplo ilustra o formato: enviar também expoConfig.json, bundles e assets do export completo.
O token só permite publicar no próprio projeto; não permite rollback nem acesso às configurações.
Um workflow GitHub Actions pode chamar essa API, mas nenhum workflow de publicação foi conectado automaticamente.

## Verificação
Testes: node --test tests/admin.test.cjs tests/settings.test.cjs
Build: npm ci && npm run build
Validar a entrega com um app de teste antes de publicar para passageiros.
