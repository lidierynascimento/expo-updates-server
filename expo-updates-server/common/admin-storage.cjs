const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const MAX_BYTES = 32 * 1024 * 1024;
const safeRuntime = (value) =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
function safePath(value) {
  return (
    typeof value === "string" &&
    value.length <= 500 &&
    !value.includes("\\") &&
    !value.includes("\0") &&
    !path.posix.isAbsolute(value) &&
    value
      .split("/")
      .every((x) => x && x !== "." && x !== ".." && !x.startsWith("."))
  );
}
function validate(input) {
  if (!safeRuntime(input.runtime))
    throw new Error(
      "Runtime inválido. Use letras, números, ponto, hífen ou sublinhado.",
    );
  if (
    !Array.isArray(input.files) ||
    input.files.length < 3 ||
    input.files.length > 3000
  )
    throw new Error("Selecione um export completo, com até 3000 arquivos.");
  const files = new Map();
  let bytes = 0;
  for (const item of input.files) {
    if (!safePath(item.path) || files.has(item.path))
      throw new Error("Caminho de arquivo inválido ou duplicado.");
    if (
      typeof item.data !== "string" ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        item.data,
      )
    )
      throw new Error("Conteúdo de arquivo inválido.");
    const content = Buffer.from(item.data, "base64");
    bytes += content.length;
    if (bytes > MAX_BYTES)
      throw new Error("O export excede o limite de 32 MB.");
    if (/\.(pem|key|p12|pfx)$/i.test(item.path) || item.path === "rollback")
      throw new Error(
        "Chaves privadas e marcadores de rollback não podem ser enviados.",
      );
    files.set(item.path, content);
  }
  let metadata, config;
  try {
    metadata = JSON.parse(files.get("metadata.json").toString());
    config = JSON.parse(files.get("expoConfig.json").toString());
  } catch {
    throw new Error(
      "Inclua metadata.json e expoConfig.json válidos na raiz do export.",
    );
  }
  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config) ||
    config.runtimeVersion !== input.runtime
  )
    throw new Error(
      "runtimeVersion de expoConfig.json deve ser igual ao runtime informado.",
    );
  const platforms = ["android", "ios"].filter(
    (p) => metadata.fileMetadata?.[p],
  );
  if (!platforms.length)
    throw new Error("Não há plataformas Android/iOS no export.");
  for (const platform of platforms) {
    const info = metadata.fileMetadata[platform];
    if (
      !safePath(info.bundle) ||
      !files.has(info.bundle) ||
      !Array.isArray(info.assets)
    )
      throw new Error("Bundle ou lista de assets inválidos.");
    for (const asset of info.assets)
      if (
        !safePath(asset.path) ||
        !files.has(asset.path) ||
        typeof asset.ext !== "string"
      )
        throw new Error("Há assets ausentes ou inválidos.");
  }
  return { runtime: input.runtime, files, bytes };
}
async function inside(root, folder) {
  const realRoot = await fs.realpath(root);
  const realFolder = await fs.realpath(folder);
  if (realFolder !== realRoot && !realFolder.startsWith(realRoot + path.sep))
    throw new Error("Diretório fora do armazenamento.");
}
async function commit(root, runtime, write) {
  if (!safeRuntime(runtime)) throw new Error("Runtime inválido.");
  await fs.mkdir(root, { recursive: true });
  const folder = path.join(root, runtime);
  await fs.mkdir(folder, { recursive: true });
  await inside(root, folder);
  const lockPath = path.join(folder, ".admin-lock");
  let lock;
  try {
    lock = await fs.open(lockPath, "wx");
  } catch {
    throw new Error("Publicação em andamento neste runtime. Tente novamente.");
  }
  let stage;
  try {
    const staging = path.join(root, ".staging");
    await fs.mkdir(staging, { recursive: true });
    await inside(root, staging);
    stage = await fs.mkdtemp(path.join(staging, "release-"));
    const names = await fs.readdir(folder);
    const latest = Math.max(
      0,
      ...names.filter((x) => /^\d+$/.test(x)).map(Number),
    );
    if (!Number.isSafeInteger(latest))
      throw new Error("Versão existente inválida.");
    const version = String(Math.max(Date.now(), latest + 1));
    await write(stage);
    await fs.rename(stage, path.join(folder, version));
    stage = null;
    return version;
  } finally {
    if (stage) await fs.rm(stage, { recursive: true, force: true });
    await lock.close();
    await fs.unlink(lockPath);
  }
}
async function publish(root, input) {
  const checked = validate(input);
  const version = await commit(root, checked.runtime, async (stage) => {
    for (const [name, content] of checked.files) {
      const dest = path.join(stage, name);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, content, { flag: "wx" });
    }
  });
  return { version, bytes: checked.bytes };
}
async function rollback(root, runtime) {
  const version = await commit(root, runtime, (stage) =>
    fs.writeFile(path.join(stage, "rollback"), "", { flag: "wx" }),
  );
  return { version };
}
const safeProject = (value) =>
  typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
async function createProject(root, name, slug) {
  if (
    !safeProject(slug) ||
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 100
  )
    throw new Error(
      "Informe um nome e um slug com letras minúsculas, números e hífens.",
    );
  await fs.mkdir(path.join(root, "projects"), { recursive: true });
  await inside(root, path.join(root, "projects"));
  const folder = path.join(root, "projects", slug);
  try {
    await fs.mkdir(folder);
  } catch (error) {
    if (error.code === "EEXIST") throw new Error("Esse slug já existe.");
    throw error;
  }
  try {
    await fs.writeFile(
      path.join(folder, "project.json"),
      JSON.stringify({ name: name.trim(), slug }),
      { flag: "wx" },
    );
  } catch (error) {
    await fs.rm(folder, { recursive: true, force: true });
    throw error;
  }
  return { slug };
}
async function projectRoot(root, slug) {
  if (!safeProject(slug)) throw new Error("Selecione um projeto válido.");
  const folder = path.join(root, "projects", slug);
  await inside(root, folder);
  await fs.readFile(path.join(folder, "project.json"));
  return folder;
}
module.exports = {
  publish,
  rollback,
  validate,
  safeRuntime,
  safePath,
  MAX_BYTES,
  createProject,
  projectRoot,
  safeProject,
};
