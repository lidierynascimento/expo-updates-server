import Head from "next/head";
import GithubIntegration from "../components/GithubIntegration";
import ProjectBuilds from "../components/ProjectBuilds";
import ProjectIcon, { ProjectAvatar } from "../components/ProjectIcon";
import ConnectProject from "../components/ConnectProject";
import DeleteProject from "../components/DeleteProject";
import BrandMark from "../components/BrandMark";
import AccountSettings, { type Profile } from "../components/AccountSettings";
const account = require("../common/admin-account.cjs");
import Dialog from "../components/Dialog";
import ProjectSettings from "../components/ProjectSettings";
import styles from "../styles/Dashboard.module.css";
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
  legacy: boolean;
  serverUrl: string;
  profile: Profile | null;
  notice: string;
  section: string;
  projects: { name: string; slug: string; hasIcon: boolean }[];
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
    serverUrl: process.env.HOSTNAME || "https://expo.vdigitalslab.com",
    legacy: false,
    profile: null,
    notice:
      query.signedout === "1"
        ? "Sessões encerradas. Entre novamente para continuar."
        : "",
    section: "overview",
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
  const projects: { name: string; slug: string; hasIcon: boolean }[] = [];
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
        const hasIcon = await fs
          .stat(path.join(base, "projects", entry.name, ".icon.png"))
          .then((stat) => stat.isFile())
          .catch(() => false);
        projects.push({ name: String(item.name), slug: entry.name, hasIcon });
      } catch {}
    }
  } catch {}
  const project =
    typeof query.project === "string" &&
    projects.some((item) => item.slug === query.project)
      ? query.project
      : "";
  const legacy = !project && query.legacy === "1";
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
      legacy,
      section:
        !project &&
        !legacy &&
        !["overview", "account", "integrations"].includes(String(query.section))
          ? "overview"
          : typeof query.section === "string" &&
              [
                "overview",
                "updates",
                "publish",
                "builds",
                "credentials",
                "tokens",
                "devices",
                "environment",
                "general",
                "account",
                "integrations",
                "android-credentials",
                "ios-credentials",
                "ios-builds",
              ].includes(query.section)
            ? query.section
            : "overview",
      serverUrl: process.env.HOSTNAME || "https://expo.vdigitalslab.com",
      profile: account.profile(),
      notice:
        query.saved === "1"
          ? "Perfil salvo com sucesso."
          : query.deleted === "1"
            ? "Projeto excluído."
            : "",
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
  legacy,
  serverUrl,
  profile,
  notice,
  section,
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
  const current = projects.find((item) => item.slug === project);
  const link = (view: string, slug = project) =>
    "/?section=" +
    view +
    (slug ? "&project=" + encodeURIComponent(slug) : legacy ? "&legacy=1" : "");
  const titles: Record<string, string> = {
    overview: project
      ? "Visão geral do projeto"
      : legacy
        ? "Aplicativo legado"
        : "Seus projetos",
    updates: "Atualizações OTA",
    publish: "Publicar atualização",
    builds: "Android · APK e builds",
    "android-credentials": "Android · Credenciais",
    "ios-credentials": "iOS · Credenciais",
    "ios-builds": "iOS · Builds e TestFlight",
    integrations: "Integrações do servidor",
    credentials: "Credenciais Android e iOS",
    tokens: "Tokens de acesso",
    devices: "Dispositivos Apple",
    environment: "Variáveis de ambiente",
    general: "Configurações do projeto",
    account: "Minha conta",
  };
  const groups = project
    ? [
        {
          label: "PROJETO",
          items: [
            ["overview", "Visão geral", "grid"],
            ["updates", "Atualizações OTA", "refresh"],
            ["publish", "Publicar OTA", "upload"],
          ],
        },
        {
          label: "ANDROID",
          items: [
            ["builds", "Gerar APK e builds", "phone"],
            ["android-credentials", "Credenciais Android", "key"],
          ],
        },
        {
          label: "iOS",
          items: [
            ["ios-builds", "Builds e TestFlight", "phone"],
            ["ios-credentials", "Credenciais iOS", "key"],
            ["devices", "Dispositivos Apple", "phone"],
          ],
        },
        {
          label: "CONFIGURAÇÕES DO APP",
          items: [
            ["tokens", "Tokens OTA", "shield"],
            ["environment", "Variáveis de ambiente", "code"],
            ["general", "Configurações", "settings"],
          ],
        },
      ]
    : legacy
      ? [
          {
            label: "APLICATIVO LEGADO",
            items: [
              ["updates", "Atualizações OTA", "refresh"],
              ["publish", "Publicar OTA", "upload"],
            ],
          },
        ]
      : [];
  return (
    <div className={styles.app}>
      <Head>
        <title>{titles[section]} · vDeploy</title>
        <link rel="icon" href="/vdeploy.svg" type="image/svg+xml" />
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      {!authorized ? (
        <main className={styles.login}>
          <div className={styles.loginBrand}>
            <BrandMark /> vDeploy
          </div>
          <section className={styles.panel}>
            <h1>Entre no seu painel</h1>
            <p>Seus aplicativos. Suas atualizações. Seu servidor.</p>
            {notice && <p role="status">{notice}</p>}
            {configured ? (
              <form onSubmit={login}>
                <label>
                  Usuário
                  <input
                    name="username"
                    autoComplete="username"
                    required
                    autoFocus
                  />
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
                {message && (
                  <p role="alert" className={styles.alert}>
                    {message}
                  </p>
                )}
                <button className={styles.primary} disabled={busy}>
                  {busy ? "Entrando…" : "Entrar"}
                </button>
              </form>
            ) : (
              <p>
                Configure DASHBOARD_USERNAME e DASHBOARD_PASSWORD no EasyPanel.
              </p>
            )}
          </section>
        </main>
      ) : (
        <div className={styles.workspace}>
          <aside className={styles.sidebar}>
            <a href="/" className={styles.brand}>
              <span className={styles.brandIcon}>
                <BrandMark />
              </span>
              <span>
                vDeploy<small>by VDigitals Lab</small>
              </span>
            </a>
            <div className={styles.projectSelect}>
              <label htmlFor="project-select">PROJETO</label>
              <select
                id="project-select"
                value={legacy ? "__legacy" : project}
                onChange={(event) => {
                  window.location.href =
                    event.target.value === "__legacy"
                      ? "/?section=updates&legacy=1"
                      : "/?section=overview" +
                        (event.target.value
                          ? "&project=" + encodeURIComponent(event.target.value)
                          : "");
                }}
              >
                <option value="">Todos os projetos</option>
                <option value="__legacy">Aplicativo legado / padrão</option>
                {projects.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  setMessage("");
                  setNewProject(true);
                }}
              >
                <Icon name="plus" /> Novo projeto
              </button>
            </div>
            <nav aria-label="Navegação">
              <a
                href="/"
                className={
                  !project && !legacy && section === "overview"
                    ? styles.active
                    : ""
                }
              >
                <Icon name="grid" />
                <span>Todos os projetos</span>
              </a>
              {groups.map((group) => (
                <div key={group.label}>
                  <p className={styles.navLabel}>{group.label}</p>
                  {group.items.map(([view, label, icon]) => (
                    <a
                      key={view}
                      href={link(view)}
                      aria-current={section === view ? "page" : undefined}
                      className={section === view ? styles.active : ""}
                    >
                      <Icon name={icon} />
                      <span>{label}</span>
                    </a>
                  ))}
                </div>
              ))}
              <p className={styles.navLabel}>GERAL</p>
              <a
                href="/?section=integrations"
                className={section === "integrations" ? styles.active : ""}
              >
                <Icon name="settings" />
                <span>Integrações</span>
              </a>
              <a
                href="/?section=account"
                className={section === "account" ? styles.active : ""}
              >
                <Icon name="settings" />
                <span>Minha conta</span>
              </a>
            </nav>
            <div className={styles.account}>
              <span className={styles.avatar}>
                {(profile?.name || "AD").slice(0, 2).toUpperCase()}
              </span>
              <div>
                <a href="/?section=account">
                  <strong>{profile?.name || "Administrador"}</strong>
                </a>
                <small>Acesso ao servidor</small>
              </div>
              <button title="Sair" aria-label="Sair" onClick={logout}>
                <Icon name="logout" />
              </button>
            </div>
          </aside>
          <div className={styles.content}>
            <header className={styles.topbar}>
              <div className={styles.breadcrumb}>
                vDeploy <span>/</span>{" "}
                {section === "account"
                  ? "Minha conta"
                  : section === "integrations"
                    ? "Integrações"
                    : current?.name || (legacy ? "Legado" : "Projetos")}
              </div>
              <span className={styles.badge}>Servidor próprio</span>
            </header>
            <main className={styles.main}>
              <div className={styles.pageHeading}>
                <div>
                  <p className={styles.eyebrow}>
                    {section === "account"
                      ? "PREFERÊNCIAS PESSOAIS"
                      : project
                        ? current?.slug
                        : "WORKSPACE"}
                  </p>
                  <h1>{titles[section]}</h1>
                </div>
                <div className={styles.actions}>
                  {section === "overview" && !project ? (
                    <button
                      className={styles.primary}
                      onClick={() => {
                        setMessage("");
                        setNewProject(true);
                      }}
                    >
                      <Icon name="plus" /> Novo projeto
                    </button>
                  ) : (
                    <a className={styles.button} href={link(section)}>
                      Atualizar
                    </a>
                  )}
                </div>
              </div>
              {notice && (
                <p role="status" className={styles.success}>
                  {notice}
                </p>
              )}
              {section === "integrations" && <GithubIntegration />}
              {section === "ios-builds" && project && (
                <section className={styles.panel}>
                  <h2>iOS · TestFlight</h2>
                  <p>
                    A compilação iOS ainda não está configurada. Ela poderá
                    rodar em macOS na nuvem, sem um Mac próprio.
                  </p>
                  <p>
                    Para instalar no iPhone via TestFlight, configure Apple
                    Developer Program, App Store Connect, certificados e perfil
                    de provisionamento. Cadastre as credenciais e dispositivos
                    nos menus de iOS.
                  </p>
                  <a className={styles.button} href={link("ios-credentials")}>
                    Credenciais iOS
                  </a>
                </section>
              )}
              {section === "account" && profile && (
                <AccountSettings profile={profile} />
              )}
              {message && !newProject && (
                <p role="alert" className={styles.alert}>
                  {message}
                </p>
              )}
              {scanError && (
                <p className={styles.alert}>
                  Não foi possível ler todas as atualizações. Confira o volume e
                  suas permissões.
                </p>
              )}
              {section === "overview" && !project && !legacy && (
                <>
                  <p className={styles.subtitle}>
                    Escolha um aplicativo para gerenciar atualizações e
                    configurações.
                  </p>
                  <div className={styles.projectGrid}>
                    {projects.map((item) => (
                      <article className={styles.projectCard} key={item.slug}>
                        <div className={styles.cardTop}>
                          <ProjectAvatar
                            name={item.name}
                            project={item.slug}
                            hasIcon={item.hasIcon}
                          />
                          <a
                            className={styles.primary}
                            href={link("builds", item.slug)}
                          >
                            Gerar APK
                          </a>
                        </div>
                        <a
                          className={styles.cardTitle}
                          href={link("overview", item.slug)}
                        >
                          <h2>{item.name}</h2>
                        </a>
                        <p>{item.slug}</p>
                        <a
                          className={styles.cardFooter}
                          href={link("overview", item.slug)}
                        >
                          Abrir projeto <span>→</span>
                        </a>
                      </article>
                    ))}
                    <button
                      className={styles.newCard}
                      onClick={() => {
                        setMessage("");
                        setNewProject(true);
                      }}
                    >
                      <Icon name="plus" />
                      <strong>Criar projeto</strong>
                      <span>Organize um novo aplicativo</span>
                    </button>
                  </div>
                  <details className={styles.legacy}>
                    <summary>Aplicativo legado / padrão</summary>
                    <p>
                      Atualizações anteriores à criação de projetos continuam
                      disponíveis.
                    </p>
                    <a href="/?section=updates&legacy=1">
                      Consultar atualizações legadas →
                    </a>
                  </details>
                </>
              )}
              {section === "overview" && project && (
                <>
                  <div className={styles.projectHero}>
                    <ProjectAvatar
                      key={project}
                      name={current?.name || project}
                      project={project}
                      hasIcon={!!current?.hasIcon}
                    />
                    <div>
                      <h2>{current?.name}</h2>
                      <p>{project}</p>
                    </div>
                    <a className={styles.primary} href={link("publish")}>
                      Publicar atualização
                    </a>
                    <a className={styles.button} href={link("general")}>
                      Editar ícone
                    </a>
                  </div>
                  <div className={styles.stats}>
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
                      <strong className={styles.smallStat}>
                        {signed ? "Caminho configurado" : "Não configurada"}
                      </strong>
                    </article>
                  </div>
                  <ConnectProject
                    key={project}
                    name={current?.name || project}
                    project={project}
                    serverUrl={serverUrl}
                  />
                </>
              )}
              {[
                "credentials",
                "android-credentials",
                "ios-credentials",
                "tokens",
                "devices",
                "environment",
              ].includes(section) && (
                <ProjectSettings
                  key={project + section}
                  project={project}
                  kind={
                    section.endsWith("-credentials") ? "credentials" : section
                  }
                  platform={
                    section === "android-credentials"
                      ? "android"
                      : section === "ios-credentials"
                        ? "ios"
                        : undefined
                  }
                  onRequestProject={() => {
                    setMessage("");
                    setNewProject(true);
                  }}
                />
              )}
              {section === "publish" && (
                <section className={styles.panel}>
                  <h2>Nova atualização OTA</h2>
                  <p>
                    {project ? current?.name : "Aplicativo legado / padrão"} · A
                    publicação será entregue aos clientes do runtime informado.
                  </p>
                  <form onSubmit={publish} className={styles.publishForm}>
                    <label>
                      Runtime
                      <input
                        value={runtime}
                        onChange={(event) => setRuntime(event.target.value)}
                        required
                        pattern="[A-Za-z0-9][A-Za-z0-9._-]{0,127}"
                        placeholder="Ex.: 1.0.0"
                      />
                    </label>
                    <label>
                      Pasta do export
                      <input
                        type="file"
                        multiple
                        {...({ webkitdirectory: "", directory: "" } as any)}
                        onChange={(event) =>
                          setSelected(Array.from(event.target.files || []))
                        }
                      />
                    </label>
                    <p className={styles.muted}>
                      {selected.length} arquivos selecionados. Inclua
                      metadata.json e expoConfig.json. Até 32 MB.
                    </p>
                    <button
                      className={styles.primary}
                      disabled={busy || !selected.length}
                    >
                      {busy ? "Publicando…" : "Publicar atualização"}
                    </button>
                  </form>
                </section>
              )}
              {section === "updates" && (
                <section className={styles.panel}>
                  <div className={styles.sectionHeading}>
                    <div>
                      <h2>Histórico de versões</h2>
                      <p>
                        {releases.length} atualizações · {runtimes} runtimes
                      </p>
                    </div>
                    <a className={styles.primary} href={link("publish")}>
                      Publicar
                    </a>
                  </div>
                  {!releases.length ? (
                    <div className={styles.empty}>
                      <Icon name="upload" />
                      <h3>Nenhuma atualização publicada</h3>
                      <p>Publique o primeiro export para começar.</p>
                    </div>
                  ) : (
                    <div className={styles.tableWrap}>
                      <table>
                        <thead>
                          <tr>
                            <th>Versão</th>
                            <th>Runtime</th>
                            <th>Plataformas</th>
                            <th>Estado</th>
                            <th>Ação</th>
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
                                {item.rollback
                                  ? "Voltar à versão embarcada"
                                  : item.valid
                                    ? "Metadados disponíveis"
                                    : "Export incompleto"}
                              </td>
                              <td>
                                <button
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
                  <p className={styles.muted}>
                    O rollback retorna ao bundle embarcado e requer protocolo
                    Expo Updates 1.
                  </p>
                </section>
              )}
              {section === "builds" &&
                (project ? (
                  <ProjectBuilds key={project} project={project} />
                ) : (
                  <section className={styles.empty}>
                    <h2>Selecione um projeto</h2>
                    <p>
                      Escolha o aplicativo no menu para configurar seus builds.
                    </p>
                  </section>
                ))}
              {section === "general" && (
                <section className={styles.panel}>
                  <h2>{current?.name || "Aplicativo legado / padrão"}</h2>
                  {project && (
                    <ProjectIcon
                      key={project}
                      name={current?.name || project}
                      project={project}
                      hasIcon={!!current?.hasIcon}
                    />
                  )}
                  <dl className={styles.definition}>
                    <dt>Slug</dt>
                    <dd>{project || "Legado"}</dd>
                    <dt>Servidor de atualizações</dt>
                    <dd>
                      <code>
                        {serverUrl.replace(/\/$/, "") +
                          "/api/manifest" +
                          (project ? "?project=" + project : "")}
                      </code>
                    </dd>
                    <dt>Publicação automatizada</dt>
                    <dd>
                      Crie um token do projeto e use Authorization: Bearer TOKEN
                      em POST /api/admin/releases. A permissão é somente
                      publicar.
                    </dd>
                  </dl>
                  <p>
                    O cadastro de variáveis, credenciais e dispositivos é
                    mantido pelo painel. Builds, registro de dispositivos na
                    Apple e configuração de workflows do GitHub Actions
                    continuam separados.
                  </p>
                  {project && <DeleteProject project={project} />}
                </section>
              )}
            </main>
          </div>
        </div>
      )}
      {authorized && newProject && (
        <Dialog title="Novo projeto" onClose={() => setNewProject(false)}>
          <p>
            Crie um espaço separado para as atualizações e configurações do
            aplicativo.
          </p>
          <form onSubmit={createProject}>
            <label>
              Nome do aplicativo
              <input
                name="name"
                maxLength={100}
                required
                placeholder="Aplicativo de passageiros"
                autoFocus
              />
            </label>
            <label>
              Slug
              <input
                name="slug"
                required
                pattern="[a-z0-9][a-z0-9-]{0,63}"
                placeholder="passageiros"
              />
              <small>Letras minúsculas, números e hífens.</small>
            </label>
            {message && (
              <p role="alert" className={styles.alert}>
                {message}
              </p>
            )}
            <div className={styles.dialogFooter}>
              <button type="button" onClick={() => setNewProject(false)}>
                Cancelar
              </button>
              <button className={styles.primary} disabled={busy}>
                {busy ? "Criando…" : "Criar projeto"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
function Icon({ name }: { name: string }) {
  const icons: Record<string, string> = {
    grid: "M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h6v6h-6z",
    key: "M14 4a6 6 0 1 1-4 10L3 21H1v-4l7-7a6 6 0 0 1 6-6z",
    phone: "M7 2h10v20H7zM10 18h4",
    shield: "M12 2l8 4v6c0 5-8 10-8 10S4 17 4 12V6z",
    code: "M8 6l-6 6 6 6M16 6l6 6-6 6M14 3l-4 18",
    upload: "M12 16V3M6 9l6-6 6 6M3 16v5h18v-5",
    refresh: "M20 7A9 9 0 1 0 21 15M20 2v6h-6",
    plus: "M12 4v16M4 12h16",
    logout: "M9 3H3v18h6M8 12h13M16 7l5 5-5 5",
    settings: "M4 7h16M4 17h16M8 4v6M16 14v6",
  };
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={icons[name] || icons.grid} />
    </svg>
  );
}
