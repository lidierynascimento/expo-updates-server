import { useEffect, useState } from "react";
import s from "../styles/Dashboard.module.css";
export default function ProjectBuilds({ project }: { project: string }) {
  const [repository, setRepository] = useState("");
  const [saved, setSaved] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/builds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get", project }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error);
        if (!controller.signal.aborted) {
          setRepository(body.repository);
          setSaved(body.repository);
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
  async function save(event: any) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/builds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          project,
          repository: repository.trim(),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setSaved(body.repository);
      setMessage("Repositório salvo. Abra o GitHub para executar o workflow.");
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }
  const url = saved
    ? "https://github.com/" + saved + "/actions/workflows/android-apk.yml"
    : "";
  return (
    <>
      <section className={s.panel}>
        <h2>APK para download</h2>
        <p>
          O GitHub Actions compila o Android na nuvem. Nesta primeira versão, a
          execução, os logs e o download ficam no GitHub.
        </p>
        <form onSubmit={save}>
          <label>
            Repositório GitHub
            <input
              value={repository}
              onChange={(e) => setRepository(e.target.value)}
              placeholder="lidierynascimento/app-mobi-urban-passenger"
              maxLength={140}
              required
            />
          </label>
          <button disabled={busy}>Salvar repositório</button>
        </form>
        {message && <p role="status">{message}</p>}
        {url && (
          <div className={s.actions} style={{ marginTop: 20 }}>
            <a
              className={s.primary}
              href={url}
              target="_blank"
              rel="noreferrer"
            >
              Gerar APK no GitHub ↗
            </a>
            <a className={s.button} href={url} target="_blank" rel="noreferrer">
              Ver execuções e downloads ↗
            </a>
          </div>
        )}
        <ol className={s.buildSteps}>
          <li>
            Abra o workflow <strong>Android APK · vDeploy</strong> e clique em{" "}
            <strong>Run workflow</strong>.
          </li>
          <li>
            Selecione a branch com a integração OTA e informe a chave publicável
            do Clerk, se ainda não estiver nas Variables do GitHub.
          </li>
          <li>
            Aguarde a execução terminar com sucesso. Abra o resumo e clique em{" "}
            <strong>Baixar APK (ZIP)</strong>, ou na seção{" "}
            <strong>Artifacts</strong>.
          </li>
          <li>
            Extraia o ZIP e instale o APK no Android. O download exige login no
            GitHub e acesso ao repositório.
          </li>
        </ol>
        <p>
          O workflow android-apk.yml precisa existir no repositório. Salvar o
          vínculo aqui não instala o workflow. Downloads ficam disponíveis por
          14 dias. Este é um APK de teste; a assinatura para a loja será
          configurada separadamente.
        </p>
      </section>
      <section className={s.panel}>
        <h2>iOS sem Mac próprio</h2>
        <p>
          Podemos compilar usando um executor macOS do GitHub Actions, com Xcode
          na nuvem. Para instalar no iPhone via TestFlight, será necessário
          Apple Developer Program, App Store Connect e assinatura configurada.
        </p>
        <p>
          A integração iOS ainda não está ativa. O IPA precisa de assinatura e
          distribuição compatíveis; o download sozinho não instala o app no
          iPhone. O uso de macOS pode consumir a franquia ou gerar cobrança no
          GitHub.
        </p>
      </section>
    </>
  );
}
