import { useEffect, useState } from "react";
import Dialog from "./Dialog";
import s from "../styles/Dashboard.module.css";
const labels: Record<string, string> = {
  environment: "Variável",
  credentials: "Credencial",
  devices: "Dispositivo Apple",
  tokens: "Token de acesso",
};
export default function ProjectSettings({
  project,
  kind,
  onRequestProject,
}: {
  project: string;
  kind: string;
  onRequestProject: () => void;
}) {
  const [rows, setRows] = useState<any[]>([]),
    [loading, setLoading] = useState(!!project),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [secret, setSecret] = useState<any>(null),
    [copied, setCopied] = useState(false);
  async function request(payload: any) {
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, project }),
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || "Falha na operação.");
    return result;
  }
  useEffect(() => {
    let active = true;
    if (!project) {
      return;
    }
    request({ action: "list" })
      .then((result) => {
        if (active) setRows(result.rows);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [project, kind]);
  async function submit(event: any) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      const payload: any = {
        action: "create",
        kind,
        ...Object.fromEntries(form.entries()),
      };
      if (kind === "credentials") {
        const file = form.get("file") as File;
        if (!file?.size || file.size > 2 * 1024 * 1024)
          throw new Error("Selecione um arquivo de até 2 MB.");
        payload.filename = file.name;
        payload.data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        delete payload.file;
      }
      const result = await request(payload);
      setRows(result.rows);
      setOpen(false);
      if (result.token) {
        setCopied(false);
        setSecret({ token: result.token });
      }
    } catch (e: any) {
      setError(e.message || "Falha ao ler arquivo.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(row: any) {
    if (
      !confirm(
        kind === "tokens"
          ? "Revogar este token? As publicações que o usam deixarão de funcionar."
          : "Excluir este registro?",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const result = await request({ action: "delete", id: row.id });
      setRows(result.rows);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function reveal(row: any) {
    setBusy(true);
    setError("");
    try {
      setSecret(await request({ action: "reveal", id: row.id }));
      setCopied(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function download() {
    const bytes = Uint8Array.from(atob(secret.data), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes]));
    const a = document.createElement("a");
    a.href = url;
    a.download = secret.filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        secret.token ?? secret.value ?? secret.password ?? "",
      );
      setCopied(true);
    } catch {
      setError("Não foi possível copiar. Selecione o texto manualmente.");
    }
  }
  if (!project)
    return (
      <section className={s.empty}>
        <h2>Escolha um projeto</h2>
        <p>
          As configurações ficam separadas por aplicativo. Selecione um projeto
          no menu lateral ou crie um novo.
        </p>
        <button className={s.primary} onClick={onRequestProject}>
          Novo projeto
        </button>
      </section>
    );
  const visible = rows.filter((row) => row.kind === kind);
  return (
    <>
      <div className={s.sectionHeading}>
        <div>
          <h2>
            {
              (
                {
                  environment: "Variáveis",
                  credentials: "Credenciais",
                  devices: "Dispositivos Apple",
                  tokens: "Tokens de acesso",
                } as Record<string, string>
              )[kind]
            }
          </h2>
          <p>
            {kind === "environment"
              ? "Valores protegidos por ambiente. Ainda não são injetados automaticamente em builds ou exports."
              : kind === "credentials"
                ? "Guarde arquivos Android e iOS neste projeto. O armazenamento não valida a assinatura nem executa builds."
                : kind === "devices"
                  ? "Cadastro local de UDIDs. O registro na conta Apple Developer continua separado."
                  : "Tokens limitados à publicação OTA deste projeto. O valor completo aparece apenas na criação."}
          </p>
        </div>
        <button
          className={s.primary}
          onClick={() => {
            setError("");
            setOpen(true);
          }}
        >
          + Adicionar
        </button>
      </div>
      {error && !open && (
        <p role="alert" className={s.alert}>
          {error}
        </p>
      )}
      {loading ? (
        <p>Carregando…</p>
      ) : !visible.length ? (
        <div className={s.empty}>
          <h3>Nenhum registro ainda</h3>
          <p>
            Adicione {labels[kind].toLowerCase()} para organizar este
            aplicativo.
          </p>
        </div>
      ) : (
        <div className={s.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>
                  {kind === "environment"
                    ? "Ambiente"
                    : kind === "devices"
                      ? "UDID"
                      : kind === "tokens"
                        ? "Permissão / validade"
                        : "Plataforma / arquivo"}
                </th>
                <th>Valor / identificação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.name}</strong>
                  </td>
                  <td>
                    {kind === "environment" ? (
                      row.environment
                    ) : kind === "devices" ? (
                      <code>{row.udid}</code>
                    ) : kind === "tokens" ? (
                      <>
                        Publicar ·{" "}
                        {new Date(row.expiresAt).toLocaleDateString("pt-BR")}
                      </>
                    ) : (
                      <>
                        {row.platform.toUpperCase()} · {row.filename}
                      </>
                    )}
                  </td>
                  <td>
                    {kind === "environment"
                      ? "••••••••"
                      : kind === "tokens"
                        ? row.prefix
                        : row.identifier || "Cadastro local"}
                  </td>
                  <td>
                    <div className={s.actions}>
                      {["environment", "credentials"].includes(kind) && (
                        <button disabled={busy} onClick={() => reveal(row)}>
                          Consultar
                        </button>
                      )}
                      <button
                        className={s.danger}
                        disabled={busy}
                        onClick={() => remove(row)}
                      >
                        {kind === "tokens" ? "Revogar" : "Excluir"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && (
        <Dialog
          title={"Adicionar " + labels[kind].toLowerCase()}
          onClose={() => setOpen(false)}
        >
          <form onSubmit={submit}>
            <label>
              Nome
              <input
                name="name"
                required
                maxLength={kind === "environment" ? 128 : 100}
                placeholder={
                  kind === "environment" ? "API_URL" : "Nome para identificar"
                }
                autoFocus
              />
            </label>
            {kind === "environment" && (
              <>
                <label>
                  Ambiente
                  <select name="environment">
                    <option value="production">Produção</option>
                    <option value="preview">Prévia</option>
                    <option value="development">Desenvolvimento</option>
                  </select>
                </label>
                <label>
                  Valor
                  <input
                    name="value"
                    type="password"
                    required
                    autoComplete="off"
                    maxLength={16000}
                  />
                </label>
                <p className={s.muted}>
                  Variáveis EXPO_PUBLIC_ tornam-se públicas quando incorporadas
                  ao aplicativo.
                </p>
              </>
            )}
            {kind === "credentials" && (
              <>
                <label>
                  Plataforma
                  <select name="platform">
                    <option value="android">Android</option>
                    <option value="ios">iOS</option>
                  </select>
                </label>
                <label>
                  Identificador do app
                  <input
                    name="identifier"
                    required
                    placeholder="com.empresa.app"
                    maxLength={200}
                  />
                </label>
                <label>
                  Arquivo de credencial
                  <input
                    name="file"
                    type="file"
                    accept=".jks,.keystore,.p12,.mobileprovision"
                    required
                  />
                </label>
                <label>
                  Senha do arquivo (se houver)
                  <input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    maxLength={1000}
                  />
                </label>
                <p className={s.muted}>
                  JKS, keystore, P12 ou mobileprovision. Até 2 MB.
                </p>
              </>
            )}
            {kind === "devices" && (
              <label>
                UDID
                <input
                  name="udid"
                  required
                  maxLength={64}
                  placeholder="Identificador do dispositivo Apple"
                />
              </label>
            )}
            {kind === "tokens" && (
              <label>
                Validade
                <select name="days">
                  <option value="30">30 dias</option>
                  <option value="90">90 dias</option>
                  <option value="365">1 ano</option>
                </select>
              </label>
            )}
            {error && (
              <p role="alert" className={s.alert}>
                {error}
              </p>
            )}
            <div className={s.dialogFooter}>
              <button type="button" onClick={() => setOpen(false)}>
                Cancelar
              </button>
              <button className={s.primary} disabled={busy}>
                {busy ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {secret && (
        <Dialog
          title={
            secret.token ? "Token criado" : secret.name || "Valor protegido"
          }
          onClose={() => setSecret(null)}
        >
          {secret.token && (
            <p>
              Copie agora e guarde em um local seguro. Este valor não será
              exibido novamente.
            </p>
          )}
          <pre className={s.secret}>
            {secret.token ?? secret.value ?? secret.password ?? "Sem senha"}
          </pre>
          <div className={s.actions}>
            <button onClick={copy}>{copied ? "Copiado" : "Copiar"}</button>
            {secret.data && (
              <button className={s.primary} onClick={download}>
                Baixar arquivo
              </button>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
