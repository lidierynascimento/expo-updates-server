import type { NextApiRequest, NextApiResponse } from "next";
const auth = require("../../../common/admin-auth.cjs");
const account = require("../../../common/admin-account.cjs");
export const config = { api: { bodyParser: { sizeLimit: "8kb" } } };
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST")
    return res.status(405).json({ error: "Método inválido." });
  if (!auth.authorized(req))
    return res.status(401).json({ error: "Entre novamente no painel." });
  if (!auth.sameOrigin(req))
    return res.status(403).json({ error: "Origem não autorizada." });
  const { action, name, email, currentPassword, newPassword } = req.body || {};
  try {
    if (action === "profile")
      return res.json({ profile: account.updateProfile(name, email) });
    if (!["password", "revoke"].includes(action))
      return res.status(400).json({ error: "Ação inválida." });
    if (!auth.loginAllowed("account:" + (req.socket.remoteAddress || "local")))
      return res
        .status(429)
        .json({ error: "Muitas tentativas. Aguarde 15 minutos." });
    if (!account.verify(currentPassword))
      return res.status(403).json({ error: "Senha atual incorreta." });
    if (action === "password") account.changePassword(newPassword);
    else account.revokeSessions();
    res.setHeader("Set-Cookie", auth.cookie("", 0));
    return res.json({ ok: true });
  } catch (error: any) {
    return res
      .status(400)
      .json({
        error: error.code ? "Não foi possível salvar a conta." : error.message,
      });
  }
}
