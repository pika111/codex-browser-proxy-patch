#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CODEX_HOME = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
const PROXY_HOST = process.env.CODEX_BROWSER_PROXY_HOST || "127.0.0.1";
const PROXY_PORT = Number(process.env.CODEX_BROWSER_PROXY_PORT || "7897");

if (!Number.isInteger(PROXY_PORT) || PROXY_PORT <= 0 || PROXY_PORT > 65535) {
  throw new Error(`Invalid CODEX_BROWSER_PROXY_PORT: ${process.env.CODEX_BROWSER_PROXY_PORT}`);
}

const proxyFetchSource = `import http from "node:http";
import https from "node:https";
import tls from "node:tls";

const PROXY_HOST = ${JSON.stringify(PROXY_HOST)};
const PROXY_PORT = ${PROXY_PORT};
const REQUEST_TIMEOUT_MS = 10000;

export async function proxyFetch(input, init = {}) {
  const url = toUrl(input);

  if (isDirectHost(url.hostname)) {
    return fetch(input, init);
  }

  if (url.protocol === "https:") {
    return fetchHttpsViaProxy(url, init);
  }

  if (url.protocol === "http:") {
    return requestToSimpleResponse({
      protocol: "http",
      requestOptions: {
        host: PROXY_HOST,
        port: PROXY_PORT,
        method: init.method || "GET",
        path: url.toString(),
        headers: headersObject(init.headers),
      },
      body: init.body,
      signal: init.signal,
    });
  }

  return fetch(input, init);
}

function toUrl(input) {
  if (typeof input === "string" || input instanceof URL) {
    return new URL(input.toString());
  }
  if (input && typeof input.url === "string") {
    return new URL(input.url);
  }
  return new URL(String(input));
}

function isDirectHost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".local")
  );
}

async function fetchHttpsViaProxy(url, init) {
  const socket = await connectTunnel(url, init.signal);

  return requestToSimpleResponse({
    protocol: "https",
    requestOptions: {
      host: url.hostname,
      port: Number(url.port || 443),
      method: init.method || "GET",
      path: \`\${url.pathname}\${url.search}\`,
      headers: {
        Host: url.host,
        ...headersObject(init.headers),
      },
      servername: url.hostname,
      createConnection: () =>
        tls.connect({
          socket,
          servername: url.hostname,
        }),
    },
    body: init.body,
    signal: init.signal,
  });
}

function connectTunnel(url, signal) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: PROXY_HOST,
      port: PROXY_PORT,
      method: "CONNECT",
      path: \`\${url.hostname}:\${url.port || 443}\`,
      headers: {
        Host: \`\${url.hostname}:\${url.port || 443}\`,
      },
    });

    const cleanup = () => {
      signal?.removeEventListener?.("abort", onAbort);
    };
    const onAbort = () => {
      req.destroy(abortError());
    };

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error("Proxy CONNECT timed out"));
    });
    req.once("connect", (res, socket) => {
      cleanup();
      if (res.statusCode !== 200) {
        socket.destroy();
        reject(new Error(\`Proxy CONNECT failed with status \${res.statusCode}\`));
        return;
      }
      resolve(socket);
    });
    req.once("error", (error) => {
      cleanup();
      reject(error);
    });
    signal?.addEventListener?.("abort", onAbort, { once: true });
    req.end();
  });
}

function requestToSimpleResponse({ protocol, requestOptions, body, signal }) {
  const client = protocol === "https" ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(requestOptions, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        resolve(new SimpleResponse(res.statusCode || 0, res.headers, Buffer.concat(chunks)));
      });
    });

    const cleanup = () => {
      signal?.removeEventListener?.("abort", onAbort);
    };
    const onAbort = () => {
      req.destroy(abortError());
    };

    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error("Proxied request timed out"));
    });
    req.once("error", (error) => {
      cleanup();
      reject(error);
    });
    req.once("close", cleanup);
    signal?.addEventListener?.("abort", onAbort, { once: true });

    writeBody(req, body).then(
      () => req.end(),
      (error) => req.destroy(error),
    );
  });
}

async function writeBody(req, body) {
  if (body == null) {
    return;
  }
  if (typeof body === "string" || Buffer.isBuffer(body) || body instanceof Uint8Array) {
    req.write(body);
    return;
  }
  if (typeof body.arrayBuffer === "function") {
    req.write(Buffer.from(await body.arrayBuffer()));
    return;
  }
  req.write(String(body));
}

function headersObject(headers) {
  const result = {};
  if (!headers) {
    return result;
  }
  if (typeof headers.forEach === "function") {
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      result[key] = value;
    }
    return result;
  }
  return { ...headers };
}

class SimpleResponse {
  constructor(status, headers, body) {
    this.status = status;
    this.ok = status >= 200 && status < 300;
    this._headers = headers;
    this._body = body;
    this.headers = {
      get: (name) => {
        const value = this._headers[String(name).toLowerCase()];
        return Array.isArray(value) ? value.join(", ") : value ?? null;
      },
    };
  }

  async text() {
    return this._body.toString("utf8");
  }

  async json() {
    return JSON.parse(await this.text());
  }

  async arrayBuffer() {
    return this._body.buffer.slice(
      this._body.byteOffset,
      this._body.byteOffset + this._body.byteLength,
    );
  }
}

function abortError() {
  const error = new Error("This operation was aborted");
  error.name = "AbortError";
  return error;
}
`;

