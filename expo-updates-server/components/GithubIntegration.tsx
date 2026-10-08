import { useState } from "react";
import s from "../styles/Dashboard.module.css";
const permissionUrl = "https://github.com/settings/personal-access-tokens/new";
function ActionsMark() {
  return (
    <svg
      width="34"
      height="34"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="11" cy="10" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="m9 6 6 4-6 4V6Z" fill="currentColor" />
      <path
        d="M11 17v7a3 3 0 0 0 3 3h7M18 10h5a3 3 0 0 1 3 3v6"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="25" cy="26" r="4" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
export default function GithubIntegration() {
  const [repositories, setRepositories] = useState("");
  const [message, setMessage] = useState("");
  const config =
    "GITHUB_BUILD_TOKEN=SEU_TOKEN_PRIVADO\nGITHUB_BUILD_REPOSITORIES=" +
    (repositories.trim() || "organizacao/repositorio");
  async function copy() {
    try {
      await navigator.clipboard.writeText(config);
      setMessage(
        "Modelo copiado. Substitua o token somente no ambiente do servidor.",
      );
    } catch {
      setMessage("Selecione e copie o modelo abaixo.");
    }
  }
  return (
    <section className={s.integrationCard}>
      <div className={s.integrationHero}>
        <a
          className={s.integrationLogo}
          href={permissionUrl}
          target="_blank"
          rel="noreferrer"
          aria-label="Configurar permissões do GitHub em nova aba"
        >
          <ActionsMark />
        </a>
        <div>
          <h2>GitHub Actions</h2>
          <p>
            Conecte seus repositórios para gerar builds, acompanhar execuções e
            baixar os aplicativos.
          </p>
        </div>
        <span className={s.badge}>Configuração manual</span>
      </div>
      <div className={s.integrationBody}>
        <div className={s.integrationSteps}>
          <div>
            <span className={s.stepNumber}>1</span>
            <h3>Permitir acesso</h3>
            <p>
              Escolha no GitHub a conta ou organização e somente os repositórios
              que deseja disponibilizar.
            </p>
            <a
              className={s.primary}
              href={permissionUrl}
              target="_blank"
              rel="noreferrer"
            >
              Configurar permissões no GitHub ↗
            </a>
          </div>
          <div>
            <span className={s.stepNumber}>2</span>
            <h3>Ativar a integração</h3>
            <p>
              O administrador configura o acesso no servidor. O token não deve
              ser incluído no código do aplicativo.
            </p>
            <a href="#github-admin-setup">Ver configuração administrativa ↓</a>
          </div>
          <div>
            <span className={s.stepNumber}>3</span>
            <h3>Vincular o aplicativo</h3>
            <p>
              Abra um projeto, escolha seu repositório na área Android e use
              Gerar APK. Cada aplicativo mantém seu próprio vínculo.
            </p>
            <a href="/">Escolher projeto →</a>
          </div>
        </div>
        <div className={s.integrationFields}>
          <label>
            Permissão necessária
            <input readOnly value="Actions · leitura e escrita" />
          </label>
          <label>
            Escopo do acesso
            <input readOnly value="Somente os repositórios selecionados" />
          </label>
        </div>
        <details id="github-admin-setup" className={s.integrationAdvanced}>
          <summary>Configuração administrativa</summary>
          <p>
            Esta versão usa um token fine-grained configurado pelo
            administrador. O botão acima abre a criação de permissões no GitHub;
            retornar dessa página não conecta a conta automaticamente.
          </p>
          <label>
            Repositórios autorizados
            <input
              value={repositories}
              onChange={(e) => {
                setRepositories(e.target.value);
                setMessage("");
              }}
              placeholder="organizacao/repositorio, organizacao/outro-app"
              maxLength={2000}
            />
            <small>
              Use o mesmo conjunto escolhido no GitHub. Este campo gera o modelo
              abaixo; não salva configurações no servidor.
            </small>
          </label>
          <pre className={s.secret}>{config}</pre>
          <button onClick={copy}>Copiar modelo</button>
          {message && <p role="status">{message}</p>}
          <p>
            Preencha as variáveis no ambiente do servidor e reimplante. Mantenha
            o token privado, sem prefixo NEXT_PUBLIC. O workflow android-apk.yml
            deve existir em cada repositório vinculado.
          </p>
        </details>
      </div>
    </section>
  );
}
