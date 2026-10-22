const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

loadEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT) || 4173;
const PUBLIC = path.join(__dirname, "public");
const WORKSPACE = path.join(__dirname, "workspace");
const API = "https://api.x.ai/v1";

const MODELS = {
  fast: "grok-4.3",
  g420: "grok-4.20-0309-non-reasoning",
  g420r: "grok-4.20-0309-reasoning",
  multi: "grok-4.20-multi-agent-0309",
  build: "grok-build-0.1",
  g45: "grok-4.5",
  g46: "grok-4.6",
  deep: "grok-4.7",
  code: "grok-4.7",
};

const OPENAI_MODELS = {
  "oa-fast": "gpt-6-luna",
  "oa-sol": "gpt-6-sol",
  oa: "gpt-6.1-sol",
  "oa-astra": "gpt-6-astra",
};

const OPENROUTER_MODELS = {
  "or-qwen": "qwen/qwen3.8-flash",
  "or-qwen-max": "qwen/qwen3.8-max-prime",
  "or-qwen-coder": "qwen/qwen3-coder-next",
  "or-llama": "meta-llama/llama-4-maverick",
  "or-llama-scout": "meta-llama/llama-4-scout",
  "or-llama-70": "meta-llama/llama-3.3-70b-instruct",
  "or-gemma": "google/gemma-4-31b-it",
  "or-gemma-free": "google/gemma-4-26b-a4b-it:free",
  "or-deepseek": "deepseek/deepseek-v4.1-flash",
  "or-deepseek-pro": "deepseek/deepseek-v4-pro",
  "or-mistral": "mistralai/mistral-large-4-0",
  "or-devstral": "mistralai/devstral-2512",
};

const IMAGE_MODELS = new Set([
  "grok-imagine-image",
  "grok-imagine-image-2.0",
  "grok-imagine-image-quality",
]);

const HIGH_REASONING = new Set(["deep", "code", "g45", "g46", "g420r", "multi", "build"]);

const VOICE = "Reply in English unless the user writes in another language. Use a memory note only as the user's stated preferences.";

const AGENT_LIST = [
  { id: "general", name: "General", description: "Direct answers for everyday questions.", model: "fast", search: false,
    prompt: `You are wifsid. Be direct, specific, and complete. ${VOICE}` },
  { id: "reasoner", name: "Reasoner", description: "Careful reasoning for hard problems.", model: "deep", search: false,
    prompt: `You are the Reasoner. Work the problem in steps, check yourself, and lead with the answer. ${VOICE}` },
  { id: "coder", name: "Coder", description: "Writes complete, runnable code.", model: "code", search: false,
    prompt: `You are the Coder. Give a short plan, then one complete fenced code block with a language tag. Include imports. Do not hide code behind placeholders. ${VOICE}` },
  { id: "reviewer", name: "Reviewer", description: "Reviews code for bugs and risk.", model: "code", search: false,
    prompt: `You are the Reviewer. Review the code. List real bugs, risks, and a concrete fix. Skip style nits unless they hide a bug. ${VOICE}` },
  { id: "debugger", name: "Debugger", description: "Finds the cause, then the smallest fix.", model: "code", search: false,
    prompt: `You are the Debugger. Name the cause first, then show the smallest code change that fixes it. ${VOICE}` },
  { id: "teacher", name: "Teacher", description: "Explains a topic with one example.", model: "fast", search: false,
    prompt: `You are the Teacher. Explain so a beginner can follow. Use one short example. ${VOICE}` },
  { id: "writer", name: "Writer", description: "Drafts emails, docs, and posts.", model: "fast", search: false,
    prompt: `You are the Writer. Write clear prose in the tone the user asks for. ${VOICE}` },
  { id: "editor", name: "Editor", description: "Rewrites text and cuts filler.", model: "fast", search: false,
    prompt: `You are the Editor. Rewrite the user's text. Keep the meaning. Cut filler. Return the revised text. ${VOICE}` },
  { id: "researcher", name: "Researcher", description: "Searches the web and cites sources.", model: "deep", search: true,
    prompt: `You are the Researcher. Use web search before you answer. Cite the pages you used. Say when a fact is uncertain. ${VOICE}` },
  { id: "planner", name: "Planner", description: "Turns a job into an ordered plan.", model: "deep", search: false,
    prompt: `You are the Planner. Turn the request into an ordered plan with a check after each step. ${VOICE}` },
  { id: "sql", name: "SQL", description: "Writes queries and reads schemas.", model: "code", search: false,
    prompt: `You are the SQL agent. Write the query in one fenced sql block. Say which dialect you assumed. Explain it in one line. ${VOICE}` },
  { id: "analyst", name: "Analyst", description: "Reads numbers and shows the calculation.", model: "deep", search: false,
    prompt: `You are the Analyst. State the finding first, then the calculation. Do not invent numbers the user did not give. ${VOICE}` },
  { id: "devops", name: "DevOps", description: "Scripts, config, and command lines.", model: "code", search: false,
    prompt: `You are the DevOps agent. Write the script or config. Say which operating system the commands assume. ${VOICE}` },
  { id: "translator", name: "Translator", description: "Translates and keeps names and code.", model: "fast", search: false,
    prompt: `You are the Translator. Translate. Keep names, code, and tone. Return the translation unless the user asks for notes. ${VOICE}` },
  { id: "tutor", name: "Tutor", description: "Practices one question at a time.", model: "fast", search: false,
    prompt: `You are the Tutor. Help the user practice. Ask one question at a time, then wait. ${VOICE}` },
  { id: "product", name: "Product", description: "Writes stories and acceptance checks.", model: "deep", search: false,
    prompt: `You are the Product agent. Write the user story, acceptance checks, and the important edge cases. ${VOICE}` },
  { id: "math", name: "Math", description: "Solves step by step.", model: "deep", search: false,
    prompt: `You are the Math agent. Put the final answer first, then the steps. ${VOICE}` },
  { id: "firmware", name: "Firmware", description: "Android firmware and device tools.", model: "deep", search: true,
    prompt: `You are the Firmware agent. Help with Android firmware, drivers, and device tools. Be precise about model names. Warn when a step can erase data. ${VOICE}` },
  { id: "security", name: "Security", description: "Defensive fixes and safer setup.", model: "deep", search: false,
    prompt: `You are the Security agent. Explain the risk and the defensive fix. Focus on detection, patching, and safer configuration. ${VOICE}` },
  { id: "qa", name: "QA", description: "Turns a feature into test cases.", model: "code", search: false,
    prompt: `You are the QA agent. List test cases, including the empty, error, and boundary cases. ${VOICE}` },
];

