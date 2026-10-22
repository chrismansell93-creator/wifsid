const KEY = "wifsid";
const PROMPTS = [
  "Explain machine learning in three lines.",
  "Draft a short privacy notice for a local chat app.",
  "What changed in Android security this year? Use web search.",
  "Turn this idea into a checklist: ship a firmware backup tool.",
  "Write a JavaScript function that checks whether a string is a palindrome.",
];

const gate = document.querySelector("#gate");
const app = document.querySelector("#app");
const historyEl = document.querySelector("#history");
const thread = document.querySelector("#thread");
const titleEl = document.querySelector("#title");
const input = document.querySelector("#input");
const subtitle = document.querySelector("#subtitle");
const modelEl = document.querySelector("#model");
const agentEl = document.querySelector("#agent");
const searchEl = document.querySelector("#web-search");
const memoryEl = document.querySelector("#memory");
const memoryOn = document.querySelector("#memory-on");

let state = load();
let activeId = state.activeId;
let sending = false;
let agents = [];

boot();

function boot() {
  if (state.code && sessionStorage.getItem(KEY + ".open") === "1") showApp();
  document.querySelector("#generate").onclick = () => {
    const code = makeCode();
    state.code = code;
    save();
    document.querySelector("#new-code").textContent = code;
    document.querySelector("#gate-create").classList.add("hidden");
    document.querySelector("#gate-show").classList.remove("hidden");
  };
  document.querySelector("#enter-new").onclick = unlock;
  document.querySelector("#have-code").onclick = () => {
    document.querySelector("#gate-create").classList.add("hidden");
    document.querySelector("#gate-enter").classList.remove("hidden");
  };
  document.querySelector("#gate-enter").onsubmit = (event) => {
    event.preventDefault();
    const typed = document.querySelector("#code-input").value.replace(/\D/g, "");
    if (typed.length === 12 && typed === state.code) unlock();
    else document.querySelector("#code-error").textContent = "That code does not match the one saved in this browser.";
  };
  document.querySelector("#new-chat").onclick = () => {
    activeId = null;
    render();
    input.focus();
  };
  document.querySelector("#lock").onclick = () => {
    sessionStorage.removeItem(KEY + ".open");
    app.classList.add("hidden");
    gate.classList.remove("hidden");
  };
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.onclick = () => showPanel(btn.dataset.panel);
  });
  document.querySelector("#composer").onsubmit = (event) => {
    event.preventDefault();
    send(input.value);
  };
  document.querySelector("#image-form").onsubmit = (event) => {
    event.preventDefault();
    sendImage(document.querySelector("#image-input").value);
  };
  document.querySelector("#save-key").onclick = () => saveProviderKey("openai", "#openai-key");
  document.querySelector("#clear-key").onclick = () => saveProviderKey("openai", "#openai-key", true);
  document.querySelector("#save-router").onclick = () => saveProviderKey("openrouter", "#router-key");
  document.querySelector("#clear-router").onclick = () => saveProviderKey("openrouter", "#router-key", true);
  thread.addEventListener("click", onCodeAction);
  document.querySelector("#export-chat").onclick = exportChat;
  document.querySelector("#save-memory").onclick = () => {
    state.memory = memoryEl.value.slice(0, 4000);
    state.memoryOn = memoryOn.checked;
    save();
    document.querySelector("#memory-status").textContent = "Saved on this device.";
  };
  modelEl.onchange = () => {
    state.model = modelEl.value;
    save();
    updateSubtitle();
  };
  agentEl.onchange = () => applyAgent(agentEl.value, false);
  searchEl.onchange = () => { state.webSearch = searchEl.checked; save(); };
  memoryOn.onchange = () => { state.memoryOn = memoryOn.checked; save(); };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send(input.value);
    }
  });
  document.querySelector("#prompt-list").innerHTML = PROMPTS.map(
    (text) => `<button type="button" class="btn ghost">${escapeHtml(text)}</button>`
  ).join("");
  document.querySelector("#prompt-list").onclick = (event) => {
    const btn = event.target.closest("button");
    if (!btn) return;
    showPanel("chat");
    input.value = btn.textContent;
    input.focus();
  };
}

