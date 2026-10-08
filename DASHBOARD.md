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
Entrar no painel, clicar em Novo projeto e informar nome e slug.
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

## Verificação
Testes: node --test tests/admin.test.cjs
Build: npm ci && npm run build
Validar a entrega com um app de teste antes de publicar para passageiros.
