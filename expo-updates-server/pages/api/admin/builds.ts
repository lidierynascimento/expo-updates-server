import type { NextApiRequest, NextApiResponse } from "next";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
const auth = require("../../../common/admin-auth.cjs");
const github = require("../../../common/github-builds.cjs");
const storage = require("../../../common/admin-storage.cjs");
export const config = { api: { bodyParser: { sizeLimit: "8kb" } } };
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  res.setHeader("Cache-Control", "no-store");
  if (!auth.authorized(req))
    return res.status(401).json({ error: "Entre novamente no painel." });
  if (req.method === "GET") {
    try {
      const saved = await github.config(
        path.resolve("updates"),
        req.query.project,
      );
      const location = await github.download(
        saved.repository,
        req.query.run,
        req.query.artifact,
      );
      res.setHeader("Referrer-Policy", "no-referrer");
      return res.redirect(302, location);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  }
  if (req.method !== "POST") return res.status(405).end();
  if (!auth.sameOrigin(req))
    return res.status(403).json({ error: "Origem não autorizada." });
  try {
    const root = path.resolve("updates");
    return await storage.withProjectLock(root, req.body?.project, async () => {
      const folder = await storage.projectRoot(root, req.body.project);
      const file = path.join(folder, ".builds.json");
      if (req.body.action === "get") {
        const config = await fs
          .readFile(file, "utf8")
          .then(JSON.parse)
          .catch((error: any) => {
            if (error.code === "ENOENT") return { repository: "" };
            throw error;
          });
        return res.json({
          ...config,
          connected: github.configured(config.repository),
        });
      }
      if (["runs", "dispatch", "artifacts"].includes(req.body.action)) {
        const saved = await github.config(root, req.body.project);
        if (req.body.action === "runs")
          return res.json({ runs: await github.runs(saved.repository) });
        if (req.body.action === "artifacts")
          return res.json({
            artifacts: await github.artifacts(saved.repository, req.body.run),
          });
        if (!auth.loginAllowed("build:" + req.body.project))
          return res
            .status(429)
            .json({ error: "Limite de solicitações. Aguarde 15 minutos." });
        return res.json(
          await github.dispatch(saved.repository, req.body.ref, req.body.key),
        );
      }
      const repository = req.body.repository;
      if (
        req.body.action !== "save" ||
        typeof repository !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(
          repository,
        ) ||
        repository.endsWith("/..") ||
        repository.endsWith("/.")
      )
        return res.status(400).json({
          error: "Informe o repositório no formato usuario/repositorio.",
        });
      const temp = file + "." + crypto.randomUUID();
      try {
        await fs.writeFile(temp, JSON.stringify({ repository }), {
          flag: "wx",
          mode: 0o600,
        });
        await fs.rename(temp, file);
      } finally {
        await fs.rm(temp, { force: true });
      }
      return res.json({ repository, connected: github.configured(repository) });
    });
  } catch (error: any) {
    return res
      .status(400)
      .json({
        error: error.code
          ? "Não foi possível acessar a configuração de builds."
          : error.message,
      });
  }
}
