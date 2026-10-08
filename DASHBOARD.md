# vDeploy — Painel OTA

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
Testes: node --test tests/admin.test.cjs tests/settings.test.cjs tests/account.test.cjs
Build: npm ci && npm run build
Validar a entrega com um app de teste antes de publicar para passageiros.

## Minha conta
No menu lateral, abrir **Minha conta** para editar o nome de exibição e o e-mail de contato.
O e-mail é informativo: não há confirmação, notificações ou recuperação de acesso por e-mail.
O usuário de login continua definido por DASHBOARD_USERNAME no EasyPanel.

A senha inicial vem de DASHBOARD_PASSWORD. Depois de alterada pelo painel, vale a senha
armazenada como hash scrypt (com salt aleatório) no volume, nunca em texto puro.
As duas variáveis de ambiente continuam obrigatórias; editar DASHBOARD_PASSWORD não
substitui uma senha já alterada no painel. Não remover o volume ao implantar.
Alterar a senha ou encerrar todas as sessões exige a senha atual e invalida todas as
sessões de navegador, incluindo a atual. Os tokens dos projetos têm revogação separada.
A sessão dura no máximo 8 horas. Ainda não há OAuth, passkeys nem autenticação em dois fatores.

Perfil, hash e versão das sessões ficam em /app/updates/.admin/account/profile.json,
com permissão 0600. Essa configuração pertence à conta do servidor, não a um projeto.
Para recuperar um acesso perdido: pare o serviço no EasyPanel, faça backup privado desse
arquivo e remova somente profile.json; configure uma nova DASHBOARD_PASSWORD forte e
reinicie o serviço. Isso restaura o perfil padrão e a senha inicial, preservando projetos,
credenciais e tokens. Trocar também a variável é necessário para invalidar cookies antigos.

A identidade vDeploy inclui marca vetorial, favicon e nome no login e na navegação.
As mudanças do dashboard são registradas em commits descritivos em feat/ota-dashboard,
validadas e integradas à main, que permanece como branch de implantação.

## Conectar aplicativo
Ao criar um projeto, a visão geral abre o bloco **Conectar aplicativo**.
Ele também permanece disponível nos projetos existentes. As abas OpenCode, PowerShell,
Bash / macOS, Expo / app.json e React Native CLI mostram conteúdo com o slug e a URL
baseada em HOSTNAME. O botão Copiar copia a aba selecionada; se a área de transferência
estiver indisponível, o texto pode ser selecionado manualmente.

A aba OpenCode contém um prompt para configurar o repositório existente e registrar
um commit. As abas de terminal orientam instalação e exportação; não substituem
app.json automaticamente. O runtime sugerido é editável e não altera o projeto ou o
aplicativo. Configurações dinâmicas, políticas de runtime e projetos nativos manuais
precisam ser adaptados ao build real. Um novo build instalado e uma atualização visível
são necessários para comprovar a conexão. Nenhum token ou senha entra no prompt.

## Excluir projeto
Em **Configurações > Excluir projeto**, digite o slug exato e a senha atual.
A operação remove permanentemente bundles/assets, histórico, credenciais, tokens,
variáveis e dispositivos do projeto. Não remove o GitHub, outros projetos, o perfil
administrativo ou a chave compartilhada de criptografia. Não há restauração pelo painel.
Apps instalados deixam de receber atualizações desse projeto; a exclusão não desinstala
nem apaga o conteúdo já armazenado no dispositivo. Reutilizar um slug faz os apps antigos
continuarem apontando para esse endereço: use outro slug para um aplicativo diferente.

Operações administrativas do mesmo projeto usam uma trava no volume para impedir
publicação/configuração concorrente com a exclusão. Se o processo for interrompido
abruptamente e deixar uma trava em updates/.admin/project-locks/SLUG, pare o serviço,
confirme que não há operação em andamento e remova somente esse diretório vazio antes
de reiniciar. Não remova travas durante operações ativas.

Testes adicionais: node --test tests/projects.test.cjs.
Em servidor de teste descartável: node tests/projects-http.cjs (porta 3100 e credenciais de teste).
