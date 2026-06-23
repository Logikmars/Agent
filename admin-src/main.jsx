import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.scss";

const memoryKinds = [
  ["fact", "Факт"],
  ["preference", "Предпочтение"],
  ["project_note", "Заметка проекта"],
  ["rule", "Правило"],
  ["event", "Событие"]
];

const memoryScopes = [
  ["important", "Важная"],
  ["dialog", "Диалоги"]
];

function App() {
  const [files, setFiles] = useState([]);
  const [tree, setTree] = useState(null);
  const [memories, setMemories] = useState([]);
  const [selectedPath, setSelectedPath] = useState(null);
  const [tab, setTab] = useState("files");
  const [fileFilter, setFileFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState("");
  const [maxFiles, setMaxFiles] = useState(10);
  const [imageMode, setImageMode] = useState(false);
  const [memoryScope, setMemoryScope] = useState("important");
  const [memoryViewScope, setMemoryViewScope] = useState("important");
  const [memoryKind, setMemoryKind] = useState("fact");
  const [memoryContent, setMemoryContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState("Проверка сервера...");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("sidebarCollapsed") === "true");

  const selected = useMemo(() => files.find((file) => file.path === selectedPath) ?? null, [files, selectedPath]);
  const messagesRef = useRef(null);

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    loadMemories();
  }, [memoryViewScope]);

  useEffect(() => {
    messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight });
  }, [messages, busy]);

  async function loadAll() {
    setBusy(true);
    setStatusText("Обновляю данные...");
    try {
      const [health, fileData, treeData, memoryData] = await Promise.all([
        api("/health"),
        api("/files"),
        api("/tree"),
        api(memoryViewScope === "all" ? "/memories" : `/memories?scope=${memoryViewScope}`)
      ]);
      setFiles(fileData.files ?? []);
      setTree(treeData);
      setMemories(memoryData.memories ?? []);
      setStatusText(`Сервер ${health.status}. В индексе ${fileData.files?.length ?? 0} записей, в памяти ${memoryData.memories?.length ?? 0}.`);
    } catch (error) {
      setStatusText(`Ошибка: ${error.message}`);
      addMessage("error", error.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadMemories() {
    const data = await api(memoryViewScope === "all" ? "/memories" : `/memories?scope=${memoryViewScope}`);
    setMemories(data.memories ?? []);
    setStatusText(`В индексе ${files.length} записей, в памяти ${data.memories?.length ?? 0}.`);
  }

  async function rescan() {
    setBusy(true);
    setStatusText("Сканирую папку...");
    try {
      await api("/rescan", { method: "POST" });
      await loadAll();
      addMessage("assistant", "Индекс обновлен.");
    } catch (error) {
      addMessage("error", error.message);
    } finally {
      setBusy(false);
    }
  }

  async function ask(event) {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) return;

    addMessage("user", trimmed);
    setQuestion("");
    setBusy(true);
    setStatusText("Агент думает...");

    try {
      if (imageMode) {
        if (!selected?.isImage) throw new Error("Выберите изображение в списке файлов.");
        const result = await api("/analyze-image", {
          method: "POST",
          body: JSON.stringify({ path: selected.path, question: trimmed })
        });
        addMessage("assistant", result.answer);
      } else {
        const result = await api("/chat", {
          method: "POST",
          body: JSON.stringify({ question: trimmed, maxFiles: Number(maxFiles || 10) })
        });
        addMessage("assistant", result.answer, result.usedFiles);
        await loadMemories();
      }
    } catch (error) {
      addMessage("error", error.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveMemory(event) {
    event.preventDefault();
    const content = memoryContent.trim();
    if (!content) return;
    setBusy(true);
    setStatusText("Сохраняю память...");
    try {
      await api("/memories", {
        method: "POST",
        body: JSON.stringify({
          scope: memoryScope,
          kind: memoryKind,
          content,
          importance: 1,
          metadata: { source: "admin" }
        })
      });
      setMemoryContent("");
      await loadMemories();
    } catch (error) {
      addMessage("error", error.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteMemory(id) {
    setBusy(true);
    setStatusText("Удаляю память...");
    try {
      await api(`/memories/${id}`, { method: "DELETE" });
      await loadMemories();
    } catch (error) {
      addMessage("error", error.message);
    } finally {
      setBusy(false);
    }
  }

  function addMessage(type, text, usedFiles = []) {
    setMessages((current) => [...current, { id: `${Date.now()}-${Math.random()}`, type, text, usedFiles: usedFiles ?? [] }]);
  }

  function useSelectedInQuestion() {
    if (!selected) return;
    setQuestion(`Расскажи про файл ${selected.path}`);
  }

  const filteredFiles = useMemo(() => {
    const query = fileFilter.trim().toLowerCase();
    return files.filter((file) => {
      const matchesQuery = !query || file.path.toLowerCase().includes(query) || file.name.toLowerCase().includes(query);
      const matchesStatus = !statusFilter || file.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [files, fileFilter, statusFilter]);

  const stats = useMemo(() => ({
    indexed: files.filter((file) => file.status === "indexed").length,
    errors: files.filter((file) => file.status === "error").length,
    images: files.filter((file) => file.isImage).length
  }), [files]);

  return (
    <main className={`shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <header className="topbar">
        <div className="brand">
          <h1>PC Folder Agent</h1>
          <p>{statusText}</p>
        </div>
        <div className="actions">
          <button type="button" className="icon-button" title={sidebarCollapsed ? "Показать список файлов" : "Скрыть список файлов"} onClick={() => setSidebarCollapsed((value) => !value)}>
            {sidebarCollapsed ? "☰" : "×"}
          </button>
          <button type="button" className="icon-button" title="Обновить данные" onClick={loadAll} disabled={busy}>↻</button>
          <button type="button" className="primary-button" onClick={rescan} disabled={busy}>Rescan</button>
        </div>
      </header>

      <section className="workspace">
        <aside className="sidebar" aria-hidden={sidebarCollapsed}>
          <div className="toolbar">
            <input value={fileFilter} onChange={(event) => setFileFilter(event.target.value)} type="search" placeholder="Фильтр файлов" />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Статус">
              <option value="">Все</option>
              <option value="indexed">Indexed</option>
              <option value="skipped">Skipped</option>
              <option value="error">Error</option>
            </select>
          </div>

          <div className="tabs" role="tablist">
            <button className={`tab ${tab === "files" ? "active" : ""}`} type="button" onClick={() => setTab("files")}>Файлы</button>
            <button className={`tab ${tab === "tree" ? "active" : ""}`} type="button" onClick={() => setTab("tree")}>Дерево</button>
            <button className={`tab ${tab === "memory" ? "active" : ""}`} type="button" onClick={() => setTab("memory")}>Память</button>
          </div>

          {tab === "files" && (
            <section className="panel active">
              <div className="stats">{filteredFiles.length} показано, {stats.indexed} indexed, {stats.errors} errors, {stats.images} images</div>
              <FileList files={filteredFiles} selectedPath={selectedPath} onSelect={setSelectedPath} />
            </section>
          )}

          {tab === "tree" && (
            <section className="panel active">
              <TreeView node={tree} onSelect={setSelectedPath} />
            </section>
          )}

          {tab === "memory" && (
            <section className="panel active">
              <form className="memory-form" onSubmit={saveMemory}>
                <select value={memoryScope} onChange={(event) => setMemoryScope(event.target.value)} aria-label="Слой памяти">
                  {memoryScopes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <select value={memoryKind} onChange={(event) => setMemoryKind(event.target.value)} aria-label="Тип памяти">
                  {memoryKinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <textarea value={memoryContent} onChange={(event) => setMemoryContent(event.target.value)} rows="3" placeholder="Что запомнить" />
                <button type="submit" disabled={busy}>Запомнить</button>
              </form>
              <div className="memory-filter">
                <button className={memoryViewScope === "important" ? "active" : ""} type="button" onClick={() => setMemoryViewScope("important")}>Важная</button>
                <button className={memoryViewScope === "dialog" ? "active" : ""} type="button" onClick={() => setMemoryViewScope("dialog")}>Диалоги</button>
                <button className={memoryViewScope === "all" ? "active" : ""} type="button" onClick={() => setMemoryViewScope("all")}>Все</button>
              </div>
              <MemoryList memories={memories} onDelete={deleteMemory} />
            </section>
          )}
        </aside>

        <section className="main">
          <section className="detail">
            <div className="detail-copy">
              <h2 title={selected?.path}>{selected ? selected.path : "Файл не выбран"}</h2>
              <p>{selected ? [selected.type, selected.status, selected.mimeType, formatBytes(selected.sizeBytes), `modified ${new Date(selected.modifiedAt).toLocaleString()}`].join(" · ") : "Выберите файл слева, чтобы использовать его в вопросе или отправить изображение на анализ."}</p>
            </div>
            <div className="detail-actions">
              <button type="button" onClick={useSelectedInQuestion} disabled={!selected}>Вставить в вопрос</button>
            </div>
          </section>

          <section className="chat">
            <div ref={messagesRef} className="messages">
              {messages.map((message) => <Message key={message.id} message={message} />)}
              {busy && <ThinkingMessage />}
            </div>
            <form className="ask-form" onSubmit={ask}>
              <textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows="3" placeholder="Напишите агенту: он ответит на основе памяти и файлов" />
              <div className="form-row">
                <label>
                  Max files
                  <input value={maxFiles} onChange={(event) => setMaxFiles(event.target.value)} type="number" min="1" max="50" />
                </label>
                <label className="image-mode">
                  <input checked={imageMode} onChange={(event) => setImageMode(event.target.checked)} type="checkbox" disabled={!selected?.isImage} />
                  Анализ выбранного изображения
                </label>
                <button className="primary-button" type="submit" disabled={busy}>Отправить</button>
              </div>
            </form>
          </section>
        </section>
      </section>
    </main>
  );
}

function FileList({ files, selectedPath, onSelect }) {
  return (
    <div className="file-list">
      {files.map((file) => (
        <button key={file.path} type="button" className={`file-row ${selectedPath === file.path ? "active" : ""}`} onClick={() => onSelect(file.path)} title={file.path}>
          <span className="file-main">
            <span className="file-name">{file.path}</span>
            <span className="file-meta">{file.type} · {file.mimeType} · {formatBytes(file.sizeBytes)}</span>
          </span>
          <span className={`badge ${file.status}`}>{file.status}</span>
        </button>
      ))}
    </div>
  );
}

function TreeView({ node, onSelect, depth = 0 }) {
  if (!node) return <div className="empty">Дерево пустое.</div>;
  return (
    <div className={depth === 0 ? "tree" : "tree-children"}>
      <button type="button" className="tree-node" style={{ paddingLeft: depth * 14 }} onClick={() => onSelect(node.path)} title={node.path}>
        {node.type === "directory" ? "▸" : "·"} {node.name}
      </button>
      {(node.children ?? []).map((child) => <TreeView key={child.path} node={child} onSelect={onSelect} depth={depth + 1} />)}
    </div>
  );
}

function MemoryList({ memories, onDelete }) {
  if (!memories.length) return <div className="empty">Память пока пустая.</div>;
  return (
    <div className="memory-list">
      {memories.map((memory) => (
        <article key={memory.id} className="memory-item">
          <div className="memory-header">
            <span className="memory-badges">
              <span className={`badge ${memory.scope}`}>{memory.scope === "dialog" ? "dialog" : "important"}</span>
              <span className="badge">{memory.kind}</span>
            </span>
            <span className="file-meta">{new Date(memory.updatedAt).toLocaleString()}</span>
          </div>
          <p>{memory.content}</p>
          <button type="button" onClick={() => onDelete(memory.id)}>Удалить</button>
        </article>
      ))}
    </div>
  );
}

function Message({ message }) {
  return (
    <div className={`message ${message.type}`}>
      <div>{message.text}</div>
      {message.usedFiles?.length > 0 && (
        <div className="sources">Источники: {message.usedFiles.map((file) => file.path).join(", ")}</div>
      )}
    </div>
  );
}

function ThinkingMessage() {
  return (
    <div className="message assistant thinking" aria-live="polite">
      <span>Агент думает</span>
      <span className="thinking-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>
    </div>
  );
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

createRoot(document.getElementById("root")).render(<App />);