const roots = [
  path.join(CODEX_HOME, ".tmp/bundled-marketplaces/openai-bundled/plugins/browser/scripts"),
  path.join(CODEX_HOME, ".tmp/bundled-marketplaces/openai-bundled/plugins/chrome/scripts"),
  ...(await cacheScriptRoots("browser")),
  ...(await cacheScriptRoots("chrome")),
];

let patched = 0;
for (const root of roots) {
  const clientPath = path.join(root, "browser-client.mjs");
  if (!existsSync(clientPath)) {
    continue;
  }

  await writeIfChanged(path.join(root, "proxy-fetch.mjs"), proxyFetchSource);

  let client = await readFile(clientPath, "utf8");
  const original = client;

  if (!client.startsWith('import{proxyFetch as __codexProxyFetch}from"./proxy-fetch.mjs";')) {
    client = `import{proxyFetch as __codexProxyFetch}from"./proxy-fetch.mjs";\n${client}`;
  }

  client = client.replace(
    /var Yn=globalThis\.nodeRepl\?\.fetch\?globalThis\.nodeRepl\.fetch:fetch;/g,
    "var Yn=__codexProxyFetch;",
  );
  client = client.replace(
    /var WA=async\(e,t\)=>\{let r=globalThis\.nodeRepl\?\.fetch;if\(r==null\)throw new Error\(J\("Browser Use cannot determine if this website is allowed\. Please try again later or use another source\."\)\);return r\(e,t\)\}/g,
    "var WA=async(e,t)=>__codexProxyFetch(e,t)",
  );
  client = client.replace(
    /var ([A-Za-z_$][\w$]*)=async\(e,t\)=>\{let r=Me\(\)\?\.fetch;if\(r==null\)throw new Error\("browser-client privileged fetch is unavailable"\);return r\(e,t\)\};/g,
    "var $1=async(e,t)=>__codexProxyFetch(e,t);",
  );
  client = client.replace(
    /var ([A-Za-z_$][\w$]*)=async\(e,t\)=>\{let r=Me\(\)\?\.fetch;if\(r==null\)throw new Error\(Z\("Browser Use cannot determine if this website is allowed\. Please try again later or use another source\."\)\);return r\(e,t\)\};/g,
    "var $1=async(e,t)=>__codexProxyFetch(e,t);",
  );

  const hasLegacyPatch =
    client.includes("var Yn=__codexProxyFetch;") &&
    client.includes("var WA=async(e,t)=>__codexProxyFetch(e,t);");
  const hasModernPatch = /var [A-Za-z_$][\w$]*=async\(e,t\)=>__codexProxyFetch\(e,t\);/.test(
    client,
  );
  const stillHasUnpatchedFetch =
    /var [A-Za-z_$][\w$]*=async\(e,t\)=>\{let r=Me\(\)\?\.fetch;if\(r==null\)throw new Error\("browser-client privileged fetch is unavailable"\);return r\(e,t\)\};/.test(
      client,
    ) ||
    /var [A-Za-z_$][\w$]*=async\(e,t\)=>\{let r=Me\(\)\?\.fetch;if\(r==null\)throw new Error\(Z\("Browser Use cannot determine if this website is allowed\. Please try again later or use another source\."\)\);return r\(e,t\)\};/.test(
      client,
    );

  if ((!hasLegacyPatch && !hasModernPatch) || stillHasUnpatchedFetch) {
    throw new Error(`Patch did not match expected Browser client patterns: ${clientPath}`);
  }

  if (client !== original) {
    await writeFile(clientPath, client);
    patched++;
  }

  console.log(`ok ${clientPath}`);
}

console.log(`patched=${patched} proxy=http://${PROXY_HOST}:${PROXY_PORT}`);

async function cacheScriptRoots(pluginName) {
  const dir = path.join(CODEX_HOME, "plugins/cache/openai-bundled", pluginName);
  if (!existsSync(dir)) {
    return [];
  }

  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(dir, entry.name, "scripts"));
}

async function writeIfChanged(filePath, content) {
  let current = null;
  if (existsSync(filePath)) {
    current = await readFile(filePath, "utf8");
  }
  if (current !== content) {
    await writeFile(filePath, content);
  }
}
