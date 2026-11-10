const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const fs = require("node:fs");
const ts = require("typescript");

const sourceRoot = path.resolve(__dirname, "../src");
const originalResolveFilename = Module._resolveFilename;
const originalTsLoader = require.extensions[".ts"];
const originalFetch = global.fetch;
process.env.NEXT_PUBLIC_API_URL = "/api/v1";

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(compiled, filename);
};

Module._resolveFilename = function (request, parent, isMain, options) {
  const mappedRequest = request.startsWith("@/")
    ? path.join(sourceRoot, request.slice(2))
    : request;
  return originalResolveFilename.call(this, mappedRequest, parent, isMain, options);
};

const { ApiError, api } = require("../src/lib/api.ts");

let requests;
let responses;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test.beforeEach(() => {
  requests = [];
  responses = [];
  api.setToken(null);
  global.fetch = async (input, options = {}) => {
    requests.push({ url: String(input), options });
    const next = responses.shift();
    assert.ok(next, `Unexpected request to ${String(input)}`);
    return jsonResponse(next.body, next.status);
  };
});

test.after(() => {
  global.fetch = originalFetch;
  Module._resolveFilename = originalResolveFilename;
  if (originalTsLoader) {
    require.extensions[".ts"] = originalTsLoader;
  } else {
    delete require.extensions[".ts"];
  }
});

test("registration, verification, login, and session lookup use the expected API contracts", async () => {
  responses.push(
    { body: { message: "registered" } },
    { body: { message: "verified" } },
    { body: { access_token: "access-test", refresh_token: "refresh-test" } },
    { body: { id: "user-1", email: "owner@example.test" } },
  );

  await api.register({ email: "owner@example.test", password: "passphrase" });
  await api.verifyEmail({ email: "owner@example.test", otp: "1234" });
  await api.login({ email: "owner@example.test", password: "passphrase" });
  const user = await api.getMe();

  assert.equal(user.email, "owner@example.test");
  assert.deepEqual(
    requests.map(({ url, options }) => [url, options.method || "GET"]),
    [
      ["/api/v1/auth/register", "POST"],
      ["/api/v1/auth/verify-email", "POST"],
      ["/api/v1/auth/login", "POST"],
      ["/api/v1/auth/me", "GET"],
    ],
  );
  assert.equal(requests[3].options.headers.Authorization, "Bearer access-test");
  assert.equal(requests[0].options.credentials, "include");
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    email: "owner@example.test",
    otp: "1234",
  });
});

test("assistant configuration, publish readiness, and publishing preserve request state", async () => {
  responses.push(
    { body: { id: "assistant-1", name: "Support assistant", status: "draft" } },
    { body: { is_ready: true, issues: [], knowledge_sources_count: 1, indexed_documents_count: 2 } },
    { body: { id: "assistant-1", name: "Support assistant", status: "published" } },
  );

  await api.createAssistant({ name: "Support assistant" });
  const readiness = await api.checkPublishReadiness("assistant-1");
  const published = await api.publishAssistant("assistant-1");

  assert.equal(readiness.ready, true);
  assert.deepEqual(readiness.errors, []);
  assert.equal(published.status, "published");
  assert.deepEqual(
    requests.map(({ url, options }) => [url, options.method || "GET"]),
    [
      ["/api/v1/assistants", "POST"],
      ["/api/v1/assistants/assistant-1/publish-readiness", "GET"],
      ["/api/v1/assistants/assistant-1/publish", "POST"],
    ],
  );
  assert.deepEqual(JSON.parse(requests[0].options.body), { name: "Support assistant" });
});

test("API failures reject with customer-safe copy and preserve diagnostic detail", async () => {
  responses.push({
    status: 422,
    body: { detail: "SQLAlchemy validation failure from provider" },
  });

  await assert.rejects(
    api.updateAssistant("assistant-1", { name: "Updated" }),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.match(error.message, /details aren.t valid/i);
      assert.equal(error.technicalDetail, "SQLAlchemy validation failure from provider");
      assert.equal(error.status, 422);
      return true;
    },
  );
});
