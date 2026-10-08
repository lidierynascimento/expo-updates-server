import Head from "next/head";
import { useState } from "react";
import type { GetServerSideProps } from "next";
const auth = require("../common/admin-auth.cjs");
import fs from "fs/promises";
import path from "path";

type Release = {
  runtime: string;
  version: string;
  platforms: string[];
  rollback: boolean;
  date: string | null;
  valid: boolean;
};
type Props = {
  projects: { name: string; slug: string }[];
  project: string;
  releases: Release[];
  configured: boolean;
  authorized: boolean;
  scanError: boolean;
  signed: boolean;
};

export const getServerSideProps: GetServerSideProps<Props> = async ({
  req,
  res,
  query,
}) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  const empty: Props = {
    projects: [],
    project: "",
    releases: [],
    configured: auth.configured(),
    authorized: false,
    scanError: false,
    signed: false,
  };
  if (!auth.authorized(req)) return { props: empty };
  const releases: Release[] = [];
  let scanError = false;
  const projects: { name: string; slug: string }[] = [];
  const base = path.resolve("updates");
  try {
    for (const entry of await fs.readdir(path.join(base, "projects"), {
      withFileTypes: true,
    })) {
      if (!entry.isDirectory() || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(entry.name))
        continue;
      try {
        const item = JSON.parse(
          await fs.readFile(
            path.join(base, "projects", entry.name, "project.json"),
            "utf8",
          ),
        );
        projects.push({ name: String(item.name), slug: entry.name });
      } catch {}
    }
  } catch {}
  const project =
    typeof query.project === "string" &&
    projects.some((item) => item.slug === query.project)
      ? query.project
      : "";
  const root = project ? path.join(base, "projects", project) : base;
  try {
    const runtimes = await fs.readdir(root, { withFileTypes: true });
    for (const runtime of runtimes.filter(
      (item) =>
        item.isDirectory() &&
        !item.name.startsWith(".") &&
        item.name !== "projects",
    )) {
      const versions = await fs.readdir(path.join(root, runtime.name), {
        withFileTypes: true,
      });
      for (const version of versions.filter(
        (item) => item.isDirectory() && /^\d+$/.test(item.name),
      )) {
        const folder = path.join(root, runtime.name, version.name);
        const files = await fs.readdir(folder, { withFileTypes: true });
        const regular = new Set(
          files.filter((item) => item.isFile()).map((item) => item.name),
        );
        const rollback = regular.has("rollback");
        let platforms: string[] = [];
        let valid = rollback;
        let date: string | null = null;
        if (!rollback && regular.has("metadata.json")) {
          try {
            const metadata = JSON.parse(
              await fs.readFile(path.join(folder, "metadata.json"), "utf8"),
            );
            platforms = ["android", "ios"].filter(
              (platform) => !!metadata.fileMetadata?.[platform],
            );
            valid = platforms.length > 0 && regular.has("expoConfig.json");
            date = (
              await fs.stat(path.join(folder, "metadata.json"))
            ).birthtime.toISOString();
          } catch {
            valid = false;
          }
        }
        releases.push({
          runtime: runtime.name,
          version: version.name,
          platforms,
          rollback,
          date,
          valid,
        });
      }
    }
  } catch (error: any) {
    if (error.code !== "ENOENT") scanError = true;
  }
  releases.sort((a, b) => Number(b.version) - Number(a.version));
  return {
    props: {
      releases,
      projects,
      project,
      authorized: true,
      configured: true,
      scanError,
      signed: !!process.env.PRIVATE_KEY_PATH,
    },
  };
};