function unlock() {
  sessionStorage.setItem(KEY + ".open", "1");
  showApp();
}

function showApp() {
  gate.classList.add("hidden");
  app.classList.remove("hidden");
  modelEl.value = state.model || "fast";
  searchEl.checked = Boolean(state.webSearch);
  memoryEl.value = state.memory || "";
  memoryOn.checked = Boolean(state.memoryOn);
  if (![...modelEl.options].some((option) => option.value === modelEl.value)) modelEl.value = "fast";
  state.model = modelEl.value;
  loadAgents().then(() => {
    updateSubtitle();
    render();
  }).catch(() => render());
  refreshKeyStatus();
}

function showPanel(name) {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.panel === name);
  });
  document.querySelectorAll(".panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.id !== `panel-${name}`);
  });
  if (name === "coding") {
    const codeAgents = ["coder", "reviewer", "debugger", "sql", "devops", "qa"];
    if (!codeAgents.includes(state.agent) && !isRouted(state.model)) applyAgent("coder", false);
    if (window.openIde) window.openIde();
  }
  if (name === "key") refreshKeyStatus();
  updateSubtitle();
}

function isOpenAI(model) {
  return String(model || "").startsWith("oa");
}

function isRouted(model) {
  return isOpenAI(model) || String(model || "").startsWith("or-");
}

function updateSubtitle() {
  const agent = agents.find((item) => item.id === state.agent);
  const who = agent ? agent.name : "General";
  if (document.querySelector("#panel-coding") && !document.querySelector("#panel-coding").classList.contains("hidden")) {
    subtitle.textContent = who + " is in the IDE. Ctrl+S saves. Ctrl+Enter runs JavaScript or Python.";
    return;
  }
  if (isRouted(state.model)) {
    const provider = String(state.model).startsWith("or-") ? "OpenRouter" : "OpenAI";
    subtitle.textContent = who + " is using " + provider + ". Web search stays on the Grok models.";
    input.placeholder = "Ask " + who;
    return;
  }
  subtitle.textContent = who + (agent && agent.search ? " searches the web before answering." : " is ready.");
  input.placeholder = "Ask " + who;
}

async function loadAgents() {
  const res = await fetch("/api/agents");
  const data = await res.json();
  agents = data.agents || [];
  agentEl.innerHTML = agents.map((agent) => `<option value="${agent.id}">${escapeHtml(agent.name)}</option>`).join("");
  document.querySelector("#agent-list").innerHTML = agents.map((agent) => (
    `<button type="button" class="agent-card" data-agent="${agent.id}"><strong>${escapeHtml(agent.name)}</strong><span>${escapeHtml(agent.description)}</span></button>`
  )).join("");
  document.querySelector("#agent-list").onclick = (event) => {
    const card = event.target.closest("[data-agent]");
    if (card) applyAgent(card.dataset.agent, true);
  };
  if (!agents.some((agent) => agent.id === state.agent)) state.agent = "general";
  agentEl.value = state.agent || "general";
  highlightAgent();
}

function applyAgent(id, goChat) {
  const agent = agents.find((item) => item.id === id);
  if (!agent) return;
  state.agent = agent.id;
  state.model = agent.model;
  state.webSearch = Boolean(agent.search);
  modelEl.value = agent.model;
  searchEl.checked = state.webSearch;
  agentEl.value = agent.id;
  save();
  highlightAgent();
  updateSubtitle();
  if (goChat) showPanel("chat");
}

function highlightAgent() {
  document.querySelectorAll(".agent-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.agent === state.agent);
  });
}

async function refreshKeyStatus() {
  const status = document.querySelector("#key-status");
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    const openai = data.hasOpenAI ? "OpenAI key saved." : "No OpenAI key.";
    const router = data.hasOpenRouter ? "OpenRouter key saved." : "No OpenRouter key.";
    status.textContent = openai + " " + router;
  } catch {
    status.textContent = "Could not reach the local server.";
  }
}

