const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const base = "http://127.0.0.1:3100";
const project = "delete-test-" + Date.now();
let cookie = "";
async function post(route, body, extra = {}) {
  return fetch(base + route, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://expo.vdigitalslab.com",
      Cookie: cookie,
      ...extra,
    },
    body: JSON.stringify(body),
  });
}
(async () => {
  try {
    const login = await post("/api/admin/session", {
      username: "test-admin",
      password: "test-local-only",
    });
    cookie = login.headers.get("set-cookie").split(";")[0];
    assert.equal(
      (
        await post("/api/admin/releases", {
          action: "project",
          name: "Delete Test",
          slug: project,
        })
      ).status,
      200,
    );
    const token = (
      await (
        await post("/api/admin/settings", {
          project,
          action: "create",
          kind: "tokens",
          name: "CI",
          days: 30,
        })
      ).json()
    ).token;
    const html = await (
      await fetch(base + "/?project=" + project, {
        headers: { Cookie: cookie },
      })
    ).text();
    assert.match(html, /Conectar aplicativo/);
    assert.match(html, /PowerShell/);
    assert.match(html, /OpenCode/);
    assert.match(html, new RegExp("api/manifest\\?project=" + project));
    const deletion = {
      action: "deleteProject",
      project,
      confirmation: project,
      password: "test-local-only",
    };
    assert.equal(
      (
        await post("/api/admin/releases", deletion, {
          Cookie: "",
          Authorization: "Bearer " + token,
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await post("/api/admin/releases", deletion, {
          Origin: "https://evil.example.com",
        })
      ).status,
      403,
    );
    assert.equal(
      (await post("/api/admin/releases", { ...deletion, password: "wrong" }))
        .status,
      403,
    );
    assert.equal(
      (
        await post("/api/admin/releases", {
          ...deletion,
          confirmation: "wrong",
        })
      ).status,
      400,
    );
    assert.equal((await post("/api/admin/releases", deletion)).status, 200);
    const res = await fetch(
      base +
        "/api/manifest?project=" +
        project +
        "&runtime-version=1&platform=android",
    );
    assert.equal(res.status, 404);
    assert.equal(
      (
        await post("/api/admin/releases", {
          action: "project",
          name: "New",
          slug: project,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await post(
          "/api/admin/releases",
          { action: "publish", project },
          { Cookie: "", Authorization: "Bearer " + token },
        )
      ).status,
      401,
    );
    console.log(
      "PASS project HTTP: connection block, deletion auth/origin/password/slug checks, manifest removal and revoked token after recreation",
    );
  } finally {
    await fs.rm("updates/projects/" + project, {
      recursive: true,
      force: true,
    });
    await fs.rm("updates/.admin/" + project + ".json", { force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
