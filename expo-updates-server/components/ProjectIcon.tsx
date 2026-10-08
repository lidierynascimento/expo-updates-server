import { useState } from "react";
import s from "../styles/Dashboard.module.css";
export function ProjectAvatar({
  name,
  project,
  hasIcon,
}: {
  name: string;
  project: string;
  hasIcon: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={s.projectAvatar}>
      {hasIcon && !failed ? (
        <img
          src={"/api/admin/icon?project=" + encodeURIComponent(project)}
          alt={"Ícone de " + name}
          width={42}
          height={42}
          onError={() => setFailed(true)}
        />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </span>
  );
}
export default function ProjectIcon({
  name,
  project,
  hasIcon,
}: {
  name: string;
  project: string;
  hasIcon: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function save(action: string) {
    setBusy(true);
    setMessage("");
    try {
      let data = "";
      if (action === "save") {
        if (!file || file.size > 2 * 1024 * 1024)
          throw new Error("Selecione uma imagem de até 2 MB.");
        data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = () => reject(new Error("Falha ao ler imagem."));
          reader.readAsDataURL(file);
        });
      }
      const response = await fetch("/api/admin/icon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project, action, data }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      window.location.reload();
    } catch (error: any) {
      setMessage(error.message);
      setBusy(false);
    }
  }
  return (
    <div className={s.iconEditor}>
      <h3>Ícone do projeto</h3>
      <ProjectAvatar name={name} project={project} hasIcon={hasIcon} />
      <p>
        PNG, JPEG ou WebP estático, até 2 MB. Prefira uma imagem quadrada. O
        ícone aparece nos cards do painel; o ícone instalado no celular é
        configurado no aplicativo.
      </p>
      <label>
        Escolher imagem
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            setMessage("");
          }}
        />
      </label>
      {file && <p>Selecionado: {file.name}</p>}
      {message && (
        <p role="alert" className={s.alert}>
          {message}
        </p>
      )}
      <div className={s.actions}>
        <button
          className={s.primary}
          disabled={busy || !file}
          onClick={() => save("save")}
        >
          {busy ? "Salvando…" : "Salvar ícone"}
        </button>
        {hasIcon && (
          <button disabled={busy} onClick={() => save("remove")}>
            Remover ícone
          </button>
        )}
      </div>
    </div>
  );
}
