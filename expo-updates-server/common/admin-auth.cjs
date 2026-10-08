const crypto = require("node:crypto");
const attempts = new Map();
const hash = (value) => crypto.createHash("sha256").update(value).digest();
const equal = (a, b) => crypto.timingSafeEqual(hash(a), hash(b));
function configured() {
  return !!(process.env.DASHBOARD_USERNAME && process.env.DASHBOARD_PASSWORD);
}
function mac(value) {
  return crypto
    .createHmac("sha256", process.env.DASHBOARD_PASSWORD)
    .update(process.env.DASHBOARD_USERNAME + ":" + value)
    .digest("hex");
}
function token(now = Date.now()) {
  const data = Buffer.from(
    JSON.stringify({
      expires: now + 8 * 3600000,
      nonce: crypto.randomBytes(16).toString("hex"),
    }),
  ).toString("base64url");
  return data + "." + mac(data);
}
function authorized(req, now = Date.now()) {
  if (!configured()) return false;
  const entry = (req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("ota_session="));
  if (!entry) return false;
  const [data, signature] = entry.slice(12).split(".");
  if (!data || !signature || !equal(signature, mac(data))) return false;
  try {
    return JSON.parse(Buffer.from(data, "base64url").toString()).expires > now;
  } catch {
    return false;
  }
}
function sameOrigin(req) {
  try {
    return (
      new URL(req.headers.origin).origin ===
      new URL(process.env.HOSTNAME).origin
    );
  } catch {
    return false;
  }
}
function loginAllowed(key, now = Date.now()) {
  for (const [id, item] of attempts) if (item.until <= now) attempts.delete(id);
  const current = attempts.get(key) || { count: 0, until: now + 900000 };
  current.count++;
  attempts.set(key, current);
  return current.count <= 10;
}
function credentials(username, password) {
  if (
    !configured() ||
    typeof username !== "string" ||
    typeof password !== "string"
  )
    return false;
  const a = equal(username, process.env.DASHBOARD_USERNAME);
  const b = equal(password, process.env.DASHBOARD_PASSWORD);
  return a && b;
}
function cookie(value, age = 28800) {
  return (
    "ota_session=" +
    value +
    "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=" +
    age
  );
}
module.exports = {
  configured,
  authorized,
  sameOrigin,
  loginAllowed,
  credentials,
  token,
  cookie,
};
