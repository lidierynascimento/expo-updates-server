import { useState } from "react";
import styles from "../styles/Dashboard.module.css";
export type Profile = {
  name: string;
  email: string;
  username: string;
  passwordChangedAt: string | null;
};
export default function AccountSettings({ profile }: { profile: Profile }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: any, action: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    if (action === "password" && data.newPassword !== data.confirmPassword) {
      setMessage("As novas senhas precisam ser iguais.");
      return;
    }
    if (
      action === "revoke" &&
      !window.confirm("Encerrar todas as sessões, incluindo esta?")
    )
      return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, action }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Não foi possível salvar.");
      if (action === "profile")
        window.location.href = "/?section=account&saved=1";
      else window.location.href = "/?signedout=1";
    } catch (error: any) {
      setMessage(error.message);
      setBusy(false);
    }
  }
  return (
    <div className={styles.accountSettings}>
      <p className={styles.subtitle}>
        Seu perfil e a segurança do acesso ao vDeploy.
      </p>
      {message && (
        <p role="alert" className={styles.alert}>
          {message}
        </p>
      )}
      <section className={styles.panel}>
        <h2>Sobre você</h2>
        <p>Esta instalação possui uma conta administradora.</p>
        <form onSubmit={(event) => submit(event, "profile")}>
          <label>
            Nome de exibição
            <input
              name="name"
              defaultValue={profile.name}
              maxLength={80}
              autoComplete="name"
              required
            />
          </label>
          <label>
            E-mail de contato
            <input
              name="email"
              type="email"
              defaultValue={profile.email}
              maxLength={254}
              autoComplete="email"
            />
          </label>
          <p>
            O e-mail é apenas informativo. Não há verificação nem recuperação de
            senha por e-mail.
          </p>
          <label>
            Usuário de acesso
            <input value={profile.username} readOnly />
          </label>
          <p>O usuário de acesso é definido no EasyPanel.</p>
          <button className={styles.primary} disabled={busy}>
            Salvar perfil
          </button>
        </form>
      </section>
      <section className={styles.panel}>
        <h2>Alterar senha</h2>
        <p>
          Use pelo menos 12 caracteres. A alteração encerra todas as sessões e
          solicita um novo login.
        </p>
        {profile.passwordChangedAt && (
          <p>
            Última alteração:{" "}
            {new Date(profile.passwordChangedAt).toLocaleDateString("pt-BR", {
              timeZone: "UTC",
            })}
            .
          </p>
        )}
        <form onSubmit={(event) => submit(event, "password")}>
          <label>
            Senha atual
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              maxLength={1024}
            />
          </label>
          <label>
            Nova senha
            <input
              name="newPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
            />
          </label>
          <label>
            Confirme a nova senha
            <input
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
            />
          </label>
          <button disabled={busy}>Atualizar senha</button>
        </form>
      </section>
      <section className={styles.panel}>
        <h2>Sessões de acesso</h2>
        <p>
          Encerre o acesso em todos os navegadores, incluindo este. Os tokens de
          publicação dos projetos continuam ativos e podem ser revogados no menu
          Tokens de acesso.
        </p>
        <form onSubmit={(event) => submit(event, "revoke")}>
          <label>
            Confirme sua senha
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
              maxLength={1024}
            />
          </label>
          <button disabled={busy}>Encerrar todas as sessões</button>
        </form>
      </section>
    </div>
  );
}
