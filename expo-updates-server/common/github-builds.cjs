const fs = require("node:fs/promises");
const path = require("node:path");
const storage = require("./admin-storage.cjs");
const workflow = "android-apk.yml";
const validRepository = (value) =>
  typeof value === "string" &&
  /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(value) &&
  ![".", ".."].includes(value.split("/")[1]);
const allowed = (repository) =>
  validRepository(repository) &&
  (process.env.GITHUB_BUILD_REPOSITORIES || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .includes(repository.toLowerCase());
function configured(repository) {
  return !!process.env.GITHUB_BUILD_TOKEN && allowed(repository);
}
async function config(root, project) {
  const folder = await storage.projectRoot(root, project);
  try {
    return JSON.parse(
      await fs.readFile(path.join(folder, ".builds.json"), "utf8"),
    );
  } catch (e) {
    if (e.code === "ENOENT") return { repository: "" };
    throw e;
  }
}
async function api(repository, suffix, options = {}) {
  if (!configured(repository))
    throw new Error(
      "Configure a integração GitHub e autorize este repositório em Integrações.",
    );
  let response;
  try {
    response = await fetch(
      "https://api.github.com/repos/" + repository + "/actions/" + suffix,
      {
        ...options,
        redirect: "manual",
        signal: AbortSignal.timeout(20000),
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: "Bearer " + process.env.GITHUB_BUILD_TOKEN,
          "X-GitHub-Api-Version": "2026-03-10",
          "Content-Type": "application/json",
        },
      },
    );
  } catch {
    throw new Error(
      "GitHub indisponível ou tempo esgotado. Confira o histórico antes de tentar gerar novamente.",
    );
  }
  if (response.status === 302 && options.method === "DOWNLOAD") return response;
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? "Workflow, branch ou arquivo não encontrado. Confira o repositório e as permissões do token."
        : response.status === 401 || response.status === 403
          ? "GitHub recusou o acesso. Confira o token, suas permissões e os limites da conta."
          : "Não foi possível concluir no GitHub (" + response.status + ").",
    );
  return response.status === 204 ? {} : response.json();
}
async function runs(repository) {
  const result = await api(
    repository,
    "workflows/" + workflow + "/runs?event=workflow_dispatch&per_page=10",
  );
  return (result.workflow_runs || []).map((r) => ({
    id: r.id,
    number: r.run_number,
    status: r.status,
    conclusion: r.conclusion,
    branch: r.head_branch,
    sha: r.head_sha,
    createdAt: r.created_at,
    url: "https://github.com/" + repository + "/actions/runs/" + r.id,
  }));
}
async function dispatch(repository, ref, key) {
  if (
    typeof ref !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9_./-]{0,199}$/.test(ref) ||
    ref.includes("..")
  )
    throw new Error("Informe uma branch ou tag válida.");
  if (
    key &&
    (typeof key !== "string" ||
      !/^pk_(test|live)_[A-Za-z0-9_=.-]{1,500}$/.test(key))
  )
    throw new Error(
      "Informe somente a chave publicável Clerk (pk_test_ ou pk_live_).",
    );
  const result = await api(
    repository,
    "workflows/" + workflow + "/dispatches",
    {
      method: "POST",
      body: JSON.stringify({
        ref,
        inputs: key ? { clerk_publishable_key: key } : {},
      }),
    },
  );
  return { ok: true, runId: result.workflow_run_id || null };
}
async function artifacts(repository, runId) {
  if (!/^\d+$/.test(String(runId))) throw new Error("Build inválido.");
  const run = await api(repository, "runs/" + runId);
  const wf = await api(repository, "workflows/" + workflow);
  if (
    run.workflow_id !== wf.id ||
    run.event !== "workflow_dispatch" ||
    run.conclusion !== "success"
  )
    throw new Error("Este build ainda não tem APK concluído para download.");
  const data = await api(
    repository,
    "runs/" + runId + "/artifacts?per_page=100",
  );
  return (data.artifacts || [])
    .filter((a) => a.name.startsWith("app-mob-passenger-apk-"))
    .map((a) => ({
      id: a.id,
      name: a.name,
      expired: a.expired,
      size: a.size_in_bytes,
    }));
}
async function download(repository, runId, artifactId) {
  const items = await artifacts(repository, runId);
  if (!items.some((a) => String(a.id) === String(artifactId) && !a.expired))
    throw new Error("Download expirado ou arquivo não pertence a este build.");
  // Do not forward the GitHub credential to the storage redirect.
  const response = await fetch(
    "https://api.github.com/repos/" +
      repository +
      "/actions/artifacts/" +
      artifactId +
      "/zip",
    {
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: "Bearer " + process.env.GITHUB_BUILD_TOKEN,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
      },
    },
  );
  const location = response.headers.get("location");
  if (
    response.status !== 302 ||
    !location ||
    new URL(location).protocol !== "https:"
  )
    throw new Error(
      "Não foi possível obter o download. O arquivo pode ter expirado.",
    );
  return location;
}
module.exports = {
  config,
  configured,
  validRepository,
  runs,
  dispatch,
  artifacts,
  download,
};
