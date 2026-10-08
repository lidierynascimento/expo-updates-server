import { useState } from "react";
import Dialog from "./Dialog";
import s from "../styles/Dashboard.module.css";
export default function DeleteProject({ project }: { project: string }) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function remove(event: any) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/releases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "deleteProject",
          project,
          confirmation,
          password: data.get("password"),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Não foi possível excluir.");
      window.location.href = "/?deleted=1";
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }
  return (
    <section className={s.dangerZone}>
      <h2>Excluir projeto</h2>
      <p>
        Remove as atualizações, credenciais, tokens, dispositivos e variáveis
        deste projeto. Aplicativos instalados deixam de receber suas
        atualizações. O repositório GitHub não é excluído.
      </p>
      <button
        onClick={() => {
          setConfirmation("");
          setError("");
          setOpen(true);
        }}
      >
        Excluir projeto…
      </button>
      {open && (
        <Dialog
          title="Excluir projeto permanentemente"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <p>
            Esta ação não pode ser desfeita. Digite <strong>{project}</strong> e
            confirme sua senha.
          </p>
          <form onSubmit={remove}>
            <label>
              Slug do projeto
              <input
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="off"
                required
              />
            </label>
            <label>
              Senha atual
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={1024}
              />
            </label>
            {error && (
              <p role="alert" className={s.alert}>
                {error}
              </p>
            )}
            <div className={s.actions}>
              <button
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancelar
              </button>
              <button disabled={busy || confirmation !== project}>
                {busy ? "Excluindo…" : "Excluir permanentemente"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}
