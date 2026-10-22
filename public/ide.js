let idePath = "";
let ideSaved = "";
let ideBusy = false;

const ideEditor = document.querySelector("#ide-editor");
const ideFiles = document.querySelector("#ide-files");
const ideOut = document.querySelector("#ide-out");
const ideCurrent = document.querySelector("#ide-current");
const ideName = document.querySelector("#ide-name");

document.querySelector("#ide-new").onclick = createIdeFile;
document.querySelector("#ide-save").onclick = () => saveIdeFile();
document.querySelector("#ide-run").onclick = runIdeFile;
document.querySelector("#ide-ask").onsubmit = (event) => {
  event.preventDefault();
  applyIdePrompt();
};
ideEditor.addEventListener("keydown", (event) => {
  if (event.key === "Tab") {
    event.preventDefault();
    insertAtCursor(ideEditor, "  ");
    markIdeDirty();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveIdeFile();
  }
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    runIdeFile();
  }
});
ideEditor.addEventListener("input", markIdeDirty);

window.openIde = async function openIde() {
  await refreshIdeFiles();
  if (!idePath) await openIdeFile("main.js");
};

async function refreshIdeFiles() {
  const res = await fetch("/api/workspace");
  const data = await res.json();
  ideFiles.innerHTML = "";
  for (const file of data.files || []) {
    const row = document.createElement("div");
    row.className = "file-row" + (file === idePath ? " active" : "");
    const open = document.createElement("button");
    open.type = "button";
    open.className = "file-open";
    open.textContent = file;
    open.onclick = () => openIdeFile(file);
    const del = document.createElement("button");
    del.type = "button";
    del.className = "file-del";
    del.textContent = "×";
    del.title = "Delete file";
    del.onclick = () => deleteIdeFile(file);
    row.append(open, del);
    ideFiles.append(row);
  }
}

async function openIdeFile(file) {
  if (idePath && ideEditor.value !== ideSaved && !window.confirm("Discard unsaved changes?")) return;
  const res = await fetch("/api/workspace/file?path=" + encodeURIComponent(file));
  const data = await res.json();
  if (!res.ok) {
    ideOut.textContent = data.error || "Could not open the file.";
    return;
  }
  idePath = data.path;
  ideSaved = data.content;
  ideEditor.value = data.content;
  ideName.value = "";
  markIdeDirty();
  await refreshIdeFiles();
}

async function createIdeFile() {
  const name = ideName.value.trim();
  if (!name) {
    ideOut.textContent = "Type a file name first, such as app.py.";
    return;
  }
  const res = await fetch("/api/workspace/file", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: name }),
  });
  const data = await res.json();
  if (!res.ok) {
    ideOut.textContent = data.error || "Could not create the file.";
    return;
  }
  idePath = "";
  ideSaved = "";
  await openIdeFile(data.path);
}

async function saveIdeFile() {
  if (!idePath) {
    ideOut.textContent = "Open or create a file first.";
    return false;
  }
  const res = await fetch("/api/workspace/file", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: idePath, content: ideEditor.value }),
  });
  const data = await res.json();
  if (!res.ok) {
    ideOut.textContent = data.error || "Could not save.";
    return false;
  }
  ideSaved = ideEditor.value;
  markIdeDirty();
  ideOut.textContent = "Saved " + idePath;
  return true;
}

async function runIdeFile() {
  if (ideBusy) return;
  if (!(await saveIdeFile())) return;
  const ext = idePath.split(".").pop().toLowerCase();
  if (!["js", "mjs", "cjs", "py"].includes(ext)) {
    ideOut.textContent = "Run supports JavaScript and Python files.";
    return;
  }
  ideBusy = true;
  ideOut.textContent = "Running…";
  try {
    const res = await fetch("/api/workspace/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: idePath }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Run failed.");
    const chunks = [];
    if (data.stdout) chunks.push(data.stdout.trimEnd());
    if (data.stderr) chunks.push(data.stderr.trimEnd());
    ideOut.textContent = chunks.join("\n") || (data.ok ? "Finished with no output." : "Exited with code " + data.code);
  } catch (err) {
    ideOut.textContent = err.message;
  }
  ideBusy = false;
}

async function deleteIdeFile(file) {
  if (!window.confirm("Delete " + file + "?")) return;
  const res = await fetch("/api/workspace/file?path=" + encodeURIComponent(file), { method: "DELETE" });
  const data = await res.json();
  if (!res.ok) {
    ideOut.textContent = data.error || "Could not delete the file.";
    return;
  }
  if (file === idePath) {
    idePath = "";
    ideSaved = "";
    ideEditor.value = "";
    markIdeDirty();
  }
  await refreshIdeFiles();
  ideOut.textContent = "Deleted " + file;
}

async function applyIdePrompt() {
  if (ideBusy || !idePath) {
    ideOut.textContent = "Open a file first.";
    return;
  }
  const request = document.querySelector("#ide-prompt").value.trim();
  if (!request) return;
  if (!(await saveIdeFile())) return;
  const model = document.querySelector("#model").value || "code";
  ideBusy = true;
  ideOut.textContent = "Writing…";
  let text = "";
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model === "fast" || model === "deep" ? "code" : model,
        agent: (document.querySelector("#agent").value || "coder"),
        coding: true,
        messages: [{
          role: "user",
          content: [
            "Update the file " + idePath + ".",
            "Return the complete updated file in one fenced code block.",
            "",
            "Request:",
            request,
            "",
            "Current file:",
            "```",
            ideEditor.value,
            "```",
          ].join("\n"),
        }],
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "The model request failed.");
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
        try { evt = JSON.parse(line.slice(5)); } catch { continue; }
        if (evt.type === "text") text += evt.delta;
        if (evt.type === "error") throw new Error(evt.text);
      }
    }
    const next = extractFence(text);
    if (next == null) {
      ideOut.textContent = text || "The model did not return a code block.";
      return;
    }
    ideEditor.value = next;
    document.querySelector("#ide-prompt").value = "";
    await saveIdeFile();
    ideOut.textContent = "Applied and saved " + idePath;
  } catch (err) {
    ideOut.textContent = err.message;
  }
  ideBusy = false;
}

function extractFence(text) {
  const matches = [...text.matchAll(/```[^\n`]*\n([\s\S]*?)```/g)];
  if (!matches.length) return null;
  return matches[matches.length - 1][1].replace(/\n$/, "");
}

function markIdeDirty() {
  const dirty = idePath && ideEditor.value !== ideSaved ? " •" : "";
  ideCurrent.textContent = (idePath || "No file") + dirty;
}

function insertAtCursor(area, text) {
  const start = area.selectionStart;
  const end = area.selectionEnd;
  area.value = area.value.slice(0, start) + text + area.value.slice(end);
  area.selectionStart = area.selectionEnd = start + text.length;
}
