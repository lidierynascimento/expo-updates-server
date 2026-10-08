const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const storage = require("./admin-storage.cjs");
const queues = new Map();
const kinds = ["environment", "credentials", "devices", "tokens"];
const digest = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
async function serial(key, operation) {
  const before = queues.get(key) || Promise.resolve();
  const current = before.catch(() => {}).then(operation);
  queues.set(key, current);
  try {
    return await current;
  } finally {
    if (queues.get(key) === current) queues.delete(key);
  }
}
async function location(root, project) {
  await storage.projectRoot(root, project);
  const dir = path.join(root, ".admin");
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const actual = await fs.realpath(dir);
  if (actual !== path.join(await fs.realpath(root), ".admin"))
    throw new Error("Diretório de administração inválido.");
  const filename = path.join(dir, project + ".json");
  return { dir, filename };
}
async function masterKey(dir) {
  const keyfile = path.join(dir, "master-key");
  try {
    const key = await fs.readFile(keyfile);
    if (key.length !== 32) throw new Error("Chave de armazenamento inválida.");
    return key;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const temp = path.join(dir, ".key-" + crypto.randomUUID());
    await fs.writeFile(temp, crypto.randomBytes(32), {
      mode: 0o600,
      flag: "wx",
    });
    try {
      await fs.link(temp, keyfile);
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    } finally {
      await fs.unlink(temp);
    }
    return fs.readFile(keyfile);
  }
}
function encrypt(value, key) {
  const iv = crypto.randomBytes(12),
    cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: ciphertext.toString("base64"),
  };
}
function decrypt(value, key) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(value.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(value.tag, "base64"));
  return JSON.parse(
    Buffer.concat([
      decipher.update(Buffer.from(value.data, "base64")),
      decipher.final(),
    ]).toString("utf8"),
  );
}
async function read(filename) {
  try {
    return JSON.parse(await fs.readFile(filename, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}
function publicRecord(row) {
  const { secret, hash, ...visible } = row;
  return visible;
}
async function list(root, project) {
  const { filename } = await location(root, project);
  return (await read(filename)).map(publicRecord);
}
function text(value, max = 100) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error("Preencha os campos obrigatórios.");
  return value.trim();
}
async function mutate(root, project, input) {
  const { dir, filename } = await location(root, project);
  return serial(filename, async () => {
    let rows = await read(filename),
      token;
    if (input.action === "delete") {
      if (
        typeof input.id !== "string" ||
        !rows.some((row) => row.id === input.id)
      )
        throw new Error("Registro não encontrado.");
      rows = rows.filter((row) => row.id !== input.id);
    } else if (input.action === "create" && kinds.includes(input.kind)) {
      if (rows.length >= 500)
        throw new Error("Limite de 500 registros por projeto.");
      const row = {
        id: crypto.randomUUID(),
        kind: input.kind,
        createdAt: new Date().toISOString(),
      };
      if (input.kind === "environment") {
        row.name = text(input.name, 128);
        if (
          !/^[A-Za-z_][A-Za-z0-9_]*$/.test(row.name) ||
          typeof input.value !== "string" ||
          input.value.length > 16000
        )
          throw new Error("Nome ou valor de variável inválido.");
        row.environment = ["development", "preview", "production"].includes(
          input.environment,
        )
          ? input.environment
          : "production";
        if (
          rows.some(
            (item) =>
              item.kind === row.kind &&
              item.name === row.name &&
              item.environment === row.environment,
          )
        )
          throw new Error("Esta variável já existe neste ambiente.");
        row.secret = encrypt({ value: input.value }, await masterKey(dir));
      }
      if (input.kind === "credentials") {
        row.name = text(input.name);
        row.platform = input.platform;
        if (!["android", "ios"].includes(row.platform))
          throw new Error("Plataforma inválida.");
        row.identifier = text(input.identifier, 200);
        row.filename = text(input.filename, 150);
        if (
          !/\.(jks|keystore|p12|mobileprovision)$/i.test(row.filename) ||
          /[\\/]/.test(row.filename)
        )
          throw new Error(
            "Use um arquivo JKS, keystore, P12 ou mobileprovision.",
          );
        if (
          typeof input.data !== "string" ||
          input.data.length > 2800000 ||
          !/^[A-Za-z0-9+/]*={0,2}$/.test(input.data)
        )
          throw new Error("Arquivo inválido ou maior que 2 MB.");
        const bytes = Buffer.from(input.data, "base64");
        if (!bytes.length || bytes.length > 2 * 1024 * 1024)
          throw new Error("Arquivo inválido ou maior que 2 MB.");
        if (typeof input.password !== "string" || input.password.length > 1000)
          throw new Error("Senha inválida.");
        row.bytes = bytes.length;
        row.secret = encrypt(
          { data: input.data, password: input.password },
          await masterKey(dir),
        );
      }
      if (input.kind === "devices") {
        row.name = text(input.name);
        row.udid = text(input.udid, 64);
        if (
          !/^(?:[A-Fa-f0-9]{40}|[A-Fa-f0-9]{8}-[A-Fa-f0-9]{16})$/.test(row.udid)
        )
          throw new Error(
            "Informe um UDID válido (40 caracteres ou formato 00000000-0000000000000000).",
          );
        if (
          rows.some(
            (item) =>
              item.kind === row.kind &&
              item.udid.toLowerCase() === row.udid.toLowerCase(),
          )
        )
          throw new Error("Este dispositivo já está cadastrado.");
      }
      if (input.kind === "tokens") {
        row.name = text(input.name);
        row.scope = "publish";
        const days = [30, 90, 365].includes(Number(input.days))
          ? Number(input.days)
          : 30;
        row.expiresAt = new Date(Date.now() + days * 86400000).toISOString();
        token = "ota_" + crypto.randomBytes(32).toString("base64url");
        row.hash = digest(token);
        row.prefix = token.slice(0, 12) + "…";
      }
      rows.push(row);
    } else throw new Error("Ação inválida.");
    const temp = filename + "." + crypto.randomUUID();
    try {
      await fs.writeFile(temp, JSON.stringify(rows), {
        mode: 0o600,
        flag: "wx",
      });
      await fs.rename(temp, filename);
    } finally {
      await fs.rm(temp, { force: true });
    }
    return { rows: rows.map(publicRecord), ...(token ? { token } : {}) };
  });
}
async function tokenAuthorized(root, project, authorization) {
  if (
    typeof authorization !== "string" ||
    !authorization.startsWith("Bearer ota_") ||
    authorization.length > 200
  )
    return false;
  try {
    const { filename } = await location(root, project),
      hash = digest(authorization.slice(7));
    return (await read(filename)).some(
      (row) =>
        row.kind === "tokens" &&
        row.scope === "publish" &&
        Date.parse(row.expiresAt) > Date.now() &&
        typeof row.hash === "string" &&
        crypto.timingSafeEqual(Buffer.from(row.hash), Buffer.from(hash)),
    );
  } catch {
    return false;
  }
}
async function reveal(root, project, id) {
  const { dir, filename } = await location(root, project);
  const row = (await read(filename)).find((item) => item.id === id);
  if (!row?.secret) throw new Error("Registro não encontrado.");
  return { ...publicRecord(row), ...decrypt(row.secret, await masterKey(dir)) };
}
module.exports = { list, mutate, tokenAuthorized, reveal };
