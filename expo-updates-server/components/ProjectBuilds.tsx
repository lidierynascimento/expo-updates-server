import { useEffect, useState } from "react";
import Dialog from "./Dialog";
import s from "../styles/Dashboard.module.css";
export default function ProjectBuilds({ project }: { project: string }) {
  const [repository, setRepository] = useState("");
  const [saved, setSaved] = useState("");
  const [connected, setConnected] = useState(false);
  const [runs, setRuns] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(true);
  const [open, setOpen] = useState(false);
  const [downloads, setDownloads] = useState<Record<string, any[]>>({});
  async function request(payload: any, signal?: AbortSignal) {
    const res = await fetch("/api/admin/builds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, project }),
      signal,
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error);
    return body;
  }
  useEffect(() => {
    const controller = new AbortController();
    request({ action: "get" }, controller.signal)
      .then((body) => {
        if (!controller.signal.aborted) {
          setRepository(body.repository);
          setSaved(body.repository);
          setConnected(body.connected);
          setBusy(false);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setMessage(error.message);
          setBusy(false);
        }
      });
    return () => controller.abort();
  }, [project]);
  useEffect(() => {
    if (!connected || !saved) return;
    let active = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const body = await request({ action: "runs" }, controller.signal);
        if (active) setRuns(body.runs);
      } catch (error: any) {
        if (active) setMessage(error.message);
      } finally {
        if (active) timer = setTimeout(poll, 15000);
      }
    }
    void poll();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [project, connected, saved]);
  async function save(event: any) {
    event.preventDefault();
    setBusy(true);
    try {
      const body = await request({
        action: "save",
        repository: repository.trim(),
      });
      setSaved(body.repository);
      setConnected(body.connected);
      setRuns([]);
      setDownloads({});
      setMessage("Repositório salvo.");
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function start(event: any) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      await request({
        action: "dispatch",
        ref: data.get("ref"),
        key: data.get("key"),
      });
      setOpen(false);
      setMessage(
        "Solicitação enviada ao GitHub. O build aparecerá abaixo em instantes.",
      );
      const body = await request({ action: "runs" });
      setRuns(body.runs);
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function files(id: number) {
    setBusy(true);
    try {
      const body = await request({ action: "artifacts", run: id });
      setDownloads((old) => ({ ...old, [id]: body.artifacts }));
    } catch (e: any) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  const labels: Record<string, string> = {
    queued: "Na fila",
    in_progress: "Compilando",
    waiting: "Aguardando",
    pending: "Pendente",
    requested: "Solicitado",
    success: "Concluído",
    failure: "Falhou",
    cancelled: "Cancelado",
    timed_out: "Tempo esgotado",
    action_required: "Ação necessária",
  };
  return (
    <>
      <section className={s.panel}>
        <div className={s.sectionHeading}>
          <div>
            <h2>Gerar APK</h2>
            <p>Android · compilação no GitHub Actions</p>
          </div>
          <button
            className={s.primary}
            disabled={busy || !connected || !saved}
            onClick={() => {
              setMessage("");
              setOpen(true);
            }}
          >
            Gerar APK
          </button>
        </div>
        {!connected && (
          <p className={s.alert}>
            Conecte o GitHub em <a href="/?section=integrations">Integrações</a>{" "}
            e salve um repositório autorizado para gerar o APK neste painel.
          </p>
        )}
        <form onSubmit={save}>
          <label>
            Repositório deste aplicativo
            <input
              value={repository}
              onChange={(e) => setRepository(e.target.value)}
              required
              maxLength={140}
              placeholder="lidierynascimento/app-mobi-urban-passenger"
            />
          </label>
          <button disabled={busy}>Salvar repositório</button>
        </form>
        {message && (
          <p role="status" className={s.alert}>
            {message}
          </p>
        )}
        <p>
          APK de teste. As credenciais Android armazenadas no painel ainda não
          são enviadas ao workflow; ele usa a assinatura configurada no
          repositório.
        </p>
      </section>
      <section className={s.panel}>
        <h2>Builds recentes</h2>
        <p>
          Últimas 10 execuções manuais de android-apk.yml deste repositório.
          Atualização a cada 15 segundos.
        </p>
        {!runs.length ? (
          <p>
            {connected
              ? "Nenhum build manual listado."
              : "Conecte o GitHub para consultar os builds."}
          </p>
        ) : (
          <div className={s.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Build / branch</th>
                  <th>Status</th>
                  <th>Download</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td>
                      #{run.number} · {run.branch}
                      <small style={{ display: "block" }}>
                        {run.sha?.slice(0, 7)}
                      </small>
                    </td>
                    <td>
                      {labels[run.conclusion || run.status] ||
                        run.conclusion ||
                        run.status}
                    </td>
                    <td>
                      {run.conclusion === "success" && (
                        <button disabled={busy} onClick={() => files(run.id)}>
                          Ver downloads
                        </button>
                      )}
                      {downloads[run.id]?.map((file) =>
                        file.expired ? (
                          <span key={file.id}>Download expirado</span>
                        ) : (
                          <a
                            key={file.id}
                            className={s.button}
                            href={
                              "/api/admin/builds?project=" +
                              encodeURIComponent(project) +
                              "&run=" +
                              run.id +
                              "&artifact=" +
                              file.id
                            }
                          >
                            Baixar APK (ZIP)
                          </a>
                        ),
                      )}
                      {downloads[run.id]?.length === 0 && (
                        <span>Nenhum arquivo disponível.</span>
                      )}{" "}
                      <a href={run.url} target="_blank" rel="noreferrer">
                        Logs ↗
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p>
          Extraia o ZIP e instale o APK no Android. Os arquivos podem expirar
          após 14 dias. O processamento pode consumir a franquia de Actions da
          sua conta.
        </p>
      </section>
      {open && (
        <Dialog title="Gerar APK Android" onClose={() => setOpen(false)}>
          <form onSubmit={start}>
            <label>
              Branch ou tag
              <input name="ref" defaultValue="main" required maxLength={200} />
            </label>
            <label>
              Chave publicável Clerk (opcional)
              <input
                name="key"
                placeholder="pk_test_…"
                autoComplete="off"
                maxLength={520}
              />
            </label>
            <p>
              Deixe vazio se EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY já estiver nas
              Variables do GitHub. Escolha a branch que recebeu a integração OTA
              do OpenCode.
            </p>
            {message && <p role="alert">{message}</p>}
            <button disabled={busy} className={s.primary}>
              {busy ? "Enviando…" : "Iniciar build"}
            </button>
          </form>
        </Dialog>
      )}
    </>
  );
}
