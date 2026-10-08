import type { NextApiRequest, NextApiResponse } from "next";
import path from "path";
const auth = require("../../../common/admin-auth.cjs");
const storage = require("../../../common/admin-storage.cjs");
const settings = require("../../../common/admin-settings.cjs");
export const config = { api: { bodyParser: { sizeLimit: "48mb" } } };
export default async function releases(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST")
    return res.status(405).json({ error: "Método inválido." });
  const session = auth.authorized(req);
  if (!session && req.body?.action !== "publish")
    return res.status(401).json({ error: "Entre novamente no painel." });
  if (session && !auth.sameOrigin(req))
    return res.status(403).json({ error: "Origem não autorizada." });
  try {
    const base = path.resolve("updates");
    const operation = async () => {
      if (
        !session &&
        !(await settings.tokenAuthorized(
          base,
          req.body?.project,
          req.headers.authorization,
        ))
      )
        return res.status(401).json({ error: "Token inválido." });
      if (req.body?.action === "project")
        return res.json(
          await storage.createProject(base, req.body.name, req.body.slug),
        );
      if (req.body?.action === "deleteProject") {
        if (
          !auth.loginAllowed("delete:" + (req.socket.remoteAddress || "local"))
        )
          return res
            .status(429)
            .json({ error: "Muitas tentativas. Aguarde 15 minutos." });
        if (
          !auth.credentials(process.env.DASHBOARD_USERNAME, req.body.password)
        )
          return res.status(403).json({ error: "Senha atual incorreta." });
        return res.json(
          await storage.deleteProject(
            base,
            req.body.project,
            req.body.confirmation,
          ),
        );
      }
      const root = req.body?.project
        ? await storage.projectRoot(base, req.body.project)
        : base;
      if (req.body?.action === "publish")
        return res.json(await storage.publish(root, req.body));
      if (req.body?.action === "rollback" && req.body?.confirm === true)
        return res.json(await storage.rollback(root, req.body.runtime));
      return res.status(400).json({ error: "Ação inválida." });
    };
    const slug =
      req.body?.action === "project" ? req.body.slug : req.body?.project;
    return slug
      ? await storage.withProjectLock(base, slug, operation)
      : await operation();
  } catch (error: any) {
    console.error("OTA administration:", error.message);
    return res.status(error.code ? 500 : 400).json({
      error: error.code
        ? "Falha ao gravar. Confira as permissões do volume e espaço disponível."
        : error.message,
    });
  }
}
