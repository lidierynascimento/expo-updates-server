import type { NextApiRequest, NextApiResponse } from "next";
const auth = require("../../../common/admin-auth.cjs");
export const config = { api: { bodyParser: { sizeLimit: "8kb" } } };
export default function session(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST")
    return res.status(405).json({ error: "Método inválido." });
  if (!auth.sameOrigin(req))
    return res
      .status(403)
      .json({ error: "Origem não autorizada. Confira HOSTNAME." });
  if (req.body?.action === "logout") {
    res.setHeader("Set-Cookie", auth.cookie("", 0));
    return res.json({ ok: true });
  }
  if (!auth.configured())
    return res
      .status(503)
      .json({ error: "Configure as credenciais no EasyPanel." });
  if (!auth.loginAllowed(req.socket.remoteAddress || "local"))
    return res
      .status(429)
      .json({ error: "Muitas tentativas. Aguarde 15 minutos." });
  if (!auth.credentials(req.body?.username, req.body?.password))
    return res.status(401).json({ error: "Usuário ou senha inválidos." });
  res.setHeader("Set-Cookie", auth.cookie(auth.token()));
  return res.json({ ok: true });
}
