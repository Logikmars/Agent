export const openAITools = [
  {
    type: "function",
    name: "list_files",
    description: "Возвращает список файлов и папок из локального индекса.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        directory: { type: ["string", "null"] },
        recursive: { type: "boolean" },
        limit: { type: "number", minimum: 1, maximum: 200 }
      },
      required: ["directory", "recursive", "limit"]
    },
    strict: true
  },
  {
    type: "function",
    name: "get_file_tree",
    description: "Возвращает дерево папки WATCH_DIR из локального индекса.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        maxDepth: { type: "number", minimum: 1, maximum: 20 }
      },
      required: ["maxDepth"]
    },
    strict: true
  },
  {
    type: "function",
    name: "search_files",
    description: "Ищет файлы по названию, расширению и тексту в чанках.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string" },
        extensions: { type: ["array", "null"], items: { type: "string" } },
        limit: { type: "number", minimum: 1, maximum: 200 }
      },
      required: ["query", "extensions", "limit"]
    },
    strict: true
  },
  {
    type: "function",
    name: "search_relevant_context",
    description: "Searches long-term memory, file metadata, and text chunk previews in one retrieval step. Use this early for most user questions.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string" },
        memoryLimit: { type: "number", minimum: 1, maximum: 20 },
        importantMemoryLimit: { type: "number", minimum: 1, maximum: 20 },
        dialogMemoryLimit: { type: "number", minimum: 1, maximum: 20 },
        fileLimit: { type: "number", minimum: 1, maximum: 50 },
        chunkLimit: { type: "number", minimum: 1, maximum: 30 }
      },
      required: ["query", "memoryLimit", "importantMemoryLimit", "dialogMemoryLimit", "fileLimit", "chunkLimit"]
    },
    strict: true
  },
  {
    type: "function",
    name: "read_file_chunk",
    description: "Читает конкретный текстовый чанк файла.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        relativePath: { type: "string" },
        chunkIndex: { type: "number", minimum: 0 }
      },
      required: ["relativePath", "chunkIndex"]
    },
    strict: true
  },
  {
    type: "function",
    name: "get_file_metadata",
    description: "Возвращает метаданные файла и preview его чанков.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        relativePath: { type: "string" }
      },
      required: ["relativePath"]
    },
    strict: true
  },
  {
    type: "function",
    name: "analyze_image",
    description: "Анализирует конкретное изображение через OpenAI Vision.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        relativePath: { type: "string" },
        question: { type: "string" }
      },
      required: ["relativePath", "question"]
    },
    strict: true
  },
  {
    type: "function",
    name: "refresh_index",
    description: "Запускает переиндексацию разрешенной папки.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        force: { type: "boolean" }
      },
      required: ["force"]
    },
    strict: true
  },
  {
    type: "function",
    name: "recall_memory",
    description: "Searches the agent long-term memory for relevant user preferences, facts, project notes, rules, and past events.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string" },
        limit: { type: "number", minimum: 1, maximum: 20 },
        scope: { type: "string", enum: ["all", "important", "dialog"] }
      },
      required: ["query", "limit", "scope"]
    },
    strict: true
  },
  {
    type: "function",
    name: "remember_memory",
    description: "Stores a durable memory only when the user explicitly asks to remember something or gives a stable preference/rule.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        kind: { type: "string", enum: ["preference", "fact", "project_note", "rule", "event"] },
        content: { type: "string" },
        importance: { type: "number", minimum: 0.1, maximum: 5 },
        metadataJson: { type: "string" },
        scope: { type: "string", enum: ["important", "dialog"] }
      },
      required: ["kind", "content", "importance", "metadataJson", "scope"]
    },
    strict: true
  }
] as const;
