const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const base = "http://127.0.0.1:3100";
const file = path.resolve("updates/.admin/account/profile.json");
let cookie = "";
async function post(
  route,
  data,
  origin = "https://expo.vdigitalslab.com",
  session = cookie,
) {
  return fetch(base + route, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      Cookie: session,
    },
    body: JSON.stringify(data),
  });
}
async function login(password) {
  const res = await post("/api/admin/session", {
    username: "test-admin",
    password,
  });
  if (res.ok) cookie = res.headers.get("set-cookie").split(";")[0];
  return res;
}
(async () => {
  try {
    await fs.access(file);
    throw new Error(
      "Refusing to modify an existing account. Use a disposable test server.",
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  try {
    assert.equal(
      (await post("/api/admin/account", { action: "profile" })).status,
      401,
    );
    assert.equal((await login("test-local-only")).status, 200);
    assert.equal(
      (
        await post(
          "/api/admin/account",
          { action: "profile", name: "Test", email: "" },
          "https://evil.example.com",
        )
      ).status,
      403,
    );
    let res = await post("/api/admin/account", {
      action: "profile",
      name: "Test Profile",
      email: "test@example.com",
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.profile.name, "Test Profile");
    assert.equal("passwordHash" in body.profile, false);
    const html = await (
      await fetch(base + "/?section=account", { headers: { Cookie: cookie } })
    ).text();
    assert.match(html, /Test Profile/);
    assert.match(html, /vDeploy/);
    assert.match(html, /Alterar senha/);
    assert.equal(
      (
        await post("/api/admin/account", {
          action: "password",
          currentPassword: "wrong",
          newPassword: "changed-password-123",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await post("/api/admin/account", {
          action: "password",
          currentPassword: "test-local-only",
          newPassword: "changed-password-123",
        })
      ).status,
      200,
    );
    assert.equal(
      (await post("/api/admin/account", { action: "profile" })).status,
      401,
    );
    assert.equal((await login("test-local-only")).status, 401);
    assert.equal((await login("changed-password-123")).status, 200);
    assert.equal(
      (
        await post("/api/admin/account", {
          action: "revoke",
          currentPassword: "changed-password-123",
        })
      ).status,
      200,
    );
    assert.equal(
      (await post("/api/admin/account", { action: "profile" })).status,
      401,
    );
    console.log(
      "PASS account HTTP: profile, origin/auth checks, password change, session revocation, branded SSR",
    );
  } finally {
    await fs.rm(file, { force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