const AGENTS = Object.fromEntries(AGENT_LIST.map((agent) => [agent.id, agent]));

const RUNNERS = {
  javascript: { cmd: process.execPath, ext: ".js" },
  js: { cmd: process.execPath, ext: ".js" },
  node: { cmd: process.execPath, ext: ".js" },
  python: { cmd: process.platform === "win32" ? "py" : "python3", ext: ".py", fallback: "python" },
  py: { cmd: process.platform === "win32" ? "py" : "python3", ext: ".py", fallback: "python" },
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "GET" && url.pathname === "/api/agents") {
      return json(res, 200, {
        agents: AGENT_LIST.map(({ id, name, description, model, search }) => ({ id, name, description, model, search })),
      });
    }
    if (req.method === "GET" && url.pathname === "/api/health") {
      return json(res, 200, {
        ok: true,
        hasKey: Boolean(process.env.XAI_API_KEY),
        hasOpenAI: Boolean(process.env.OPENAI_API_KEY),
        hasOpenRouter: Boolean(process.env.OPENROUTER_API_KEY),
      });
    }
    if (req.method === "POST" && url.pathname === "/api/keys") {
      return handleKeys(req, res);
    }
    if (req.method === "POST" && url.pathname === "/api/chat") {
      return await handleChat(req, res);
    }
    if (req.method === "POST" && url.pathname === "/api/image") {
      return await handleImage(req, res);
    }
    if (req.method === "POST" && url.pathname === "/api/run") {
      return await handleRun(req, res);
    }
    if (url.pathname === "/api/workspace" && req.method === "GET") {
      return json(res, 200, { files: listWorkspace() });
    }
    if (url.pathname === "/api/workspace/file" && req.method === "GET") {
      return readWorkspaceFile(url.searchParams.get("path"), res);
    }
    if (url.pathname === "/api/workspace/file" && req.method === "PUT") {
      return await writeWorkspaceFile(req, res);
    }
    if (url.pathname === "/api/workspace/file" && req.method === "POST") {
      return await createWorkspaceFile(req, res);
    }
    if (url.pathname === "/api/workspace/file" && req.method === "DELETE") {
      return deleteWorkspaceFile(url.searchParams.get("path"), res);
    }
    if (url.pathname === "/api/workspace/run" && req.method === "POST") {
      return await runWorkspaceFile(req, res);
    }
    if (req.method === "GET") return serveStatic(url.pathname, res);
    json(res, 404, { error: "Not found." });
  } catch (err) {
    json(res, 500, { error: err.message || "Server error." });
  }
});

