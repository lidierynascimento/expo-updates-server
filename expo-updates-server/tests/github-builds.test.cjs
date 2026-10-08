const { test } = require("node:test");
const assert = require("node:assert/strict");
const github = require("../common/github-builds.cjs");
test("GitHub dispatch and downloads enforce repository, workflow and artifact scope", async () => {
  const original = global.fetch;
  const token = process.env.GITHUB_BUILD_TOKEN;
  const allowed = process.env.GITHUB_BUILD_REPOSITORIES;
  process.env.GITHUB_BUILD_TOKEN = "test-only";
  process.env.GITHUB_BUILD_REPOSITORIES = "owner/app";
  const calls = [];
  let queue = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    const next = queue.shift();
    assert.ok(next, "unexpected network request");
    return next;
  };
  const json = (data) => new Response(JSON.stringify(data), { status: 200 });
  try {
    await assert.rejects(github.dispatch("other/repo", "main", ""), /autorize/);
    assert.equal(calls.length, 0);
    await assert.rejects(github.dispatch("owner/app", "../main", ""), /branch/);
    await assert.rejects(
      github.dispatch("owner/app", "main", "sk_secret"),
      /publicável/,
    );
    queue = [json({ workflow_run_id: 12 })];
    assert.deepEqual(
      await github.dispatch("owner/app", "main", "pk_test_example"),
      { ok: true, runId: 12 },
    );
    assert.equal(
      calls[0].url,
      "https://api.github.com/repos/owner/app/actions/workflows/android-apk.yml/dispatches",
    );
    assert.equal(calls[0].options.redirect, "manual");
    assert.equal(
      JSON.parse(calls[0].options.body).inputs.clerk_publishable_key,
      "pk_test_example",
    );
    queue = [
      json({
        workflow_id: 9,
        event: "workflow_dispatch",
        conclusion: "success",
      }),
      json({ id: 9 }),
      json({
        artifacts: [
          { id: 30, name: "other-project-apk-1", expired: false },
        ],
      }),
    ];
    await assert.rejects(github.download("owner/app", 12, 31), /pertence/);
    queue = [
      json({
        workflow_id: 8,
        event: "workflow_dispatch",
        conclusion: "success",
      }),
      json({ id: 9 }),
    ];
    await assert.rejects(github.artifacts("owner/app", 12), /concluído/);
    queue = [
      json({
        workflow_id: 9,
        event: "workflow_dispatch",
        conclusion: "success",
      }),
      json({ id: 9 }),
      json({
        artifacts: [
          { id: 30, name: "other-project-apk-1", expired: false },
        ],
      }),
      new Response(null, {
        status: 302,
        headers: { location: "https://storage.example.test/download" },
      }),
    ];
    assert.equal(
      await github.download("owner/app", 12, 30),
      "https://storage.example.test/download",
    );
    assert.ok(
      calls.every((c) =>
        c.url.startsWith("https://api.github.com/repos/owner/app/actions/"),
      ),
    );
    queue = [new Response(null, { status: 403 })];
    await assert.rejects(github.runs("owner/app"), /recusou/);
  } finally {
    global.fetch = original;
    if (token === undefined) delete process.env.GITHUB_BUILD_TOKEN;
    else process.env.GITHUB_BUILD_TOKEN = token;
    if (allowed === undefined) delete process.env.GITHUB_BUILD_REPOSITORIES;
    else process.env.GITHUB_BUILD_REPOSITORIES = allowed;
  }
});
