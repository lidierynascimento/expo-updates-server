import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
const auth = require("../../../common/admin-auth.cjs");
const settings = require("../../../common/admin-settings.cjs");
export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  if (!auth.authorized(req))
    return res.status(401).json({ error: "Entre novamente no painel." });
  if (req.method !== "POST")
    return res.status(405).json({ error: "Método inválido." });
  if (!auth.sameOrigin(req))
    return res.status(403).json({ error: "Origem não autorizada." });
  try {
    const root = path.resolve("updates");
    if (req.body?.action === "list")
      return res.json({ rows: await settings.list(root, req.body.project) });
    if (req.body?.action === "reveal")
      return res.json(
        await settings.reveal(root, req.body.project, req.body.id),
      );
    return res.json(await settings.mutate(root, req.body?.project, req.body));
  } catch (error: any) {
    return res
      .status(error.code ? 500 : 400)
      .json({
        error: error.code
          ? "Não foi possível acessar o armazenamento do projeto."
          : error.message,
      });
  }
}
