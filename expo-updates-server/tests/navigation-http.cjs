const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const base = "http://127.0.0.1:3100",
  project = "nav-test-" + Date.now();
let cookie = "";
async function post(route, body) {
  return fetch(base + route, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://expo.vdigitalslab.com",
      Cookie: cookie,
    },
    body: JSON.stringify(body),
  });
}
async function html(query = "") {
  return (await fetch(base + query, { headers: { Cookie: cookie } })).text();
}
(async () => {
  try {
    const login = await post("/api/admin/session", {
      username: "test-admin",
      password: "test-local-only",
    });
    cookie = login.headers.get("set-cookie").split(";")[0];
    await post("/api/admin/releases", {
      action: "project",
      name: "Nav test",
      slug: project,
    });
    const home = await html();
    const nav = home.match(/<nav[\s\S]*?<\/nav>/)[0];
    assert.match(nav, /Todos os projetos/);
    assert.match(nav, /Integrações/);
    assert.doesNotMatch(
      nav,
      /Publicar OTA|Credenciais Android|Dispositivos Apple/,
    );
    assert.match(home, new RegExp('section=builds[^"<>]*project=' + project));
    const projectPage = await html("/?project=" + project);
    const projectNav = projectPage.match(/<nav[\s\S]*?<\/nav>/)[0];
    assert.match(projectNav, /ANDROID/);
    assert.match(projectNav, /iOS/);
    assert.match(projectNav, /Credenciais Android/);
    assert.match(projectNav, /Credenciais iOS/);
    assert.doesNotMatch(
      await html("/?section=publish"),
      /Nova atualização OTA/,
    );
    assert.match(
      await html("/?section=publish&legacy=1"),
      /Nova atualização OTA/,
    );
    assert.match(
      await html("/?section=ios-builds&project=" + project),
      /iOS · TestFlight/,
    );
    const get = await (
      await post("/api/admin/builds", { action: "get", project })
    ).json();
    assert.equal(get.connected, false);
    assert.equal(
      (
        await post("/api/admin/builds", {
          action: "save",
          project,
          repository: "owner/app",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await post("/api/admin/builds", {
          action: "dispatch",
          project,
          ref: "main",
        })
      ).status,
      400,
    );
    console.log(
      "PASS scoped navigation, card APK action, explicit legacy and disconnected build state",
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
