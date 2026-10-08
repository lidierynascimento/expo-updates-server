import type { NextApiRequest, NextApiResponse } from "next";
import fs from "node:fs/promises";
import path from "node:path";
const auth = require("../../../common/admin-auth.cjs");
const storage = require("../../../common/admin-storage.cjs");
const icon = require("../../../common/project-icon.cjs");
export const config = { api: { bodyParser: { sizeLimit: "3mb" } } };
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (!auth.authorized(req))
    return res.status(401).json({ error: "Entre novamente no painel." });
  if (!["GET", "POST"].includes(req.method || "")) return res.status(405).end();
  if (req.method === "POST" && !auth.sameOrigin(req))
    return res.status(403).json({ error: "Origem não autorizada." });
  try {
    const root = path.resolve("updates");
    if (req.method === "GET") {
      const folder = await storage.projectRoot(root, req.query.project);
      const data = await fs.readFile(path.join(folder, ".icon.png"));
      res.setHeader("Content-Type", "image/png");
      return res.send(data);
    }
    if (!["save", "remove"].includes(req.body?.action))
      return res.status(400).json({ error: "Ação inválida." });
    return await storage.withProjectLock(root, req.body.project, async () =>
      res.json(
        req.body.action === "save"
          ? await icon.save(root, req.body.project, req.body.data)
          : await icon.remove(root, req.body.project),
      ),
    );
  } catch (error: any) {
    return res
      .status(req.method === "GET" ? 404 : 400)
      .json({
        error: error.code ? "Não foi possível acessar o ícone." : error.message,
      });
  }
}
