const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const base = "http://127.0.0.1:3100",
  project = "builds-test-" + Date.now();
let cookie = "";
async function post(route, body, headers = {}) {
  return fetch(base + route, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://expo.vdigitalslab.com",
      Cookie: cookie,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
(async () => {
  try {
    assert.equal(
      (await post("/api/admin/builds", { action: "get", project })).status,
      401,
    );
    const login = await post("/api/admin/session", {
      username: "test-admin",
      password: "test-local-only",
    });
    cookie = login.headers.get("set-cookie").split(";")[0];
    assert.equal(
      (
        await post("/api/admin/releases", {
          action: "project",
          name: "Builds",
          slug: project,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await post(
          "/api/admin/builds",
          { action: "save", project, repository: "user/repo" },
          { Origin: "https://evil.test" },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await post("/api/admin/builds", {
          action: "save",
          project,
          repository: "https://evil.test",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await post("/api/admin/builds", {
          action: "save",
          project,
          repository: "user/repo",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await (
          await post("/api/admin/builds", { action: "get", project })
        ).json()
      ).repository,
      "user/repo",
    );
    assert.match(
      await (
        await fetch(base + "/?section=builds&project=" + project, {
          headers: { Cookie: cookie },
        })
      ).text(),
      /Gerar APK/,
    );
    console.log(
      "PASS builds HTTP: authentication, origin, repository validation, persistence and page",
    );
  } finally {
    await fs.rm("updates/projects/" + project, {
      recursive: true,
      force: true,
    });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
