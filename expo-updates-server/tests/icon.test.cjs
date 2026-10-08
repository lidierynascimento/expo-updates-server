const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const storage = require("../common/admin-storage.cjs");
const icon = require("../common/project-icon.cjs");
test("icons are decoded, normalized, isolated and removed with projects", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vdeploy-icon-"));
  try {
    await storage.createProject(root, "One", "one");
    await storage.createProject(root, "Two", "two");
    const input = await sharp({
      create: { width: 40, height: 30, channels: 4, background: "#336699" },
    })
      .png()
      .toBuffer();
    await icon.save(root, "one", input.toString("base64"));
    const file = path.join(root, "projects/one/.icon.png");
    const meta = await sharp(await fs.readFile(file)).metadata();
    assert.equal(meta.width, 256);
    assert.equal(meta.height, 256);
    assert.equal(meta.format, "png");
    await assert.rejects(fs.access(path.join(root, "projects/two/.icon.png")));
    await assert.rejects(
      icon.save(root, "one", Buffer.from("<svg></svg>").toString("base64")),
    );
    await assert.rejects(icon.save(root, "one", "a".repeat(2800001)));
    await assert.rejects(icon.save(root, "../two", input.toString("base64")));
    await icon.remove(root, "one");
    await assert.rejects(fs.access(file));
    await icon.save(root, "one", input.toString("base64"));
    await storage.deleteProject(root, "one", "one");
    await assert.rejects(fs.access(file));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
