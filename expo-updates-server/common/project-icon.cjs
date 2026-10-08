const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const sharp = require("sharp");
const storage = require("./admin-storage.cjs");
async function save(root, project, data) {
  const folder = await storage.projectRoot(root, project);
  if (
    typeof data !== "string" ||
    data.length > 2800000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(data)
  )
    throw new Error("Selecione uma imagem PNG, JPEG ou WebP de até 2 MB.");
  const input = Buffer.from(data, "base64");
  if (input.length > 2 * 1024 * 1024)
    throw new Error("Limite de 2 MB por ícone.");
  let output;
  try {
    const image = sharp(input, { limitInputPixels: 16777216 });
    const meta = await image.metadata();
    if (
      !["png", "jpeg", "webp"].includes(meta.format) ||
      (meta.pages || 1) > 1 ||
      (meta.width || 0) > 4096 ||
      (meta.height || 0) > 4096
    )
      throw new Error("format");
    output = await image
      .rotate()
      .resize(256, 256, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      })
      .png()
      .toBuffer();
  } catch {
    throw new Error(
      "Imagem inválida. Use PNG, JPEG ou WebP estático de até 4096 × 4096 pixels.",
    );
  }
  const temp = path.join(folder, ".icon-" + crypto.randomUUID());
  try {
    await fs.writeFile(temp, output, { flag: "wx", mode: 0o600 });
    await fs.rename(temp, path.join(folder, ".icon.png"));
  } finally {
    await fs.rm(temp, { force: true });
  }
  return { ok: true };
}
async function remove(root, project) {
  const folder = await storage.projectRoot(root, project);
  await fs.rm(path.join(folder, ".icon.png"), { force: true });
  return { ok: true };
}
module.exports = { save, remove };
