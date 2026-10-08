import s from "../styles/Dashboard.module.css";
export default function GithubIntegration() {
  return (
    <section className={s.panel}>
      <h2>GitHub Actions</h2>
      <p>
        Conexão geral do servidor. Cada projeto escolhe seu próprio repositório
        na seção Android.
      </p>
      <p>
        Para gerar APK, acompanhar os builds e baixar o ZIP pelo vDeploy,
        configure estas variáveis no EasyPanel e reimplante:
      </p>
      <pre className={s.secret}>
        GITHUB_BUILD_TOKEN=seu_token_fine_grained{"\n"}
        GITHUB_BUILD_REPOSITORIES=lidierynascimento/app-mobi-urban-passenger
      </pre>
      <p>
        Crie um token limitado aos repositórios necessários, com permissão
        Actions: leitura e escrita. Separe vários repositórios por vírgula. O
        token permanece no servidor; não use prefixo NEXT_PUBLIC e não o cole no
        aplicativo ou em commits.
      </p>
      <p>
        O workflow android-apk.yml precisa existir no repositório escolhido. O
        GitHub fornece a máquina de compilação e o armazenamento temporário; o
        vDeploy oferece os controles. Os builds podem consumir a franquia do
        GitHub.
      </p>
      <a
        href="https://github.com/settings/personal-access-tokens/new"
        target="_blank"
        rel="noreferrer"
      >
        Criar token no GitHub ↗
      </a>
    </section>
  );
}