fs.mkdirSync(WORKSPACE, { recursive: true });
const starter = path.join(WORKSPACE, "main.js");
if (!fs.existsSync(starter)) {
  fs.writeFileSync(starter, "console.log(\"Hello from the wifsid IDE\");\n", "utf8");
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`wifsid  http://127.0.0.1:${PORT}`);
});

async function handleKeys(req, res) {
  const body = await readJson(req);
  const fields = [
    ["openai", "OPENAI_API_KEY", "hasOpenAI"],
    ["openrouter", "OPENROUTER_API_KEY", "hasOpenRouter"],
  ];
  const present = fields.filter(([key]) => Object.prototype.hasOwnProperty.call(body, key));
  if (!present.length) return json(res, 400, { error: "Send an API key." });
  const result = {};
  for (const [key, envName, flag] of present) {
    const value = typeof body[key] === "string" ? body[key].trim() : "";
    if (value && !/^[\w.-]{20,400}$/.test(value)) {
      return json(res, 400, { error: "That does not look like an API key." });
    }
    writeEnvKey(envName, value);
    result[flag] = Boolean(value);
  }
  json(res, 200, result);
}

function writeEnvKey(name, value) {
  const file = path.join(__dirname, ".env");
  const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/) : [];
  let found = false;
  const next = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const eq = trimmed.indexOf("=");
    if (!trimmed.startsWith("#") && eq > 0 && trimmed.slice(0, eq).trim() === name) {
      found = true;
      if (value) next.push(`${name}=${value}`);
      continue;
    }
    if (line.length) next.push(line);
  }
  if (!found && value) next.push(`${name}=${value}`);
  fs.writeFileSync(file, next.join("\n") + (next.length ? "\n" : ""), "utf8");
  if (value) process.env[name] = value;
  else delete process.env[name];
}