export default function Dashboard({
  projects,
  project,
  releases,
  configured,
  authorized,
  scanError,
  signed,
}: Props) {
  const [newProject, setNewProject] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [runtime, setRuntime] = useState("");
  const [selected, setSelected] = useState<File[]>([]);
  async function send(url: string, payload: any) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error || "Não foi possível concluir.");
    return result;
  }
  async function login(event: any) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      await send("/api/admin/session", {
        username: form.get("username"),
        password: form.get("password"),
      });
      window.location.reload();
    } catch (error: any) {
      setMessage(error.message);
      setBusy(false);
    }
  }
  async function publish(event: any) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (!selected.length) throw new Error("Selecione a pasta do export.");
      if (selected.reduce((sum, file) => sum + file.size, 0) > 32 * 1024 * 1024)
        throw new Error("Limite de 32 MB por export.");
      const files = await Promise.all(
        selected.map(
          (file) =>
            new Promise<{ path: string; data: string }>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve({
                  path: (file.webkitRelativePath || file.name)
                    .split("/")
                    .slice(file.webkitRelativePath ? 1 : 0)
                    .join("/"),
                  data: String(reader.result).split(",")[1],
                });
              reader.onerror = () =>
                reject(new Error("Falha na leitura do arquivo."));
              reader.readAsDataURL(file);
            }),
        ),
      );
      await send("/api/admin/releases", {
        action: "publish",
        project,
        runtime,
        files,
      });
      window.location.reload();
    } catch (error: any) {
      setMessage(error.message);
      setBusy(false);
    }
  }
  async function rollback(value: string) {
    if (
      !window.confirm(
        "Voltar à versão embarcada no aplicativo para o runtime " +
          value +
          "? Isso afeta os celulares que consultarem este runtime.",
      )
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      await send("/api/admin/releases", {
        action: "rollback",
        project,
        runtime: value,
        confirm: true,
      });
      window.location.reload();
    } catch (error: any) {
      setMessage(error.message);
      setBusy(false);
    }
  }
  async function createProject(event: any) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const result = await send("/api/admin/releases", {
        action: "project",
        name: form.get("name"),
        slug: form.get("slug"),
      });
      window.location.href = "/?project=" + encodeURIComponent(result.slug);
    } catch (error: any) {
      setMessage(error.message);
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await send("/api/admin/session", { action: "logout" });
      window.location.reload();
    } catch (error: any) {
      setMessage(error.message);
    }
  }
  const runtimes = new Set(releases.map((item) => item.runtime)).size;
  return (
    <div className="shell">
      <Head>
        <title>Expo OTA · Painel</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <header>
        <div className="brand">
          <span className="logo">⟨/⟩</span>
          <div>
            Expo OTA<small>VDigitals Lab</small>
          </div>
        </div>
        <span className="badge">OTA · Self-hosted</span>
      </header>
      {!authorized ? (
        <main className="login">
          <section className="panel">
            <p className="eyebrow">VDIGITALS LAB</p>
            <h1>Entrar no painel OTA</h1>
            {configured ? (
              <form onSubmit={login}>
                <label>
                  Usuário
                  <input name="username" autoComplete="username" required />
                </label>
                <label>
                  Senha
                  <input
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </label>
                <button disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
              </form>
            ) : (
              <p>
                Defina DASHBOARD_USERNAME e DASHBOARD_PASSWORD no EasyPanel.
              </p>
            )}
            {message && (
              <p role="alert" className="warning">
                {message}
              </p>
            )}
          </section>
        </main>
      ) : (
        <main>
          <div className="heading">
            <div>
              <p className="eyebrow">VISÃO GERAL</p>
              <h1>Atualizações do aplicativo</h1>
              <p>
                Versões encontradas no armazenamento persistente do servidor.
              </p>
            </div>
            <div className="actions">
              <a
                className="button"
                href={
                  project ? "/?project=" + encodeURIComponent(project) : "/"
                }
              >
                Atualizar lista
              </a>
              <button className="secondary" onClick={logout}>
                Sair
              </button>
            </div>
          </div>
          {message && (
            <p role="alert" className="warning">
              {message}
            </p>
          )}
          <section className="projectbar">
            <label>
              Projeto
              <select
                value={project}
                onChange={(event) => {
                  window.location.href = event.target.value
                    ? "/?project=" + encodeURIComponent(event.target.value)
                    : "/";
                }}
              >
                <option value="">Aplicativo legado / padrão</option>
                {projects.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <button onClick={() => setNewProject(!newProject)}>
              + Novo projeto
            </button>
          </section>
          {newProject && (
            <section className="panel">
              <h2>Novo projeto</h2>
              <form onSubmit={createProject}>
                <label>
                  Nome do aplicativo
                  <input
                    name="name"
                    maxLength={100}
                    required
                    placeholder="Aplicativo de passageiros"
                  />
                </label>
                <label>
                  Slug
                  <input
                    name="slug"
                    pattern="[a-z0-9][a-z0-9-]{0,63}"
                    required
                    placeholder="passageiros"
                  />
                </label>
                <button disabled={busy}>Criar projeto</button>
              </form>
            </section>
          )}
          <nav>
            <a href="#publish">Publicar</a>
            <a href="#history">Atualizações</a>
            <a href="#connect">Configuração</a>
          </nav>
          <section id="publish" className="panel">
            <h2>Publicar atualização</h2>
            <p>
              Selecione a pasta exportada do app, incluindo metadata.json e
              expoConfig.json. Ao publicar, a versão passa a ser a mais recente
              do runtime.
            </p>
            <form onSubmit={publish}>
              <label>
                Runtime do aplicativo
                <input
                  value={runtime}
                  onChange={(event) => setRuntime(event.target.value)}
                  placeholder="Ex.: 1.0.0"
                  required
                  pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,127}"
                />
              </label>
              <label>
                Pasta do export (até 32 MB)
                <input
                  type="file"
                  multiple
                  {...({ webkitdirectory: "", directory: "" } as any)}
                  onChange={(event) =>
                    setSelected(Array.from(event.target.files || []))
                  }
                />
              </label>
              <p>
                {selected.length
                  ? selected.length + " arquivos selecionados"
                  : "Nenhum arquivo selecionado"}
              </p>
              <button disabled={busy || !selected.length}>
                {busy ? "Processando…" : "Publicar atualização"}
              </button>
            </form>
          </section>
          <section className="cards">
            <article>
              <span>Atualizações</span>
              <strong>{releases.length}</strong>
            </article>
            <article>
              <span>Runtimes</span>
              <strong>{runtimes}</strong>
            </article>
            <article>
              <span>Assinatura OTA</span>
              <strong className="text">
                {signed ? "Caminho configurado" : "Não configurada"}
              </strong>
            </article>
          </section>
          {scanError && (
            <p className="warning">
              Não foi possível ler todo o armazenamento. Confira as permissões
              do volume /app/updates.
            </p>
          )}
          <section id="history" className="panel">
            <h2>Histórico de versões</h2>
            {!releases.length ? (
              <div className="empty">
                <span>↥</span>
                <h3>Nenhuma atualização publicada</h3>
                <p>
                  O servidor ainda não possui exports do aplicativo. As versões
                  aparecerão aqui após a publicação no volume.
                </p>
              </div>
            ) : (
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Versão</th>
                      <th>Runtime</th>
                      <th>Plataforma</th>
                      <th>Estado dos arquivos</th>
                      <th>Data do arquivo</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {releases.map((item) => (
                      <tr key={item.runtime + "/" + item.version}>
                        <td>
                          <code>{item.version}</code>
                        </td>
                        <td>{item.runtime}</td>
                        <td>{item.platforms.join(" / ") || "—"}</td>
                        <td>
                          <span
                            className={item.valid ? "state" : "state error"}
                          >
                            {item.rollback
                              ? "Rollback para versão embarcada"
                              : item.valid
                                ? "Metadados disponíveis"
                                : "Export incompleto"}
                          </span>
                        </td>
                        <td>{item.date || "—"}</td>
                        <td>
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() => rollback(item.runtime)}
                          >
                            Voltar à versão instalada
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section id="connect" className="panel info">
            <h2>Conectar o aplicativo</h2>
            <p>Endereço de atualizações:</p>
            <code>
              {"https://expo.vdigitalslab.com/api/manifest" +
                (project ? "?project=" + project : "")}
            </code>
            <p>
              O runtime deve corresponder ao código nativo instalado no celular.
              A lista de arquivos não comprova que uma atualização foi
              instalada.
            </p>
            <p>
              O botão de rollback volta à versão embarcada no aplicativo, para
              todo o runtime, e requer protocolo Expo Updates 1. Builds
              Android/iOS continuam fora deste painel.
            </p>
          </section>
        </main>
      )}
      <style jsx>{`
        select {
          display: block;
          margin-top: 8px;
          padding: 12px;
          border: 1px solid #ccd4df;
          border-radius: 8px;
          min-width: 250px;
          background: white;
        }
        .projectbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .projectbar label {
          margin: 0;
        }
        form {
          max-width: 660px;
        }
        label {
          display: block;
          font-size: 14px;
          margin: 18px 0;
        }
        input {
          display: block;
          width: 100%;
          padding: 12px;
          border: 1px solid #ccd4df;
          border-radius: 8px;
          margin-top: 8px;
          box-sizing: border-box;
          background: #fff;
          color: #17233b;
        }
        button {
          cursor: pointer;
          border: 0;
          background: #173d35;
          color: white;
          padding: 12px 18px;
          border-radius: 8px;
          font-size: 14px;
        }
        button:disabled {
          opacity: 0.5;
          cursor: wait;
        }
        .secondary {
          background: #edf1f5;
          color: #24354b;
        }
        .actions {
          display: flex;
          gap: 10px;
        }
        .login {
          max-width: 450px;
          margin: 6vh auto;
        }
        nav {
          display: flex;
          gap: 24px;
          margin-top: 24px;
        }
        nav a {
          color: #236147;
          text-decoration: none;
          font-size: 14px;
        }
        .shell {
          min-height: 100vh;
          background: #f5f7fa;
          color: #17233b;
          font-family: Arial, sans-serif;
        }
        header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: white;
          border-bottom: 1px solid #e3e8ef;
          padding: 24px 6%;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
          font-weight: 700;
          font-size: 22px;
        }
        .brand small {
          display: block;
          font-size: 12px;
          color: #748096;
          margin-top: 4px;
          font-weight: 400;
        }
        .logo {
          background: #173d35;
          color: #fff;
          padding: 8px 12px;
          border-radius: 12px;
        }
        .badge,
        .state {
          background: #e7f3ed;
          color: #236147;
          border-radius: 20px;
          padding: 7px 12px;
          font-size: 12px;
        }
        main {
          max-width: 1200px;
          margin: auto;
          padding: 40px 24px;
        }
        .heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }
        h1 {
          font-size: 32px;
          margin: 8px 0 12px;
          letter-spacing: -1px;
        }
        p {
          color: #68768d;
          line-height: 1.7;
        }
        .eyebrow {
          font-size: 11px;
          letter-spacing: 2px;
          color: #367c64;
        }
        .button {
          background: #173d35;
          color: white;
          padding: 12px 18px;
          border-radius: 8px;
          text-decoration: none;
          white-space: nowrap;
        }
        .cards {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 18px;
          margin: 28px 0;
        }
        .cards article,
        .panel {
          background: white;
          border: 1px solid #e3e8ef;
          border-radius: 14px;
          padding: 24px;
        }
        .cards span {
          color: #748096;
          font-size: 13px;
        }
        .cards strong {
          display: block;
          margin-top: 16px;
          font-size: 36px;
        }
        .cards .text {
          font-size: 18px;
        }
        .panel {
          margin: 22px 0;
        }
        h2 {
          font-size: 18px;
          margin: 0 0 20px;
        }
        .empty {
          text-align: center;
          padding: 40px 15px;
        }
        .empty > span {
          font-size: 35px;
          color: #367c64;
        }
        .empty p {
          max-width: 550px;
          margin: 0 auto;
        }
        .scroll {
          overflow-x: auto;
        }
        table {
          border-collapse: collapse;
          width: 100%;
          text-align: left;
          font-size: 13px;
        }
        th {
          color: #748096;
          font-weight: 500;
        }
        td,
        th {
          padding: 16px 12px;
          border-bottom: 1px solid #edf0f4;
        }
        code {
          font-size: 13px;
          overflow-wrap: anywhere;
        }
        .error,
        .warning {
          background: #fff0df;
          color: #955d0b;
        }
        .warning {
          padding: 16px;
          border-radius: 8px;
        }
        .info p {
          font-size: 14px;
        }
        @media (max-width: 700px) {
          .cards {
            grid-template-columns: 1fr;
          }
          .heading {
            align-items: flex-start;
            flex-direction: column;
          }
          h1 {
            font-size: 26px;
          }
          header {
            padding: 20px;
          }
          .badge {
            display: none;
          }
        }
        .shell {
          background: #ffffff;
          color: #1f2328;
          font-family:
            -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        header {
          padding: 14px 32px;
          background: #f6f8fa;
          border-color: #d1d9e0;
        }
        .brand {
          font-size: 17px;
          gap: 10px;
        }
        .brand small {
          font-size: 11px;
          color: #59636e;
        }
        .logo {
          background: #24292f;
          border-radius: 9px;
          padding: 8px;
          font-size: 14px;
        }
        .badge {
          background: #ffffff;
          color: #59636e;
          border: 1px solid #d1d9e0;
          padding: 4px 9px;
        }
        main {
          max-width: 1240px;
          padding: 24px 28px;
        }
        h1 {
          font-size: 24px;
          font-weight: 600;
          letter-spacing: -0.5px;
          margin: 5px 0;
        }
        h2 {
          font-size: 15px;
          font-weight: 600;
          margin-bottom: 12px;
        }
        h3 {
          font-size: 16px;
          font-weight: 600;
        }
        p {
          color: #59636e;
          font-size: 13px;
          line-height: 1.5;
          margin: 8px 0;
        }
        .eyebrow {
          color: #59636e;
          font-size: 10px;
          letter-spacing: 1.5px;
        }
        .button,
        button {
          background: #1f883d;
          border: 1px solid #1a7f37;
          padding: 7px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
        }
        .button {
          background: #f6f8fa;
          border-color: #d1d9e0;
          color: #25292e;
        }
        .secondary {
          background: #f6f8fa;
          border-color: #d1d9e0;
          color: #25292e;
        }
        button:hover,
        .button:hover {
          filter: brightness(0.97);
        }
        input:focus,
        select:focus {
          outline: 2px solid #0969da;
          outline-offset: -1px;
        }
        .projectbar {
          border-bottom: 1px solid #d1d9e0;
          padding: 14px 0;
          margin-top: 8px;
        }
        .projectbar label {
          font-size: 11px;
          color: #59636e;
        }
        select,
        input {
          border-color: #d1d9e0;
          border-radius: 6px;
          padding: 8px 10px;
          font-size: 13px;
          margin-top: 5px;
        }
        select {
          min-width: 220px;
        }
        nav {
          margin: 0;
          gap: 8px;
          border-bottom: 1px solid #d1d9e0;
          padding-top: 6px;
        }
        nav a {
          color: #1f2328;
          font-size: 13px;
          padding: 12px 14px;
          border-bottom: 2px solid transparent;
        }
        nav a:hover {
          border-bottom-color: #fd8c73;
          background: #f6f8fa;
        }
        .cards {
          margin: 16px 0;
          gap: 12px;
        }
        .cards article,
        .panel {
          border-color: #d1d9e0;
          border-radius: 8px;
          padding: 16px;
          box-shadow: 0 1px 0 rgba(31, 35, 40, 0.03);
        }
        .cards span {
          font-size: 12px;
          color: #59636e;
        }
        .cards strong {
          margin-top: 8px;
          font-size: 26px;
          font-weight: 600;
        }
        .cards .text {
          font-size: 15px;
        }
        .panel {
          margin: 16px 0;
        }
        form {
          max-width: 100%;
        }
        #publish form {
          display: grid;
          grid-template-columns: 180px 1fr auto;
          align-items: end;
          gap: 12px;
        }
        #publish label {
          margin: 8px 0;
        }
        #publish form p {
          grid-column: 1 / 3;
          margin: 0;
          font-size: 11px;
        }
        #publish form button {
          grid-column: 3;
          grid-row: 1 / 3;
          align-self: center;
        }
        label {
          font-size: 12px;
          margin: 14px 0;
        }
        .empty {
          padding: 26px 15px;
        }
        .empty > span {
          color: #0969da;
          font-size: 26px;
        }
        .empty p {
          max-width: 480px;
        }
        th {
          background: #f6f8fa;
          color: #59636e;
          font-size: 11px;
        }
        td,
        th {
          padding: 10px 12px;
          border-color: #d1d9e0;
        }
        tbody tr:hover {
          background: #f6f8fa;
        }
        .state {
          padding: 3px 8px;
          font-size: 11px;
          border: 1px solid #b4dfc0;
          background: #dafbe1;
          color: #1a7f37;
        }
        .state.error {
          border-color: #eac54f;
          background: #fff8c5;
          color: #7d4e00;
        }
        .info {
          background: #f6f8fa;
        }
        .info p {
          font-size: 12px;
        }
        .info code {
          color: #0969da;
          font-size: 12px;
        }
        .login {
          max-width: 380px;
          margin: 6vh auto;
        }
        .login .panel {
          padding: 24px;
        }
        .login button {
          width: 100%;
        }
        @media (max-width: 760px) {
          main {
            padding: 18px 14px;
          }
          header {
            padding: 14px 18px;
          }
          .projectbar {
            align-items: end;
          }
          select {
            min-width: 0;
            max-width: 210px;
          }
          .cards {
            grid-template-columns: 1fr;
          }
          #publish form {
            display: block;
          }
          #publish form button {
            margin-top: 12px;
          }
          nav a {
            padding: 10px;
          }
          h1 {
            font-size: 22px;
          }
        }
      `}</style>
    </div>
  );
}
