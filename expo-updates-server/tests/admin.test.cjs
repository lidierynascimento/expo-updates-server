const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const auth = require("../common/admin-auth.cjs");
const storage = require("../common/admin-storage.cjs");
const encode = (file, data) => ({
  path: file,
  data: Buffer.from(data).toString("base64"),
});
const exportData = () => ({
  runtime: "1.0.0",
  files: [
    encode(
      "metadata.json",
      JSON.stringify({
        fileMetadata: {
          android: {
            bundle: "_expo/main.hbc",
            assets: [{ path: "assets/a", ext: "png" }],
          },
        },
      }),
    ),
    encode("expoConfig.json", JSON.stringify({ runtimeVersion: "1.0.0" })),
    encode("_expo/main.hbc", "bundle"),
    encode("assets/a", "asset"),
  ],
});
test("authentication rejects tampering, expiry and wrong origin", () => {
  process.env.DASHBOARD_USERNAME = "admin";
  process.env.DASHBOARD_PASSWORD = "test-only";
  process.env.HOSTNAME = "https://expo.example.com";
  const token = auth.token(1000);
  assert.equal(
    auth.authorized({ headers: { cookie: "ota_session=" + token } }, 2000),
    true,
  );
  assert.equal(
    auth.authorized(
      { headers: { cookie: "ota_session=" + token + "x" } },
      2000,
    ),
    false,
  );
  assert.equal(
    auth.authorized({ headers: { cookie: "ota_session=" + token } }, 30000000),
    false,
  );
  assert.equal(auth.credentials("admin", "wrong"), false);
  assert.equal(
    auth.sameOrigin({ headers: { origin: "https://evil.example.com" } }),
    false,
  );
  assert.equal(
    auth.sameOrigin({ headers: { origin: "https://expo.example.com" } }),
    true,
  );
  for (let i = 0; i < 10; i++)
    assert.equal(auth.loginAllowed("test", 1000), true);
  assert.equal(auth.loginAllowed("test", 1000), false);
});
test("upload rejects traversal, absent assets, mismatched runtime and keys", () => {
  let input = exportData();
  input.files.push(encode("../outside", "x"));
  assert.throws(() => storage.validate(input));
  input = exportData();
  input.files.pop();
  assert.throws(() => storage.validate(input));
  input = exportData();
  input.runtime = "different";
  assert.throws(() => storage.validate(input));
  input = exportData();
  input.files.push(encode("private.pem", "x"));
  assert.throws(() => storage.validate(input));
});
test("projects isolate publication and rollback atomically", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ota-test-"));
  try {
    await storage.createProject(root, "Passenger", "passenger");
    await storage.createProject(root, "Driver", "driver");
    const passenger = await storage.projectRoot(root, "passenger");
    const driver = await storage.projectRoot(root, "driver");
    const release = await storage.publish(passenger, exportData());
    assert.equal(
      await fs.readFile(
        path.join(passenger, "1.0.0", release.version, "assets/a"),
        "utf8",
      ),
      "asset",
    );
    assert.deepEqual(await fs.readdir(driver), ["project.json"]);
    const rollback = await storage.rollback(passenger, "1.0.0");
    assert.ok(Number(rollback.version) > Number(release.version));
    assert.equal(
      await fs.readFile(
        path.join(passenger, "1.0.0", rollback.version, "rollback"),
        "utf8",
      ),
      "",
    );
    assert.equal(
      (await fs.readdir(path.join(passenger, "1.0.0"))).includes(".admin-lock"),
      false,
    );
    assert.deepEqual(await fs.readdir(path.join(passenger, ".staging")), []);
    await assert.rejects(storage.createProject(root, "Duplicate", "passenger"));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
test("publication rejects symlink escaping storage", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ota-root-"));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "ota-outside-"));
  try {
    await fs.symlink(outside, path.join(root, "1.0.0"));
    await assert.rejects(storage.publish(root, exportData()));
    assert.deepEqual(await fs.readdir(outside), []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});