async function saveProviderKey(field, input, clear) {
  const message = document.querySelector("#key-message");
  const box = document.querySelector(input);
  message.textContent = "Saving…";
  try {
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: clear ? "" : box.value.trim() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not save the key.");
    box.value = "";
    message.textContent = clear ? "Key removed." : "Key saved.";
    refreshKeyStatus();
  } catch (err) {
    message.textContent = err.message;
  }
}

function currentChat() {
  return state.chats.find((chat) => chat.id === activeId) || null;
}

function ensureChat() {
  let chat = currentChat();
  if (chat) return chat;
  chat = { id: crypto.randomUUID(), title: "New chat", messages: [] };
  state.chats.unshift(chat);
  activeId = chat.id;
  state.activeId = activeId;
  save();
  return chat;
}

async function send(text, options = {}) {
  const content = text.trim();
  if (!content || sending) return;
  const chat = ensureChat();
  if (chat.title === "New chat") chat.title = content.slice(0, 48);
  chat.messages.push({ role: "user", content });
  input.value = "";
  save();
  render();
  await streamReply(chat, options);
}

async function sendImage(text) {
  const prompt = text.trim();
  if (!prompt || sending) return;
  const chat = ensureChat();
  if (chat.title === "New chat") chat.title = prompt.slice(0, 48);
  chat.messages.push({ role: "user", content: prompt });
  document.querySelector("#image-input").value = "";
  showPanel("chat");
  save();
  render();
  sending = true;
  const pending = { role: "assistant", content: "Generating an image…", image: "" };
  chat.messages.push(pending);
  render();
  try {
    const res = await fetch("/api/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        model: document.querySelector("#image-model").value,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Image request failed.");
    pending.content = "Image generated.";
    pending.image = data.url;
  } catch (err) {
    pending.content = err.message;
  }
  sending = false;
  save();
  render();
}

async function streamReply(chat, options = {}) {
  sending = true;
  const pending = { role: "assistant", content: "" };
  chat.messages.push(pending);
  render();
  const status = document.createElement("div");
  status.className = "status";
  status.textContent = "Thinking…";
  thread.appendChild(status);
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: chat.messages.filter((m) => m !== pending).map(({ role, content }) => ({ role, content })),
        model: state.model || "fast",
        agent: state.agent || "general",
        coding: Boolean(options.coding),
        webSearch: Boolean(state.webSearch) && !isRouted(state.model),
        memory: state.memoryOn ? state.memory || "" : "",
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Chat request failed.");
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        let evt;
        try {
          evt = JSON.parse(line.slice(5));
        } catch {
          continue;
        }
        if (evt.type === "text") pending.content += evt.delta;
        if (evt.type === "status") status.textContent = evt.text;
        if (evt.type === "error") throw new Error(evt.text);
        renderMessage(pending, status.previousElementSibling);
        thread.scrollTop = thread.scrollHeight;
      }
    }
    if (!pending.content) pending.content = "No reply came back. Check the API key and try again.";
  } catch (err) {
    pending.content = err.message;
  }
  sending = false;
  save();
  render();
}

function render() {
  historyEl.innerHTML = state.chats.map((chat) => (
    `<button type="button" class="hist-btn${chat.id === activeId ? " active" : ""}" data-id="${chat.id}">${escapeHtml(chat.title)}</button>`
  )).join("") || `<p class="hint">No chats yet.</p>`;
  historyEl.onclick = (event) => {
    const btn = event.target.closest("[data-id]");
    if (!btn) return;
    activeId = btn.dataset.id;
    state.activeId = activeId;
    save();
    showPanel("chat");
    render();
  };
  const chat = currentChat();
  titleEl.textContent = chat ? chat.title : "New chat";
  thread.innerHTML = "";
  if (!chat || !chat.messages.length) {
    thread.innerHTML = `<div class="empty"><p>Start a private English chat. Open Coding for programs you can run, Images for pictures, or turn on web search for current facts.</p></div>`;
    return;
  }
  for (const message of chat.messages) {
    const node = document.createElement("article");
    thread.appendChild(node);
    renderMessage(message, node);
  }
  thread.scrollTop = thread.scrollHeight;
}

