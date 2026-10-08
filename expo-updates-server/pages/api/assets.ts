import fs from "fs/promises";
import mime from "mime";
import path from "path";
import type { NextApiRequest, NextApiResponse } from "next";
const storage = require("../../common/admin-storage.cjs");
export default async function assets(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET")
    return res.status(405).json({ error: "Expected GET" });
  const { asset, runtimeVersion, platform, project } = req.query;
  if (
    typeof asset !== "string" ||
    typeof runtimeVersion !== "string" ||
    !storage.safeRuntime(runtimeVersion) ||
    (platform !== "android" && platform !== "ios")
  )
    return res.status(400).json({ error: "Invalid request" });
  if (project !== undefined && !storage.safeProject(project))
    return res.status(400).json({ error: "Invalid project" });
  const base = project
    ? `updates/projects/${project}/${runtimeVersion}/`
    : `updates/${runtimeVersion}/`;
  if (!asset.startsWith(base))
    return res.status(400).json({ error: "Invalid asset path" });
  const relative = asset.slice(base.length);
  const split = relative.indexOf("/");
  const version = relative.slice(0, split);
  const file = relative.slice(split + 1);
  if (split < 0 || !/^\d+$/.test(version) || !storage.safePath(file))
    return res.status(400).json({ error: "Invalid asset path" });
  try {
    const folder = path.resolve(base, version);
    const realFolder = await fs.realpath(folder);
    const realRoot = await fs.realpath("updates");
    const actual = await fs.realpath(path.join(folder, file));
    if (
      !realFolder.startsWith(realRoot + path.sep) ||
      !actual.startsWith(realFolder + path.sep)
    )
      return res.status(400).json({ error: "Invalid asset path" });
    const metadata = JSON.parse(
      await fs.readFile(path.join(folder, "metadata.json"), "utf8"),
    );
    const info = metadata.fileMetadata[platform];
    const item = info.assets.find((entry: any) => entry.path === file);
    if (info.bundle !== file && !item)
      return res.status(404).json({ error: "Unknown asset" });
    const content = await fs.readFile(actual);
    res.setHeader(
      "Content-Type",
      info.bundle === file
        ? "application/javascript"
        : mime.getType(item.ext) || "application/octet-stream",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.status(200).send(content);
  } catch {
    return res.status(404).json({ error: "Asset not found" });
  }
}
