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
    return next.status === 204 ? new Response(null, { status: 204 }) : jsonResponse(next.body, next.status);
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

test("Shopify integration listing and OAuth start use the authenticated API contracts", async () => {
  responses.push(
    {
      body: [
        {
          id: "integration-1",
          provider: "shopify",
          connection_key: "sample.myshopify.com",
          display_name: "sample.myshopify.com",
          is_active: true,
          config: { shop_domain: "sample.myshopify.com" },
          last_synced_at: null,
          sync_status: "idle",
          last_error: null,
          created_at: "2025-01-01T00:00:00Z",
        },
      ],
    },
    { body: { authorization_url: "https://sample.myshopify.com/admin/oauth/authorize" } },
    { status: 202, body: { integration_id: "integration-1", status: "queued" } },
    { status: 204 },
  );
  api.setToken("access-test");

  const integrations = await api.getIntegrations();
  const authorization = await api.startShopifyOAuth("sample.myshopify.com");
  const sync = await api.syncIntegration("integration-1");
  await api.disconnectIntegration("integration-1");

  assert.equal(integrations[0].provider, "shopify");
  assert.equal(authorization.authorization_url, "https://sample.myshopify.com/admin/oauth/authorize");
  assert.equal(sync.status, "queued");
  assert.deepEqual(
    requests.map(({ url, options }) => [url, options.method || "GET"]),
    [
      ["/api/v1/integrations", "GET"],
      ["/api/v1/integrations/shopify/oauth/start", "POST"],
      ["/api/v1/integrations/integration-1/sync", "POST"],
      ["/api/v1/integrations/integration-1", "DELETE"],
    ],
  );
  assert.equal(requests[0].options.headers.Authorization, "Bearer access-test");
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    shop_domain: "sample.myshopify.com",
  });
});

test("demo provider authorization and Drive file selection use simulated integration contracts", async () => {
  responses.push(
    { body: { enabled: true, providers: ["shopify", "google_drive"] } },
    { body: { authorization_url: "http://localhost:3000/demo-integrations/authorize?provider=google_drive&state=signed" } },
    { body: { status: "connected", integration_id: "demo-drive-1" } },
    {
      body: {
        parent_id: null,
        items: [
          {
            id: "demo-drive-file-support",
            name: "Support playbook.md",
            type: "file",
            parent_id: null,
            modified_at: "2026-10-11T11:20:00Z",
            mime_type: "text/markdown",
          },
        ],
      },
    },
    { status: 202, body: { integration_id: "demo-drive-1", status: "queued" } },
  );
  api.setToken("access-test");

  const capabilities = await api.getMockIntegrationCapabilities();
  const authorization = await api.startDemoIntegrationOAuth("google_drive");
  const connection = await api.completeDemoIntegrationOAuth("google_drive", "signed-state", true);
  const files = await api.getMockDriveItems("demo-drive-1");
  const sync = await api.syncIntegration("demo-drive-1", ["demo-drive-file-support"]);

  assert.equal(capabilities.enabled, true);
  assert.match(authorization.authorization_url, /demo-integrations\/authorize/);
  assert.equal(connection.integration_id, "demo-drive-1");
  assert.equal(files[0].id, "demo-drive-file-support");
  assert.equal(sync.status, "queued");
  assert.deepEqual(
    requests.map(({ url, options }) => [url, options.method || "GET"]),
    [
      ["/api/v1/integrations/mock/capabilities", "GET"],
      ["/api/v1/integrations/mock/google_drive/oauth/start", "POST"],
      ["/api/v1/integrations/mock/google_drive/oauth/callback", "POST"],
      ["/api/v1/integrations/demo-drive-1/google-drive/items", "GET"],
      ["/api/v1/integrations/demo-drive-1/sync", "POST"],
    ],
  );
  assert.deepEqual(JSON.parse(requests[2].options.body), {
    state: "signed-state",
    approved: true,
  });
  assert.deepEqual(JSON.parse(requests[4].options.body), {
    file_ids: ["demo-drive-file-support"],
  });
});

test("real Google Drive OAuth start and items listing use production API contracts", async () => {
  responses.push(
    { body: { authorization_url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=real-id" } },
    {
      body: {
        parent_id: null,
        items: [
          {
            id: "real-drive-file-1",
            name: "Quarterly Report.pdf",
            type: "file",
            parent_id: null,
            modified_at: "2026-10-15T09:00:00Z",
            mime_type: "application/pdf",
          },
        ],
      },
    },
  );
  api.setToken("access-test");

  const oauth = await api.startGoogleDriveOAuth();
  const items = await api.getGoogleDriveItems("gdrive-real-1");

  assert.equal(oauth.authorization_url, "https://accounts.google.com/o/oauth2/v2/auth?client_id=real-id");
  assert.equal(items[0].id, "real-drive-file-1");
  assert.equal(items[0].name, "Quarterly Report.pdf");
  assert.deepEqual(
    requests.map(({ url, options }) => [url, options.method || "GET"]),
    [
      ["/api/v1/integrations/google-drive/oauth/start", "POST"],
      ["/api/v1/integrations/gdrive-real-1/google-drive/items", "GET"],
    ],
  );
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