function renderMessage(message, node) {
  if (!node) return;
  node.className = `msg ${message.role}`;
  node.replaceChildren();
  const who = document.createElement("div");
  who.className = "who";
  who.textContent = message.role === "user" ? "You" : "wifsid";
  const body = document.createElement("div");
  if (message.role === "assistant") fillRichText(body, message.content || "");
  else body.textContent = message.content || "";
  node.append(who, body);
  const imageUrl = safeImage(message.image);
  if (imageUrl) {
    const img = document.createElement("img");
    img.alt = "Generated image";
    img.src = imageUrl;
    node.append(img);
  }
}

function fillRichText(container, text) {
  const pattern = /```([^\n`]*)\n?([\s\S]*?)```/g;
  let last = 0;
  let match;
  while ((match = pattern.exec(text))) {
    appendInline(container, text.slice(last, match.index));
    container.append(codeBlock(match[1].trim() || "text", match[2].replace(/\n$/, "")));
    last = match.index + match[0].length;
  }
  appendInline(container, text.slice(last));
}

function appendInline(container, text) {
  if (!text) return;
  const html = escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
  const span = document.createElement("span");
  span.innerHTML = html;
  container.append(span);
}

function codeBlock(lang, code) {
  const wrap = document.createElement("div");
  wrap.className = "code-block";
  wrap.dataset.lang = lang.toLowerCase();
  const bar = document.createElement("div");
  bar.className = "code-bar";
  const label = document.createElement("span");
  label.textContent = lang;
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "btn ghost";
  copy.dataset.action = "copy";
  copy.textContent = "Copy";
  bar.append(label, copy);
  if (RUNNABLE.has(wrap.dataset.lang)) {
    const run = document.createElement("button");
    run.type = "button";
    run.className = "btn ghost";
    run.dataset.action = "run";
    run.textContent = "Run";
    bar.append(run);
  }
  const pre = document.createElement("pre");
  const codeEl = document.createElement("code");
  codeEl.textContent = code;
  pre.append(codeEl);
  const out = document.createElement("pre");
  out.className = "code-out hidden";
  wrap.append(bar, pre, out);
  return wrap;
}

const RUNNABLE = new Set(["javascript", "js", "node", "python", "py"]);

async function onCodeAction(event) {
  const btn = event.target.closest("[data-action]");
  if (!btn || sending) return;
  const block = btn.closest(".code-block");
  const code = block.querySelector("code").textContent;
  if (btn.dataset.action === "copy") {
    await navigator.clipboard.writeText(code);
    btn.textContent = "Copied";
    setTimeout(() => { btn.textContent = "Copy"; }, 1200);
    return;
  }
  const out = block.querySelector(".code-out");
  out.classList.remove("hidden");
  out.textContent = "Running…";
  btn.disabled = true;
  try {
    const res = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: block.dataset.lang, code }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Run failed.");
    const chunks = [];
    if (data.stdout) chunks.push(data.stdout.trimEnd());
    if (data.stderr) chunks.push(data.stderr.trimEnd());
    out.textContent = chunks.join("\n") || (data.ok ? "Finished with no output." : `Exited with code ${data.code}.`);
  } catch (err) {
    out.textContent = err.message;
  }
  btn.disabled = false;
}

function exportChat() {
  const chat = currentChat();
  if (!chat) return;
  const blob = new Blob([JSON.stringify(chat, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${chat.title.replace(/[^\w\-]+/g, "_").slice(0, 40) || "chat"}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function safeImage(url) {
  if (typeof url !== "string") return "";
  if (url.startsWith("https://") || url.startsWith("http://") || url.startsWith("data:image/")) return url;
  return "";
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function makeCode() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => String(b % 10)).join("");
}

function load() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "{}");
    parsed.chats = Array.isArray(parsed.chats) ? parsed.chats : [];
    return parsed;
  } catch {
    return { chats: [] };
  }
}

function save() {
  state.activeId = activeId;
  localStorage.setItem(KEY, JSON.stringify(state));
}
