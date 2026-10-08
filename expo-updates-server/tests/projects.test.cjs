const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const storage = require("../common/admin-storage.cjs");
const settings = require("../common/admin-settings.cjs");
const { connectionGuide } = require("../common/connection-guide.cjs");
test("delete removes only target project and revokes old tokens even after recreation", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vdeploy-delete-"));
  try {
    await storage.createProject(root, "One", "one");
    await storage.createProject(root, "Two", "two");
    await settings.mutate(root, "two", {
      action: "create",
      kind: "environment",
      name: "KEEP",
      value: "preserved",
      environment: "production",
    });
    const token = (
      await settings.mutate(root, "one", {
        action: "create",
        kind: "tokens",
        name: "CI",
        days: 30,
      })
    ).token;
    await assert.rejects(storage.deleteProject(root, "one", "wrong"));
    await assert.rejects(storage.deleteProject(root, "../two", "../two"));
    assert.equal(
      await settings.tokenAuthorized(root, "one", "Bearer " + token),
      true,
    );
    await storage.withProjectLock(root, "one", async () => {
      await assert.rejects(
        storage.withProjectLock(root, "one", () =>
          storage.createProject(root, "Race", "one"),
        ),
        /ocupado/,
      );
      await storage.deleteProject(root, "one", "one");
    });
    await assert.rejects(fs.access(path.join(root, "projects/one")));
    await assert.rejects(fs.access(path.join(root, ".admin/one.json")));
    await storage.projectRoot(root, "two");
    await fs.access(path.join(root, ".admin/master-key"));
    assert.equal((await settings.list(root, "two")).length, 1);
    await storage.withProjectLock(root, "one", () =>
      storage.createProject(root, "New", "one"),
    );
    assert.equal(
      await settings.tokenAuthorized(root, "one", "Bearer " + token),
      false,
    );
    assert.deepEqual(await settings.list(root, "one"), []);
    await assert.rejects(
      storage.withProjectLock(root, "one", () =>
        Promise.reject(new Error("fail")),
      ),
    );
    await storage.withProjectLock(root, "one", async () => {});
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
test("connection instructions use deployment origin and chosen project without replacing app identity", () => {
  const guide = connectionGuide({
    name: "Passenger",
    project: "app-mob-passenger",
    serverUrl: "https://custom.example.com/",
    runtime: "2.1.0",
  });
  const config = JSON.parse(guide.expo);
  assert.equal(
    config.expo.updates.url,
    "https://custom.example.com/api/manifest?project=app-mob-passenger",
  );
  assert.equal(config.expo.runtimeVersion, "2.1.0");
  assert.equal(config.expo.slug, undefined);
  assert.match(guide.opencode, /app-mob-passenger/);
  assert.match(guide.opencode, /Preserve runtimeVersion/);
  assert.match(guide.powershell, /writeFileSync/);
  assert.throws(() =>
    connectionGuide({
      name: "X",
      project: "../x",
      serverUrl: "https://x.test",
      runtime: "1",
    }),
  );
});
