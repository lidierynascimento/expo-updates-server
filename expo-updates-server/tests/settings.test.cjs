const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const storage = require("../common/admin-storage.cjs");
const settings = require("../common/admin-settings.cjs");
test("project settings encrypt secrets, preserve concurrent writes and scope/revoke tokens", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ota-settings-"));
  try {
    await storage.createProject(root, "One", "one");
    await storage.createProject(root, "Two", "two");
    await Promise.all(
      ["FIRST", "SECOND"].map((name) =>
        settings.mutate(root, "one", {
          action: "create",
          kind: "environment",
          name,
          value: "private-" + name,
          environment: "production",
        }),
      ),
    );
    let rows = await settings.list(root, "one");
    assert.equal(rows.length, 2);
    assert.ok(rows.every((row) => !row.secret && !row.value));
    const disk = await fs.readFile(
      path.join(root, ".admin", "one.json"),
      "utf8",
    );
    assert.equal(disk.includes("private-FIRST"), false);
    const first = rows.find((row) => row.name === "FIRST");
    assert.equal(
      (await settings.reveal(root, "one", first.id)).value,
      "private-FIRST",
    );
    await assert.rejects(settings.reveal(root, "two", first.id));
    const record = await settings.mutate(root, "one", {
      action: "create",
      kind: "credentials",
      name: "Android",
      identifier: "com.example.app",
      platform: "android",
      filename: "signing.jks",
      data: Buffer.from("private-credential").toString("base64"),
      password: "private-password",
    });
    const credential = record.rows.find((row) => row.kind === "credentials");
    assert.equal(credential.data, undefined);
    assert.equal(credential.password, undefined);
    assert.equal(
      (await settings.reveal(root, "one", credential.id)).password,
      "private-password",
    );
    const created = await settings.mutate(root, "one", {
      action: "create",
      kind: "tokens",
      name: "CI",
      days: 30,
    });
    assert.equal(
      await settings.tokenAuthorized(root, "one", "Bearer " + created.token),
      true,
    );
    assert.equal(
      await settings.tokenAuthorized(root, "two", "Bearer " + created.token),
      false,
    );
    assert.equal(
      JSON.stringify(await settings.list(root, "one")).includes(created.token),
      false,
    );
    const tokenRow = created.rows.find((row) => row.kind === "tokens");
    assert.equal(tokenRow.hash, undefined);
    await settings.mutate(root, "one", { action: "delete", id: tokenRow.id });
    assert.equal(
      await settings.tokenAuthorized(root, "one", "Bearer " + created.token),
      false,
    );
    assert.deepEqual(await settings.list(root, "two"), []);
    await assert.rejects(
      settings.mutate(root, "../escape", {
        action: "create",
        kind: "tokens",
        name: "bad",
      }),
    );
    const key = await fs.stat(path.join(root, ".admin", "master-key"));
    assert.equal(key.mode & 0o777, 0o600);
    const file = path.join(root, ".admin", "one.json");
    const raw = JSON.parse(await fs.readFile(file, "utf8"));
    raw[0].secret.data = "AAAA";
    await fs.writeFile(file, JSON.stringify(raw));
    await assert.rejects(settings.reveal(root, "one", raw[0].id));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
