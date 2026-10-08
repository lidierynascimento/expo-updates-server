const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const sharp = require("sharp");
const base = "http://127.0.0.1:3100";
const project = "icon-test-" + Date.now();
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
    const login = await post("/api/admin/session", {
      username: "test-admin",
      password: "test-local-only",
    });
    cookie = login.headers.get("set-cookie").split(";")[0];
    assert.equal(
      (
        await post("/api/admin/releases", {
          action: "project",
          name: "Icon test",
          slug: project,
        })
      ).status,
      200,
    );
    const data = (
      await sharp({
        create: { width: 40, height: 40, channels: 4, background: "#336699" },
      })
        .png()
        .toBuffer()
    ).toString("base64");
    assert.equal(
      (
        await post(
          "/api/admin/icon",
          { action: "save", project, data },
          { Cookie: "" },
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await post(
          "/api/admin/icon",
          { action: "save", project, data },
          { Origin: "https://evil.test" },
        )
      ).status,
      403,
    );
    assert.equal(
      (await post("/api/admin/icon", { action: "save", project, data })).status,
      200,
    );
    const url = base + "/api/admin/icon?project=" + project;
    assert.equal((await fetch(url)).status, 401);
    const image = await fetch(url, { headers: { Cookie: cookie } });
    assert.equal(image.status, 200);
    assert.equal(image.headers.get("content-type"), "image/png");
    const html = await (
      await fetch(base, { headers: { Cookie: cookie } })
    ).text();
    assert.match(html, new RegExp("/api/admin/icon\\?project=" + project));
    assert.equal(
      (await post("/api/admin/icon", { action: "remove", project })).status,
      200,
    );
    assert.equal(
      (await fetch(url, { headers: { Cookie: cookie } })).status,
      404,
    );
    console.log(
      "PASS icon HTTP upload, protected download, origin/auth checks, card rendering and removal",
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
