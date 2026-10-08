const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
function filename() {
  return path.resolve("updates/.admin/account/profile.json");
}
function read() {
  try {
    return JSON.parse(fs.readFileSync(filename(), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}
function write(value) {
  const file = filename();
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = file + "." + crypto.randomUUID();
  try {
    fs.writeFileSync(temp, JSON.stringify(value), { mode: 0o600, flag: "wx" });
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}
function profile() {
  const value = read();
  return {
    name: value.name || "Administrador",
    email: value.email || "",
    username: process.env.DASHBOARD_USERNAME || "",
    passwordChangedAt: value.passwordChangedAt || null,
  };
}
function updateProfile(name, email) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 80)
    throw new Error("Informe um nome com até 80 caracteres.");
  if (
    typeof email !== "string" ||
    email.length > 254 ||
    (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  )
    throw new Error("Informe um e-mail válido ou deixe vazio.");
  write({ ...read(), name: name.trim(), email: email.trim() });
  return profile();
}
function verify(password) {
  if (typeof password !== "string" || password.length > 1024) return false;
  const value = read();
  if (!value.passwordHash) {
    const digest = (s) => crypto.createHash("sha256").update(s).digest();
    return crypto.timingSafeEqual(
      digest(password),
      digest(process.env.DASHBOARD_PASSWORD || ""),
    );
  }
  const actual = crypto.scryptSync(password, value.salt, 64);
  return crypto.timingSafeEqual(actual, Buffer.from(value.passwordHash, "hex"));
}
function changePassword(password) {
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    password.length > 128
  )
    throw new Error("A nova senha deve ter entre 12 e 128 caracteres.");
  const salt = crypto.randomBytes(32).toString("hex");
  write({
    ...read(),
    salt,
    passwordHash: crypto.scryptSync(password, salt, 64).toString("hex"),
    sessionVersion: crypto.randomUUID(),
    passwordChangedAt: new Date().toISOString(),
  });
}
function revokeSessions() {
  write({ ...read(), sessionVersion: crypto.randomUUID() });
}
function sessionVersion() {
  return read().sessionVersion || "bootstrap";
}
module.exports = {
  profile,
  updateProfile,
  verify,
  changePassword,
  revokeSessions,
  sessionVersion,
};