async function handleChat(req, res) {
  const body = await readJson(req);
  const messages = sanitizeMessages(body.messages);
  if (!messages.length) return json(res, 400, { error: "Send a message first." });

  const wantSearch = Boolean(body.webSearch);
  const coding = body.model === "code" || Boolean(body.coding);
  const agent = AGENTS[body.agent] || AGENTS.general;
  const memory = typeof body.memory === "string" ? body.memory.slice(0, 4000).trim() : "";
  const system = memory ? `${agent.prompt}\n\nUser memory:\n${memory}` : agent.prompt;
  const openaiModel = OPENAI_MODELS[body.model];
  if (openaiModel) return streamOpenAI(res, openaiModel, messages, system);
  const routerModel = OPENROUTER_MODELS[body.model];
  if (routerModel) return streamOpenRouter(res, routerModel, messages, system);

  const key = process.env.XAI_API_KEY;
  if (!key) {
    return json(res, 503, {
      error: "Set XAI_API_KEY in the .env file next to server.js and restart the server.",
    });
  }

  const model = MODELS[body.model] || (wantSearch || coding ? MODELS.deep : MODELS.fast);
  const payload = {
    model,
    store: false,
    stream: true,
    input: [{ role: "system", content: system }, ...messages],
  };
  if (body.model !== "g420" && (HIGH_REASONING.has(body.model) || wantSearch || coding)) {
    payload.reasoning = { effort: HIGH_REASONING.has(body.model) || coding ? "high" : "medium" };
  }
  if (wantSearch) payload.tools = [{ type: "web_search" }];

  const upstream = await fetch(`${API}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text();
    return json(res, upstream.status || 502, { error: cleanApiError(detail) });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let announcedSearch = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let evt;
      try {
        evt = JSON.parse(data);
      } catch {
        continue;
      }
      const type = evt.type || "";
      if (type === "response.output_text.delta" && evt.delta) {
        sse(res, { type: "text", delta: evt.delta });
      } else if (!announcedSearch && /web_search|tool_call|search/.test(type)) {
        announcedSearch = true;
        sse(res, { type: "status", text: "Searching the web…" });
      } else if (type === "error" || evt.error) {
        sse(res, { type: "error", text: evt.error?.message || "The model request failed." });
      }
    }
  }
  sse(res, { type: "done" });
  res.end();
}

async function streamOpenAI(res, modelId, messages, system) {
  return streamCompletions(res, {
    url: "https://api.openai.com/v1/chat/completions",
    key: process.env.OPENAI_API_KEY,
    missing: "Add an OpenAI API key under API key, or set OPENAI_API_KEY in the .env file next to server.js.",
    modelId,
    messages,
    system,
  });
}

async function streamOpenRouter(res, modelId, messages, system) {
  return streamCompletions(res, {
    url: "https://openrouter.ai/api/v1/chat/completions",
    key: process.env.OPENROUTER_API_KEY,
    missing: "Add an OpenRouter API key under API key. Qwen, Llama, Gemma, DeepSeek, and Mistral use that key.",
    modelId,
    messages,
    system,
    headers: { "HTTP-Referer": "http://127.0.0.1:4173", "X-Title": "wifsid" },
  });
}

async function streamCompletions(res, options) {
  if (!options.key) return json(res, 503, { error: options.missing });
  const upstream = await fetch(options.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.key}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: JSON.stringify({
      model: options.modelId,
      stream: true,
      messages: [{ role: "system", content: options.system }, ...options.messages],
    }),
  });
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text();
    return json(res, upstream.status || 502, { error: cleanApiError(detail) });
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let evt;
      try {
        evt = JSON.parse(data);
      } catch {
        continue;
      }
      const delta = evt.choices && evt.choices[0] && evt.choices[0].delta && evt.choices[0].delta.content;
      if (delta) sse(res, { type: "text", delta });
      else if (evt.error) sse(res, { type: "error", text: evt.error.message || "The model request failed." });
    }
  }
  sse(res, { type: "done" });
  res.end();
}

async function handleImage(req, res) {
  const key = process.env.XAI_API_KEY;
  if (!key) {
    return json(res, 503, {
      error: "Set XAI_API_KEY in the .env file next to server.js and restart the server.",
    });
  }
  const body = await readJson(req);
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 2000) : "";
  if (!prompt) return json(res, 400, { error: "Describe the image first." });

  const upstream = await fetch(`${API}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: IMAGE_MODELS.has(body.model) ? body.model : "grok-imagine-image",
      prompt,
      n: 1,
    }),
  });
  const detail = await upstream.text();
  if (!upstream.ok) return json(res, upstream.status || 502, { error: cleanApiError(detail) });

  let parsed;
  try {
    parsed = JSON.parse(detail);
  } catch {
    return json(res, 502, { error: "Image response was not JSON." });
  }
  const item = parsed.data && parsed.data[0];
  const url = item && (item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : ""));
  if (!url) return json(res, 502, { error: "The image API returned no image." });
  json(res, 200, { url });
}

function workspaceFile(rel) {
  if (typeof rel !== "string" || !rel.trim()) {
    const error = new Error("Name the file.");
    error.status = 400;
    throw error;
  }
  const clean = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (clean.length > 180 || /[\0<>:"|?*]/.test(clean)) {
    const error = new Error("That file name is not allowed.");
    error.status = 400;
    throw error;
  }
  const abs = path.resolve(WORKSPACE, clean);
  const relative = path.relative(path.resolve(WORKSPACE), abs);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    const error = new Error("That path is outside the workspace.");
    error.status = 400;
    throw error;
  }
  return { abs, rel: relative.replace(/\\/g, "/") };
}

function listWorkspace() {
  const files = [];
  walkWorkspace(WORKSPACE, files);
  return files.sort();
}

function walkWorkspace(dir, files) {
  if (files.length >= 200 || !fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const abs = path.join(dir, name);
    const stat = fs.statSync(abs);
    if (stat.isDirectory()) walkWorkspace(abs, files);
    else if (stat.isFile()) files.push(path.relative(WORKSPACE, abs).replace(/\\/g, "/"));
  }
}

function readWorkspaceFile(rel, res) {
  try {
    const file = workspaceFile(rel);
    if (!fs.existsSync(file.abs) || !fs.statSync(file.abs).isFile()) {
      return json(res, 404, { error: "File not found." });
    }
    json(res, 200, { path: file.rel, content: fs.readFileSync(file.abs, "utf8").slice(0, 200000) });
  } catch (err) {
    json(res, err.status || 400, { error: err.message });
  }
}

