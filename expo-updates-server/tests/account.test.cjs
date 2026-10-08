const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const auth = require("../common/admin-auth.cjs");
const account = require("../common/admin-account.cjs");
test("profile persists, password is hashed and sessions are revoked", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vd-account-"));
  const before = process.cwd();
  process.chdir(root);
  process.env.DASHBOARD_USERNAME = "admin";
  process.env.DASHBOARD_PASSWORD = "bootstrap-password";
  const authorized = (token) =>
    auth.authorized({ headers: { cookie: "ota_session=" + token } });
  try {
    assert.equal(auth.credentials("admin", "bootstrap-password"), true);
    const first = auth.token();
    account.updateProfile("Lidyh", "test@example.com");
    assert.equal(account.profile().name, "Lidyh");
    assert.equal(authorized(first), true);
    assert.throws(() => account.updateProfile("", "invalid"));
    assert.throws(() => account.changePassword("short"));
    account.changePassword("new-strong-password");
    assert.equal(auth.credentials("admin", "bootstrap-password"), false);
    assert.equal(auth.credentials("admin", "new-strong-password"), true);
    assert.equal(auth.credentials("other", "new-strong-password"), false);
    assert.equal(authorized(first), false);
    const second = auth.token();
    assert.equal(authorized(second), true);
    account.revokeSessions();
    assert.equal(authorized(second), false);
    const file = path.join(root, "updates/.admin/account/profile.json");
    const saved = fs.readFileSync(file, "utf8");
    assert.equal(saved.includes("new-strong-password"), false);
    assert.equal(saved.includes("bootstrap-password"), false);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal("passwordHash" in account.profile(), false);
    assert.equal(account.verify("x".repeat(2000)), false);
  } finally {
    process.chdir(before);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
