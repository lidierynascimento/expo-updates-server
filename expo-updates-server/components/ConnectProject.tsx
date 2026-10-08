import { useState } from "react";
import s from "../styles/Dashboard.module.css";
const { connectionGuide } = require("../common/connection-guide.cjs");
const tabs = [
  ["opencode", "OpenCode"],
  ["powershell", "PowerShell"],
  ["bash", "Bash / macOS"],
  ["expo", "Expo / app.json"],
  ["native", "React Native CLI"],
];
export default function ConnectProject({
  name,
  project,
  serverUrl,
}: {
  name: string;
  project: string;
  serverUrl: string;
}) {
  const [tab, setTab] = useState("opencode");
  const [runtime, setRuntime] = useState("1.0.0");
  const [status, setStatus] = useState("");
  let guide: Record<string, string> = {};
  let error = "";
  try {
    guide = connectionGuide({ name, project, serverUrl, runtime });
  } catch (err: any) {
    error = err.message;
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(guide[tab]);
      setStatus("Copiado! Cole no OpenCode ou no editor indicado pela aba.");
    } catch {
      setStatus("Não foi possível copiar. Selecione e copie o texto abaixo.");
    }
  }
  return (
    <section className={s.connectPanel}>
      <div className={s.connectHeading}>
        <div>
          <h2>Conectar aplicativo</h2>
          <p>
            Copie o prompt para o OpenCode configurar este projeto no seu
            repositório.
          </p>
        </div>
        <span className={s.badge}>Primeiros passos</span>
      </div>
      <label className={s.runtimeField}>
        Runtime sugerido
        <input
          value={runtime}
          onChange={(e) => {
            setRuntime(e.target.value);
            setStatus("");
          }}
          maxLength={128}
        />
      </label>
      <p>
        Se o aplicativo já possui um runtime, use o mesmo valor do build. Este
        campo apenas gera as instruções; não altera o aplicativo.
      </p>
      <div className={s.codeTabs} role="tablist" aria-label="Modo de conexão">
        {tabs.map(([id, label]) => (
          <button
            id={"connect-tab-" + id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls="connect-code"
            key={id}
            onClick={() => {
              setTab(id);
              setStatus("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={s.codeToolbar}>
        <span>
          {tab === "opencode"
            ? "Prompt pronto para colar"
            : tab === "expo"
              ? "Mescle estes campos com sua configuração atual"
              : "Instruções para o projeto selecionado"}
        </span>
        <button disabled={!!error} onClick={copy}>
          Copiar {tab === "opencode" ? "prompt" : "conteúdo"}
        </button>
      </div>
      {error ? (
        <p role="alert" className={s.alert}>
          {error}
        </p>
      ) : (
        <pre
          className={s.connectionCode}
          id="connect-code"
          role="tabpanel"
          aria-labelledby={"connect-tab-" + tab}
          tabIndex={0}
        >
          <code>{guide[tab]}</code>
        </pre>
      )}
      {status && <p role="status">{status}</p>}
      <p>
        O cadastro no painel não conecta o aplicativo automaticamente. Após
        configurar, instale um novo build e teste uma atualização visível.{" "}
        <a
          href="https://docs.expo.dev/versions/latest/sdk/updates/"
          target="_blank"
          rel="noreferrer"
        >
          Documentação Expo ↗
        </a>
      </p>
    </section>
  );
}