async function writeWorkspaceFile(req, res) {
  try {
    const body = await readJson(req);
    const file = workspaceFile(body.path);
    const content = typeof body.content === "string" ? body.content.slice(0, 200000) : "";
    fs.mkdirSync(path.dirname(file.abs), { recursive: true });
    fs.writeFileSync(file.abs, content, "utf8");
    json(res, 200, { path: file.rel });
  } catch (err) {
    json(res, err.status || 400, { error: err.message });
  }
}

async function createWorkspaceFile(req, res) {
  try {
    const body = await readJson(req);
    const file = workspaceFile(body.path);
    if (fs.existsSync(file.abs)) return json(res, 409, { error: "That file already exists." });
    fs.mkdirSync(path.dirname(file.abs), { recursive: true });
    fs.writeFileSync(file.abs, "", "utf8");
    json(res, 200, { path: file.rel });
  } catch (err) {
    json(res, err.status || 400, { error: err.message });
  }
}

function deleteWorkspaceFile(rel, res) {
  try {
    const file = workspaceFile(rel);
    if (!fs.existsSync(file.abs) || !fs.statSync(file.abs).isFile()) {
      return json(res, 404, { error: "File not found." });
    }
    fs.unlinkSync(file.abs);
    json(res, 200, { path: file.rel });
  } catch (err) {
    json(res, err.status || 400, { error: err.message });
  }
}

async function runWorkspaceFile(req, res) {
  try {
    const body = await readJson(req);
    const file = workspaceFile(body.path);
    if (!fs.existsSync(file.abs)) return json(res, 404, { error: "File not found." });
    const ext = path.extname(file.abs).slice(1).toLowerCase();
    const language = ext === "mjs" || ext === "cjs" ? "js" : ext;
    const runner = RUNNERS[language];
    if (!runner) return json(res, 400, { error: "Run supports JavaScript and Python files." });
    let result = await runProcess(runner.cmd, [file.abs], WORKSPACE);
    if (!result.ok && result.missing && runner.fallback) {
      result = await runProcess(runner.fallback, [file.abs], WORKSPACE);
    }
    json(res, 200, { ok: result.ok, code: result.code, stdout: result.stdout, stderr: result.stderr });
  } catch (err) {
    json(res, err.status || 400, { error: err.message });
  }
}

async function handleRun(req, res) {
  const body = await readJson(req);
  const language = String(body.language || "").toLowerCase().trim();
  const runner = RUNNERS[language];
  if (!runner) return json(res, 400, { error: "Run supports JavaScript and Python." });
  const code = typeof body.code === "string" ? body.code.slice(0, 50000) : "";
  if (!code.trim()) return json(res, 400, { error: "There is no code to run." });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skynet-run-"));
  const file = path.join(dir, "main" + runner.ext);
  fs.writeFileSync(file, code, "utf8");
  try {
    let result = await runProcess(runner.cmd, [file], dir);
    if (!result.ok && result.missing && runner.fallback) {
      result = await runProcess(runner.fallback, [file], dir);
    }
    json(res, 200, {
      ok: result.ok,
      code: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function runProcess(cmd, args, cwd) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { cwd, windowsHide: true });
    } catch (err) {
      resolve({ ok: false, code: null, stdout: "", stderr: err.message, missing: true });
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish({
        ok: false,
        code: null,
        stdout: stdout.slice(0, 20000),
        stderr: `${stderr}\nStopped after 8 seconds.`.trim(),
      });
    }, 8000);
    child.stdout.on("data", (chunk) => {
      stdout = (stdout + chunk.toString("utf8")).slice(0, 20000);
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk.toString("utf8")).slice(0, 20000);
    });
    child.on("error", (err) => {
      finish({
        ok: false,
        code: null,
        stdout,
        stderr: err.code === "ENOENT" ? `${cmd} is not installed.` : err.message,
        missing: err.code === "ENOENT",
      });
    });
    child.on("close", (code) => {
      finish({ ok: code === 0, code, stdout, stderr, missing: false });
    });
  });
}

function sanitizeMessages(input) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 12000) }))
    .slice(-24);
}

function cleanApiError(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed.error?.message || parsed.error || raw.slice(0, 400);
  } catch {
    return raw.slice(0, 400) || "Request failed.";
  }
}

function serveStatic(pathname, res) {
  const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) return json(res, 403, { error: "Forbidden." });
  fs.readFile(file, (err, data) => {
    if (err) return json(res, 404, { error: "Not found." });
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error("Request is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const name = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[name]) process.env[name] = value;
  }
}
