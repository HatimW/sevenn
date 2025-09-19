(() => {
  // js/state.js
  var state = {
    tab: "Diseases",
    subtab: {
      Diseases: "Browse",
      Drugs: "Browse",
      Concepts: "Browse",
      Study: "Flashcards",
      Exams: "",
      // placeholder
      Map: "",
      Settings: ""
    },
    query: "",
    filters: { types: ["disease", "drug", "concept"], block: "", week: "", onlyFav: false, sort: "updated" },
    entryLayout: { mode: "list", columns: 3, scale: 1, controlsVisible: false },
    builder: {
      blocks: [],
      weeks: [],
      lectures: [],
      types: ["disease", "drug", "concept"],
      tags: [],
      onlyFav: false,
      manualPicks: [],
      collapsedBlocks: [],
      collapsedWeeks: []
    },
    cohort: [],
    review: { count: 20, format: "flashcards" },
    quizSession: null,
    flashSession: null,
    examSession: null,
    examAttemptExpanded: {},
    map: { panzoom: false },
    blockMode: { section: "", assignments: {}, reveal: {}, order: {} }
  };
  function setTab(t) {
    state.tab = t;
  }
  function setSubtab(tab, sub) {
    state.subtab[tab] = sub;
  }
  function setQuery(q) {
    state.query = q;
  }
  function setBuilder(patch) {
    Object.assign(state.builder, patch);
  }
  function setCohort(items) {
    state.cohort = items;
  }
  function setFlashSession(sess) {
    state.flashSession = sess;
  }
  function setQuizSession(sess) {
    state.quizSession = sess;
  }
  function setReviewConfig(patch) {
    Object.assign(state.review, patch);
  }
  function setExamSession(sess) {
    state.examSession = sess;
  }
  function setExamAttemptExpanded(examId, expanded2) {
    state.examAttemptExpanded[examId] = expanded2;
  }
  function setBlockMode(patch) {
    Object.assign(state.blockMode, patch);
  }
  function resetBlockMode() {
    state.blockMode = { section: "", assignments: {}, reveal: {}, order: {} };
  }
  function setEntryLayout(patch) {
    if (!patch) return;
    const layout = state.entryLayout;
    if (Object.prototype.hasOwnProperty.call(patch, "columns")) {
      const cols = Number(patch.columns);
      if (!Number.isNaN(cols)) {
        layout.columns = Math.max(1, Math.min(6, Math.round(cols)));
      }
    }
    if (Object.prototype.hasOwnProperty.call(patch, "scale")) {
      const scl = Number(patch.scale);
      if (!Number.isNaN(scl)) {
        layout.scale = Math.max(0.6, Math.min(1.4, scl));
      }
    }
    if (patch.mode === "list" || patch.mode === "grid") {
      layout.mode = patch.mode;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "controlsVisible")) {
      layout.controlsVisible = Boolean(patch.controlsVisible);
    }
  }

  // js/storage/idb.js
  var DB_NAME = "sevenn-db";
  var DB_VERSION = 3;
  var MEMORY_STORAGE_KEY = "sevenn-memory-db";
  var STORE_KEY_PATHS = {
    items: "id",
    blocks: "blockId",
    exams: "id",
    settings: "id",
    exam_sessions: "examId"
  };
  var enqueue = typeof queueMicrotask === "function" ? queueMicrotask.bind(globalThis) : ((cb) => Promise.resolve().then(cb));
  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }
  var MemoryRequest = class {
    constructor(tx, executor) {
      this.result = void 0;
      this.error = null;
      this.onsuccess = null;
      this.onerror = null;
      tx._requestStarted();
      enqueue(() => {
        try {
          this.result = executor();
          if (typeof this.onsuccess === "function") {
            this.onsuccess({ target: this });
          }
          tx._requestFinished();
        } catch (err) {
          this.error = err;
          if (typeof this.onerror === "function") {
            this.onerror({ target: this });
          }
          tx._requestFailed(err);
        }
      });
    }
  };
  var MemoryIndex = class {
    constructor(store2, extractor, multiEntry = false) {
      this.store = store2;
      this.extractor = extractor;
      this.multiEntry = multiEntry;
    }
    getAll(value) {
      return new MemoryRequest(this.store.tx, () => {
        const results = [];
        for (const item of this.store._map().values()) {
          const extracted = this.extractor(item);
          if (this.multiEntry && Array.isArray(extracted)) {
            if (extracted.includes(value)) results.push(clone(item));
          } else if (extracted === value) {
            results.push(clone(item));
          }
        }
        return results;
      });
    }
    getAllKeys(value) {
      return new MemoryRequest(this.store.tx, () => {
        const results = [];
        for (const [key, item] of this.store._map()) {
          const extracted = this.extractor(item);
          if (this.multiEntry && Array.isArray(extracted)) {
            if (extracted.includes(value)) results.push(key);
          } else if (extracted === value) {
            results.push(key);
          }
        }
        return results;
      });
    }
  };
  var MemoryStore = class {
    constructor(tx, name) {
      this.tx = tx;
      this.name = name;
    }
    _map() {
      if (!this.tx.db.maps[this.name]) {
        this.tx.db.maps[this.name] = /* @__PURE__ */ new Map();
      }
      return this.tx.db.maps[this.name];
    }
    _keyFromValue(value) {
      const keyPath = STORE_KEY_PATHS[this.name];
      if (!keyPath) return void 0;
      return value?.[keyPath];
    }
    get(key) {
      return new MemoryRequest(this.tx, () => {
        const found = this._map().get(key);
        return clone(found);
      });
    }
    getAll() {
      return new MemoryRequest(this.tx, () => {
        return Array.from(this._map().values()).map(clone);
      });
    }
    put(value) {
      return new MemoryRequest(this.tx, () => {
        const key = this._keyFromValue(value);
        if (key == null) throw new Error(`Missing key for store ${this.name}`);
        this._map().set(key, clone(value));
        this.tx.db._persist();
        return clone(value);
      });
    }
    delete(key) {
      return new MemoryRequest(this.tx, () => {
        this._map().delete(key);
        this.tx.db._persist();
        return void 0;
      });
    }
    clear() {
      return new MemoryRequest(this.tx, () => {
        this._map().clear();
        this.tx.db._persist();
        return void 0;
      });
    }
    index(name) {
      if (this.name === "items") {
        switch (name) {
          case "by_kind":
            return new MemoryIndex(this, (item) => item.kind || null);
          case "by_blocks":
            return new MemoryIndex(this, (item) => item.blocks || [], true);
          case "by_weeks":
            return new MemoryIndex(this, (item) => item.weeks || [], true);
          case "by_favorite":
            return new MemoryIndex(this, (item) => !!item.favorite);
          default:
            break;
        }
      }
      return {
        getAll: () => new MemoryRequest(this.tx, () => []),
        getAllKeys: () => new MemoryRequest(this.tx, () => [])
      };
    }
  };
  var MemoryTransaction = class {
    constructor(db, names, mode) {
      this.db = db;
      this.names = Array.isArray(names) ? names : [names];
      this.mode = mode;
      this._stores = /* @__PURE__ */ new Map();
      this._pending = 0;
      this._failed = false;
      this._completePending = false;
      this._errorPending = null;
      this._oncomplete = null;
      this._onerror = null;
      Object.defineProperty(this, "oncomplete", {
        get: () => this._oncomplete,
        set: (fn) => {
          this._oncomplete = fn;
          if (this._completePending && typeof fn === "function") {
            this._completePending = false;
            enqueue(() => fn({ target: this }));
          }
        }
      });
      Object.defineProperty(this, "onerror", {
        get: () => this._onerror,
        set: (fn) => {
          this._onerror = fn;
          if (this._errorPending && typeof fn === "function") {
            const err = this._errorPending;
            this._errorPending = null;
            enqueue(() => fn({ target: this, error: err }));
          }
        }
      });
    }
    objectStore(name) {
      if (!this._stores.has(name)) {
        this._stores.set(name, new MemoryStore(this, name));
      }
      return this._stores.get(name);
    }
    _requestStarted() {
      this._pending += 1;
    }
    _requestFinished() {
      if (this._pending > 0) this._pending -= 1;
      if (this._pending === 0 && !this._failed) {
        if (typeof this._oncomplete === "function") {
          enqueue(() => this._oncomplete({ target: this }));
        } else {
          this._completePending = true;
        }
      }
    }
    _requestFailed(error) {
      this._failed = true;
      if (typeof this._onerror === "function") {
        enqueue(() => this._onerror({ target: this, error }));
      } else {
        this._errorPending = error;
      }
    }
  };
  var MemoryDB = class {
    constructor() {
      this.maps = {};
      this.persistKey = MEMORY_STORAGE_KEY;
      this.canPersist = false;
      if (typeof localStorage !== "undefined") {
        try {
          const testKey = `${MEMORY_STORAGE_KEY}-test`;
          localStorage.setItem(testKey, "1");
          localStorage.removeItem(testKey);
          this.canPersist = true;
        } catch (err) {
          this.canPersist = false;
        }
      }
      for (const name of Object.keys(STORE_KEY_PATHS)) {
        this.maps[name] = /* @__PURE__ */ new Map();
      }
      this._load();
    }
    _load() {
      if (!this.canPersist) return;
      try {
        const raw = localStorage.getItem(this.persistKey);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        for (const name of Object.keys(STORE_KEY_PATHS)) {
          const list = parsed?.[name];
          if (Array.isArray(list)) {
            for (const entry of list) {
              const keyPath = STORE_KEY_PATHS[name];
              const key = entry?.[keyPath];
              if (key != null) {
                this.maps[name].set(key, clone(entry));
              }
            }
          }
        }
      } catch (err) {
        console.warn("Failed to load memory DB from storage", err);
        for (const name of Object.keys(STORE_KEY_PATHS)) {
          this.maps[name].clear();
        }
      }
    }
    _persist() {
      if (!this.canPersist) return;
      try {
        const payload = {};
        for (const name of Object.keys(STORE_KEY_PATHS)) {
          payload[name] = Array.from(this.maps[name].values()).map(clone);
        }
        localStorage.setItem(this.persistKey, JSON.stringify(payload));
      } catch (err) {
        console.warn("Failed to persist memory DB", err);
        this.canPersist = false;
      }
    }
    transaction(names, mode = "readonly") {
      return new MemoryTransaction(this, names, mode);
    }
    close() {
    }
  };
  function fallbackToMemory(message, error) {
    if (message) {
      console.warn(message, error);
    }
    return new MemoryDB();
  }
  function openDB() {
    if (!("indexedDB" in globalThis)) {
      return Promise.resolve(fallbackToMemory("IndexedDB unavailable, using in-memory storage."));
    }
    return new Promise((resolve) => {
      let settled = false;
      let req;
      try {
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (err) {
        settled = true;
        resolve(fallbackToMemory("IndexedDB threw during open, using in-memory storage.", err));
        return;
      }
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(fallbackToMemory("IndexedDB open timeout, using in-memory storage."));
        }
      }, 5e3);
      req.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(fallbackToMemory("IndexedDB failed to open, using in-memory storage.", req.error));
      };
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("items")) {
          const items = db.createObjectStore("items", { keyPath: "id" });
          items.createIndex("by_kind", "kind");
          items.createIndex("by_updatedAt", "updatedAt");
          items.createIndex("by_favorite", "favorite");
          items.createIndex("by_blocks", "blocks", { multiEntry: true });
          items.createIndex("by_weeks", "weeks", { multiEntry: true });
          items.createIndex("by_lecture_ids", "lectures.id", { multiEntry: true });
          items.createIndex("by_search", "tokens");
        }
        if (!db.objectStoreNames.contains("blocks")) {
          const blocks = db.createObjectStore("blocks", { keyPath: "blockId" });
          blocks.createIndex("by_title", "title");
          blocks.createIndex("by_createdAt", "createdAt");
        }
        if (!db.objectStoreNames.contains("exams")) {
          const exams = db.createObjectStore("exams", { keyPath: "id" });
          exams.createIndex("by_createdAt", "createdAt");
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("exam_sessions")) {
          const sessions = db.createObjectStore("exam_sessions", { keyPath: "examId" });
          sessions.createIndex("by_updatedAt", "updatedAt");
        }
      };
      req.onsuccess = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(req.result);
      };
    });
  }

  // js/search.js
  var contentFields = [
    "etiology",
    "pathophys",
    "clinical",
    "diagnosis",
    "treatment",
    "complications",
    "mnemonic",
    "class",
    "source",
    "moa",
    "uses",
    "sideEffects",
    "contraindications",
    "type",
    "definition",
    "mechanism",
    "clinicalRelevance",
    "example"
  ];
  function stripHtml(value = "") {
    return value.replace(/<br\s*\/?>(\s*)/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&[#a-z0-9]+;/gi, " ");
  }
  function tokenize(str) {
    return str.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  }
  function buildTokens(item) {
    const fields = [];
    if (item.name) fields.push(item.name);
    if (item.concept) fields.push(item.concept);
    fields.push(...item.tags || []);
    if (Array.isArray(item.extras)) {
      item.extras.forEach((extra) => {
        if (!extra) return;
        if (extra.title) fields.push(extra.title);
        if (extra.body) fields.push(stripHtml(extra.body));
      });
    } else if (item.facts && item.facts.length) {
      fields.push(...item.facts);
    }
    if (item.lectures) fields.push(...item.lectures.map((l) => l.name));
    contentFields.forEach((field) => {
      if (typeof item[field] === "string" && item[field]) {
        fields.push(stripHtml(item[field]));
      }
    });
    return Array.from(new Set(tokenize(fields.join(" ")))).slice(0, 200).join(" ");
  }
  function buildSearchMeta(item) {
    const pieces = [];
    if (item.name) pieces.push(item.name);
    if (item.concept) pieces.push(item.concept);
    pieces.push(...item.tags || []);
    pieces.push(...item.blocks || []);
    if (Array.isArray(item.lectures)) {
      pieces.push(...item.lectures.map((l) => l?.name || ""));
    }
    return pieces.join(" ").toLowerCase();
  }

  // js/storage/export.js
  function prom(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function exportJSON() {
    const db = await openDB();
    const tx = db.transaction(["items", "blocks", "exams", "settings"]);
    const items = await prom(tx.objectStore("items").getAll());
    const blocks = await prom(tx.objectStore("blocks").getAll());
    const exams = await prom(tx.objectStore("exams").getAll());
    const settingsArr = await prom(tx.objectStore("settings").getAll());
    const settings = settingsArr.find((s) => s.id === "app") || { id: "app", dailyCount: 20, theme: "dark" };
    return { items, blocks, exams, settings };
  }
  async function importJSON(dbDump) {
    try {
      const db = await openDB();
      const tx = db.transaction(["items", "blocks", "exams", "settings"], "readwrite");
      const items = tx.objectStore("items");
      const blocks = tx.objectStore("blocks");
      const exams = tx.objectStore("exams");
      const settings = tx.objectStore("settings");
      await Promise.all([
        prom(items.clear()),
        prom(blocks.clear()),
        prom(exams.clear()),
        prom(settings.clear())
      ]);
      if (dbDump.settings) await prom(settings.put({ ...dbDump.settings, id: "app" }));
      if (Array.isArray(dbDump.blocks)) {
        for (const b of dbDump.blocks) {
          await prom(blocks.put(b));
        }
      }
      if (Array.isArray(dbDump.items)) {
        for (const it of dbDump.items) {
          it.tokens = buildTokens(it);
          await prom(items.put(it));
        }
      }
      if (Array.isArray(dbDump.exams)) {
        for (const ex of dbDump.exams) {
          await prom(exams.put(ex));
        }
      }
      await new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return { ok: true, message: "Import complete" };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }
  function escapeCSV(value) {
    return '"' + String(value).replace(/"/g, '""') + '"';
  }
  async function exportAnkiCSV(profile, cohort) {
    const rows = [];
    if (profile === "cloze") {
      const regex = /\{\{c\d+::(.*?)\}\}/g;
      for (const item of cohort) {
        const title = item.name || item.concept || "";
        for (const [key, val] of Object.entries(item)) {
          if (typeof val !== "string") continue;
          let m;
          while (m = regex.exec(val)) {
            const answer = m[1];
            const question = val.replace(regex, "_____");
            rows.push([question, answer, title]);
          }
        }
      }
    } else {
      const qaMap = {
        disease: [
          ["etiology", "Etiology of NAME?"],
          ["pathophys", "Pathophysiology of NAME?"],
          ["clinical", "Clinical features of NAME?"],
          ["diagnosis", "Diagnosis of NAME?"],
          ["treatment", "Treatment of NAME?"],
          ["complications", "Complications of NAME?"]
        ],
        drug: [
          ["class", "Class of NAME?"],
          ["moa", "Mechanism of action of NAME?"],
          ["uses", "Uses of NAME?"],
          ["sideEffects", "Side effects of NAME?"],
          ["contraindications", "Contraindications of NAME?"]
        ],
        concept: [
          ["definition", "Definition of NAME?"],
          ["mechanism", "Mechanism of NAME?"],
          ["clinicalRelevance", "Clinical relevance of NAME?"],
          ["example", "Example of NAME?"]
        ]
      };
      for (const item of cohort) {
        const title = item.name || item.concept || "";
        const mappings = qaMap[item.kind] || [];
        for (const [field, tmpl] of mappings) {
          const val = item[field];
          if (!val) continue;
          const question = tmpl.replace("NAME", title);
          rows.push([question, val, title]);
        }
      }
    }
    const csv = rows.map((r) => r.map(escapeCSV).join(",")).join("\n");
    return new Blob([csv], { type: "text/csv" });
  }

  // js/validators.js
  var randomId = () => globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  function escapeHtml(str = "") {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function legacyFactsToHtml(facts = []) {
    return facts.map((f) => `<p>${escapeHtml(f)}</p>`).join("");
  }
  function cleanItem(item) {
    const extras = Array.isArray(item.extras) ? item.extras : [];
    const normalizedExtras = extras.map((ex) => {
      if (!ex || typeof ex !== "object") return null;
      const id = typeof ex.id === "string" && ex.id ? ex.id : randomId();
      const title = typeof ex.title === "string" ? ex.title : "";
      const body = typeof ex.body === "string" ? ex.body : "";
      if (!title.trim() && !body.trim()) return null;
      return { id, title: title.trim(), body };
    }).filter(Boolean);
    if (!normalizedExtras.length && Array.isArray(item.facts) && item.facts.length) {
      normalizedExtras.push({
        id: randomId(),
        title: "Highlights",
        body: legacyFactsToHtml(item.facts)
      });
    }
    return {
      ...item,
      favorite: !!item.favorite,
      color: item.color || null,
      extras: normalizedExtras,
      facts: normalizedExtras.length ? [] : Array.isArray(item.facts) ? item.facts : [],
      tags: item.tags || [],
      links: item.links || [],
      blocks: item.blocks || [],
      weeks: item.weeks || [],
      lectures: item.lectures || [],
      mapPos: item.mapPos || null,
      mapHidden: !!item.mapHidden,
      sr: item.sr || { box: 0, last: 0, due: 0, ease: 2.5 }
    };
  }

  // js/storage/storage.js
  var dbPromise;
  var DEFAULT_KINDS = ["disease", "drug", "concept"];
  var RESULT_BATCH_SIZE = 50;
  var MAP_CONFIG_KEY = "map-config";
  var DEFAULT_MAP_CONFIG = {
    activeTabId: "default",
    tabs: [
      {
        id: "default",
        name: "All concepts",
        includeLinked: true,
        manualMode: false,
        manualIds: [],
        layout: {},
        layoutSeeded: true,
        filter: { blockId: "", week: "", lectureKey: "" }
      }
    ]
  };
  function prom2(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function store(name, mode = "readonly") {
    const db = await dbPromise;
    return db.transaction(name, mode).objectStore(name);
  }
  async function initDB() {
    if (!dbPromise) dbPromise = openDB();
    const s = await store("settings", "readwrite");
    const existing = await prom2(s.get("app"));
    if (!existing) {
      await prom2(s.put({ id: "app", dailyCount: 20, theme: "dark" }));
    }
  }
  async function getSettings() {
    const s = await store("settings");
    const settings = await prom2(s.get("app"));
    return settings || { id: "app", dailyCount: 20, theme: "dark" };
  }
  async function saveSettings(patch) {
    const s = await store("settings", "readwrite");
    const current = await prom2(s.get("app")) || { id: "app", dailyCount: 20, theme: "dark" };
    const next = { ...current, ...patch, id: "app" };
    await prom2(s.put(next));
  }
  function cloneConfig(config) {
    return JSON.parse(JSON.stringify(config));
  }
  async function getMapConfig() {
    try {
      const s = await store("settings", "readwrite");
      const existing = await prom2(s.get(MAP_CONFIG_KEY));
      if (existing && existing.config) {
        return cloneConfig(existing.config);
      }
      const fallback = cloneConfig(DEFAULT_MAP_CONFIG);
      await prom2(s.put({ id: MAP_CONFIG_KEY, config: fallback }));
      return fallback;
    } catch (err) {
      console.warn("getMapConfig failed", err);
      return cloneConfig(DEFAULT_MAP_CONFIG);
    }
  }
  async function saveMapConfig(config) {
    const payload = config ? cloneConfig(config) : cloneConfig(DEFAULT_MAP_CONFIG);
    const s = await store("settings", "readwrite");
    await prom2(s.put({ id: MAP_CONFIG_KEY, config: payload }));
  }
  async function listBlocks() {
    try {
      const b = await store("blocks");
      const all = await prom2(b.getAll());
      return all.sort((a, b2) => {
        const ao = a.order ?? a.createdAt;
        const bo = b2.order ?? b2.createdAt;
        return bo - ao;
      });
    } catch (err) {
      console.warn("listBlocks failed", err);
      return [];
    }
  }
  async function upsertBlock(def) {
    const b = await store("blocks", "readwrite");
    const existing = await prom2(b.get(def.blockId));
    const now = Date.now();
    let lectures = def.lectures || existing?.lectures || [];
    if (existing && typeof def.weeks === "number" && def.weeks < existing.weeks) {
      const maxWeek = def.weeks;
      lectures = lectures.filter((l) => l.week <= maxWeek);
      const i = await store("items", "readwrite");
      const all = await prom2(i.getAll());
      for (const it of all) {
        let changed = false;
        if (it.lectures) {
          const before = it.lectures.length;
          it.lectures = it.lectures.filter((l) => !(l.blockId === def.blockId && l.week > maxWeek));
          if (it.lectures.length !== before) changed = true;
        }
        if (it.weeks) {
          const beforeW = it.weeks.length;
          it.weeks = it.weeks.filter((w) => w <= maxWeek);
          if (it.weeks.length !== beforeW) changed = true;
        }
        if (changed) {
          it.tokens = buildTokens(it);
          it.searchMeta = buildSearchMeta(it);
          await prom2(i.put(it));
        }
      }
    }
    const next = {
      ...def,
      lectures,
      color: def.color || existing?.color || null,
      order: def.order || existing?.order || now,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    await prom2(b.put(next));
  }
  async function deleteBlock(blockId) {
    const b = await store("blocks", "readwrite");
    await prom2(b.delete(blockId));
    const i = await store("items", "readwrite");
    const all = await prom2(i.getAll());
    for (const it of all) {
      const beforeBlocks = it.blocks?.length || 0;
      const beforeLects = it.lectures?.length || 0;
      if (beforeBlocks || beforeLects) {
        if (it.blocks) it.blocks = it.blocks.filter((bId) => bId !== blockId);
        if (it.lectures) it.lectures = it.lectures.filter((l) => l.blockId !== blockId);
        if (it.weeks) {
          const validWeeks = new Set((it.lectures || []).map((l) => l.week));
          it.weeks = Array.from(validWeeks);
        }
        if ((it.blocks?.length || 0) !== beforeBlocks || (it.lectures?.length || 0) !== beforeLects) {
          it.tokens = buildTokens(it);
          it.searchMeta = buildSearchMeta(it);
          await prom2(i.put(it));
        }
      }
    }
  }
  async function deleteLecture(blockId, lectureId) {
    const b = await store("blocks", "readwrite");
    const blk = await prom2(b.get(blockId));
    if (blk) {
      blk.lectures = (blk.lectures || []).filter((l) => l.id !== lectureId);
      await prom2(b.put(blk));
    }
    const i = await store("items", "readwrite");
    const all = await prom2(i.getAll());
    for (const it of all) {
      const before = it.lectures?.length || 0;
      if (before) {
        it.lectures = it.lectures.filter((l) => !(l.blockId === blockId && l.id === lectureId));
        if (it.lectures.length !== before) {
          it.blocks = it.blocks?.filter((bid) => bid !== blockId || it.lectures.some((l) => l.blockId === bid));
          const validWeeks = new Set((it.lectures || []).map((l) => l.week));
          it.weeks = Array.from(validWeeks);
          it.tokens = buildTokens(it);
          it.searchMeta = buildSearchMeta(it);
          await prom2(i.put(it));
        }
      }
    }
  }
  async function updateLecture(blockId, lecture) {
    const b = await store("blocks", "readwrite");
    const blk = await prom2(b.get(blockId));
    if (blk) {
      blk.lectures = (blk.lectures || []).map((l) => l.id === lecture.id ? lecture : l);
      await prom2(b.put(blk));
    }
    const i = await store("items", "readwrite");
    const all = await prom2(i.getAll());
    for (const it of all) {
      let changed = false;
      if (it.lectures) {
        it.lectures = it.lectures.map((l) => {
          if (l.blockId === blockId && l.id === lecture.id) {
            changed = true;
            return { blockId, id: lecture.id, name: lecture.name, week: lecture.week };
          }
          return l;
        });
      }
      if (changed) {
        const validWeeks = new Set((it.lectures || []).map((l) => l.week));
        it.weeks = Array.from(validWeeks);
        it.tokens = buildTokens(it);
        it.searchMeta = buildSearchMeta(it);
        await prom2(i.put(it));
      }
    }
  }
  async function listItemsByKind(kind) {
    const i = await store("items");
    const idx = i.index("by_kind");
    return await prom2(idx.getAll(kind));
  }
  function titleOf(item) {
    return item.name || item.concept || "";
  }
  function normalizeFilter(filter = {}) {
    const rawTypes = Array.isArray(filter.types) ? filter.types.filter((t) => typeof t === "string" && t) : [];
    const types = rawTypes.length ? Array.from(new Set(rawTypes)) : DEFAULT_KINDS;
    const block = typeof filter.block === "string" ? filter.block : "";
    const weekRaw = filter.week;
    let week = null;
    if (typeof weekRaw === "number" && !Number.isNaN(weekRaw)) {
      week = weekRaw;
    } else if (typeof weekRaw === "string" && weekRaw.trim()) {
      const parsed = Number(weekRaw);
      if (!Number.isNaN(parsed)) week = parsed;
    }
    const onlyFav = Boolean(filter.onlyFav);
    const query = typeof filter.query === "string" ? filter.query.trim() : "";
    const tokens = query ? tokenize(query) : [];
    return {
      types,
      block,
      week,
      onlyFav,
      tokens: tokens.length ? tokens : null,
      sort: filter.sort === "name" ? "name" : "updated"
    };
  }
  async function getKeySet(storeRef, indexName, value) {
    if (value === null || value === void 0 || value === "" || value !== value) return null;
    if (typeof storeRef.index !== "function") return null;
    const idx = storeRef.index(indexName);
    if (!idx || typeof idx.getAllKeys !== "function") return null;
    const keys = await prom2(idx.getAllKeys(value));
    return new Set(keys);
  }
  async function keysForKinds(storeRef, kinds) {
    const idx = typeof storeRef.index === "function" ? storeRef.index("by_kind") : null;
    const seen = /* @__PURE__ */ new Set();
    const allKeys = [];
    for (const kind of kinds) {
      if (!kind) continue;
      let keys = [];
      if (idx && typeof idx.getAllKeys === "function") {
        keys = await prom2(idx.getAllKeys(kind));
      } else if (idx && typeof idx.getAll === "function") {
        const values = await prom2(idx.getAll(kind));
        keys = values.map((v) => v?.id).filter(Boolean);
      }
      for (const key of keys) {
        if (!seen.has(key)) {
          seen.add(key);
          allKeys.push(key);
        }
      }
    }
    return allKeys;
  }
  async function executeItemQuery(filter) {
    const normalized2 = normalizeFilter(filter);
    const itemsStore = await store("items");
    const blockSet = normalized2.block && normalized2.block !== "__unlabeled" ? await getKeySet(itemsStore, "by_blocks", normalized2.block) : null;
    const weekSet = normalized2.week != null ? await getKeySet(itemsStore, "by_weeks", normalized2.week) : null;
    const favoriteSet = normalized2.onlyFav ? await getKeySet(itemsStore, "by_favorite", true) : null;
    const baseKeys = await keysForKinds(itemsStore, normalized2.types);
    const filteredKeys = baseKeys.filter((id) => {
      if (!id) return false;
      if (blockSet && !blockSet.has(id)) return false;
      if (weekSet && !weekSet.has(id)) return false;
      if (favoriteSet && !favoriteSet.has(id)) return false;
      return true;
    });
    const results = [];
    for (let i = 0; i < filteredKeys.length; i += RESULT_BATCH_SIZE) {
      const chunk = filteredKeys.slice(i, i + RESULT_BATCH_SIZE);
      const fetched = await Promise.all(chunk.map((id) => prom2(itemsStore.get(id))));
      for (const item of fetched) {
        if (!item) continue;
        if (normalized2.block === "__unlabeled" && Array.isArray(item.blocks) && item.blocks.length) continue;
        if (normalized2.tokens) {
          const tokenField = item.tokens || "";
          const metaField = item.searchMeta || buildSearchMeta(item);
          const matches = normalized2.tokens.every((tok) => tokenField.includes(tok) || metaField.includes(tok));
          if (!matches) continue;
        }
        results.push(item);
      }
    }
    if (normalized2.sort === "name") {
      results.sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
    } else {
      results.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return results;
  }
  function findItemsByFilter(filter) {
    let memo;
    const run = () => {
      if (!memo) memo = executeItemQuery(filter);
      return memo;
    };
    return {
      async toArray() {
        const items = await run();
        return items.slice();
      },
      async *[Symbol.asyncIterator]() {
        const items = await run();
        for (let i = 0; i < items.length; i += RESULT_BATCH_SIZE) {
          yield items.slice(i, i + RESULT_BATCH_SIZE);
        }
      }
    };
  }
  async function getItem(id) {
    const i = await store("items");
    return await prom2(i.get(id));
  }
  async function upsertItem(item) {
    const i = await store("items", "readwrite");
    const existing = await prom2(i.get(item.id));
    const now = Date.now();
    const next = cleanItem({
      ...item,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    });
    next.tokens = buildTokens(next);
    next.searchMeta = buildSearchMeta(next);
    for (const link of next.links) {
      const other = await prom2(i.get(link.id));
      if (other) {
        other.links = other.links || [];
        if (!other.links.find((l) => l.id === next.id)) {
          other.links.push({ id: next.id, type: link.type });
          other.tokens = buildTokens(other);
          other.searchMeta = buildSearchMeta(other);
          await prom2(i.put(other));
        }
      }
    }
    await prom2(i.put(next));
  }
  async function deleteItem(id) {
    const i = await store("items", "readwrite");
    const all = await prom2(i.getAll());
    for (const it of all) {
      if (it.links?.some((l) => l.id === id)) {
        it.links = it.links.filter((l) => l.id !== id);
        it.tokens = buildTokens(it);
        it.searchMeta = buildSearchMeta(it);
        await prom2(i.put(it));
      }
    }
    await prom2(i.delete(id));
  }
  async function listExams() {
    const e = await store("exams");
    return await prom2(e.getAll());
  }
  async function upsertExam(exam) {
    const e = await store("exams", "readwrite");
    const existing = await prom2(e.get(exam.id));
    const now = Date.now();
    const next = {
      ...exam,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      results: exam.results || existing?.results || []
    };
    await prom2(e.put(next));
  }
  async function deleteExam(id) {
    const e = await store("exams", "readwrite");
    await prom2(e.delete(id));
  }
  async function listExamSessions() {
    const s = await store("exam_sessions");
    return await prom2(s.getAll());
  }
  async function loadExamSession(examId) {
    const s = await store("exam_sessions");
    return await prom2(s.get(examId));
  }
  async function saveExamSessionProgress(progress) {
    const s = await store("exam_sessions", "readwrite");
    const now = Date.now();
    await prom2(s.put({ ...progress, updatedAt: now }));
  }
  async function deleteExamSessionProgress(examId) {
    const s = await store("exam_sessions", "readwrite");
    await prom2(s.delete(examId));
  }

  // js/ui/components/confirm.js
  function confirmModal(message) {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "modal";
      const box = document.createElement("div");
      box.className = "card";
      const msg = document.createElement("p");
      msg.textContent = message;
      box.appendChild(msg);
      const actions = document.createElement("div");
      actions.className = "row";
      const yes = document.createElement("button");
      yes.className = "btn";
      yes.textContent = "Yes";
      yes.addEventListener("click", () => {
        document.body.removeChild(overlay);
        resolve(true);
      });
      const no = document.createElement("button");
      no.className = "btn";
      no.textContent = "No";
      no.addEventListener("click", () => {
        document.body.removeChild(overlay);
        resolve(false);
      });
      actions.appendChild(yes);
      actions.appendChild(no);
      box.appendChild(actions);
      overlay.appendChild(box);
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) {
          document.body.removeChild(overlay);
          resolve(false);
        }
      });
      document.body.appendChild(overlay);
      yes.focus();
    });
  }

  // js/ui/settings.js
  var collapsedLectureBlocks = /* @__PURE__ */ new Set();
  function isLectureListCollapsed(blockId) {
    return collapsedLectureBlocks.has(blockId);
  }
  function toggleLectureListCollapse(blockId) {
    if (collapsedLectureBlocks.has(blockId)) {
      collapsedLectureBlocks.delete(blockId);
    } else {
      collapsedLectureBlocks.add(blockId);
    }
  }
  async function renderSettings(root) {
    root.innerHTML = "";
    const settings = await getSettings();
    const settingsCard = document.createElement("section");
    settingsCard.className = "card";
    const heading = document.createElement("h2");
    heading.textContent = "Settings";
    settingsCard.appendChild(heading);
    const dailyLabel = document.createElement("label");
    dailyLabel.textContent = "Daily review target:";
    const dailyInput = document.createElement("input");
    dailyInput.type = "number";
    dailyInput.className = "input";
    dailyInput.min = "1";
    dailyInput.value = settings.dailyCount;
    dailyInput.addEventListener("change", () => {
      saveSettings({ dailyCount: Number(dailyInput.value) });
    });
    dailyLabel.appendChild(dailyInput);
    settingsCard.appendChild(dailyLabel);
    root.appendChild(settingsCard);
    const blocksCard = document.createElement("section");
    blocksCard.className = "card";
    const bHeading = document.createElement("h2");
    bHeading.textContent = "Blocks";
    blocksCard.appendChild(bHeading);
    const list = document.createElement("div");
    list.className = "block-list";
    blocksCard.appendChild(list);
    const blocks = await listBlocks();
    blocks.forEach((b, i) => {
      const wrap = document.createElement("div");
      wrap.className = "block";
      const lectures = (b.lectures || []).slice().sort((a, b2) => b2.week - a.week || b2.id - a.id);
      const lecturesCollapsed = isLectureListCollapsed(b.blockId);
      const title = document.createElement("h3");
      title.textContent = `${b.blockId} \u2013 ${b.title}`;
      wrap.appendChild(title);
      const wkInfo = document.createElement("div");
      wkInfo.textContent = `Weeks: ${b.weeks}`;
      wrap.appendChild(wkInfo);
      if (lectures.length || lecturesCollapsed) {
        const toggleLecturesBtn = document.createElement("button");
        toggleLecturesBtn.type = "button";
        toggleLecturesBtn.className = "btn secondary settings-lecture-toggle";
        toggleLecturesBtn.textContent = lecturesCollapsed ? "Show lectures" : "Hide lectures";
        toggleLecturesBtn.addEventListener("click", async () => {
          toggleLectureListCollapse(b.blockId);
          await renderSettings(root);
        });
        wrap.appendChild(toggleLecturesBtn);
      }
      const controls = document.createElement("div");
      controls.className = "row";
      const upBtn = document.createElement("button");
      upBtn.className = "btn";
      upBtn.textContent = "\u2191";
      upBtn.disabled = i === 0;
      upBtn.addEventListener("click", async () => {
        const other = blocks[i - 1];
        const tmp = b.order;
        b.order = other.order;
        other.order = tmp;
        await upsertBlock(b);
        await upsertBlock(other);
        await renderSettings(root);
      });
      controls.appendChild(upBtn);
      const downBtn = document.createElement("button");
      downBtn.className = "btn";
      downBtn.textContent = "\u2193";
      downBtn.disabled = i === blocks.length - 1;
      downBtn.addEventListener("click", async () => {
        const other = blocks[i + 1];
        const tmp = b.order;
        b.order = other.order;
        other.order = tmp;
        await upsertBlock(b);
        await upsertBlock(other);
        await renderSettings(root);
      });
      controls.appendChild(downBtn);
      const edit = document.createElement("button");
      edit.className = "btn";
      edit.textContent = "Edit";
      controls.appendChild(edit);
      const del = document.createElement("button");
      del.className = "btn";
      del.textContent = "Delete";
      del.addEventListener("click", async () => {
        if (await confirmModal("Delete block?")) {
          await deleteBlock(b.blockId);
          await renderSettings(root);
        }
      });
      controls.appendChild(del);
      wrap.appendChild(controls);
      const editForm = document.createElement("form");
      editForm.className = "row";
      editForm.style.display = "none";
      const titleInput2 = document.createElement("input");
      titleInput2.className = "input";
      titleInput2.value = b.title;
      const weeksInput = document.createElement("input");
      weeksInput.className = "input";
      weeksInput.type = "number";
      weeksInput.value = b.weeks;
      const colorInput = document.createElement("input");
      colorInput.className = "input";
      colorInput.type = "color";
      colorInput.value = b.color || "#ffffff";
      const saveBtn = document.createElement("button");
      saveBtn.className = "btn";
      saveBtn.type = "submit";
      saveBtn.textContent = "Save";
      editForm.append(titleInput2, weeksInput, colorInput, saveBtn);
      editForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const updated = { ...b, title: titleInput2.value.trim(), weeks: Number(weeksInput.value), color: colorInput.value };
        await upsertBlock(updated);
        await renderSettings(root);
      });
      wrap.appendChild(editForm);
      edit.addEventListener("click", () => {
        editForm.style.display = editForm.style.display === "none" ? "flex" : "none";
      });
      const lectureSection = document.createElement("div");
      lectureSection.className = "settings-lecture-section";
      lectureSection.hidden = lecturesCollapsed;
      const lecList = document.createElement("ul");
      lectures.forEach((l) => {
        const li = document.createElement("li");
        li.className = "row";
        const span = document.createElement("span");
        span.textContent = `${l.id}: ${l.name} (W${l.week})`;
        li.appendChild(span);
        const editLec = document.createElement("button");
        editLec.className = "btn";
        editLec.textContent = "Edit";
        const delLec = document.createElement("button");
        delLec.className = "btn";
        delLec.textContent = "Delete";
        editLec.addEventListener("click", () => {
          li.innerHTML = "";
          li.className = "row";
          const nameInput2 = document.createElement("input");
          nameInput2.className = "input";
          nameInput2.value = l.name;
          const weekInput2 = document.createElement("input");
          weekInput2.className = "input";
          weekInput2.type = "number";
          weekInput2.value = l.week;
          const saveBtn2 = document.createElement("button");
          saveBtn2.className = "btn";
          saveBtn2.textContent = "Save";
          const cancelBtn = document.createElement("button");
          cancelBtn.className = "btn";
          cancelBtn.textContent = "Cancel";
          li.append(nameInput2, weekInput2, saveBtn2, cancelBtn);
          saveBtn2.addEventListener("click", async () => {
            const name = nameInput2.value.trim();
            const week = Number(weekInput2.value);
            if (!name || !week || week < 1 || week > b.weeks) return;
            await updateLecture(b.blockId, { id: l.id, name, week });
            await renderSettings(root);
          });
          cancelBtn.addEventListener("click", async () => {
            await renderSettings(root);
          });
        });
        delLec.addEventListener("click", async () => {
          if (await confirmModal("Delete lecture?")) {
            await deleteLecture(b.blockId, l.id);
            await renderSettings(root);
          }
        });
        li.append(editLec, delLec);
        lecList.appendChild(li);
      });
      lectureSection.appendChild(lecList);
      const lecForm = document.createElement("form");
      lecForm.className = "row";
      const idInput = document.createElement("input");
      idInput.className = "input";
      idInput.placeholder = "id";
      idInput.type = "number";
      const nameInput = document.createElement("input");
      nameInput.className = "input";
      nameInput.placeholder = "name";
      const weekInput = document.createElement("input");
      weekInput.className = "input";
      weekInput.placeholder = "week";
      weekInput.type = "number";
      const addBtn = document.createElement("button");
      addBtn.className = "btn";
      addBtn.type = "submit";
      addBtn.textContent = "Add lecture";
      lecForm.append(idInput, nameInput, weekInput, addBtn);
      lecForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const lecture = { id: Number(idInput.value), name: nameInput.value.trim(), week: Number(weekInput.value) };
        if (!lecture.id || !lecture.name || !lecture.week) return;
        if (lecture.week < 1 || lecture.week > b.weeks) return;
        const updated = { ...b, lectures: [...b.lectures, lecture] };
        await upsertBlock(updated);
        await renderSettings(root);
      });
      lectureSection.appendChild(lecForm);
      wrap.appendChild(lectureSection);
      list.appendChild(wrap);
    });
    const form = document.createElement("form");
    form.className = "row";
    const id = document.createElement("input");
    id.className = "input";
    id.placeholder = "ID";
    const titleInput = document.createElement("input");
    titleInput.className = "input";
    titleInput.placeholder = "Title";
    const weeks = document.createElement("input");
    weeks.className = "input";
    weeks.type = "number";
    weeks.placeholder = "Weeks";
    const color = document.createElement("input");
    color.className = "input";
    color.type = "color";
    color.value = "#ffffff";
    const add = document.createElement("button");
    add.className = "btn";
    add.type = "submit";
    add.textContent = "Add block";
    form.append(id, titleInput, weeks, color, add);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const def = {
        blockId: id.value.trim(),
        title: titleInput.value.trim(),
        weeks: Number(weeks.value),
        color: color.value,
        lectures: []
      };
      if (!def.blockId || !def.title || !def.weeks) return;
      await upsertBlock(def);
      await renderSettings(root);
    });
    blocksCard.appendChild(form);
    root.appendChild(blocksCard);
    const dataCard = document.createElement("section");
    dataCard.className = "card";
    const dHeading = document.createElement("h2");
    dHeading.textContent = "Data";
    dataCard.appendChild(dHeading);
    const exportBtn = document.createElement("button");
    exportBtn.className = "btn";
    exportBtn.textContent = "Export DB";
    exportBtn.addEventListener("click", async () => {
      const dump = await exportJSON();
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "sevenn-export.json";
      a.click();
      URL.revokeObjectURL(a.href);
    });
    dataCard.appendChild(exportBtn);
    const importInput = document.createElement("input");
    importInput.type = "file";
    importInput.accept = "application/json";
    importInput.style.display = "none";
    importInput.addEventListener("change", async () => {
      const file = importInput.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        const res = await importJSON(json);
        alert(res.message);
        location.reload();
      } catch (e) {
        alert("Import failed");
      }
    });
    const importBtn = document.createElement("button");
    importBtn.className = "btn";
    importBtn.textContent = "Import DB";
    importBtn.addEventListener("click", () => importInput.click());
    dataCard.appendChild(importBtn);
    dataCard.appendChild(importInput);
    const ankiBtn = document.createElement("button");
    ankiBtn.className = "btn";
    ankiBtn.textContent = "Export Anki CSV";
    ankiBtn.addEventListener("click", async () => {
      const dump = await exportJSON();
      const blob = await exportAnkiCSV("qa", dump.items || []);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "sevenn-anki.csv";
      a.click();
      URL.revokeObjectURL(a.href);
    });
    dataCard.appendChild(ankiBtn);
    root.appendChild(dataCard);
  }

  // js/utils.js
  function uid() {
    const g = globalThis;
    return g.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  }
  function setToggleState(element, active, className = "active") {
    if (!element) return;
    const isActive = Boolean(active);
    if (element.dataset) {
      element.dataset.toggle = "true";
      element.dataset.active = isActive ? "true" : "false";
    }
    if (className && element.classList) {
      element.classList.toggle(className, isActive);
    }
    if (typeof HTMLElement !== "undefined" && element instanceof HTMLElement) {
      const role = element.getAttribute("role");
      if ((element.tagName === "BUTTON" || role === "button") && typeof element.setAttribute === "function") {
        element.setAttribute("aria-pressed", isActive ? "true" : "false");
      }
    }
  }

  // js/ui/components/window-manager.js
  var windows = /* @__PURE__ */ new Set();
  var zIndexCounter = 2e3;
  var dock;
  var dockList;
  var dockHandle;
  function ensureDock() {
    if (dock) return;
    dock = document.createElement("div");
    dock.className = "window-dock";
    dockHandle = document.createElement("button");
    dockHandle.type = "button";
    dockHandle.className = "window-dock-handle";
    dockHandle.textContent = "\u{1F5C2}";
    dockHandle.addEventListener("click", () => {
      dock.classList.toggle("open");
    });
    dock.appendChild(dockHandle);
    dockList = document.createElement("div");
    dockList.className = "window-dock-list";
    dock.appendChild(dockList);
    document.body.appendChild(dock);
  }
  function bringToFront(win) {
    if (!win) return;
    zIndexCounter += 1;
    win.style.zIndex = zIndexCounter;
  }
  function setupDragging(win, header) {
    let active = null;
    header.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return;
      active = {
        offsetX: e.clientX - win.offsetLeft,
        offsetY: e.clientY - win.offsetTop
      };
      bringToFront(win);
      document.addEventListener("mousemove", handleMove);
      document.addEventListener("mouseup", stopDrag);
      e.preventDefault();
    });
    function handleMove(e) {
      if (!active) return;
      const left = e.clientX - active.offsetX;
      const top = e.clientY - active.offsetY;
      win.style.left = `${left}px`;
      win.style.top = `${top}px`;
    }
    function stopDrag() {
      active = null;
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", stopDrag);
    }
  }
  function createFloatingWindow({ title, width = 520, onClose, onBeforeClose } = {}) {
    ensureDock();
    const win = document.createElement("div");
    win.className = "floating-window";
    win.style.width = typeof width === "number" ? `${width}px` : width;
    win.style.left = `${120 + windows.size * 32}px`;
    win.style.top = `${100 + windows.size * 24}px`;
    bringToFront(win);
    const header = document.createElement("div");
    header.className = "floating-header";
    const titleEl = document.createElement("div");
    titleEl.className = "floating-title";
    titleEl.textContent = title || "Window";
    header.appendChild(titleEl);
    const actions = document.createElement("div");
    actions.className = "floating-actions";
    const minimizeBtn = document.createElement("button");
    minimizeBtn.type = "button";
    minimizeBtn.className = "floating-action";
    minimizeBtn.title = "Minimize";
    minimizeBtn.textContent = "\u2014";
    actions.appendChild(minimizeBtn);
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "floating-action";
    closeBtn.title = "Close";
    closeBtn.textContent = "\xD7";
    actions.appendChild(closeBtn);
    header.appendChild(actions);
    win.appendChild(header);
    const body = document.createElement("div");
    body.className = "floating-body";
    win.appendChild(body);
    let minimized = false;
    let dockButton = null;
    function handleMinimize() {
      if (minimized) {
        restore();
        return;
      }
      minimized = true;
      win.classList.add("minimized");
      win.style.display = "none";
      dock.classList.add("open");
      dockButton = document.createElement("button");
      dockButton.type = "button";
      dockButton.className = "dock-entry";
      dockButton.textContent = titleEl.textContent;
      dockButton.addEventListener("click", () => restore());
      dockList.appendChild(dockButton);
    }
    function destroyDockButton() {
      if (dockButton && dockButton.parentElement) {
        dockButton.parentElement.removeChild(dockButton);
      }
      dockButton = null;
      if (!dockList.childElementCount) {
        dock.classList.remove("open");
      }
    }
    function restore() {
      if (!minimized) return;
      minimized = false;
      win.classList.remove("minimized");
      win.style.display = "";
      bringToFront(win);
      destroyDockButton();
    }
    minimizeBtn.addEventListener("click", handleMinimize);
    async function close(reason) {
      if (typeof onBeforeClose === "function") {
        try {
          const shouldClose = await onBeforeClose(reason);
          if (shouldClose === false) return false;
        } catch (err) {
          console.error(err);
          return false;
        }
      }
      destroyDockButton();
      windows.delete(win);
      if (win.parentElement) win.parentElement.removeChild(win);
      if (typeof onClose === "function") onClose(reason);
      return true;
    }
    closeBtn.addEventListener("click", () => {
      void close("close");
    });
    function isInteractiveTarget(target) {
      if (!(target instanceof HTMLElement)) return false;
      if (target.closest('input, textarea, select, [contenteditable="true"], button, label, .rich-editor-area')) {
        return true;
      }
      return false;
    }
    win.addEventListener("mousedown", (event) => {
      if (isInteractiveTarget(event.target)) {
        requestAnimationFrame(() => bringToFront(win));
        return;
      }
      bringToFront(win);
    });
    win.addEventListener("focusin", () => bringToFront(win));
    setupDragging(win, header);
    document.body.appendChild(win);
    windows.add(win);
    return {
      element: win,
      body,
      setContent(node) {
        body.innerHTML = "";
        if (node) body.appendChild(node);
      },
      close,
      minimize: handleMinimize,
      restore,
      setTitle(text) {
        titleEl.textContent = text;
        if (dockButton) dockButton.textContent = text;
      },
      isMinimized() {
        return minimized;
      },
      focus() {
        bringToFront(win);
      }
    };
  }

  // js/ui/components/rich-text.js
  var allowedTags = /* @__PURE__ */ new Set([
    "a",
    "b",
    "strong",
    "i",
    "em",
    "u",
    "s",
    "strike",
    "del",
    "mark",
    "span",
    "font",
    "p",
    "div",
    "br",
    "ul",
    "ol",
    "li",
    "img",
    "sub",
    "sup",
    "blockquote",
    "code",
    "pre",
    "hr",
    "video",
    "audio",
    "source",
    "iframe"
  ]);
  var allowedAttributes = {
    "a": ["href", "title", "target", "rel"],
    "img": ["src", "alt", "title", "width", "height"],
    "span": ["style"],
    "div": ["style"],
    "p": ["style"],
    "font": ["style", "color", "face", "size"],
    "blockquote": ["style"],
    "code": ["style"],
    "pre": ["style"],
    "video": ["src", "controls", "width", "height", "poster", "preload", "loop", "muted", "playsinline"],
    "audio": ["src", "controls", "preload", "loop", "muted"],
    "source": ["src", "type"],
    "iframe": ["src", "title", "width", "height", "allow", "allowfullscreen", "frameborder"]
  };
  var allowedStyles = /* @__PURE__ */ new Set([
    "color",
    "background-color",
    "font-size",
    "font-weight",
    "font-style",
    "text-decoration-line",
    "text-decoration",
    "text-decoration-color",
    "text-decoration-style",
    "text-align"
  ]);
  function escapeHtml2(str = "") {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function isSafeUrl(value = "", { allowData = false, requireHttps = false } = {}) {
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (/^javascript:/i.test(trimmed)) return false;
    if (!allowData && /^data:/i.test(trimmed)) return false;
    if (/^blob:/i.test(trimmed)) return true;
    if (requireHttps) {
      if (trimmed.startsWith("//")) return true;
      if (trimmed.startsWith("/") || trimmed.startsWith("./") || trimmed.startsWith("../")) return true;
      if (/^https:/i.test(trimmed)) return true;
      return false;
    }
    return true;
  }
  function cleanStyles(node) {
    const style = node.getAttribute("style");
    if (!style) return;
    const cleaned = style.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
      const [rawProp, ...valueParts] = part.split(":");
      if (!rawProp || !valueParts.length) return null;
      const prop = rawProp.trim().toLowerCase();
      if (!allowedStyles.has(prop)) return null;
      return `${prop}: ${valueParts.join(":").trim()}`;
    }).filter(Boolean).join("; ");
    if (cleaned) node.setAttribute("style", cleaned);
    else node.removeAttribute("style");
  }
  function sanitizeNode(node) {
    if (node.nodeType === Node.TEXT_NODE) return;
    if (node.nodeType === Node.COMMENT_NODE) {
      node.remove();
      return;
    }
    const tag = node.tagName?.toLowerCase();
    if (!tag) return;
    if (!allowedTags.has(tag)) {
      if (node.childNodes.length) {
        const parent = node.parentNode;
        while (node.firstChild) parent.insertBefore(node.firstChild, node);
        node.remove();
      } else {
        node.remove();
      }
      return;
    }
    const attrs = Array.from(node.attributes || []);
    const allowList = allowedAttributes[tag] || [];
    attrs.forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (name === "style") {
        cleanStyles(node);
        return;
      }
      if (!allowList.includes(name)) {
        node.removeAttribute(attr.name);
        return;
      }
      if (tag === "a" && name === "href") {
        const value = attr.value.trim();
        if (!value || value.startsWith("javascript:")) {
          node.removeAttribute(attr.name);
        } else {
          node.setAttribute("target", "_blank");
          node.setAttribute("rel", "noopener noreferrer");
        }
      }
      if (name === "src" && ["img", "video", "audio", "source", "iframe"].includes(tag)) {
        const allowData = tag === "img";
        const requireHttps = tag === "iframe";
        if (!isSafeUrl(attr.value || "", { allowData, requireHttps })) {
          node.removeAttribute(attr.name);
        }
      }
    });
    Array.from(node.childNodes).forEach(sanitizeNode);
  }
  function sanitizeHtml(html = "") {
    const template = document.createElement("template");
    template.innerHTML = html;
    Array.from(template.content.childNodes).forEach(sanitizeNode);
    return template.innerHTML;
  }
  function normalizeInput(value = "") {
    if (!value) return "";
    const looksHtml = /<([a-z][^>]*>)/i.test(value);
    if (looksHtml) return sanitizeHtml(value);
    return sanitizeHtml(escapeHtml2(value).replace(/\n/g, "<br>"));
  }
  function isEmptyHtml(html = "") {
    if (!html) return true;
    const template = document.createElement("template");
    template.innerHTML = html;
    const hasMedia = template.content.querySelector("img,video,audio,iframe");
    const text = template.content.textContent?.replace(/\u00a0/g, " ").trim();
    return !hasMedia && !text;
  }
  function createToolbarButton(label, title, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rich-editor-btn";
    btn.textContent = label;
    btn.title = title;
    btn.setAttribute("aria-label", title);
    btn.dataset.toggle = "true";
    btn.dataset.active = "false";
    btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", onClick);
    return btn;
  }
  function createRichTextEditor({ value = "", onChange, ariaLabel, ariaLabelledBy } = {}) {
    const wrapper = document.createElement("div");
    wrapper.className = "rich-editor";
    const toolbar = document.createElement("div");
    toolbar.className = "rich-editor-toolbar";
    toolbar.setAttribute("role", "toolbar");
    toolbar.setAttribute("aria-label", "Text formatting toolbar");
    wrapper.appendChild(toolbar);
    const editable = document.createElement("div");
    editable.className = "rich-editor-area input";
    editable.contentEditable = "true";
    editable.spellcheck = true;
    editable.innerHTML = normalizeInput(value);
    if (ariaLabel) editable.setAttribute("aria-label", ariaLabel);
    if (ariaLabelledBy) editable.setAttribute("aria-labelledby", ariaLabelledBy);
    wrapper.appendChild(editable);
    const commandButtons = [];
    function focusEditor() {
      editable.focus({ preventScroll: false });
    }
    let savedRange = null;
    let suppressSelectionCapture = false;
    function rangeWithinEditor(range, { allowCollapsed = true } = {}) {
      if (!range) return false;
      if (!allowCollapsed && range.collapsed) return false;
      const { startContainer, endContainer } = range;
      if (!startContainer || !endContainer) return false;
      return editable.contains(startContainer) && editable.contains(endContainer);
    }
    function captureSelectionRange() {
      if (suppressSelectionCapture) return;
      const selection = window.getSelection();
      if (!selection?.rangeCount) return;
      const range = selection.getRangeAt(0);
      if (!rangeWithinEditor(range)) return;
      savedRange = range.cloneRange();
    }
    function getSavedRange({ requireSelection = false } = {}) {
      if (!savedRange) return null;
      return rangeWithinEditor(savedRange, { allowCollapsed: !requireSelection }) ? savedRange : null;
    }
    function restoreSavedRange({ requireSelection = false } = {}) {
      const range = getSavedRange({ requireSelection });
      if (!range) return false;
      const selection = window.getSelection();
      if (!selection) return false;
      selection.removeAllRanges();
      const clone3 = range.cloneRange();
      selection.addRange(clone3);
      savedRange = clone3.cloneRange();
      return true;
    }
    function runCommand(action, { requireSelection = false } = {}) {
      const existing = getSavedRange({ requireSelection });
      if (!existing) return false;
      const preservedRange = existing.cloneRange();
      let restored = false;
      suppressSelectionCapture = true;
      try {
        focusEditor();
        savedRange = preservedRange.cloneRange();
        restored = restoreSavedRange({ requireSelection });
      } finally {
        suppressSelectionCapture = false;
      }
      if (!restored) return false;
      let inputFired = false;
      const handleInput = () => {
        inputFired = true;
      };
      editable.addEventListener("input", handleInput, { once: true });
      const result = action();
      editable.removeEventListener("input", handleInput);
      captureSelectionRange();
      if (!inputFired) {
        editable.dispatchEvent(new Event("input", { bubbles: true }));
      }
      updateInlineState();
      return result;
    }
    function exec(command, arg = null, { requireSelection = false, styleWithCss = true } = {}) {
      return runCommand(() => {
        let previousStyleWithCss = null;
        try {
          previousStyleWithCss = document.queryCommandState("styleWithCSS");
        } catch (err) {
          previousStyleWithCss = null;
        }
        try {
          document.execCommand("styleWithCSS", false, styleWithCss);
          return document.execCommand(command, false, arg);
        } finally {
          if (previousStyleWithCss !== null) {
            document.execCommand("styleWithCSS", false, previousStyleWithCss);
          }
        }
      }, { requireSelection });
    }
    function selectionWithinEditor({ allowCollapsed = true } = {}) {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return false;
      if (!allowCollapsed && selection.isCollapsed) return false;
      const anchor = selection.anchorNode;
      const focus = selection.focusNode;
      if (!anchor || !focus) return false;
      return editable.contains(anchor) && editable.contains(focus);
    }
    function hasActiveSelection() {
      return Boolean(getSavedRange({ requireSelection: true }));
    }
    function collapsedInlineState() {
      const selection = window.getSelection();
      if (!selection?.anchorNode) return null;
      let node = selection.anchorNode;
      const state2 = { bold: false, italic: false, underline: false, strike: false };
      const applyFromElement = (el) => {
        const tag = el.tagName?.toLowerCase();
        if (tag === "b" || tag === "strong") state2.bold = true;
        if (tag === "i" || tag === "em") state2.italic = true;
        if (tag === "u") state2.underline = true;
        if (tag === "s" || tag === "strike" || tag === "del") state2.strike = true;
        if (el instanceof Element) {
          const inlineStyle = el.style;
          if (inlineStyle) {
            if (!state2.bold) {
              const weightRaw = inlineStyle.fontWeight || "";
              const weightText = typeof weightRaw === "string" ? weightRaw.toLowerCase() : `${weightRaw}`.toLowerCase();
              const weightValue = Number.parseInt(weightText, 10);
              if (weightText === "bold" || weightText === "bolder" || Number.isFinite(weightValue) && weightValue >= 600) {
                state2.bold = true;
              }
            }
            if (!state2.italic && inlineStyle.fontStyle === "italic") state2.italic = true;
            const deco = `${inlineStyle.textDecorationLine || inlineStyle.textDecoration || ""}`.toLowerCase();
            if (!state2.underline && deco.includes("underline")) state2.underline = true;
            if (!state2.strike && (deco.includes("line-through") || deco.includes("strikethrough"))) state2.strike = true;
          }
        }
      };
      while (node && node !== editable) {
        if (node.nodeType === Node.TEXT_NODE) {
          node = node.parentNode;
          continue;
        }
        if (!(node instanceof Element)) {
          node = node.parentNode;
          continue;
        }
        applyFromElement(node);
        node = node.parentNode;
      }
      return state2;
    }
    function updateInlineState() {
      const inEditor = selectionWithinEditor();
      const selection = window.getSelection();
      const collapsed = Boolean(selection?.isCollapsed);
      const collapsedState = inEditor && collapsed ? collapsedInlineState() : null;
      commandButtons.forEach(({ btn, command, stateKey }) => {
        let active = false;
        if (inEditor) {
          if (collapsed && collapsedState && stateKey) {
            active = collapsedState[stateKey];
          } else {
            try {
              active = document.queryCommandState(command);
            } catch (err) {
              active = false;
            }
          }
        }
        const isActive = Boolean(active);
        btn.classList.toggle("is-active", isActive);
        btn.dataset.active = isActive ? "true" : "false";
        btn.setAttribute("aria-pressed", isActive ? "true" : "false");
      });
    }
    function createGroup(extraClass) {
      const group = document.createElement("div");
      group.className = "rich-editor-group";
      if (extraClass) group.classList.add(extraClass);
      toolbar.appendChild(group);
      return group;
    }
    const inlineGroup = createGroup();
    [
      ["B", "Bold", "bold", "bold"],
      ["I", "Italic", "italic", "italic"],
      ["U", "Underline", "underline", "underline"],
      ["S", "Strikethrough", "strikeThrough", "strike"]
    ].forEach(([label, title, command, stateKey]) => {
      const btn = createToolbarButton(label, title, () => exec(command));
      btn.dataset.command = command;
      commandButtons.push({ btn, command, stateKey });
      inlineGroup.appendChild(btn);
    });
    const colorWrap = document.createElement("label");
    colorWrap.className = "rich-editor-color";
    colorWrap.title = "Text color";
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = "#ffffff";
    colorInput.dataset.lastColor = "#ffffff";
    colorInput.addEventListener("input", () => {
      if (!getSavedRange({ requireSelection: true })) {
        const previous = colorInput.dataset.lastColor || "#ffffff";
        colorInput.value = previous;
        return;
      }
      exec("foreColor", colorInput.value, { requireSelection: true });
      colorInput.dataset.lastColor = colorInput.value;
    });
    colorWrap.appendChild(colorInput);
    const colorGroup = createGroup("rich-editor-color-group");
    colorGroup.appendChild(colorWrap);
    const highlightRow = document.createElement("div");
    highlightRow.className = "rich-editor-highlight-row";
    colorGroup.appendChild(highlightRow);
    const highlightColors = [
      ["#facc15", "Yellow"],
      ["#f472b6", "Pink"],
      ["#f87171", "Red"],
      ["#4ade80", "Green"],
      ["#38bdf8", "Blue"]
    ];
    function applyHighlight(color) {
      if (!getSavedRange({ requireSelection: true })) return;
      exec("hiliteColor", color, { requireSelection: true });
    }
    const clearSwatch = document.createElement("button");
    clearSwatch.type = "button";
    clearSwatch.className = "rich-editor-swatch rich-editor-swatch--clear";
    clearSwatch.title = "Remove highlight";
    clearSwatch.setAttribute("aria-label", "Remove highlight");
    clearSwatch.textContent = "\xD7";
    clearSwatch.addEventListener("mousedown", (e) => e.preventDefault());
    clearSwatch.addEventListener("click", () => {
      exec("hiliteColor", "transparent", { requireSelection: true });
    });
    highlightRow.appendChild(clearSwatch);
    highlightColors.forEach(([color, label]) => {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "rich-editor-swatch";
      swatch.style.setProperty("--swatch-color", color);
      swatch.title = `${label} highlight`;
      swatch.setAttribute("aria-label", `${label} highlight`);
      swatch.addEventListener("mousedown", (e) => e.preventDefault());
      swatch.addEventListener("click", () => applyHighlight(color));
      highlightRow.appendChild(swatch);
    });
    const listGroup = createGroup("rich-editor-list-group");
    function applyOrderedStyle(style) {
      const selection = window.getSelection();
      if (!selection?.rangeCount) return;
      let node = selection.getRangeAt(0).startContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
      while (node && node !== editable) {
        if (node.nodeType === Node.ELEMENT_NODE && node.tagName?.toLowerCase() === "ol") {
          if (style) node.style.listStyleType = style;
          else node.style.removeProperty("list-style-type");
          break;
        }
        node = node.parentNode;
      }
    }
    function insertOrdered(style) {
      runCommand(() => {
        document.execCommand("styleWithCSS", false, false);
        document.execCommand("insertOrderedList", false, null);
        if (style) applyOrderedStyle(style);
      });
    }
    const listButtons = [
      ["\u2022", "Bulleted list", () => exec("insertUnorderedList", null, { styleWithCss: false })],
      ["1.", "Numbered list", () => insertOrdered("")],
      ["a.", "Lettered list", () => insertOrdered("lower-alpha")],
      ["i.", "Roman numeral list", () => insertOrdered("lower-roman")]
    ];
    listButtons.forEach(([label, title, handler]) => {
      const btn = createToolbarButton(label, title, handler);
      listGroup.appendChild(btn);
    });
    const sizeSelect = document.createElement("select");
    sizeSelect.className = "rich-editor-size";
    const sizes = [
      ["Default", ""],
      ["Small", "0.85rem"],
      ["Normal", "1rem"],
      ["Large", "1.25rem"],
      ["Huge", "1.5rem"]
    ];
    sizes.forEach(([label, value2]) => {
      const opt = document.createElement("option");
      opt.value = value2;
      opt.textContent = label;
      sizeSelect.appendChild(opt);
    });
    sizeSelect.addEventListener("change", () => {
      if (!hasActiveSelection()) {
        sizeSelect.value = "";
        return;
      }
      runCommand(() => {
        document.execCommand("styleWithCSS", false, true);
        document.execCommand("fontSize", false, 4);
        const selection = window.getSelection();
        if (selection?.rangeCount) {
          const walker = document.createTreeWalker(editable, NodeFilter.SHOW_ELEMENT, {
            acceptNode: (node) => node.tagName?.toLowerCase() === "font" ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
          });
          const toAdjust = [];
          while (walker.nextNode()) {
            toAdjust.push(walker.currentNode);
          }
          toAdjust.forEach((node) => {
            if (sizeSelect.value) {
              const span = document.createElement("span");
              span.style.fontSize = sizeSelect.value;
              while (node.firstChild) span.appendChild(node.firstChild);
              node.parentNode.replaceChild(span, node);
            } else {
              const parent = node.parentNode;
              while (node.firstChild) parent.insertBefore(node.firstChild, node);
              parent.removeChild(node);
            }
          });
        }
      }, { requireSelection: true });
      sizeSelect.value = "";
    });
    listGroup.appendChild(sizeSelect);
    const mediaGroup = createGroup("rich-editor-media-group");
    const linkBtn = createToolbarButton("\u{1F517}", "Insert link", () => {
      if (!hasActiveSelection()) return;
      const url = prompt("Enter URL");
      if (!url) return;
      exec("createLink", url, { requireSelection: true });
    });
    mediaGroup.appendChild(linkBtn);
    const imageBtn = createToolbarButton("\u{1F5BC}", "Insert image", () => {
      const url = prompt("Enter image URL");
      if (!url) return;
      exec("insertImage", url, { styleWithCss: false });
    });
    mediaGroup.appendChild(imageBtn);
    const mediaBtn = createToolbarButton("\u{1F3AC}", "Insert media", () => {
      const url = prompt("Enter media URL");
      if (!url) return;
      const typePrompt = prompt("Media type (video/audio/embed)", "video");
      const kind = (typePrompt || "video").toLowerCase();
      const safeUrl = escapeHtml2(url);
      let html = "";
      if (kind.startsWith("a")) {
        html = `<audio controls src="${safeUrl}"></audio>`;
      } else if (kind.startsWith("e") || kind.startsWith("i")) {
        html = `<iframe src="${safeUrl}" title="Embedded media" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
      } else {
        html = `<video controls src="${safeUrl}"></video>`;
      }
      runCommand(() => document.execCommand("insertHTML", false, html));
    });
    mediaGroup.appendChild(mediaBtn);
    const clearBtn = createToolbarButton("\u232B", "Clear formatting", () => exec("removeFormat", null, { requireSelection: true, styleWithCss: false }));
    const utilityGroup = createGroup("rich-editor-utility-group");
    utilityGroup.appendChild(clearBtn);
    editable.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        if (e.shiftKey) exec("outdent");
        else exec("indent");
      }
    });
    let settingValue = false;
    editable.addEventListener("input", () => {
      if (settingValue) return;
      if (typeof onChange === "function") onChange();
      updateInlineState();
    });
    ["keyup", "mouseup", "focus"].forEach((event) => {
      editable.addEventListener(event, () => updateInlineState());
    });
    editable.addEventListener("blur", () => {
      setTimeout(() => updateInlineState(), 0);
    });
    const selectionHandler = () => {
      if (!document.body.contains(wrapper)) {
        document.removeEventListener("selectionchange", selectionHandler);
        return;
      }
      captureSelectionRange();
      updateInlineState();
    };
    document.addEventListener("selectionchange", selectionHandler);
    updateInlineState();
    return {
      element: wrapper,
      getValue() {
        const sanitized = sanitizeHtml(editable.innerHTML);
        return isEmptyHtml(sanitized) ? "" : sanitized;
      },
      setValue(val) {
        settingValue = true;
        editable.innerHTML = normalizeInput(val);
        settingValue = false;
        updateInlineState();
      },
      focus() {
        focusEditor();
      }
    };
  }
  function renderRichText(target, value) {
    const normalized2 = normalizeInput(value);
    if (!normalized2) {
      target.textContent = "";
      target.classList.remove("rich-content");
      return;
    }
    target.classList.add("rich-content");
    target.innerHTML = normalized2;
  }

  // js/ui/components/editor.js
  var fieldMap = {
    disease: [
      ["etiology", "Etiology"],
      ["pathophys", "Pathophys"],
      ["clinical", "Clinical"],
      ["diagnosis", "Diagnosis"],
      ["treatment", "Treatment"],
      ["complications", "Complications"],
      ["mnemonic", "Mnemonic"]
    ],
    drug: [
      ["class", "Class"],
      ["source", "Source"],
      ["moa", "MOA"],
      ["uses", "Uses"],
      ["sideEffects", "Side Effects"],
      ["contraindications", "Contraindications"],
      ["mnemonic", "Mnemonic"]
    ],
    concept: [
      ["type", "Type"],
      ["definition", "Definition"],
      ["mechanism", "Mechanism"],
      ["clinicalRelevance", "Clinical Relevance"],
      ["example", "Example"],
      ["mnemonic", "Mnemonic"]
    ]
  };
  var titleMap = { disease: "Disease", drug: "Drug", concept: "Concept" };
  function escapeHtml3(str = "") {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  async function openEditor(kind, onSave, existing = null) {
    let isDirty = false;
    let status;
    const win = createFloatingWindow({
      title: `${existing ? "Edit" : "Add"} ${titleMap[kind] || kind}`,
      width: 660,
      onBeforeClose: async (reason) => {
        if (reason === "saved") return true;
        if (!isDirty) return true;
        if (reason !== "close") return true;
        const shouldSave = await confirmModal("Save changes before closing?");
        if (shouldSave) {
          await persist(true);
          return false;
        }
        return true;
      }
    });
    const form = document.createElement("form");
    form.className = "editor-form";
    const nameLabel = document.createElement("label");
    nameLabel.textContent = kind === "concept" ? "Concept" : "Name";
    nameLabel.className = "editor-field";
    const nameInput = document.createElement("input");
    nameInput.className = "input";
    nameInput.value = existing ? existing.name || existing.concept || "" : "";
    nameLabel.appendChild(nameInput);
    form.appendChild(nameLabel);
    const markDirty = () => {
      isDirty = true;
      if (status) status.textContent = "";
    };
    nameInput.addEventListener("input", markDirty);
    const fieldInputs = {};
    fieldMap[kind].forEach(([field, label]) => {
      const fieldWrap = document.createElement("div");
      fieldWrap.className = "editor-field";
      const labelEl = document.createElement("label");
      labelEl.className = "editor-field-label";
      labelEl.textContent = label;
      const labelId = `field-${field}-${uid()}`;
      labelEl.id = labelId;
      fieldWrap.appendChild(labelEl);
      const editor = createRichTextEditor({
        value: existing ? existing[field] || "" : "",
        onChange: markDirty,
        ariaLabelledBy: labelId
      });
      const inp = editor.element;
      fieldInputs[field] = editor;
      fieldWrap.appendChild(inp);
      form.appendChild(fieldWrap);
    });
    const extrasWrap = document.createElement("section");
    extrasWrap.className = "editor-extras";
    const extrasHeader = document.createElement("div");
    extrasHeader.className = "editor-extras-header";
    const extrasTitle = document.createElement("h3");
    extrasTitle.textContent = "Custom Sections";
    extrasHeader.appendChild(extrasTitle);
    const addExtraBtn = document.createElement("button");
    addExtraBtn.type = "button";
    addExtraBtn.className = "btn subtle";
    addExtraBtn.textContent = "Add Section";
    extrasHeader.appendChild(addExtraBtn);
    extrasWrap.appendChild(extrasHeader);
    const extrasList = document.createElement("div");
    extrasList.className = "editor-extras-list";
    extrasWrap.appendChild(extrasList);
    form.appendChild(extrasWrap);
    const extraControls = /* @__PURE__ */ new Map();
    function addExtra(extra = null) {
      const data = extra || {};
      const id = data.id || uid();
      const row = document.createElement("div");
      row.className = "editor-extra";
      row.dataset.id = id;
      const titleRow = document.createElement("div");
      titleRow.className = "editor-extra-title-row";
      const titleInput = document.createElement("input");
      titleInput.className = "input editor-extra-title";
      titleInput.placeholder = "Section title";
      titleInput.value = data.title || "";
      titleRow.appendChild(titleInput);
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "icon-btn ghost";
      removeBtn.title = "Remove section";
      removeBtn.textContent = "\u2715";
      removeBtn.addEventListener("click", () => {
        extraControls.delete(id);
        row.remove();
        markDirty();
      });
      titleRow.appendChild(removeBtn);
      row.appendChild(titleRow);
      const editor = createRichTextEditor({ value: data.body || "", onChange: markDirty });
      row.appendChild(editor.element);
      extrasList.appendChild(row);
      extraControls.set(id, { id, titleInput, editor });
      titleInput.addEventListener("input", markDirty);
      row.addEventListener("input", markDirty);
      if (!extra) markDirty();
    }
    addExtraBtn.addEventListener("click", () => addExtra());
    const legacyExtras = (() => {
      if (existing?.extras && existing.extras.length) return existing.extras;
      if (existing?.facts && existing.facts.length) {
        return [{
          id: uid(),
          title: "Highlights",
          body: existing.facts.map((f) => `<p>${escapeHtml3(f)}</p>`).join("")
        }];
      }
      return [];
    })();
    legacyExtras.forEach((extra) => addExtra(extra));
    const colorLabel = document.createElement("label");
    colorLabel.className = "editor-field";
    colorLabel.textContent = "Color";
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.className = "input";
    colorInput.value = existing?.color || "#ffffff";
    colorLabel.appendChild(colorInput);
    form.appendChild(colorLabel);
    colorInput.addEventListener("input", markDirty);
    const blocks = await listBlocks();
    const blockMap = new Map(blocks.map((b) => [b.blockId, b]));
    const blockSet = new Set(existing?.blocks || []);
    const weekSet = /* @__PURE__ */ new Set();
    const lectSet = /* @__PURE__ */ new Set();
    existing?.lectures?.forEach((l) => {
      blockSet.add(l.blockId);
      weekSet.add(`${l.blockId}|${l.week}`);
      lectSet.add(`${l.blockId}|${l.id}`);
    });
    const blockWrap = document.createElement("section");
    blockWrap.className = "editor-tags";
    const blockTitle = document.createElement("div");
    blockTitle.className = "editor-tags-title";
    blockTitle.textContent = "Curriculum tags";
    blockWrap.appendChild(blockTitle);
    const blockChipRow = document.createElement("div");
    blockChipRow.className = "editor-chip-row";
    blockWrap.appendChild(blockChipRow);
    const blockPanels = document.createElement("div");
    blockPanels.className = "editor-block-panels";
    blockWrap.appendChild(blockPanels);
    function createTagChip(label, variant, active = false) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `tag-chip tag-chip-${variant}`;
      chip.textContent = label;
      setToggleState(chip, active);
      return chip;
    }
    function pruneBlock(blockId) {
      for (const key of Array.from(weekSet)) {
        if (key.startsWith(`${blockId}|`)) weekSet.delete(key);
      }
      for (const key of Array.from(lectSet)) {
        if (key.startsWith(`${blockId}|`)) lectSet.delete(key);
      }
    }
    function renderBlockChips() {
      blockChipRow.innerHTML = "";
      if (!blocks.length) {
        const empty = document.createElement("div");
        empty.className = "editor-tags-empty";
        empty.textContent = "No curriculum blocks have been created yet.";
        blockChipRow.appendChild(empty);
        return;
      }
      blocks.forEach((b) => {
        const chip = createTagChip(b.title || b.blockId, "block", blockSet.has(b.blockId));
        chip.addEventListener("click", () => {
          if (blockSet.has(b.blockId)) {
            blockSet.delete(b.blockId);
            pruneBlock(b.blockId);
          } else {
            blockSet.add(b.blockId);
          }
          markDirty();
          renderBlockChips();
          renderBlockPanels();
        });
        blockChipRow.appendChild(chip);
      });
    }
    function renderBlockPanels() {
      blockPanels.innerHTML = "";
      if (!blockSet.size) {
        const empty = document.createElement("div");
        empty.className = "editor-tags-empty";
        empty.textContent = "Choose a block to pick weeks and lectures.";
        blockPanels.appendChild(empty);
        return;
      }
      Array.from(blockSet).forEach((blockId) => {
        const block = blockMap.get(blockId);
        if (!block) return;
        const panel = document.createElement("div");
        panel.className = "editor-block-panel";
        const header = document.createElement("div");
        header.className = "editor-block-panel-header";
        const title = document.createElement("h4");
        title.textContent = block.title || blockId;
        header.appendChild(title);
        const meta = document.createElement("span");
        meta.className = "editor-block-meta";
        const lectureCount = block.lectures?.length || 0;
        const weekTotal = block.weeks || new Set((block.lectures || []).map((l) => l.week)).size;
        const metaParts = [];
        if (weekTotal) metaParts.push(`${weekTotal} week${weekTotal === 1 ? "" : "s"}`);
        if (lectureCount) metaParts.push(`${lectureCount} lecture${lectureCount === 1 ? "" : "s"}`);
        meta.textContent = metaParts.join(" \u2022 ") || "No weeks defined yet";
        header.appendChild(meta);
        panel.appendChild(header);
        const weekList = document.createElement("div");
        weekList.className = "editor-week-list";
        const weekNumbers = /* @__PURE__ */ new Set();
        if (block.weeks) {
          for (let i = 1; i <= block.weeks; i++) weekNumbers.add(i);
        }
        (block.lectures || []).forEach((l) => {
          if (typeof l.week === "number") weekNumbers.add(l.week);
        });
        const sortedWeeks = Array.from(weekNumbers).sort((a, b) => a - b);
        if (!sortedWeeks.length) {
          const noWeeks = document.createElement("div");
          noWeeks.className = "editor-tags-empty subtle";
          noWeeks.textContent = "Add weeks or lectures to this block to start tagging.";
          weekList.appendChild(noWeeks);
        } else {
          sortedWeeks.forEach((w) => {
            const weekKey = `${blockId}|${w}`;
            const section = document.createElement("div");
            section.className = "editor-week-section";
            if (weekSet.has(weekKey)) section.classList.add("active");
            const weekChip = createTagChip(`Week ${w}`, "week", weekSet.has(weekKey));
            weekChip.addEventListener("click", () => {
              const wasActive = weekSet.has(weekKey);
              if (wasActive) {
                weekSet.delete(weekKey);
                section.classList.remove("active");
                lectureWrap.classList.add("collapsed");
                (block.lectures || []).filter((l) => l.week === w).forEach((l) => {
                  const key = `${blockId}|${l.id}`;
                  lectSet.delete(key);
                  const chip = lectureWrap.querySelector(`[data-lecture='${key}']`);
                  if (chip) setToggleState(chip, false);
                });
              } else {
                weekSet.add(weekKey);
                section.classList.add("active");
                lectureWrap.classList.remove("collapsed");
              }
              setToggleState(weekChip, weekSet.has(weekKey));
              markDirty();
            });
            section.appendChild(weekChip);
            const lectureWrap = document.createElement("div");
            lectureWrap.className = "editor-lecture-list";
            if (!weekSet.has(weekKey)) lectureWrap.classList.add("collapsed");
            const lectures = (block.lectures || []).filter((l) => l.week === w);
            if (!lectures.length) {
              const empty = document.createElement("div");
              empty.className = "editor-tags-empty subtle";
              empty.textContent = "No lectures linked to this week yet.";
              lectureWrap.appendChild(empty);
            } else {
              lectures.forEach((l) => {
                const key = `${blockId}|${l.id}`;
                const lectureChip = createTagChip(l.name || `Lecture ${l.id}`, "lecture", lectSet.has(key));
                lectureChip.dataset.lecture = key;
                lectureChip.addEventListener("click", () => {
                  if (lectSet.has(key)) {
                    lectSet.delete(key);
                    setToggleState(lectureChip, false);
                  } else {
                    lectSet.add(key);
                    setToggleState(lectureChip, true);
                    if (!weekSet.has(weekKey)) {
                      weekSet.add(weekKey);
                      section.classList.add("active");
                      setToggleState(weekChip, true);
                      lectureWrap.classList.remove("collapsed");
                    }
                  }
                  markDirty();
                });
                lectureWrap.appendChild(lectureChip);
              });
            }
            section.appendChild(lectureWrap);
            weekList.appendChild(section);
          });
        }
        panel.appendChild(weekList);
        blockPanels.appendChild(panel);
      });
    }
    renderBlockChips();
    renderBlockPanels();
    form.appendChild(blockWrap);
    const actionBar = document.createElement("div");
    actionBar.className = "editor-actions";
    status = document.createElement("span");
    status.className = "editor-status";
    async function persist(closeAfter) {
      const titleKey = kind === "concept" ? "concept" : "name";
      const trimmed = nameInput.value.trim();
      if (!trimmed) {
        status.textContent = "Name is required.";
        return;
      }
      status.textContent = "Saving\u2026";
      const item = existing || { id: uid(), kind };
      item[titleKey] = trimmed;
      fieldMap[kind].forEach(([field]) => {
        const control = fieldInputs[field];
        const v = control?.getValue ? control.getValue() : "";
        item[field] = v;
      });
      item.extras = Array.from(extraControls.values()).map(({ id, titleInput, editor }) => ({
        id,
        title: titleInput.value.trim(),
        body: editor.getValue()
      })).filter((ex) => ex.title || ex.body);
      item.facts = [];
      item.blocks = Array.from(blockSet);
      const weekNums = new Set(Array.from(weekSet).map((k) => Number(k.split("|")[1])));
      item.weeks = Array.from(weekNums);
      const lectures = [];
      for (const key of lectSet) {
        const [blockId, lecIdStr] = key.split("|");
        const lecId = Number(lecIdStr);
        const blk = blockMap.get(blockId);
        const l = blk?.lectures.find((le) => le.id === lecId);
        if (l) lectures.push({ blockId, id: l.id, name: l.name, week: l.week });
      }
      item.lectures = lectures;
      item.color = colorInput.value;
      try {
        await upsertItem(item);
      } catch (err) {
        console.error(err);
        status.textContent = "Failed to save.";
        throw err;
      }
      existing = item;
      updateTitle();
      isDirty = false;
      if (onSave) onSave();
      if (closeAfter) {
        win.close("saved");
      } else {
        status.textContent = "Saved";
      }
    }
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn";
    saveBtn.textContent = "Save";
    saveBtn.addEventListener("click", () => {
      persist(true).catch(() => {
      });
    });
    actionBar.appendChild(saveBtn);
    actionBar.appendChild(status);
    form.appendChild(actionBar);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      persist(true).catch(() => {
      });
    });
    win.setContent(form);
    const updateTitle = () => {
      const base = `${existing ? "Edit" : "Add"} ${titleMap[kind] || kind}`;
      const name = nameInput.value.trim();
      if (name) {
        win.setTitle(`${base}: ${name}`);
      } else {
        win.setTitle(base);
      }
    };
    nameInput.addEventListener("input", updateTitle);
    updateTitle();
    win.focus();
    nameInput.focus();
  }

  // js/ui/components/linker.js
  async function openLinker(item, onSave) {
    const overlay = document.createElement("div");
    overlay.className = "modal";
    const card = document.createElement("div");
    card.className = "card";
    const title = document.createElement("h2");
    title.textContent = `Links for ${item.name || item.concept || ""}`;
    card.appendChild(title);
    const all = [
      ...await listItemsByKind("disease"),
      ...await listItemsByKind("drug"),
      ...await listItemsByKind("concept")
    ];
    const idMap = new Map(all.map((i) => [i.id, i]));
    const links = new Set((item.links || []).map((l) => l.id));
    const list = document.createElement("div");
    list.className = "link-list";
    card.appendChild(list);
    function renderList() {
      list.innerHTML = "";
      links.forEach((id) => {
        const row = document.createElement("div");
        row.className = "row";
        const label = document.createElement("span");
        const it = idMap.get(id);
        label.textContent = it ? it.name || it.concept || id : id;
        row.appendChild(label);
        const btn = document.createElement("button");
        btn.className = "btn";
        btn.textContent = "Remove";
        btn.addEventListener("click", () => {
          links.delete(id);
          renderList();
        });
        row.appendChild(btn);
        list.appendChild(row);
      });
    }
    renderList();
    const input = document.createElement("input");
    input.className = "input";
    input.placeholder = "Search items...";
    card.appendChild(input);
    const sug = document.createElement("ul");
    sug.className = "quiz-suggestions";
    card.appendChild(sug);
    input.addEventListener("input", () => {
      const v = input.value.toLowerCase();
      sug.innerHTML = "";
      if (!v) return;
      all.filter((it) => it.id !== item.id && (it.name || it.concept || "").toLowerCase().includes(v)).slice(0, 5).forEach((it) => {
        const li = document.createElement("li");
        li.textContent = it.name || it.concept || "";
        li.addEventListener("mousedown", () => {
          links.add(it.id);
          input.value = "";
          sug.innerHTML = "";
          renderList();
        });
        sug.appendChild(li);
      });
    });
    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn";
    cancel.textContent = "Close";
    cancel.addEventListener("click", () => document.body.removeChild(overlay));
    const save = document.createElement("button");
    save.type = "button";
    save.className = "btn";
    save.textContent = "Save";
    save.addEventListener("click", async () => {
      const newLinks = new Set(links);
      const oldLinks = new Set((item.links || []).map((l) => l.id));
      item.links = Array.from(newLinks).map((id) => ({ id, type: "assoc" }));
      await upsertItem(item);
      const affected = /* @__PURE__ */ new Set([...oldLinks, ...newLinks]);
      for (const id of affected) {
        const other = idMap.get(id);
        if (!other) continue;
        other.links = other.links || [];
        const has = other.links.some((l) => l.id === item.id);
        const should = newLinks.has(id);
        if (should && !has) other.links.push({ id: item.id, type: "assoc" });
        if (!should && has) other.links = other.links.filter((l) => l.id !== item.id);
        await upsertItem(other);
      }
      document.body.removeChild(overlay);
      onSave && onSave();
    });
    actions.appendChild(cancel);
    actions.appendChild(save);
    card.appendChild(actions);
    overlay.appendChild(card);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) document.body.removeChild(overlay);
    });
    document.body.appendChild(overlay);
    input.focus();
  }

  // js/ui/components/cardlist.js
  var kindColors = { disease: "var(--pink)", drug: "var(--blue)", concept: "var(--green)" };
  var fieldDefs = {
    disease: [
      ["etiology", "Etiology", "\u{1F9EC}"],
      ["pathophys", "Pathophys", "\u2699\uFE0F"],
      ["clinical", "Clinical", "\u{1FA7A}"],
      ["diagnosis", "Diagnosis", "\u{1F50E}"],
      ["treatment", "Treatment", "\u{1F48A}"],
      ["complications", "Complications", "\u26A0\uFE0F"],
      ["mnemonic", "Mnemonic", "\u{1F9E0}"]
    ],
    drug: [
      ["class", "Class", "\u{1F3F7}\uFE0F"],
      ["source", "Source", "\u{1F331}"],
      ["moa", "MOA", "\u2699\uFE0F"],
      ["uses", "Uses", "\u{1F48A}"],
      ["sideEffects", "Side Effects", "\u26A0\uFE0F"],
      ["contraindications", "Contraindications", "\u{1F6AB}"],
      ["mnemonic", "Mnemonic", "\u{1F9E0}"]
    ],
    concept: [
      ["type", "Type", "\u{1F3F7}\uFE0F"],
      ["definition", "Definition", "\u{1F4D6}"],
      ["mechanism", "Mechanism", "\u2699\uFE0F"],
      ["clinicalRelevance", "Clinical Relevance", "\u{1FA7A}"],
      ["example", "Example", "\u{1F4DD}"],
      ["mnemonic", "Mnemonic", "\u{1F9E0}"]
    ]
  };
  function escapeHtml4(str = "") {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function ensureExtras(item) {
    if (Array.isArray(item.extras) && item.extras.length) {
      return item.extras;
    }
    if (item.facts && item.facts.length) {
      return [{
        id: "legacy-facts",
        title: "Highlights",
        body: `<ul>${item.facts.map((f) => `<li>${escapeHtml4(f)}</li>`).join("")}</ul>`
      }];
    }
    return [];
  }
  var expanded = /* @__PURE__ */ new Set();
  var collapsedBlocks = /* @__PURE__ */ new Set();
  var collapsedWeeks = /* @__PURE__ */ new Set();
  function createItemCard(item, onChange) {
    const card = document.createElement("div");
    card.className = `item-card card--${item.kind}`;
    const color = item.color || kindColors[item.kind] || "var(--gray)";
    card.style.borderTop = `3px solid ${color}`;
    const header = document.createElement("div");
    header.className = "card-header";
    const mainBtn = document.createElement("button");
    mainBtn.className = "card-title-btn";
    mainBtn.textContent = item.name || item.concept || "Untitled";
    mainBtn.setAttribute("aria-expanded", expanded.has(item.id));
    mainBtn.addEventListener("click", () => {
      if (expanded.has(item.id)) expanded.delete(item.id);
      else expanded.add(item.id);
      card.classList.toggle("expanded");
      mainBtn.setAttribute("aria-expanded", expanded.has(item.id));
    });
    header.appendChild(mainBtn);
    const settings = document.createElement("div");
    settings.className = "card-settings";
    const menu = document.createElement("div");
    menu.className = "card-menu hidden";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-hidden", "true");
    const gear = document.createElement("button");
    gear.type = "button";
    gear.className = "icon-btn card-settings-toggle";
    gear.title = "Entry options";
    gear.setAttribute("aria-haspopup", "true");
    gear.setAttribute("aria-expanded", "false");
    gear.innerHTML = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.8" stroke="currentColor" stroke-width="1.6"/></svg>';
    settings.append(gear, menu);
    header.appendChild(settings);
    function closeMenu() {
      menu.classList.add("hidden");
      menu.setAttribute("aria-hidden", "true");
      settings.classList.remove("open");
      gear.setAttribute("aria-expanded", "false");
      document.removeEventListener("mousedown", handleOutside);
    }
    function openMenu() {
      menu.classList.remove("hidden");
      menu.setAttribute("aria-hidden", "false");
      settings.classList.add("open");
      gear.setAttribute("aria-expanded", "true");
      document.addEventListener("mousedown", handleOutside);
    }
    function handleOutside(e) {
      if (!settings.contains(e.target)) {
        closeMenu();
      }
    }
    gear.addEventListener("click", (e) => {
      e.stopPropagation();
      if (menu.classList.contains("hidden")) openMenu();
      else closeMenu();
    });
    menu.addEventListener("click", (e) => e.stopPropagation());
    const fav = document.createElement("button");
    fav.className = "icon-btn";
    fav.textContent = item.favorite ? "\u2605" : "\u2606";
    fav.title = "Toggle Favorite";
    fav.setAttribute("aria-label", "Toggle Favorite");
    fav.addEventListener("click", async (e) => {
      e.stopPropagation();
      closeMenu();
      item.favorite = !item.favorite;
      await upsertItem(item);
      fav.textContent = item.favorite ? "\u2605" : "\u2606";
      onChange && onChange();
    });
    menu.appendChild(fav);
    const link = document.createElement("button");
    link.className = "icon-btn";
    link.textContent = "\u{1FAA2}";
    link.title = "Links";
    link.setAttribute("aria-label", "Manage links");
    link.addEventListener("click", (e) => {
      e.stopPropagation();
      closeMenu();
      openLinker(item, onChange);
    });
    menu.appendChild(link);
    const edit = document.createElement("button");
    edit.className = "icon-btn";
    edit.textContent = "\u270F\uFE0F";
    edit.title = "Edit";
    edit.setAttribute("aria-label", "Edit");
    edit.addEventListener("click", (e) => {
      e.stopPropagation();
      closeMenu();
      openEditor(item.kind, onChange, item);
    });
    menu.appendChild(edit);
    const copy = document.createElement("button");
    copy.className = "icon-btn";
    copy.textContent = "\u{1F4CB}";
    copy.title = "Copy Title";
    copy.setAttribute("aria-label", "Copy Title");
    copy.addEventListener("click", (e) => {
      e.stopPropagation();
      closeMenu();
      navigator.clipboard && navigator.clipboard.writeText(item.name || item.concept || "");
    });
    menu.appendChild(copy);
    const del = document.createElement("button");
    del.className = "icon-btn danger";
    del.textContent = "\u{1F5D1}\uFE0F";
    del.title = "Delete";
    del.setAttribute("aria-label", "Delete");
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      closeMenu();
      if (await confirmModal("Delete this item?")) {
        await deleteItem(item.id);
        onChange && onChange();
      }
    });
    menu.appendChild(del);
    card.appendChild(header);
    const body = document.createElement("div");
    body.className = "card-body";
    card.appendChild(body);
    function renderBody() {
      body.innerHTML = "";
      const identifiers = document.createElement("div");
      identifiers.className = "identifiers";
      (item.blocks || []).forEach((b) => {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = b;
        identifiers.appendChild(chip);
      });
      (item.weeks || []).forEach((w) => {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.textContent = "W" + w;
        identifiers.appendChild(chip);
      });
      if (item.lectures) {
        item.lectures.forEach((l) => {
          const chip = document.createElement("span");
          chip.className = "chip";
          chip.textContent = "\u{1F4DA} " + (l.name || l.id);
          identifiers.appendChild(chip);
        });
      }
      body.appendChild(identifiers);
      const defs = fieldDefs[item.kind] || [];
      defs.forEach(([f, label, icon]) => {
        if (!item[f]) return;
        const sec = document.createElement("div");
        sec.className = "section";
        sec.style.borderLeftColor = color;
        const tl = document.createElement("div");
        tl.className = "section-title";
        tl.textContent = label;
        if (icon) tl.prepend(icon + " ");
        sec.appendChild(tl);
        const txt = document.createElement("div");
        txt.className = "section-content";
        renderRichText(txt, item[f]);
        sec.appendChild(txt);
        body.appendChild(sec);
      });
      const extras = ensureExtras(item);
      extras.forEach((extra) => {
        if (!extra || !extra.body) return;
        const sec = document.createElement("div");
        sec.className = "section section--extra";
        const tl = document.createElement("div");
        tl.className = "section-title";
        tl.textContent = extra.title || "Additional Section";
        sec.appendChild(tl);
        const txt = document.createElement("div");
        txt.className = "section-content";
        renderRichText(txt, extra.body);
        sec.appendChild(txt);
        body.appendChild(sec);
      });
      if (item.links && item.links.length) {
        const lc = document.createElement("span");
        lc.className = "chip link-chip";
        lc.textContent = `\u{1FAA2} ${item.links.length}`;
        body.appendChild(lc);
      }
    }
    renderBody();
    if (expanded.has(item.id)) card.classList.add("expanded");
    function fit() {
      const headerH = header.offsetHeight;
      const maxH = card.clientHeight - headerH - 4;
      let size = parseFloat(getComputedStyle(body).fontSize);
      while (body.scrollHeight > maxH && size > 12) {
        size -= 1;
        body.style.fontSize = size + "px";
      }
    }
    requestAnimationFrame(fit);
    return card;
  }
  async function renderCardList(container, itemSource, kind, onChange) {
    container.innerHTML = "";
    const items = [];
    if (itemSource) {
      if (typeof itemSource?.[Symbol.asyncIterator] === "function") {
        for await (const batch of itemSource) {
          if (Array.isArray(batch)) {
            items.push(...batch);
          } else if (batch) {
            items.push(batch);
          }
        }
      } else if (typeof itemSource?.toArray === "function") {
        const collected = await itemSource.toArray();
        items.push(...collected);
      } else if (Array.isArray(itemSource)) {
        items.push(...itemSource);
      }
    }
    const blocks = await listBlocks();
    const blockTitle = (id) => blocks.find((b) => b.blockId === id)?.title || id;
    const orderMap = new Map(blocks.map((b, i) => [b.blockId, i]));
    const groups = /* @__PURE__ */ new Map();
    items.forEach((it) => {
      let block = "_";
      let week = "_";
      if (it.lectures && it.lectures.length) {
        let bestOrd = Infinity, bestWeek = -Infinity, bestLec = -Infinity;
        it.lectures.forEach((l) => {
          const ord = orderMap.has(l.blockId) ? orderMap.get(l.blockId) : Infinity;
          if (ord < bestOrd || ord === bestOrd && (l.week > bestWeek || l.week === bestWeek && l.id > bestLec)) {
            block = l.blockId;
            week = l.week;
            bestOrd = ord;
            bestWeek = l.week;
            bestLec = l.id;
          }
        });
      } else {
        let bestOrd = Infinity;
        (it.blocks || []).forEach((id) => {
          const ord = orderMap.has(id) ? orderMap.get(id) : Infinity;
          if (ord < bestOrd) {
            block = id;
            bestOrd = ord;
          }
        });
        if (it.weeks && it.weeks.length) week = Math.max(...it.weeks);
      }
      if (!groups.has(block)) groups.set(block, /* @__PURE__ */ new Map());
      const wkMap = groups.get(block);
      const arr = wkMap.get(week) || [];
      arr.push(it);
      wkMap.set(week, arr);
    });
    const sortedBlocks = Array.from(groups.keys()).sort((a, b) => {
      const ao = orderMap.has(a) ? orderMap.get(a) : Infinity;
      const bo = orderMap.has(b) ? orderMap.get(b) : Infinity;
      return ao - bo;
    });
    const layoutState = state.entryLayout;
    const toolbar = document.createElement("div");
    toolbar.className = "entry-layout-toolbar";
    const viewToggle = document.createElement("div");
    viewToggle.className = "layout-toggle";
    const listBtn = document.createElement("button");
    listBtn.type = "button";
    listBtn.className = "layout-btn";
    setToggleState(listBtn, layoutState.mode === "list");
    listBtn.textContent = "List";
    listBtn.addEventListener("click", () => {
      if (layoutState.mode === "list") return;
      setEntryLayout({ mode: "list" });
      updateToolbar();
      applyLayout();
    });
    const gridBtn = document.createElement("button");
    gridBtn.type = "button";
    gridBtn.className = "layout-btn";
    setToggleState(gridBtn, layoutState.mode === "grid");
    gridBtn.textContent = "Grid";
    gridBtn.addEventListener("click", () => {
      if (layoutState.mode === "grid") return;
      setEntryLayout({ mode: "grid" });
      updateToolbar();
      applyLayout();
    });
    viewToggle.appendChild(listBtn);
    viewToggle.appendChild(gridBtn);
    toolbar.appendChild(viewToggle);
    const controlsToggle = document.createElement("button");
    controlsToggle.type = "button";
    controlsToggle.className = "layout-advanced-toggle";
    setToggleState(controlsToggle, layoutState.controlsVisible);
    controlsToggle.addEventListener("click", () => {
      setEntryLayout({ controlsVisible: !state.entryLayout.controlsVisible });
      updateToolbar();
    });
    toolbar.appendChild(controlsToggle);
    const controlsWrap = document.createElement("div");
    controlsWrap.className = "layout-controls";
    const controlsId = `layout-controls-${Math.random().toString(36).slice(2, 8)}`;
    controlsWrap.id = controlsId;
    controlsToggle.setAttribute("aria-controls", controlsId);
    toolbar.appendChild(controlsWrap);
    const columnWrap = document.createElement("label");
    columnWrap.className = "layout-control";
    columnWrap.textContent = "Columns";
    const columnInput = document.createElement("input");
    columnInput.type = "range";
    columnInput.min = "1";
    columnInput.max = "6";
    columnInput.step = "1";
    columnInput.value = String(layoutState.columns);
    const columnValue = document.createElement("span");
    columnValue.className = "layout-value";
    columnValue.textContent = String(layoutState.columns);
    columnInput.addEventListener("input", () => {
      setEntryLayout({ columns: Number(columnInput.value) });
      columnValue.textContent = String(state.entryLayout.columns);
      applyLayout();
    });
    columnWrap.appendChild(columnInput);
    columnWrap.appendChild(columnValue);
    controlsWrap.appendChild(columnWrap);
    const scaleWrap = document.createElement("label");
    scaleWrap.className = "layout-control";
    scaleWrap.textContent = "Scale";
    const scaleInput = document.createElement("input");
    scaleInput.type = "range";
    scaleInput.min = "0.6";
    scaleInput.max = "1.4";
    scaleInput.step = "0.05";
    scaleInput.value = String(layoutState.scale);
    const scaleValue = document.createElement("span");
    scaleValue.className = "layout-value";
    scaleValue.textContent = `${layoutState.scale.toFixed(2)}x`;
    scaleInput.addEventListener("input", () => {
      setEntryLayout({ scale: Number(scaleInput.value) });
      scaleValue.textContent = `${state.entryLayout.scale.toFixed(2)}x`;
      applyLayout();
    });
    scaleWrap.appendChild(scaleInput);
    scaleWrap.appendChild(scaleValue);
    controlsWrap.appendChild(scaleWrap);
    container.appendChild(toolbar);
    function updateToolbar() {
      const { mode, controlsVisible } = state.entryLayout;
      setToggleState(listBtn, mode === "list");
      setToggleState(gridBtn, mode === "grid");
      columnWrap.style.display = mode === "grid" ? "" : "none";
      controlsWrap.style.display = controlsVisible ? "" : "none";
      controlsWrap.setAttribute("aria-hidden", controlsVisible ? "false" : "true");
      controlsToggle.textContent = controlsVisible ? "Hide layout tools" : "Show layout tools";
      controlsToggle.setAttribute("aria-expanded", controlsVisible ? "true" : "false");
      setToggleState(controlsToggle, controlsVisible);
    }
    function applyLayout() {
      const lists = container.querySelectorAll(".card-list");
      lists.forEach((list) => {
        list.classList.toggle("grid-layout", state.entryLayout.mode === "grid");
        list.style.setProperty("--entry-scale", state.entryLayout.scale);
        list.style.setProperty("--entry-columns", state.entryLayout.columns);
      });
    }
    updateToolbar();
    sortedBlocks.forEach((b) => {
      const blockSec = document.createElement("section");
      blockSec.className = "block-section";
      const blockHeader = document.createElement("button");
      blockHeader.type = "button";
      blockHeader.className = "block-header";
      const blockLabel = b === "_" ? "Unassigned" : blockTitle(b);
      const blockKey = String(b);
      const bdef = blocks.find((bl) => bl.blockId === b);
      if (bdef?.color) blockHeader.style.background = bdef.color;
      function updateBlockState() {
        const isCollapsed = collapsedBlocks.has(blockKey);
        blockSec.classList.toggle("collapsed", isCollapsed);
        blockHeader.textContent = `${isCollapsed ? "\u25B8" : "\u25BE"} ${blockLabel}`;
        blockHeader.setAttribute("aria-expanded", String(!isCollapsed));
      }
      updateBlockState();
      blockHeader.addEventListener("click", () => {
        if (collapsedBlocks.has(blockKey)) collapsedBlocks.delete(blockKey);
        else collapsedBlocks.add(blockKey);
        updateBlockState();
      });
      blockSec.appendChild(blockHeader);
      const wkMap = groups.get(b);
      const sortedWeeks = Array.from(wkMap.keys()).sort((a, b2) => {
        if (a === "_" && b2 !== "_") return 1;
        if (b2 === "_" && a !== "_") return -1;
        return Number(b2) - Number(a);
      });
      sortedWeeks.forEach((w) => {
        const weekSec = document.createElement("div");
        weekSec.className = "week-section";
        const weekHeader = document.createElement("button");
        weekHeader.type = "button";
        weekHeader.className = "week-header";
        const weekLabel = w === "_" ? "Unassigned" : `Week ${w}`;
        const weekKey = `${blockKey}__${w}`;
        function updateWeekState() {
          const isCollapsed = collapsedWeeks.has(weekKey);
          weekSec.classList.toggle("collapsed", isCollapsed);
          weekHeader.textContent = `${isCollapsed ? "\u25B8" : "\u25BE"} ${weekLabel}`;
          weekHeader.setAttribute("aria-expanded", String(!isCollapsed));
        }
        updateWeekState();
        weekHeader.addEventListener("click", () => {
          if (collapsedWeeks.has(weekKey)) collapsedWeeks.delete(weekKey);
          else collapsedWeeks.add(weekKey);
          updateWeekState();
        });
        weekSec.appendChild(weekHeader);
        const list = document.createElement("div");
        list.className = "card-list";
        list.style.setProperty("--entry-scale", state.entryLayout.scale);
        list.style.setProperty("--entry-columns", state.entryLayout.columns);
        list.classList.toggle("grid-layout", state.entryLayout.mode === "grid");
        const rows = wkMap.get(w);
        function renderChunk(start = 0) {
          const slice = rows.slice(start, start + 200);
          slice.forEach((it) => {
            list.appendChild(createItemCard(it, onChange));
          });
          if (start + 200 < rows.length) requestAnimationFrame(() => renderChunk(start + 200));
        }
        renderChunk();
        weekSec.appendChild(list);
        blockSec.appendChild(weekSec);
      });
      container.appendChild(blockSec);
    });
    applyLayout();
  }

  // js/ui/components/cards.js
  var UNASSIGNED_BLOCK_KEY = "__unassigned__";
  var MISC_LECTURE_KEY = "__misc__";
  var KIND_COLORS = {
    disease: "var(--pink)",
    drug: "var(--blue)",
    concept: "var(--green)"
  };
  var KIND_FIELDS = {
    disease: [
      ["etiology", "Etiology", "\u{1F9EC}"],
      ["pathophys", "Pathophys", "\u2699\uFE0F"],
      ["clinical", "Clinical", "\u{1FA7A}"],
      ["diagnosis", "Diagnosis", "\u{1F50E}"],
      ["treatment", "Treatment", "\u{1F48A}"],
      ["complications", "Complications", "\u26A0\uFE0F"],
      ["mnemonic", "Mnemonic", "\u{1F9E0}"]
    ],
    drug: [
      ["class", "Class", "\u{1F3F7}\uFE0F"],
      ["source", "Source", "\u{1F331}"],
      ["moa", "MOA", "\u2699\uFE0F"],
      ["uses", "Uses", "\u{1F48A}"],
      ["sideEffects", "Side Effects", "\u26A0\uFE0F"],
      ["contraindications", "Contraindications", "\u{1F6AB}"],
      ["mnemonic", "Mnemonic", "\u{1F9E0}"]
    ],
    concept: [
      ["type", "Type", "\u{1F3F7}\uFE0F"],
      ["definition", "Definition", "\u{1F4D6}"],
      ["mechanism", "Mechanism", "\u2699\uFE0F"],
      ["clinicalRelevance", "Clinical Relevance", "\u{1FA7A}"],
      ["example", "Example", "\u{1F4DD}"],
      ["mnemonic", "Mnemonic", "\u{1F9E0}"]
    ]
  };
  function formatWeekLabel(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return `Week ${value}`;
    }
    return "Unscheduled";
  }
  function titleFromItem(item) {
    return item?.name || item?.concept || "Untitled Card";
  }
  function escapeHtml5(str = "") {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function ensureExtras2(item) {
    if (Array.isArray(item?.extras) && item.extras.length) {
      return item.extras;
    }
    if (item?.facts && item.facts.length) {
      return [{
        id: "legacy-facts",
        title: "Highlights",
        body: `<ul>${item.facts.map((f) => `<li>${escapeHtml5(f)}</li>`).join("")}</ul>`
      }];
    }
    return [];
  }
  function getItemAccent(item) {
    if (item?.color) return item.color;
    if (item?.kind && KIND_COLORS[item.kind]) return KIND_COLORS[item.kind];
    return "var(--accent)";
  }
  async function renderCards(container, items, onChange) {
    container.innerHTML = "";
    container.classList.add("cards-tab");
    const blockDefs = await listBlocks();
    const blockLookup = new Map(blockDefs.map((def) => [def.blockId, def]));
    const blockOrder = new Map(blockDefs.map((def, idx) => [def.blockId, idx]));
    const blockBuckets = /* @__PURE__ */ new Map();
    function ensureBlock(blockId) {
      const key = blockId || UNASSIGNED_BLOCK_KEY;
      if (!blockBuckets.has(key)) {
        const def = blockLookup.get(blockId);
        const order = typeof blockId === "string" ? blockOrder.get(blockId) ?? 999 : 1200;
        blockBuckets.set(key, {
          key,
          blockId: blockId || null,
          title: def?.title || (blockId ? blockId : "Unassigned"),
          accent: def?.color || null,
          order,
          weeks: /* @__PURE__ */ new Map()
        });
      }
      return blockBuckets.get(key);
    }
    function ensureWeek(blockBucket, weekValue) {
      const weekKey = weekValue == null ? "none" : String(weekValue);
      if (!blockBucket.weeks.has(weekKey)) {
        blockBucket.weeks.set(weekKey, {
          key: weekKey,
          value: typeof weekValue === "number" && Number.isFinite(weekValue) ? weekValue : null,
          label: formatWeekLabel(weekValue),
          order: typeof weekValue === "number" && Number.isFinite(weekValue) ? weekValue : 999,
          lectures: /* @__PURE__ */ new Map()
        });
      }
      return blockBucket.weeks.get(weekKey);
    }
    function ensureLecture(weekBucket, lectureKey, lectureName) {
      if (!weekBucket.lectures.has(lectureKey)) {
        weekBucket.lectures.set(lectureKey, {
          key: lectureKey,
          title: lectureName || "Lecture",
          cards: []
        });
      }
      return weekBucket.lectures.get(lectureKey);
    }
    items.forEach((item) => {
      const lectureRefs = Array.isArray(item.lectures) ? item.lectures : [];
      if (lectureRefs.length) {
        lectureRefs.forEach((ref) => {
          const blockBucket = ensureBlock(ref.blockId);
          const weekBucket = ensureWeek(blockBucket, ref.week);
          const lectureKeyParts = [ref.blockId || blockBucket.key];
          if (ref.id != null) lectureKeyParts.push(`lec-${ref.id}`);
          if (ref.name) lectureKeyParts.push(ref.name);
          const lectureKey = lectureKeyParts.join("::") || `${blockBucket.key}-${titleFromItem(item)}`;
          const lecture = ensureLecture(weekBucket, lectureKey, ref.name || (ref.id != null ? `Lecture ${ref.id}` : "Lecture"));
          if (!lecture.cards.includes(item)) {
            lecture.cards.push(item);
          }
        });
      } else if (Array.isArray(item.blocks) && item.blocks.length) {
        item.blocks.forEach((blockId) => {
          const blockBucket = ensureBlock(blockId);
          const weeks = Array.isArray(item.weeks) && item.weeks.length ? item.weeks : [null];
          weeks.forEach((weekVal) => {
            const weekBucket = ensureWeek(blockBucket, weekVal);
            const lecture = ensureLecture(weekBucket, `${blockBucket.key}::${MISC_LECTURE_KEY}`, "Ungrouped Items");
            lecture.cards.push(item);
          });
        });
      } else {
        const blockBucket = ensureBlock(null);
        const weekBucket = ensureWeek(blockBucket, null);
        const lecture = ensureLecture(weekBucket, `${blockBucket.key}::${MISC_LECTURE_KEY}`, "Unassigned Items");
        lecture.cards.push(item);
      }
    });
    const blockSections = Array.from(blockBuckets.values()).map((block) => {
      const weeks = Array.from(block.weeks.values()).map((week) => {
        const lectures = Array.from(week.lectures.values()).map((lec) => ({
          ...lec,
          cards: lec.cards.slice().sort((a, b) => titleFromItem(a).localeCompare(titleFromItem(b)))
        })).filter((lec) => lec.cards.length > 0).sort((a, b) => a.title.localeCompare(b.title));
        const totalCards2 = lectures.reduce((sum, lec) => sum + lec.cards.length, 0);
        return {
          ...week,
          lectures,
          totalCards: totalCards2,
          lectureCount: lectures.length
        };
      }).filter((week) => week.totalCards > 0).sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
      const totalCards = weeks.reduce((sum, week) => sum + week.totalCards, 0);
      const lectureCount = weeks.reduce((sum, week) => sum + week.lectureCount, 0);
      return {
        ...block,
        weeks,
        totalCards,
        lectureCount
      };
    }).filter((block) => block.totalCards > 0).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    const catalog = document.createElement("div");
    catalog.className = "card-catalog";
    container.appendChild(catalog);
    const expandedDecks = /* @__PURE__ */ new Set();
    function createCollapseIcon() {
      const icon = document.createElement("span");
      icon.className = "card-collapse-icon";
      icon.innerHTML = '<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 8L10 12L14 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      return icon;
    }
    let deckIdCounter = 0;
    function createDeckTile(block, week, lecture) {
      const wrapper = document.createElement("div");
      wrapper.className = "deck-entry";
      wrapper.dataset.expanded = "false";
      const deckId = `deck-${deckIdCounter++}`;
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "deck-tile";
      tile.setAttribute("aria-controls", deckId);
      tile.setAttribute("aria-expanded", "false");
      const info = document.createElement("div");
      info.className = "deck-info";
      const label = document.createElement("h3");
      label.className = "deck-title";
      label.textContent = lecture.title;
      info.appendChild(label);
      const meta = document.createElement("div");
      meta.className = "deck-meta";
      const pieces = [];
      if (block.title) pieces.push(block.title);
      if (week?.label) pieces.push(week.label);
      meta.textContent = pieces.join(" \u2022 ");
      info.appendChild(meta);
      const count = document.createElement("span");
      count.className = "deck-count-pill";
      count.textContent = `${lecture.cards.length} card${lecture.cards.length === 1 ? "" : "s"}`;
      info.appendChild(count);
      tile.appendChild(info);
      const icon = createCollapseIcon();
      tile.appendChild(icon);
      const cardList = document.createElement("div");
      cardList.className = "deck-card-list";
      cardList.id = deckId;
      cardList.hidden = true;
      let rendered = false;
      const close = () => {
        if (wrapper.dataset.expanded !== "true") return;
        wrapper.dataset.expanded = "false";
        tile.setAttribute("aria-expanded", "false");
        cardList.hidden = true;
        expandedDecks.delete(close);
      };
      const open = () => {
        if (wrapper.dataset.expanded === "true") return;
        expandedDecks.forEach((fn) => fn());
        expandedDecks.clear();
        if (!rendered) {
          const fragment = document.createDocumentFragment();
          lecture.cards.forEach((card) => {
            fragment.appendChild(createDeckCard(card, { block, week, lecture }));
          });
          cardList.appendChild(fragment);
          rendered = true;
        }
        wrapper.dataset.expanded = "true";
        tile.setAttribute("aria-expanded", "true");
        cardList.hidden = false;
        expandedDecks.add(close);
      };
      tile.addEventListener("click", () => {
        if (wrapper.dataset.expanded === "true") {
          close();
        } else {
          open();
        }
      });
      tile.addEventListener("keydown", (evt) => {
        if (evt.key === "Enter" || evt.key === " ") {
          evt.preventDefault();
          tile.click();
        }
      });
      wrapper.appendChild(tile);
      wrapper.appendChild(cardList);
      return wrapper;
    }
    function createMetaChip(text, icon) {
      const chip = document.createElement("span");
      chip.className = "deck-chip";
      if (icon) {
        const iconEl = document.createElement("span");
        iconEl.className = "deck-chip-icon";
        iconEl.textContent = icon;
        chip.appendChild(iconEl);
      }
      const label = document.createElement("span");
      label.className = "deck-chip-label";
      label.textContent = text;
      chip.appendChild(label);
      return chip;
    }
    function createDeckCard(item, context) {
      const card = document.createElement("article");
      card.className = "deck-card";
      const accent = getItemAccent(item);
      card.style.setProperty("--card-accent", accent);
      const header = document.createElement("header");
      header.className = "deck-card-header";
      const title = document.createElement("h4");
      title.className = "deck-card-title";
      title.textContent = titleFromItem(item);
      header.appendChild(title);
      if (item.kind) {
        const kind = document.createElement("span");
        kind.className = "deck-card-kind";
        kind.textContent = item.kind.toUpperCase();
        header.appendChild(kind);
      }
      card.appendChild(header);
      const meta = document.createElement("div");
      meta.className = "deck-card-meta";
      const seen = /* @__PURE__ */ new Set();
      const addMeta = (text, icon) => {
        if (!text || seen.has(text)) return;
        seen.add(text);
        meta.appendChild(createMetaChip(text, icon));
      };
      if (context.block?.title) addMeta(context.block.title, "\u{1F9ED}");
      if (context.week?.label) addMeta(context.week.label, "\u{1F4C6}");
      (item.blocks || []).forEach((blockId) => {
        const label = blockLookup.get(blockId)?.title || blockId;
        addMeta(label, "\u{1F9F1}");
      });
      (item.weeks || []).forEach((weekValue) => addMeta(`Week ${weekValue}`, "\u{1F4C5}"));
      (item.lectures || []).forEach((lec) => addMeta(lec.name || (lec.id != null ? `Lecture ${lec.id}` : ""), "\u{1F4DA}"));
      if (meta.children.length) {
        card.appendChild(meta);
      }
      const sections = document.createElement("div");
      sections.className = "deck-card-sections";
      const defs = KIND_FIELDS[item.kind] || [];
      defs.forEach(([field, label, icon]) => {
        const value = item[field];
        if (!value) return;
        const section = document.createElement("section");
        section.className = "deck-card-section";
        section.style.setProperty("--section-accent", accent);
        const sectionTitle = document.createElement("h5");
        sectionTitle.className = "deck-card-section-title";
        if (icon) {
          const iconEl = document.createElement("span");
          iconEl.className = "deck-card-section-icon";
          iconEl.textContent = icon;
          sectionTitle.appendChild(iconEl);
        }
        const labelNode = document.createElement("span");
        labelNode.textContent = label;
        sectionTitle.appendChild(labelNode);
        section.appendChild(sectionTitle);
        const content = document.createElement("div");
        content.className = "deck-card-section-content";
        renderRichText(content, value);
        section.appendChild(content);
        sections.appendChild(section);
      });
      ensureExtras2(item).forEach((extra) => {
        if (!extra?.body) return;
        const section = document.createElement("section");
        section.className = "deck-card-section deck-card-section-extra";
        section.style.setProperty("--section-accent", accent);
        const sectionTitle = document.createElement("h5");
        sectionTitle.className = "deck-card-section-title";
        const labelNode = document.createElement("span");
        labelNode.textContent = extra.title || "Additional Notes";
        sectionTitle.appendChild(labelNode);
        section.appendChild(sectionTitle);
        const content = document.createElement("div");
        content.className = "deck-card-section-content";
        renderRichText(content, extra.body);
        section.appendChild(content);
        sections.appendChild(section);
      });
      if (!sections.children.length) {
        const empty = document.createElement("p");
        empty.className = "deck-card-empty";
        empty.textContent = "No detailed content yet for this card.";
        sections.appendChild(empty);
      }
      card.appendChild(sections);
      return card;
    }
    function buildBlockSection(block) {
      const section = document.createElement("section");
      section.className = "card-block-section";
      const header = document.createElement("button");
      header.type = "button";
      header.className = "card-block-header";
      header.setAttribute("aria-expanded", "true");
      const heading = document.createElement("div");
      heading.className = "card-block-heading";
      const swatch = document.createElement("span");
      swatch.className = "card-block-mark";
      heading.appendChild(swatch);
      const title = document.createElement("span");
      title.className = "card-block-title";
      title.textContent = block.title;
      heading.appendChild(title);
      header.appendChild(heading);
      const stats = document.createElement("span");
      stats.className = "card-block-stats";
      stats.textContent = `${block.lectureCount} lecture${block.lectureCount === 1 ? "" : "s"} \u2022 ${block.totalCards} card${block.totalCards === 1 ? "" : "s"}`;
      header.appendChild(stats);
      const icon = createCollapseIcon();
      header.appendChild(icon);
      section.appendChild(header);
      const body = document.createElement("div");
      body.className = "card-block-body";
      block.weeks.forEach((week) => {
        const weekSection = document.createElement("div");
        weekSection.className = "card-week-section";
        const weekHeader = document.createElement("button");
        weekHeader.type = "button";
        weekHeader.className = "card-week-header";
        weekHeader.setAttribute("aria-expanded", "true");
        const weekTitle = document.createElement("span");
        weekTitle.className = "card-week-title";
        weekTitle.textContent = week.label;
        weekHeader.appendChild(weekTitle);
        const weekStats = document.createElement("span");
        weekStats.className = "card-week-stats";
        weekStats.textContent = `${week.lectureCount} lecture${week.lectureCount === 1 ? "" : "s"} \u2022 ${week.totalCards} card${week.totalCards === 1 ? "" : "s"}`;
        weekHeader.appendChild(weekStats);
        weekHeader.appendChild(createCollapseIcon());
        const deckGrid = document.createElement("div");
        deckGrid.className = "deck-grid";
        week.lectures.forEach((lecture) => {
          deckGrid.appendChild(createDeckTile(block, week, lecture));
        });
        weekSection.appendChild(weekHeader);
        weekSection.appendChild(deckGrid);
        body.appendChild(weekSection);
        weekHeader.addEventListener("click", () => {
          const collapsed = weekSection.classList.toggle("is-collapsed");
          weekHeader.setAttribute("aria-expanded", collapsed ? "false" : "true");
          if (collapsed) {
            expandedDecks.forEach((fn) => fn());
            expandedDecks.clear();
          }
        });
      });
      section.appendChild(body);
      header.addEventListener("click", () => {
        const collapsed = section.classList.toggle("is-collapsed");
        header.setAttribute("aria-expanded", collapsed ? "false" : "true");
        if (collapsed) {
          expandedDecks.forEach((fn) => fn());
          expandedDecks.clear();
        }
      });
      return section;
    }
    if (!blockSections.length) {
      const empty = document.createElement("div");
      empty.className = "cards-empty";
      const heading = document.createElement("h3");
      heading.textContent = "No cards match your filters yet";
      empty.appendChild(heading);
      const body = document.createElement("p");
      body.textContent = "Assign lectures, blocks, or create new entries to populate this view.";
      empty.appendChild(body);
      catalog.appendChild(empty);
      return;
    }
    const renderQueue = blockSections.slice();
    const getTime = typeof performance === "object" && typeof performance.now === "function" ? () => performance.now() : () => Date.now();
    function pump() {
      const start = getTime();
      while (renderQueue.length && getTime() - start < 12) {
        catalog.appendChild(buildBlockSection(renderQueue.shift()));
      }
      if (renderQueue.length) {
        requestAnimationFrame(pump);
      }
    }
    pump();
  }

  // js/ui/components/builder.js
  async function renderBuilder(root) {
    const blocks = await loadBlocks();
    root.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "builder";
    root.appendChild(wrap);
    drawBuilder(wrap, blocks);
  }
  async function loadBlocks() {
    const blocks = await listBlocks();
    blocks.push({ blockId: "__unlabeled", title: "Unlabeled", weeks: 0, lectures: [] });
    return blocks;
  }
  function drawBuilder(container, blocks) {
    container.innerHTML = "";
    const rerender = () => drawBuilder(container, blocks);
    const layout = document.createElement("div");
    layout.className = "builder-layout";
    container.appendChild(layout);
    const blockColumn = document.createElement("div");
    blockColumn.className = "builder-blocks";
    layout.appendChild(blockColumn);
    blocks.forEach((block) => {
      blockColumn.appendChild(renderBlockPanel(block, rerender));
    });
    const controls = renderControls(rerender);
    layout.appendChild(controls);
  }
  function renderBlockPanel(block, rerender) {
    const blockId = block.blockId;
    const lectures = Array.isArray(block.lectures) ? [...block.lectures] : [];
    lectures.sort((a, b) => {
      const weekDiff = (a.week ?? 0) - (b.week ?? 0);
      if (weekDiff !== 0) return weekDiff;
      return (a.name || "").localeCompare(b.name || "");
    });
    const weeks = groupByWeek(lectures);
    const hasSelections = hasBlockSelection(blockId);
    const blockCollapsed = isBlockCollapsed(blockId);
    const card = document.createElement("div");
    card.className = "card builder-block-card";
    if (hasSelections) card.classList.add("active");
    if (blockCollapsed) card.classList.add("is-collapsed");
    const header = document.createElement("div");
    header.className = "builder-block-header";
    const blockCollapseBtn = createCollapseToggle({
      collapsed: blockCollapsed,
      label: blockCollapsed ? "Show weeks" : "Hide weeks",
      onToggle: () => {
        toggleBlockCollapsed(blockId);
        rerender();
      },
      variant: "block"
    });
    header.appendChild(blockCollapseBtn);
    const title = document.createElement("h3");
    title.textContent = block.title || blockId;
    header.appendChild(title);
    const meta = document.createElement("span");
    meta.className = "builder-block-meta";
    const weekCount = weeks.length;
    const lectureCount = lectures.length;
    const metaParts = [];
    if (weekCount) metaParts.push(`${weekCount} week${weekCount === 1 ? "" : "s"}`);
    if (lectureCount) metaParts.push(`${lectureCount} lecture${lectureCount === 1 ? "" : "s"}`);
    meta.textContent = metaParts.join(" \u2022 ") || "No lectures linked yet";
    header.appendChild(meta);
    const actions = document.createElement("div");
    actions.className = "builder-block-actions";
    const blockSelected = state.builder.blocks.includes(blockId);
    const toggleBlockBtn = createPill(blockSelected, blockSelected ? "Block added" : "Add block", () => {
      toggleBlock(block);
      rerender();
    });
    actions.appendChild(toggleBlockBtn);
    if (lectures.length) {
      const allBtn = createAction("Select all lectures", () => {
        selectEntireBlock(block);
        rerender();
      });
      actions.appendChild(allBtn);
    }
    if (hasSelections) {
      const clearBtn = createAction("Clear block", () => {
        clearBlock(blockId);
        rerender();
      });
      actions.appendChild(clearBtn);
    }
    header.appendChild(actions);
    card.appendChild(header);
    if (blockId === "__unlabeled") {
      const note = document.createElement("div");
      note.className = "builder-unlabeled-note";
      note.textContent = "Include to study cards without block or lecture tags.";
      card.appendChild(note);
      return card;
    }
    const weekList = document.createElement("div");
    weekList.className = "builder-week-list";
    weekList.hidden = blockCollapsed;
    if (!weeks.length) {
      const empty = document.createElement("div");
      empty.className = "builder-empty";
      empty.textContent = "No lectures added yet.";
      weekList.appendChild(empty);
    } else {
      weeks.forEach(({ week, items }) => {
        weekList.appendChild(renderWeek(block, week, items, rerender));
      });
    }
    card.appendChild(weekList);
    return card;
  }
  function renderWeek(block, week, lectures, rerender) {
    const blockId = block.blockId;
    const weekKey = weekKeyFor(blockId, week);
    const selected = state.builder.weeks.includes(weekKey);
    const weekCollapsed = isWeekCollapsed(blockId, week);
    const row = document.createElement("div");
    row.className = "builder-week-card";
    if (weekCollapsed) row.classList.add("is-collapsed");
    const header = document.createElement("div");
    header.className = "builder-week-header";
    const weekCollapseBtn = createCollapseToggle({
      collapsed: weekCollapsed,
      label: weekCollapsed ? "Show lectures" : "Hide lectures",
      onToggle: () => {
        toggleWeekCollapsed(blockId, week);
        rerender();
      }
    });
    header.appendChild(weekCollapseBtn);
    const label = createPill(selected, formatWeekLabel2(week), () => {
      toggleWeek(block, week);
      rerender();
    }, "week");
    header.appendChild(label);
    const meta = document.createElement("span");
    meta.className = "builder-week-meta";
    meta.textContent = `${lectures.length} lecture${lectures.length === 1 ? "" : "s"}`;
    header.appendChild(meta);
    const actions = document.createElement("div");
    actions.className = "builder-week-actions";
    const allBtn = createAction("Select all", () => {
      selectWeek(block, week);
      rerender();
    });
    actions.appendChild(allBtn);
    header.appendChild(actions);
    row.appendChild(header);
    const lectureList = document.createElement("div");
    lectureList.className = "builder-lecture-list";
    lectureList.hidden = weekCollapsed;
    lectures.forEach((lecture) => {
      lectureList.appendChild(renderLecture(block, lecture, rerender));
    });
    row.appendChild(lectureList);
    return row;
  }
  function renderLecture(block, lecture, rerender) {
    const blockId = block.blockId;
    const lectureKey = lectureKeyFor(blockId, lecture.id);
    const active = state.builder.lectures.includes(lectureKey);
    const pill = createPill(active, lecture.name || `Lecture ${lecture.id}`, () => {
      toggleLecture(block, lecture);
      rerender();
    }, "lecture");
    return pill;
  }
  function renderControls(rerender) {
    const aside = document.createElement("aside");
    aside.className = "builder-controls";
    aside.appendChild(renderFilterCard(rerender));
    aside.appendChild(renderSummaryCard(rerender));
    return aside;
  }
  function renderFilterCard(rerender) {
    const card = document.createElement("div");
    card.className = "card builder-filter-card";
    const title = document.createElement("h3");
    title.textContent = "Filters";
    card.appendChild(title);
    const typeLabel = document.createElement("div");
    typeLabel.className = "builder-section-title";
    typeLabel.textContent = "Card types";
    card.appendChild(typeLabel);
    const pillRow = document.createElement("div");
    pillRow.className = "builder-pill-row";
    const typeMap = { disease: "Disease", drug: "Drug", concept: "Concept" };
    Object.entries(typeMap).forEach(([value, label]) => {
      const active = state.builder.types.includes(value);
      const pill = createPill(active, label, () => {
        toggleType(value);
        rerender();
      }, "small");
      pillRow.appendChild(pill);
    });
    card.appendChild(pillRow);
    const favToggle = createPill(state.builder.onlyFav, "Only favorites", () => {
      setBuilder({ onlyFav: !state.builder.onlyFav });
      rerender();
    }, "small outline");
    card.appendChild(favToggle);
    return card;
  }
  function renderSummaryCard(rerender) {
    const card = document.createElement("div");
    card.className = "card builder-summary-card";
    const title = document.createElement("h3");
    title.textContent = "Study set";
    card.appendChild(title);
    const selectionMeta = document.createElement("div");
    selectionMeta.className = "builder-selection-meta";
    selectionMeta.innerHTML = `
    <span>Blocks: ${state.builder.blocks.length}</span>
    <span>Weeks: ${state.builder.weeks.length}</span>
    <span>Lectures: ${state.builder.lectures.length}</span>
  `;
    card.appendChild(selectionMeta);
    const count = document.createElement("div");
    count.className = "builder-count";
    count.textContent = `Set size: ${state.cohort.length}`;
    card.appendChild(count);
    const actions = document.createElement("div");
    actions.className = "builder-summary-actions";
    const buildBtn = document.createElement("button");
    buildBtn.type = "button";
    buildBtn.className = "btn";
    buildBtn.textContent = "Build set";
    buildBtn.addEventListener("click", async () => {
      await buildSet(buildBtn, count, rerender);
    });
    actions.appendChild(buildBtn);
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "btn secondary";
    clearBtn.textContent = "Clear selection";
    clearBtn.disabled = !hasAnySelection();
    clearBtn.addEventListener("click", () => {
      setBuilder({ blocks: [], weeks: [], lectures: [] });
      rerender();
    });
    actions.appendChild(clearBtn);
    card.appendChild(actions);
    return card;
  }
  async function buildSet(button, countEl, rerender) {
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Building\u2026";
    try {
      const items = await gatherItems();
      setCohort(items);
      resetBlockMode();
      countEl.textContent = `Set size: ${items.length}`;
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
    rerender();
  }
  async function gatherItems() {
    let items = [];
    for (const kind of state.builder.types) {
      const byKind = await listItemsByKind(kind);
      items = items.concat(byKind);
    }
    return items.filter((item) => {
      if (state.builder.onlyFav && !item.favorite) return false;
      if (state.builder.blocks.length) {
        const wantUnlabeled = state.builder.blocks.includes("__unlabeled");
        const hasBlockMatch = item.blocks?.some((b) => state.builder.blocks.includes(b));
        if (!hasBlockMatch) {
          const isUnlabeled = !item.blocks || !item.blocks.length;
          if (!(wantUnlabeled && isUnlabeled)) return false;
        }
      }
      if (state.builder.weeks.length) {
        const ok = state.builder.weeks.some((pair) => {
          const [blockId, weekStr] = pair.split("|");
          const weekNum = Number(weekStr);
          return item.blocks?.includes(blockId) && item.weeks?.includes(weekNum);
        });
        if (!ok) return false;
      }
      if (state.builder.lectures.length) {
        const ok = item.lectures?.some((lecture) => {
          const key = lectureKeyFor(lecture.blockId, lecture.id);
          return state.builder.lectures.includes(key);
        });
        if (!ok) return false;
      }
      return true;
    });
  }
  function toggleBlock(block) {
    const blockId = block.blockId;
    const set = new Set(state.builder.blocks);
    const isActive = set.has(blockId);
    if (isActive) {
      set.delete(blockId);
      const weeks = state.builder.weeks.filter((key) => !key.startsWith(`${blockId}|`));
      const lectures = state.builder.lectures.filter((key) => !key.startsWith(`${blockId}|`));
      setBuilder({ blocks: Array.from(set), weeks, lectures });
    } else {
      set.add(blockId);
      setBuilder({ blocks: Array.from(set) });
    }
  }
  function selectEntireBlock(block) {
    const blockId = block.blockId;
    const blockSet = new Set(state.builder.blocks);
    const weekSet = new Set(state.builder.weeks);
    const lectureSet = new Set(state.builder.lectures);
    blockSet.add(blockId);
    (block.lectures || []).forEach((lecture) => {
      if (lecture.week != null) weekSet.add(weekKeyFor(blockId, lecture.week));
      lectureSet.add(lectureKeyFor(blockId, lecture.id));
    });
    setBuilder({
      blocks: Array.from(blockSet),
      weeks: Array.from(weekSet),
      lectures: Array.from(lectureSet)
    });
  }
  function clearBlock(blockId) {
    const blocks = state.builder.blocks.filter((id) => id !== blockId);
    const weeks = state.builder.weeks.filter((key) => !key.startsWith(`${blockId}|`));
    const lectures = state.builder.lectures.filter((key) => !key.startsWith(`${blockId}|`));
    setBuilder({ blocks, weeks, lectures });
  }
  function toggleWeek(block, week) {
    const weekKey = weekKeyFor(block.blockId, week);
    const weekSet = new Set(state.builder.weeks);
    const lectureSet = new Set(state.builder.lectures);
    const blockSet = new Set(state.builder.blocks);
    if (weekSet.has(weekKey)) {
      weekSet.delete(weekKey);
      (block.lectures || []).forEach((lecture) => {
        if (lecture.week === week) {
          lectureSet.delete(lectureKeyFor(block.blockId, lecture.id));
        }
      });
    } else {
      weekSet.add(weekKey);
      blockSet.add(block.blockId);
    }
    setBuilder({
      weeks: Array.from(weekSet),
      lectures: Array.from(lectureSet),
      blocks: Array.from(blockSet)
    });
  }
  function selectWeek(block, week) {
    const weekKey = weekKeyFor(block.blockId, week);
    const weekSet = new Set(state.builder.weeks);
    const lectureSet = new Set(state.builder.lectures);
    const blockSet = new Set(state.builder.blocks);
    weekSet.add(weekKey);
    blockSet.add(block.blockId);
    (block.lectures || []).forEach((lecture) => {
      if (lecture.week === week) {
        lectureSet.add(lectureKeyFor(block.blockId, lecture.id));
      }
    });
    setBuilder({
      weeks: Array.from(weekSet),
      lectures: Array.from(lectureSet),
      blocks: Array.from(blockSet)
    });
  }
  function toggleLecture(block, lecture) {
    const key = lectureKeyFor(block.blockId, lecture.id);
    const lectureSet = new Set(state.builder.lectures);
    const blockSet = new Set(state.builder.blocks);
    const weekSet = new Set(state.builder.weeks);
    if (lectureSet.has(key)) {
      lectureSet.delete(key);
    } else {
      lectureSet.add(key);
      blockSet.add(block.blockId);
      if (lecture.week != null) weekSet.add(weekKeyFor(block.blockId, lecture.week));
    }
    setBuilder({
      lectures: Array.from(lectureSet),
      blocks: Array.from(blockSet),
      weeks: Array.from(weekSet)
    });
  }
  function toggleType(type) {
    const types = new Set(state.builder.types);
    if (types.has(type)) types.delete(type);
    else types.add(type);
    setBuilder({ types: Array.from(types) });
  }
  function isBlockCollapsed(blockId) {
    return (state.builder.collapsedBlocks || []).includes(blockId);
  }
  function toggleBlockCollapsed(blockId) {
    const collapsed = new Set(state.builder.collapsedBlocks || []);
    if (collapsed.has(blockId)) {
      collapsed.delete(blockId);
    } else {
      collapsed.add(blockId);
    }
    setBuilder({ collapsedBlocks: Array.from(collapsed) });
  }
  function isWeekCollapsed(blockId, week) {
    return (state.builder.collapsedWeeks || []).includes(weekKeyFor(blockId, week));
  }
  function toggleWeekCollapsed(blockId, week) {
    const key = weekKeyFor(blockId, week);
    const collapsed = new Set(state.builder.collapsedWeeks || []);
    if (collapsed.has(key)) {
      collapsed.delete(key);
    } else {
      collapsed.add(key);
    }
    setBuilder({ collapsedWeeks: Array.from(collapsed) });
  }
  function hasBlockSelection(blockId) {
    return state.builder.blocks.includes(blockId) || state.builder.weeks.some((key) => key.startsWith(`${blockId}|`)) || state.builder.lectures.some((key) => key.startsWith(`${blockId}|`));
  }
  function hasAnySelection() {
    return state.builder.blocks.length || state.builder.weeks.length || state.builder.lectures.length;
  }
  function groupByWeek(lectures) {
    const map = /* @__PURE__ */ new Map();
    lectures.forEach((lecture) => {
      const week = lecture.week != null ? lecture.week : -1;
      if (!map.has(week)) map.set(week, []);
      map.get(week).push(lecture);
    });
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]).map(([week, items]) => ({ week, items }));
  }
  function weekKeyFor(blockId, week) {
    return `${blockId}|${week}`;
  }
  function lectureKeyFor(blockId, lectureId) {
    return `${blockId}|${lectureId}`;
  }
  function formatWeekLabel2(week) {
    if (week == null || week < 0) return "No week";
    return `Week ${week}`;
  }
  function createPill(active, label, onClick, variant = "") {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "builder-pill";
    if (variant) {
      const variants = Array.isArray(variant) ? variant : variant.split(" ");
      variants.filter(Boolean).forEach((name) => btn.classList.add(`builder-pill-${name}`));
    }
    setToggleState(btn, active);
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }
  function createAction(label, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "builder-action";
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    return btn;
  }
  function createCollapseToggle({ collapsed, label, onToggle, variant = "week" }) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "builder-collapse-toggle";
    if (variant === "block") btn.classList.add("builder-collapse-toggle-block");
    btn.setAttribute("aria-expanded", String(!collapsed));
    btn.setAttribute("aria-label", label);
    btn.textContent = collapsed ? "\u25B8" : "\u25BE";
    btn.addEventListener("click", onToggle);
    return btn;
  }

  // js/ui/components/sections.js
  var SECTION_DEFS = {
    disease: [
      { key: "etiology", label: "Etiology" },
      { key: "pathophys", label: "Pathophys" },
      { key: "clinical", label: "Clinical Presentation" },
      { key: "diagnosis", label: "Diagnosis" },
      { key: "treatment", label: "Treatment" },
      { key: "complications", label: "Complications" },
      { key: "mnemonic", label: "Mnemonic" }
    ],
    drug: [
      { key: "moa", label: "Mechanism" },
      { key: "uses", label: "Uses" },
      { key: "sideEffects", label: "Side Effects" },
      { key: "contraindications", label: "Contraindications" },
      { key: "mnemonic", label: "Mnemonic" }
    ],
    concept: [
      { key: "definition", label: "Definition" },
      { key: "mechanism", label: "Mechanism" },
      { key: "clinicalRelevance", label: "Clinical Relevance" },
      { key: "example", label: "Example" },
      { key: "mnemonic", label: "Mnemonic" }
    ]
  };
  function sectionDefsForKind(kind) {
    return SECTION_DEFS[kind] || [];
  }

  // js/ui/components/flashcards.js
  function renderFlashcards(root, redraw) {
    const session = state.flashSession || { idx: 0, pool: state.cohort };
    const items = session.pool || state.cohort;
    root.innerHTML = "";
    if (!items.length) {
      const msg = document.createElement("div");
      msg.textContent = "No items in cohort.";
      root.appendChild(msg);
      return;
    }
    if (session.idx >= items.length) {
      setFlashSession(null);
      redraw();
      return;
    }
    const item = items[session.idx];
    const card = document.createElement("section");
    card.className = "card flashcard";
    card.tabIndex = 0;
    const title = document.createElement("h2");
    title.textContent = item.name || item.concept || "";
    card.appendChild(title);
    sectionsFor(item).forEach(([label, field]) => {
      const sec = document.createElement("div");
      sec.className = "flash-section";
      sec.setAttribute("role", "button");
      sec.tabIndex = 0;
      const head = document.createElement("div");
      head.className = "flash-heading";
      head.textContent = label;
      const body = document.createElement("div");
      body.className = "flash-body";
      renderRichText(body, item[field] || "");
      sec.appendChild(head);
      sec.appendChild(body);
      setToggleState(sec, false, "revealed");
      const toggleReveal = () => {
        const next2 = sec.dataset.active !== "true";
        setToggleState(sec, next2, "revealed");
      };
      sec.addEventListener("click", toggleReveal);
      sec.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleReveal();
        }
      });
      card.appendChild(sec);
    });
    const controls = document.createElement("div");
    controls.className = "row";
    const prev = document.createElement("button");
    prev.className = "btn";
    prev.textContent = "Prev";
    prev.disabled = session.idx === 0;
    prev.addEventListener("click", () => {
      if (session.idx > 0) {
        setFlashSession({ idx: session.idx - 1, pool: items });
        redraw();
      }
    });
    controls.appendChild(prev);
    const next = document.createElement("button");
    next.className = "btn";
    next.textContent = session.idx < items.length - 1 ? "Next" : "Finish";
    next.addEventListener("click", () => {
      const idx = session.idx + 1;
      if (idx >= items.length) {
        setFlashSession(null);
      } else {
        setFlashSession({ idx, pool: items });
      }
      redraw();
    });
    controls.appendChild(next);
    const exit = document.createElement("button");
    exit.className = "btn";
    exit.textContent = "End";
    exit.addEventListener("click", () => {
      setFlashSession(null);
      redraw();
    });
    controls.appendChild(exit);
    card.appendChild(controls);
    root.appendChild(card);
    card.focus();
    card.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") {
        next.click();
      } else if (e.key === "ArrowLeft") {
        prev.click();
      }
    });
  }
  function sectionsFor(item) {
    return sectionDefsForKind(item.kind).map((def) => [def.label, def.key]);
  }

  // js/ui/components/review.js
  function renderReview(root, redraw) {
    const cfg = state.review;
    const section = document.createElement("section");
    section.className = "review-controls";
    const countLabel = document.createElement("label");
    countLabel.textContent = "Count:";
    const countInput = document.createElement("input");
    countInput.type = "number";
    countInput.min = "1";
    countInput.value = cfg.count;
    countInput.addEventListener("change", () => setReviewConfig({ count: Number(countInput.value) }));
    countLabel.appendChild(countInput);
    section.appendChild(countLabel);
    const formatLabel = document.createElement("label");
    formatLabel.textContent = "Format:";
    const formatSel = document.createElement("select");
    ["flashcards", "quiz"].forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f;
      opt.textContent = f;
      if (cfg.format === f) opt.selected = true;
      formatSel.appendChild(opt);
    });
    formatSel.addEventListener("change", () => setReviewConfig({ format: formatSel.value }));
    formatLabel.appendChild(formatSel);
    section.appendChild(formatLabel);
    const startBtn = document.createElement("button");
    startBtn.className = "btn";
    startBtn.textContent = "Start Review";
    startBtn.addEventListener("click", () => {
      const items = sampleItems(state.cohort, cfg.count);
      if (!items.length) return;
      if (cfg.format === "flashcards") {
        setFlashSession({ idx: 0, pool: items });
      } else {
        setQuizSession({ idx: 0, score: 0, pool: items });
      }
      redraw();
    });
    section.appendChild(startBtn);
    root.appendChild(section);
  }
  function sampleItems(cohort, count) {
    const sorted = [...cohort].sort((a, b) => {
      const ad = a.sr && a.sr.due || a.updatedAt || 0;
      const bd = b.sr && b.sr.due || b.updatedAt || 0;
      return ad - bd;
    });
    if (sorted.length <= count) return sorted;
    const third = Math.ceil(sorted.length / 3);
    const oldest = sorted.slice(0, third);
    const middle = sorted.slice(third, third * 2);
    const newest = sorted.slice(third * 2);
    const take = (arr, n) => {
      const out = [];
      for (let i = 0; i < n && arr.length; i++) {
        const idx = Math.floor(Math.random() * arr.length);
        out.push(arr.splice(idx, 1)[0]);
      }
      return out;
    };
    const res = [];
    const nOld = Math.round(count * 0.6);
    const nMid = Math.round(count * 0.3);
    const nNew = count - nOld - nMid;
    res.push(...take(oldest, nOld));
    res.push(...take(middle, nMid));
    res.push(...take(newest, nNew));
    return res;
  }

  // js/ui/components/quiz.js
  function titleOf2(item) {
    return item.name || item.concept || "";
  }
  function renderQuiz(root, redraw) {
    const sess = state.quizSession;
    if (!sess) return;
    if (!sess.dict) {
      sess.dict = sess.pool.map((it) => ({ id: it.id, title: titleOf2(it), lower: titleOf2(it).toLowerCase() }));
    }
    const item = sess.pool[sess.idx];
    if (!item) {
      const done = document.createElement("div");
      done.textContent = `Score ${sess.score}/${sess.pool.length}`;
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = "Done";
      btn.addEventListener("click", () => {
        setQuizSession(null);
        redraw();
      });
      done.appendChild(document.createElement("br"));
      done.appendChild(btn);
      root.appendChild(done);
      return;
    }
    const form = document.createElement("form");
    form.className = "quiz-form";
    const info = document.createElement("div");
    info.className = "quiz-info";
    sectionsFor2(item).forEach(([label, field]) => {
      if (!item[field]) return;
      const sec = document.createElement("div");
      sec.className = "section";
      const head = document.createElement("div");
      head.className = "section-title";
      head.textContent = label;
      const body = document.createElement("div");
      renderRichText(body, item[field]);
      sec.appendChild(head);
      sec.appendChild(body);
      info.appendChild(sec);
    });
    form.appendChild(info);
    const input = document.createElement("input");
    input.type = "text";
    input.autocomplete = "off";
    form.appendChild(input);
    const sug = document.createElement("ul");
    sug.className = "quiz-suggestions";
    form.appendChild(sug);
    input.addEventListener("input", () => {
      const v = input.value.toLowerCase();
      sug.innerHTML = "";
      if (!v) return;
      const starts = sess.dict.filter((d) => d.lower.startsWith(v));
      const contains = sess.dict.filter((d) => !d.lower.startsWith(v) && d.lower.includes(v));
      [...starts, ...contains].slice(0, 5).forEach((d) => {
        const li = document.createElement("li");
        li.textContent = d.title;
        li.addEventListener("mousedown", () => {
          input.value = d.title;
          sug.innerHTML = "";
        });
        sug.appendChild(li);
      });
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const ans = input.value.trim().toLowerCase();
      const correct = titleOf2(item).toLowerCase();
      if (ans === correct) sess.score++;
      sess.idx++;
      setQuizSession(sess);
      redraw();
    });
    root.appendChild(form);
  }
  function sectionsFor2(item) {
    const map = {
      disease: [
        ["Etiology", "etiology"],
        ["Pathophys", "pathophys"],
        ["Clinical Presentation", "clinical"],
        ["Diagnosis", "diagnosis"],
        ["Treatment", "treatment"],
        ["Complications", "complications"],
        ["Mnemonic", "mnemonic"]
      ],
      drug: [
        ["Mechanism", "moa"],
        ["Uses", "uses"],
        ["Side Effects", "sideEffects"],
        ["Contraindications", "contraindications"],
        ["Mnemonic", "mnemonic"]
      ],
      concept: [
        ["Definition", "definition"],
        ["Mechanism", "mechanism"],
        ["Clinical Relevance", "clinicalRelevance"],
        ["Example", "example"],
        ["Mnemonic", "mnemonic"]
      ]
    };
    return map[item.kind] || [];
  }

  // js/ui/components/block-mode.js
  function renderBlockMode(root) {
    const shell = document.createElement("section");
    shell.className = "block-mode-shell";
    root.appendChild(shell);
    drawBlockMode(shell);
  }
  function drawBlockMode(shell) {
    shell.innerHTML = "";
    const redraw = () => drawBlockMode(shell);
    const items = state.cohort || [];
    if (!items.length) {
      shell.appendChild(messageCard("Build a study set to unlock Blocks mode. Use the filters above to assemble a cohort."));
      return;
    }
    const sections = collectSections(items);
    if (!sections.length) {
      shell.appendChild(messageCard("The selected cards do not have structured sections yet. Add cards with rich content to practice in Blocks mode."));
      return;
    }
    let activeKey = state.blockMode.section;
    if (!activeKey || !sections.some((sec) => sec.key === activeKey)) {
      activeKey = sections[0].key;
      if (activeKey !== state.blockMode.section) {
        setBlockMode({ section: activeKey });
      }
    }
    const sectionData = sections.find((sec) => sec.key === activeKey) || sections[0];
    const entryMap = /* @__PURE__ */ new Map();
    sectionData.items.forEach((info) => {
      entryMap.set(entryIdFor(info.itemId, sectionData.key), info);
    });
    const validAssignments = sanitizeAssignments(sectionData.key, entryMap);
    const assignedSet = new Set(Object.values(validAssignments));
    const reveal = !!(state.blockMode.reveal && state.blockMode.reveal[sectionData.key]);
    const bankEntries = Array.from(entryMap.entries()).filter(([id]) => !assignedSet.has(id)).map(([entryId, info]) => ({ entryId, value: info.value, itemId: info.itemId }));
    const orderedBank = orderEntries(sectionData.key, bankEntries);
    const results = sectionData.items.map((info) => {
      const entryId = entryIdFor(info.itemId, sectionData.key);
      const assignedId = validAssignments[info.itemId];
      const assignedInfo = assignedId ? entryMap.get(assignedId) : null;
      const assignedValue = assignedInfo ? assignedInfo.value : "";
      const correct = assignedValue && normalized(assignedValue) === normalized(info.value);
      return { ...info, entryId, assignedId, assignedValue, correct };
    });
    const filledCount = results.filter((r) => r.assignedValue).length;
    const correctCount = results.filter((r) => r.correct).length;
    shell.appendChild(renderHeader({
      sections,
      activeKey: sectionData.key,
      filledCount,
      correctCount,
      total: results.length,
      bankRemaining: orderedBank.length,
      reveal,
      onSectionChange: (key) => {
        const nextReveal = { ...state.blockMode.reveal || {} };
        delete nextReveal[key];
        setBlockMode({ section: key, reveal: nextReveal });
        redraw();
      },
      onCheck: () => {
        const nextReveal = { ...state.blockMode.reveal || {} };
        nextReveal[sectionData.key] = true;
        setBlockMode({ reveal: nextReveal });
        redraw();
      },
      onReset: () => {
        const assignments = { ...state.blockMode.assignments || {} };
        assignments[sectionData.key] = {};
        const revealMap = { ...state.blockMode.reveal || {} };
        delete revealMap[sectionData.key];
        setBlockMode({ assignments, reveal: revealMap });
        redraw();
      }
    }));
    const board = document.createElement("div");
    board.className = "block-mode-board";
    results.forEach((result) => {
      board.appendChild(renderBlockCard({
        sectionLabel: sectionData.label,
        reveal,
        result,
        onRemove: () => {
          const assignments = { ...state.blockMode.assignments || {} };
          const nextSectionAssignments = { ...assignments[sectionData.key] || {} };
          delete nextSectionAssignments[result.itemId];
          assignments[sectionData.key] = nextSectionAssignments;
          const revealMap = { ...state.blockMode.reveal || {} };
          delete revealMap[sectionData.key];
          setBlockMode({ assignments, reveal: revealMap });
          redraw();
        },
        onDrop: (entryId) => {
          const info = entryMap.get(entryId);
          if (!info) return;
          const assignments = { ...state.blockMode.assignments || {} };
          const nextSectionAssignments = { ...assignments[sectionData.key] || {} };
          for (const [itemId, assigned] of Object.entries(nextSectionAssignments)) {
            if (assigned === entryId) delete nextSectionAssignments[itemId];
          }
          nextSectionAssignments[result.itemId] = entryId;
          assignments[sectionData.key] = nextSectionAssignments;
          const revealMap = { ...state.blockMode.reveal || {} };
          delete revealMap[sectionData.key];
          setBlockMode({ assignments, reveal: revealMap });
          redraw();
        }
      }));
    });
    shell.appendChild(board);
    shell.appendChild(renderBank({
      label: sectionData.label,
      entries: orderedBank
    }));
  }
  function renderHeader({ sections, activeKey, filledCount, correctCount, total, bankRemaining, reveal, onSectionChange, onCheck, onReset }) {
    const card = document.createElement("div");
    card.className = "card block-mode-header";
    const titleRow = document.createElement("div");
    titleRow.className = "block-mode-header-row";
    const title = document.createElement("h2");
    title.textContent = "Blocks Mode";
    titleRow.appendChild(title);
    const selectWrap = document.createElement("label");
    selectWrap.className = "block-mode-select";
    const selectLabel = document.createElement("span");
    selectLabel.textContent = "Section";
    selectWrap.appendChild(selectLabel);
    const select = document.createElement("select");
    sections.forEach((sec) => {
      const opt = document.createElement("option");
      opt.value = sec.key;
      opt.textContent = sec.label;
      if (sec.key === activeKey) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener("change", () => onSectionChange(select.value));
    selectWrap.appendChild(select);
    titleRow.appendChild(selectWrap);
    card.appendChild(titleRow);
    const meta = document.createElement("div");
    meta.className = "block-mode-meta-row";
    const placed = document.createElement("span");
    placed.textContent = `Placed: ${filledCount}/${total}`;
    meta.appendChild(placed);
    if (reveal) {
      const score = document.createElement("span");
      score.textContent = `Correct: ${correctCount}/${total}`;
      meta.appendChild(score);
    }
    const bankInfo = document.createElement("span");
    bankInfo.textContent = `In bank: ${bankRemaining}`;
    meta.appendChild(bankInfo);
    card.appendChild(meta);
    const actions = document.createElement("div");
    actions.className = "block-mode-actions";
    const checkBtn = document.createElement("button");
    checkBtn.type = "button";
    checkBtn.className = "btn";
    checkBtn.textContent = "Check answers";
    checkBtn.disabled = !filledCount;
    checkBtn.addEventListener("click", onCheck);
    actions.appendChild(checkBtn);
    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "btn secondary";
    resetBtn.textContent = "Reset section";
    resetBtn.disabled = !filledCount;
    resetBtn.addEventListener("click", onReset);
    actions.appendChild(resetBtn);
    card.appendChild(actions);
    return card;
  }
  function renderBlockCard({ sectionLabel, reveal, result, onRemove, onDrop }) {
    const card = document.createElement("div");
    card.className = "card block-mode-card";
    const title = document.createElement("div");
    title.className = "block-mode-card-title";
    title.textContent = itemTitle(result.item);
    card.appendChild(title);
    const subtitle = document.createElement("div");
    subtitle.className = "block-mode-card-subtitle";
    subtitle.textContent = formatItemContext(result.item);
    if (subtitle.textContent) card.appendChild(subtitle);
    const slot = document.createElement("div");
    slot.className = "block-mode-slot";
    slot.dataset.itemId = result.itemId;
    slot.dataset.section = sectionLabel;
    slot.addEventListener("dragover", (event) => {
      event.preventDefault();
      slot.classList.add("drag-over");
    });
    slot.addEventListener("dragenter", (event) => {
      event.preventDefault();
      slot.classList.add("drag-over");
    });
    slot.addEventListener("dragleave", () => {
      slot.classList.remove("drag-over");
    });
    slot.addEventListener("drop", (event) => {
      event.preventDefault();
      slot.classList.remove("drag-over");
      const entryId = event.dataTransfer.getData("text/plain");
      if (entryId) onDrop(entryId);
    });
    if (result.assignedValue) {
      slot.classList.add("filled");
      const chip = document.createElement("div");
      chip.className = "block-chip assigned";
      const text = document.createElement("div");
      text.className = "block-chip-text";
      text.textContent = result.assignedValue;
      chip.appendChild(text);
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "chip-remove";
      removeBtn.textContent = "\xD7";
      removeBtn.addEventListener("click", onRemove);
      chip.appendChild(removeBtn);
      slot.appendChild(chip);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "block-slot-placeholder";
      placeholder.textContent = `Drop ${sectionLabel.toLowerCase()} here`;
      slot.appendChild(placeholder);
    }
    card.appendChild(slot);
    if (reveal) {
      slot.classList.add(result.correct ? "correct" : result.assignedValue ? "incorrect" : "missing");
      if (!result.correct) {
        const answer = document.createElement("div");
        answer.className = "block-mode-answer";
        const label = document.createElement("span");
        label.textContent = "Answer";
        const body = document.createElement("div");
        body.textContent = result.value;
        answer.appendChild(label);
        answer.appendChild(body);
        card.appendChild(answer);
      }
    }
    return card;
  }
  function renderBank({ label, entries, onPick }) {
    const card = document.createElement("div");
    card.className = "card block-mode-bank";
    const title = document.createElement("div");
    title.className = "block-mode-bank-title";
    title.textContent = `${label} bank`;
    card.appendChild(title);
    const list = document.createElement("div");
    list.className = "block-mode-bank-items";
    if (!entries.length) {
      const empty = document.createElement("div");
      empty.className = "block-mode-bank-empty";
      empty.textContent = "All matches placed!";
      list.appendChild(empty);
    } else {
      entries.forEach((entry) => {
        const chip = document.createElement("div");
        chip.className = "block-chip";
        chip.textContent = entry.value;
        chip.draggable = true;
        chip.addEventListener("dragstart", (event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", entry.entryId);
          chip.classList.add("dragging");
        });
        chip.addEventListener("dragend", () => chip.classList.remove("dragging"));
        if (onPick) {
          chip.addEventListener("click", () => onPick(entry.entryId));
        }
        list.appendChild(chip);
      });
    }
    card.appendChild(list);
    return card;
  }
  function collectSections(items) {
    const map = /* @__PURE__ */ new Map();
    items.forEach((item, index) => {
      const itemId = resolveItemId(item, index);
      sectionDefsForKind(item.kind).forEach((def) => {
        const value = sectionValue(item[def.key]);
        if (!value) return;
        let section = map.get(def.key);
        if (!section) {
          section = { key: def.key, label: def.label, items: [] };
          map.set(def.key, section);
        }
        section.items.push({ item, itemId, value });
      });
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }
  function sanitizeAssignments(sectionKey, entryMap) {
    const current = state.blockMode.assignments && state.blockMode.assignments[sectionKey] || {};
    let changed = false;
    const valid = {};
    for (const [itemId, entryId] of Object.entries(current)) {
      if (entryMap.has(entryId)) {
        valid[itemId] = entryId;
      } else {
        changed = true;
      }
    }
    if (changed) {
      const assignments = { ...state.blockMode.assignments || {} };
      assignments[sectionKey] = valid;
      setBlockMode({ assignments });
    }
    return valid;
  }
  function orderEntries(sectionKey, entries) {
    const ids = entries.map((entry) => entry.entryId);
    const existing = state.blockMode.order && state.blockMode.order[sectionKey] || [];
    const filtered = existing.filter((id) => ids.includes(id));
    const missing = ids.filter((id) => !filtered.includes(id));
    const next = filtered.concat(missing);
    if (!arraysEqual(existing, next)) {
      const order = { ...state.blockMode.order || {} };
      order[sectionKey] = next;
      setBlockMode({ order });
    }
    const byId = new Map(entries.map((entry) => [entry.entryId, entry]));
    return next.map((id) => byId.get(id)).filter(Boolean);
  }
  function entryIdFor(itemId, sectionKey) {
    return `${itemId}::${sectionKey}`;
  }
  function sectionValue(raw) {
    if (raw == null) return "";
    const text = typeof raw === "string" ? raw : String(raw);
    const sanitized = sanitizeHtml(text);
    const template = document.createElement("template");
    template.innerHTML = sanitized;
    return template.content.textContent?.trim() || "";
  }
  function normalized(text) {
    return sectionValue(text).replace(/\s+/g, " ").toLowerCase();
  }
  function resolveItemId(item, index) {
    return item.id || item.uid || item.slug || item.key || `${item.kind || "item"}-${index}`;
  }
  function itemTitle(item) {
    return item.name || item.concept || item.title || "Card";
  }
  function formatItemContext(item) {
    const parts = [];
    if (item.kind) parts.push(capitalize(item.kind));
    if (Array.isArray(item.lectures) && item.lectures.length) {
      const lectureNames = item.lectures.map((l) => l.name).filter(Boolean);
      if (lectureNames.length) parts.push(lectureNames.join(", "));
    }
    return parts.join(" \u2022 ");
  }
  function capitalize(text) {
    if (!text) return "";
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    return a.every((val, idx) => val === b[idx]);
  }
  function messageCard(text) {
    const card = document.createElement("div");
    card.className = "card block-mode-empty";
    card.textContent = text;
    return card;
  }

  // js/ui/components/exams.js
  var DEFAULT_SECONDS = 60;
  var timerHandles = /* @__PURE__ */ new WeakMap();
  var keyHandler = null;
  var keyHandlerSession = null;
  var lastExamStatusMessage = "";
  function clone2(value) {
    return value ? JSON.parse(JSON.stringify(value)) : value;
  }
  function totalExamTimeMs(exam) {
    const seconds = typeof exam.secondsPerQuestion === "number" ? exam.secondsPerQuestion : DEFAULT_SECONDS;
    return seconds * (exam.questions?.length || 0) * 1e3;
  }
  function stopTimer(sess) {
    const handle = timerHandles.get(sess);
    if (handle) {
      clearInterval(handle);
      timerHandles.delete(sess);
    }
    if (sess?.startedAt) {
      const now = Date.now();
      const delta = Math.max(0, now - sess.startedAt);
      sess.elapsedMs = (sess.elapsedMs || 0) + delta;
      if (sess.exam?.timerMode === "timed" && typeof sess.remainingMs === "number") {
        sess.remainingMs = Math.max(0, sess.remainingMs - delta);
      }
      sess.startedAt = null;
    }
  }
  function ensureTimer(sess, render2) {
    if (!sess || sess.mode !== "taking" || sess.exam.timerMode !== "timed") return;
    if (timerHandles.has(sess)) return;
    if (typeof sess.remainingMs !== "number") {
      sess.remainingMs = totalExamTimeMs(sess.exam);
    }
    if (typeof sess.elapsedMs !== "number") sess.elapsedMs = 0;
    sess.startedAt = Date.now();
    const handle = setInterval(() => {
      const now = Date.now();
      const last = sess.startedAt || now;
      const delta = Math.max(0, now - last);
      sess.startedAt = now;
      sess.elapsedMs = (sess.elapsedMs || 0) + delta;
      sess.remainingMs = Math.max(0, (sess.remainingMs ?? 0) - delta);
      if (sess.remainingMs <= 0) {
        stopTimer(sess);
        finalizeExam(sess, render2, { autoSubmit: true });
      } else {
        render2();
      }
    }, 1e3);
    timerHandles.set(sess, handle);
  }
  function teardownKeyboardNavigation() {
    if (keyHandler) {
      window.removeEventListener("keydown", keyHandler);
      keyHandler = null;
      keyHandlerSession = null;
    }
  }
  function setupKeyboardNavigation(sess, render2) {
    if (!sess || sess.mode === "summary") {
      teardownKeyboardNavigation();
      return;
    }
    if (keyHandler && keyHandlerSession === sess) return;
    teardownKeyboardNavigation();
    keyHandlerSession = sess;
    keyHandler = (event) => {
      if (event.defaultPrevented) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
      }
      if (event.key === "ArrowRight") {
        if (sess.idx < sess.exam.questions.length - 1) {
          event.preventDefault();
          sess.idx += 1;
          render2();
        }
      } else if (event.key === "ArrowLeft") {
        if (sess.idx > 0) {
          event.preventDefault();
          sess.idx -= 1;
          render2();
        }
      }
    };
    window.addEventListener("keydown", keyHandler);
  }
  function formatCountdown(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1e3));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor(totalSeconds % 3600 / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return [hours, minutes, seconds].map((val) => String(val).padStart(2, "0")).join(":");
    }
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  function currentElapsedMs(sess) {
    const base = sess?.elapsedMs || 0;
    if (sess?.startedAt) {
      return base + Math.max(0, Date.now() - sess.startedAt);
    }
    return base;
  }
  function slugify(text) {
    const lowered = (text || "").toLowerCase();
    const normalized2 = lowered.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return normalized2 || "exam";
  }
  function triggerExamDownload(exam) {
    try {
      const data = JSON.stringify(exam, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slugify(exam.examTitle || "exam")}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 0);
      return true;
    } catch (err) {
      console.warn("Failed to export exam", err);
      return false;
    }
  }
  function ensureExamShape(exam) {
    const next = clone2(exam) || {};
    let changed = false;
    if (!next.id) {
      next.id = uid();
      changed = true;
    }
    if (!next.examTitle) {
      next.examTitle = "Untitled Exam";
      changed = true;
    }
    if (next.timerMode !== "timed") {
      if (next.timerMode !== "untimed") changed = true;
      next.timerMode = "untimed";
    }
    if (typeof next.secondsPerQuestion !== "number" || next.secondsPerQuestion <= 0) {
      next.secondsPerQuestion = DEFAULT_SECONDS;
      changed = true;
    }
    if (!Array.isArray(next.questions)) {
      next.questions = [];
      changed = true;
    }
    next.questions = next.questions.map((q) => {
      const question = { ...q };
      if (!question.id) {
        question.id = uid();
        changed = true;
      }
      question.stem = question.stem ? String(question.stem) : "";
      if (!Array.isArray(question.options)) {
        question.options = [];
        changed = true;
      }
      question.options = question.options.map((opt) => {
        const option = { ...opt };
        if (!option.id) {
          option.id = uid();
          changed = true;
        }
        option.text = option.text ? String(option.text) : "";
        return option;
      });
      if (!question.answer || !question.options.some((opt) => opt.id === question.answer)) {
        question.answer = question.options[0]?.id || "";
        changed = true;
      }
      if (question.explanation == null) {
        question.explanation = "";
        changed = true;
      }
      if (!Array.isArray(question.tags)) {
        if (question.tags == null) question.tags = [];
        else question.tags = Array.isArray(question.tags) ? question.tags : [String(question.tags)];
        changed = true;
      }
      question.tags = question.tags.map((t) => String(t)).filter(Boolean);
      if (question.media == null) {
        question.media = "";
        changed = true;
      }
      return question;
    });
    if (!Array.isArray(next.results)) {
      next.results = [];
      changed = true;
    }
    next.results = next.results.map((res) => {
      const result = { ...res };
      if (!result.id) {
        result.id = uid();
        changed = true;
      }
      if (typeof result.when !== "number") {
        result.when = Date.now();
        changed = true;
      }
      if (typeof result.correct !== "number") {
        result.correct = Number(result.correct) || 0;
        changed = true;
      }
      if (typeof result.total !== "number") {
        result.total = Number(result.total) || (next.questions?.length ?? 0);
        changed = true;
      }
      if (!result.answers || typeof result.answers !== "object") {
        result.answers = {};
        changed = true;
      }
      if (!Array.isArray(result.flagged)) {
        result.flagged = [];
        changed = true;
      }
      if (typeof result.durationMs !== "number") {
        result.durationMs = 0;
        changed = true;
      }
      if (typeof result.answered !== "number") {
        result.answered = Object.keys(result.answers || {}).length;
        changed = true;
      }
      return result;
    });
    return { exam: next, changed };
  }
  function createBlankQuestion() {
    return {
      id: uid(),
      stem: "",
      options: [1, 2, 3, 4].map(() => ({ id: uid(), text: "" })),
      answer: "",
      explanation: "",
      tags: [],
      media: ""
    };
  }
  function createTakingSession(exam) {
    const snapshot = clone2(exam);
    const totalMs = snapshot.timerMode === "timed" ? totalExamTimeMs(snapshot) : null;
    return {
      mode: "taking",
      exam: snapshot,
      idx: 0,
      answers: {},
      flagged: {},
      checked: {},
      startedAt: Date.now(),
      elapsedMs: 0,
      remainingMs: totalMs
    };
  }
  function hydrateSavedSession(saved, fallbackExam) {
    const baseExam = saved?.exam ? ensureExamShape(saved.exam).exam : fallbackExam;
    const exam = clone2(baseExam);
    const questionCount = exam.questions.length;
    const idx = Math.min(Math.max(Number(saved?.idx) || 0, 0), Math.max(0, questionCount - 1));
    const remaining = typeof saved?.remainingMs === "number" ? Math.max(0, saved.remainingMs) : exam.timerMode === "timed" ? totalExamTimeMs(exam) : null;
    const elapsed = Math.max(0, Number(saved?.elapsedMs) || 0);
    return {
      mode: "taking",
      exam,
      idx,
      answers: saved?.answers ? { ...saved.answers } : {},
      flagged: saved?.flagged ? { ...saved.flagged } : {},
      checked: saved?.checked ? { ...saved.checked } : {},
      startedAt: Date.now(),
      elapsedMs: elapsed,
      remainingMs: remaining
    };
  }
  async function renderExams(root, render2) {
    root.innerHTML = "";
    root.className = "exam-view";
    const controls = document.createElement("div");
    controls.className = "exam-controls";
    const heading = document.createElement("div");
    heading.className = "exam-heading";
    heading.innerHTML = "<h1>Exams</h1><p>Import exams, take them, and review your attempts.</p>";
    controls.appendChild(heading);
    const actions = document.createElement("div");
    actions.className = "exam-control-actions";
    const status = document.createElement("div");
    status.className = "exam-status";
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "application/json";
    fileInput.style.display = "none";
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const { exam } = ensureExamShape(parsed);
        await upsertExam({ ...exam, updatedAt: Date.now() });
        render2();
      } catch (err) {
        console.warn("Failed to import exam", err);
        status.textContent = "Unable to import exam \u2014 invalid JSON structure.";
      } finally {
        fileInput.value = "";
      }
    });
    const importBtn = document.createElement("button");
    importBtn.type = "button";
    importBtn.className = "btn secondary";
    importBtn.textContent = "Import Exam";
    importBtn.addEventListener("click", () => fileInput.click());
    actions.appendChild(importBtn);
    const newBtn = document.createElement("button");
    newBtn.type = "button";
    newBtn.className = "btn";
    newBtn.textContent = "New Exam";
    newBtn.addEventListener("click", () => openExamEditor(null, render2));
    actions.appendChild(newBtn);
    controls.appendChild(actions);
    controls.appendChild(status);
    root.appendChild(controls);
    root.appendChild(fileInput);
    if (lastExamStatusMessage) {
      status.textContent = lastExamStatusMessage;
      lastExamStatusMessage = "";
    } else {
      status.textContent = "";
    }
    const stored = await listExams();
    const exams = [];
    for (const raw of stored) {
      const { exam, changed } = ensureExamShape(raw);
      exams.push(exam);
      if (changed) await upsertExam(exam);
    }
    exams.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const savedSessions = await listExamSessions();
    const sessionMap = /* @__PURE__ */ new Map();
    for (const sess of savedSessions) {
      if (sess?.examId) sessionMap.set(sess.examId, sess);
    }
    for (const sess of savedSessions) {
      if (!exams.find((ex) => ex.id === sess.examId)) {
        await deleteExamSessionProgress(sess.examId);
      }
    }
    if (!exams.length) {
      const empty = document.createElement("div");
      empty.className = "exam-empty";
      empty.innerHTML = "<p>No exams yet. Import a JSON exam or create one from scratch.</p>";
      root.appendChild(empty);
      return;
    }
    const grid = document.createElement("div");
    grid.className = "exam-grid";
    exams.forEach((exam) => {
      grid.appendChild(buildExamCard(exam, render2, sessionMap.get(exam.id), status));
    });
    root.appendChild(grid);
  }
  function buildExamCard(exam, render2, savedSession, statusEl) {
    const card = document.createElement("article");
    card.className = "card exam-card";
    const title = document.createElement("h2");
    title.className = "exam-card-title";
    title.textContent = exam.examTitle;
    card.appendChild(title);
    const meta = document.createElement("div");
    meta.className = "exam-card-meta";
    const questionCount = document.createElement("span");
    questionCount.textContent = `${exam.questions.length} question${exam.questions.length === 1 ? "" : "s"}`;
    meta.appendChild(questionCount);
    if (exam.timerMode === "timed") {
      const timed = document.createElement("span");
      timed.textContent = `Timed \u2022 ${exam.secondsPerQuestion}s/question`;
      meta.appendChild(timed);
    } else {
      const timed = document.createElement("span");
      timed.textContent = "Untimed";
      meta.appendChild(timed);
    }
    card.appendChild(meta);
    const stats = document.createElement("div");
    stats.className = "exam-card-stats";
    stats.appendChild(createStat("Attempts", String(exam.results.length)));
    const last = latestResult(exam);
    if (last) {
      stats.appendChild(createStat("Last Score", formatScore(last)));
      const best = bestResult(exam);
      if (best) stats.appendChild(createStat("Best Score", formatScore(best)));
    } else {
      stats.appendChild(createStat("Last Score", "\u2014"));
      stats.appendChild(createStat("Best Score", "\u2014"));
    }
    card.appendChild(stats);
    if (savedSession) {
      const banner = document.createElement("div");
      banner.className = "exam-saved-banner";
      const updated = savedSession.updatedAt ? new Date(savedSession.updatedAt).toLocaleString() : null;
      banner.textContent = updated ? `Saved attempt \u2022 ${updated}` : "Saved attempt available";
      card.appendChild(banner);
    }
    const actions = document.createElement("div");
    actions.className = "exam-card-actions";
    if (savedSession) {
      const resumeBtn = document.createElement("button");
      resumeBtn.className = "btn";
      resumeBtn.textContent = "Resume Attempt";
      resumeBtn.disabled = exam.questions.length === 0;
      resumeBtn.addEventListener("click", async () => {
        const latest = await loadExamSession(exam.id);
        if (!latest) {
          if (statusEl) statusEl.textContent = "Saved attempt could not be found.";
          render2();
          return;
        }
        const session = hydrateSavedSession(latest, exam);
        setExamSession(session);
        render2();
      });
      actions.appendChild(resumeBtn);
    }
    const startBtn = document.createElement("button");
    startBtn.className = savedSession ? "btn secondary" : "btn";
    startBtn.textContent = savedSession ? "Start Fresh" : "Start Exam";
    startBtn.disabled = exam.questions.length === 0;
    startBtn.addEventListener("click", async () => {
      if (savedSession) {
        const confirm2 = await confirmModal("Start a new attempt and discard saved progress?");
        if (!confirm2) return;
        await deleteExamSessionProgress(exam.id);
      }
      setExamSession(createTakingSession(exam));
      render2();
    });
    actions.appendChild(startBtn);
    if (last) {
      const reviewBtn = document.createElement("button");
      reviewBtn.className = "btn secondary";
      reviewBtn.textContent = "Review Last Attempt";
      reviewBtn.addEventListener("click", () => {
        setExamSession({ mode: "review", exam: clone2(exam), result: clone2(last), idx: 0 });
        render2();
      });
      actions.appendChild(reviewBtn);
    }
    const editBtn = document.createElement("button");
    editBtn.className = "btn secondary";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => openExamEditor(exam, render2));
    actions.appendChild(editBtn);
    const exportBtn = document.createElement("button");
    exportBtn.className = "btn secondary";
    exportBtn.textContent = "Export";
    exportBtn.addEventListener("click", () => {
      const ok = triggerExamDownload(exam);
      if (!ok && statusEl) {
        statusEl.textContent = "Unable to export exam.";
      } else if (ok && statusEl) {
        statusEl.textContent = "Exam exported.";
      }
    });
    actions.appendChild(exportBtn);
    const delBtn = document.createElement("button");
    delBtn.className = "btn danger";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async () => {
      const ok = await confirmModal(`Delete "${exam.examTitle}"? This will remove all attempts.`);
      if (!ok) return;
      await deleteExamSessionProgress(exam.id).catch(() => {
      });
      await deleteExam(exam.id);
      render2();
    });
    actions.appendChild(delBtn);
    card.appendChild(actions);
    const attemptsWrap = document.createElement("div");
    attemptsWrap.className = "exam-attempts";
    const attemptsHeader = document.createElement("div");
    attemptsHeader.className = "exam-attempts-header";
    const attemptsTitle = document.createElement("h3");
    attemptsTitle.textContent = "Attempts";
    attemptsHeader.appendChild(attemptsTitle);
    const expandedState = state.examAttemptExpanded[exam.id];
    const isExpanded = expandedState != null ? expandedState : true;
    if (exam.results.length) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "exam-attempt-toggle";
      toggle.textContent = isExpanded ? "Hide Attempts" : "Show Attempts";
      toggle.addEventListener("click", () => {
        setExamAttemptExpanded(exam.id, !isExpanded);
        render2();
      });
      attemptsHeader.appendChild(toggle);
    }
    attemptsWrap.appendChild(attemptsHeader);
    attemptsWrap.classList.toggle("collapsed", !isExpanded && exam.results.length > 0);
    if (!exam.results.length) {
      const none = document.createElement("p");
      none.className = "exam-attempt-empty";
      none.textContent = "No attempts yet.";
      attemptsWrap.appendChild(none);
    } else {
      const list = document.createElement("div");
      list.className = "exam-attempt-list";
      [...exam.results].sort((a, b) => b.when - a.when).forEach((result) => {
        list.appendChild(buildAttemptRow(exam, result, render2));
      });
      attemptsWrap.appendChild(list);
    }
    card.appendChild(attemptsWrap);
    return card;
  }
  function buildAttemptRow(exam, result, render2) {
    const row = document.createElement("div");
    row.className = "exam-attempt-row";
    const info = document.createElement("div");
    info.className = "exam-attempt-info";
    const title = document.createElement("div");
    title.className = "exam-attempt-score";
    title.textContent = formatScore(result);
    info.appendChild(title);
    const meta = document.createElement("div");
    meta.className = "exam-attempt-meta";
    const date = new Date(result.when).toLocaleString();
    const answeredText = `${result.answered}/${result.total} answered`;
    const flaggedText = `${result.flagged.length} flagged`;
    const durationText = result.durationMs ? formatDuration(result.durationMs) : "\u2014";
    meta.textContent = `${date} \u2022 ${answeredText} \u2022 ${flaggedText} \u2022 ${durationText}`;
    info.appendChild(meta);
    row.appendChild(info);
    const review = document.createElement("button");
    review.className = "btn secondary";
    review.textContent = "Review";
    review.addEventListener("click", () => {
      setExamSession({ mode: "review", exam: clone2(exam), result: clone2(result), idx: 0 });
      render2();
    });
    row.appendChild(review);
    return row;
  }
  function createStat(label, value) {
    const wrap = document.createElement("div");
    wrap.className = "exam-stat";
    const lbl = document.createElement("div");
    lbl.className = "exam-stat-label";
    lbl.textContent = label;
    const val = document.createElement("div");
    val.className = "exam-stat-value";
    val.textContent = value;
    wrap.appendChild(lbl);
    wrap.appendChild(val);
    return wrap;
  }
  function latestResult(exam) {
    if (!exam.results?.length) return null;
    return exam.results.reduce((acc, res) => acc == null || res.when > acc.when ? res : acc, null);
  }
  function bestResult(exam) {
    if (!exam.results?.length) return null;
    return exam.results.reduce((acc, res) => {
      const pct = res.total ? res.correct / res.total : 0;
      const bestPct = acc?.total ? acc.correct / acc.total : -1;
      if (!acc || pct > bestPct) return res;
      return acc;
    }, null);
  }
  function formatScore(result) {
    const pct = result.total ? Math.round(result.correct / result.total * 100) : 0;
    return `${result.correct}/${result.total} \u2022 ${pct}%`;
  }
  function formatDuration(ms) {
    if (!ms) return "\u2014";
    const totalSeconds = Math.max(0, Math.round(ms / 1e3));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor(totalSeconds % 3600 / 60);
    const seconds = totalSeconds % 60;
    const parts = [];
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);
    return parts.join(" ");
  }
  function optionText(question, id) {
    return question.options.find((opt) => opt.id === id)?.text || "";
  }
  function mediaElement(source) {
    if (!source) return null;
    const wrap = document.createElement("div");
    wrap.className = "exam-media";
    const lower = source.toLowerCase();
    if (lower.startsWith("data:video") || /\.(mp4|webm|ogg)$/i.test(lower)) {
      const video = document.createElement("video");
      video.controls = true;
      video.src = source;
      wrap.appendChild(video);
    } else if (lower.startsWith("data:audio") || /\.(mp3|wav|ogg)$/i.test(lower)) {
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.src = source;
      wrap.appendChild(audio);
    } else {
      const img = document.createElement("img");
      img.src = source;
      img.alt = "Question media";
      wrap.appendChild(img);
    }
    return wrap;
  }
  function answerClass(question, selectedId, optionId) {
    const isCorrect = optionId === question.answer;
    if (selectedId == null) return isCorrect ? "correct-answer" : "";
    if (selectedId === optionId) {
      return selectedId === question.answer ? "correct-answer" : "incorrect-answer";
    }
    return isCorrect ? "correct-answer" : "";
  }
  function renderPalette(sidebar, sess, render2) {
    const palette = document.createElement("div");
    palette.className = "exam-palette";
    const title = document.createElement("h3");
    title.textContent = "Question Map";
    palette.appendChild(title);
    const grid = document.createElement("div");
    grid.className = "exam-palette-grid";
    const answers = sess.mode === "review" ? sess.result.answers || {} : sess.answers || {};
    const flaggedSet = new Set(sess.mode === "review" ? sess.result.flagged || [] : Object.entries(sess.flagged || {}).filter(([_, v]) => v).map(([idx]) => Number(idx)));
    sess.exam.questions.forEach((question, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = String(idx + 1);
      btn.className = "palette-button";
      setToggleState(btn, sess.idx === idx);
      const answer = answers[idx];
      const hasAnswer = question.options.some((opt) => opt.id === answer);
      if (hasAnswer) {
        btn.classList.add("answered");
        if (sess.mode === "review") {
          btn.classList.add(answer === question.answer ? "correct" : "incorrect");
        }
      }
      if (flaggedSet.has(idx)) btn.classList.add("flagged");
      btn.addEventListener("click", () => {
        sess.idx = idx;
        render2();
      });
      grid.appendChild(btn);
    });
    palette.appendChild(grid);
    sidebar.appendChild(palette);
  }
  function renderExamRunner(root, render2) {
    const sess = state.examSession;
    if (!sess) {
      teardownKeyboardNavigation();
      return;
    }
    root.innerHTML = "";
    root.className = "exam-session";
    if (sess.mode === "summary") {
      teardownKeyboardNavigation();
      renderSummary(root, render2, sess);
      return;
    }
    setupKeyboardNavigation(sess, render2);
    if (!sess.answers) sess.answers = {};
    if (!sess.flagged) sess.flagged = {};
    if (!sess.checked) sess.checked = {};
    if (typeof sess.elapsedMs !== "number") sess.elapsedMs = 0;
    if (sess.exam.timerMode === "timed" && typeof sess.remainingMs !== "number") {
      sess.remainingMs = totalExamTimeMs(sess.exam);
    }
    if (!sess.startedAt) sess.startedAt = Date.now();
    const questionCount = sess.exam.questions.length;
    if (!questionCount) {
      const empty = document.createElement("div");
      empty.className = "exam-empty";
      empty.innerHTML = "<p>This exam does not contain any questions.</p>";
      const back = document.createElement("button");
      back.className = "btn";
      back.textContent = "Back to Exams";
      back.addEventListener("click", () => {
        teardownKeyboardNavigation();
        setExamSession(null);
        render2();
      });
      empty.appendChild(back);
      root.appendChild(empty);
      return;
    }
    if (sess.mode === "taking" && sess.exam.timerMode === "timed") {
      ensureTimer(sess, render2);
    }
    if (sess.idx < 0) sess.idx = 0;
    if (sess.idx >= questionCount) sess.idx = questionCount - 1;
    const container = document.createElement("div");
    container.className = "exam-runner";
    root.appendChild(container);
    const main = document.createElement("section");
    main.className = "exam-main";
    container.appendChild(main);
    const sidebar = document.createElement("aside");
    sidebar.className = "exam-sidebar";
    container.appendChild(sidebar);
    const question = sess.exam.questions[sess.idx];
    const answers = sess.mode === "review" ? sess.result.answers || {} : sess.answers || {};
    const selected = answers[sess.idx];
    const isInstantCheck = sess.mode === "taking" && sess.exam.timerMode !== "timed" && Boolean(sess.checked?.[sess.idx]);
    const showReview = sess.mode === "review" || isInstantCheck;
    const top = document.createElement("div");
    top.className = "exam-topbar";
    const progress = document.createElement("div");
    progress.className = "exam-progress";
    progress.textContent = `${sess.exam.examTitle} \u2022 Question ${sess.idx + 1} of ${questionCount}`;
    top.appendChild(progress);
    const flagBtn = document.createElement("button");
    flagBtn.type = "button";
    flagBtn.className = "flag-btn";
    const isFlagged = sess.mode === "review" ? (sess.result.flagged || []).includes(sess.idx) : Boolean(sess.flagged?.[sess.idx]);
    setToggleState(flagBtn, isFlagged);
    flagBtn.textContent = isFlagged ? "\u{1F6A9} Flagged" : "Flag question";
    if (sess.mode === "taking") {
      flagBtn.addEventListener("click", () => {
        if (!sess.flagged) sess.flagged = {};
        sess.flagged[sess.idx] = !isFlagged;
        render2();
      });
    } else {
      flagBtn.disabled = true;
    }
    top.appendChild(flagBtn);
    if (sess.mode === "taking" && sess.exam.timerMode === "timed") {
      const timerEl = document.createElement("div");
      timerEl.className = "exam-timer";
      const remainingMs = typeof sess.remainingMs === "number" ? sess.remainingMs : totalExamTimeMs(sess.exam);
      timerEl.textContent = formatCountdown(remainingMs);
      top.appendChild(timerEl);
    }
    main.appendChild(top);
    const stem = document.createElement("div");
    stem.className = "exam-stem";
    stem.textContent = question.stem || "(No prompt)";
    main.appendChild(stem);
    const media = mediaElement(question.media);
    if (media) main.appendChild(media);
    if (question.tags?.length) {
      const tagWrap = document.createElement("div");
      tagWrap.className = "exam-tags";
      question.tags.forEach((tag) => {
        const chip = document.createElement("span");
        chip.className = "exam-tag";
        chip.textContent = tag;
        tagWrap.appendChild(chip);
      });
      main.appendChild(tagWrap);
    }
    const optionsWrap = document.createElement("div");
    optionsWrap.className = "exam-options";
    if (!question.options.length) {
      const warn = document.createElement("p");
      warn.className = "exam-warning";
      warn.textContent = "This question has no answer options.";
      optionsWrap.appendChild(warn);
    }
    question.options.forEach((opt) => {
      const choice = document.createElement(sess.mode === "taking" ? "button" : "div");
      if (sess.mode === "taking") choice.type = "button";
      choice.className = "exam-option";
      if (sess.mode === "review") choice.classList.add("review");
      const indicator = document.createElement("span");
      indicator.className = "option-indicator";
      choice.appendChild(indicator);
      const label = document.createElement("span");
      label.className = "option-text";
      label.textContent = opt.text || "(Empty option)";
      choice.appendChild(label);
      const isSelected = selected === opt.id;
      if (sess.mode === "taking") {
        setToggleState(choice, isSelected, "selected");
        choice.addEventListener("click", () => {
          sess.answers[sess.idx] = opt.id;
          if (sess.exam.timerMode !== "timed" && sess.checked) {
            delete sess.checked[sess.idx];
          }
          render2();
        });
        if (isInstantCheck) {
          const cls = answerClass(question, selected, opt.id);
          if (cls) choice.classList.add(cls);
          if (isSelected) choice.classList.add("chosen");
        }
      } else {
        const cls = answerClass(question, selected, opt.id);
        if (cls) choice.classList.add(cls);
        if (isSelected) choice.classList.add("chosen");
      }
      optionsWrap.appendChild(choice);
    });
    main.appendChild(optionsWrap);
    if (showReview) {
      const verdict = document.createElement("div");
      verdict.className = "exam-verdict";
      let verdictText = "Not answered";
      let verdictClass = "neutral";
      if (selected != null) {
        if (selected === question.answer) {
          verdictText = "Correct";
          verdictClass = "correct";
        } else {
          verdictText = "Incorrect";
          verdictClass = "incorrect";
        }
      }
      verdict.classList.add(verdictClass);
      verdict.textContent = sess.mode === "review" ? verdictText : `Checked: ${verdictText}`;
      main.appendChild(verdict);
      const answerSummary = document.createElement("div");
      answerSummary.className = "exam-answer-summary";
      const your = optionText(question, selected);
      const correct = optionText(question, question.answer);
      answerSummary.innerHTML = `<div><strong>Your answer:</strong> ${your || "\u2014"}</div><div><strong>Correct answer:</strong> ${correct || "\u2014"}</div>`;
      main.appendChild(answerSummary);
      if (question.explanation) {
        const explain = document.createElement("div");
        explain.className = "exam-explanation";
        const title = document.createElement("h3");
        title.textContent = "Explanation";
        const body = document.createElement("p");
        body.textContent = question.explanation;
        explain.appendChild(title);
        explain.appendChild(body);
        main.appendChild(explain);
      }
    }
    renderPalette(sidebar, sess, render2);
    renderSidebarMeta(sidebar, sess);
    const nav = document.createElement("div");
    nav.className = "exam-nav";
    const prev = document.createElement("button");
    prev.className = "btn secondary";
    prev.textContent = "Previous";
    prev.disabled = sess.idx === 0;
    prev.addEventListener("click", () => {
      if (sess.idx > 0) {
        sess.idx -= 1;
        render2();
      }
    });
    nav.appendChild(prev);
    if (sess.mode === "taking") {
      const saveBtn = document.createElement("button");
      saveBtn.className = "btn secondary";
      saveBtn.textContent = "Save & Exit";
      saveBtn.addEventListener("click", async () => {
        await saveProgressAndExit(sess, render2);
      });
      nav.appendChild(saveBtn);
      if (sess.exam.timerMode !== "timed") {
        const checkBtn = document.createElement("button");
        checkBtn.className = "btn secondary";
        checkBtn.textContent = isInstantCheck ? "Hide Check" : "Check Answer";
        checkBtn.disabled = question.options.length === 0;
        checkBtn.addEventListener("click", () => {
          if (!sess.checked) sess.checked = {};
          if (isInstantCheck) {
            delete sess.checked[sess.idx];
          } else {
            sess.checked[sess.idx] = true;
          }
          render2();
        });
        nav.appendChild(checkBtn);
      }
      const nextBtn = document.createElement("button");
      nextBtn.className = "btn secondary";
      nextBtn.textContent = "Next Question";
      nextBtn.disabled = sess.idx >= questionCount - 1;
      nextBtn.addEventListener("click", () => {
        if (sess.idx < questionCount - 1) {
          sess.idx += 1;
          render2();
        }
      });
      nav.appendChild(nextBtn);
      const submit = document.createElement("button");
      submit.className = "btn";
      submit.textContent = "Submit Exam";
      submit.addEventListener("click", async () => {
        await finalizeExam(sess, render2);
      });
      nav.appendChild(submit);
    } else {
      const nextBtn = document.createElement("button");
      nextBtn.className = "btn secondary";
      nextBtn.textContent = "Next";
      nextBtn.disabled = sess.idx >= questionCount - 1;
      nextBtn.addEventListener("click", () => {
        if (sess.idx < questionCount - 1) {
          sess.idx += 1;
          render2();
        }
      });
      nav.appendChild(nextBtn);
      const exit = document.createElement("button");
      exit.className = "btn";
      if (sess.fromSummary) {
        exit.textContent = "Back to Summary";
        exit.addEventListener("click", () => {
          setExamSession({ mode: "summary", exam: sess.exam, latestResult: sess.fromSummary });
          render2();
        });
      } else {
        exit.textContent = "Back to Exams";
        exit.addEventListener("click", () => {
          teardownKeyboardNavigation();
          setExamSession(null);
          render2();
        });
      }
      nav.appendChild(exit);
    }
    root.appendChild(nav);
  }
  function renderSidebarMeta(sidebar, sess) {
    const info = document.createElement("div");
    info.className = "exam-sidebar-info";
    const attempts = document.createElement("div");
    attempts.innerHTML = `<strong>Attempts:</strong> ${sess.exam.results?.length || 0}`;
    info.appendChild(attempts);
    if (sess.mode === "review" && sess.result.durationMs) {
      const duration = document.createElement("div");
      duration.innerHTML = `<strong>Duration:</strong> ${formatDuration(sess.result.durationMs)}`;
      info.appendChild(duration);
    } else if (sess.mode === "taking") {
      if (sess.exam.timerMode === "timed") {
        const remaining = typeof sess.remainingMs === "number" ? sess.remainingMs : totalExamTimeMs(sess.exam);
        const timer = document.createElement("div");
        timer.innerHTML = `<strong>Time Remaining:</strong> ${formatCountdown(remaining)}`;
        info.appendChild(timer);
        const pace = document.createElement("div");
        pace.innerHTML = `<strong>Pace:</strong> ${sess.exam.secondsPerQuestion}s/question`;
        info.appendChild(pace);
      } else {
        const timerMode = document.createElement("div");
        timerMode.innerHTML = "<strong>Timer:</strong> Untimed";
        info.appendChild(timerMode);
        const elapsed = document.createElement("div");
        elapsed.innerHTML = `<strong>Elapsed:</strong> ${formatDuration(currentElapsedMs(sess))}`;
        info.appendChild(elapsed);
      }
    }
    sidebar.appendChild(info);
  }
  async function saveProgressAndExit(sess, render2) {
    stopTimer(sess);
    const payload = {
      examId: sess.exam.id,
      exam: clone2(sess.exam),
      idx: sess.idx,
      answers: { ...sess.answers || {} },
      flagged: { ...sess.flagged || {} },
      checked: { ...sess.checked || {} },
      remainingMs: typeof sess.remainingMs === "number" ? Math.max(0, sess.remainingMs) : null,
      elapsedMs: sess.elapsedMs || 0,
      mode: "taking"
    };
    await saveExamSessionProgress(payload);
    lastExamStatusMessage = "Attempt saved. You can resume later.";
    teardownKeyboardNavigation();
    setExamSession(null);
    render2();
  }
  async function finalizeExam(sess, render2, options = {}) {
    const isAuto = Boolean(options.autoSubmit);
    stopTimer(sess);
    const unanswered = sess.exam.questions.filter((_, idx) => sess.answers[idx] == null);
    if (!isAuto && unanswered.length) {
      const confirm2 = await confirmModal(`You have ${unanswered.length} unanswered question${unanswered.length === 1 ? "" : "s"}. Submit anyway?`);
      if (!confirm2) return;
    }
    const answers = {};
    let correct = 0;
    let answeredCount = 0;
    sess.exam.questions.forEach((question, idx) => {
      const ans = sess.answers[idx];
      if (ans != null) {
        answers[idx] = ans;
        answeredCount += 1;
        if (ans === question.answer) correct += 1;
      }
    });
    const flagged = Object.entries(sess.flagged || {}).filter(([_, val]) => Boolean(val)).map(([idx]) => Number(idx));
    const result = {
      id: uid(),
      when: Date.now(),
      correct,
      total: sess.exam.questions.length,
      answers,
      flagged,
      durationMs: sess.elapsedMs || 0,
      answered: answeredCount
    };
    const updatedExam = clone2(sess.exam);
    updatedExam.results = [...updatedExam.results || [], result];
    updatedExam.updatedAt = Date.now();
    await upsertExam(updatedExam);
    await deleteExamSessionProgress(updatedExam.id).catch(() => {
    });
    if (isAuto) {
      lastExamStatusMessage = "Time expired. Attempt submitted automatically.";
    }
    teardownKeyboardNavigation();
    setExamSession({ mode: "summary", exam: updatedExam, latestResult: result });
    render2();
  }
  function renderSummary(root, render2, sess) {
    const wrap = document.createElement("div");
    wrap.className = "exam-summary";
    const title = document.createElement("h2");
    title.textContent = `${sess.exam.examTitle} \u2014 Results`;
    wrap.appendChild(title);
    const score = document.createElement("div");
    score.className = "exam-summary-score";
    const pct = sess.latestResult.total ? Math.round(sess.latestResult.correct / sess.latestResult.total * 100) : 0;
    score.innerHTML = `<span class="score-number">${sess.latestResult.correct}/${sess.latestResult.total}</span><span class="score-percent">${pct}%</span>`;
    wrap.appendChild(score);
    const metrics = document.createElement("div");
    metrics.className = "exam-summary-metrics";
    metrics.appendChild(createStat("Answered", `${sess.latestResult.answered}/${sess.latestResult.total}`));
    metrics.appendChild(createStat("Flagged", String(sess.latestResult.flagged.length)));
    metrics.appendChild(createStat("Duration", formatDuration(sess.latestResult.durationMs)));
    wrap.appendChild(metrics);
    const actions = document.createElement("div");
    actions.className = "exam-summary-actions";
    const reviewBtn = document.createElement("button");
    reviewBtn.className = "btn";
    reviewBtn.textContent = "Review Attempt";
    reviewBtn.addEventListener("click", () => {
      setExamSession({
        mode: "review",
        exam: clone2(sess.exam),
        result: clone2(sess.latestResult),
        idx: 0,
        fromSummary: clone2(sess.latestResult)
      });
      render2();
    });
    actions.appendChild(reviewBtn);
    const retake = document.createElement("button");
    retake.className = "btn secondary";
    retake.textContent = "Retake Exam";
    retake.addEventListener("click", () => {
      setExamSession(createTakingSession(sess.exam));
      render2();
    });
    actions.appendChild(retake);
    const exit = document.createElement("button");
    exit.className = "btn";
    exit.textContent = "Back to Exams";
    exit.addEventListener("click", () => {
      setExamSession(null);
      render2();
    });
    actions.appendChild(exit);
    wrap.appendChild(actions);
    root.appendChild(wrap);
  }
  function openExamEditor(existing, render2) {
    const overlay = document.createElement("div");
    overlay.className = "modal";
    const form = document.createElement("form");
    form.className = "card modal-form exam-editor";
    const { exam } = ensureExamShape(existing || {
      id: uid(),
      examTitle: "New Exam",
      timerMode: "untimed",
      secondsPerQuestion: DEFAULT_SECONDS,
      questions: [],
      results: []
    });
    const heading = document.createElement("h2");
    heading.textContent = existing ? "Edit Exam" : "Create Exam";
    form.appendChild(heading);
    const error = document.createElement("div");
    error.className = "exam-error";
    form.appendChild(error);
    const titleLabel = document.createElement("label");
    titleLabel.textContent = "Title";
    const titleInput = document.createElement("input");
    titleInput.className = "input";
    titleInput.value = exam.examTitle;
    titleInput.addEventListener("input", () => {
      exam.examTitle = titleInput.value;
    });
    titleLabel.appendChild(titleInput);
    form.appendChild(titleLabel);
    const timerRow = document.createElement("div");
    timerRow.className = "exam-timer-row";
    const modeLabel = document.createElement("label");
    modeLabel.textContent = "Timer Mode";
    const modeSelect = document.createElement("select");
    modeSelect.className = "input";
    ["untimed", "timed"].forEach((mode) => {
      const opt = document.createElement("option");
      opt.value = mode;
      opt.textContent = mode === "timed" ? "Timed" : "Untimed";
      modeSelect.appendChild(opt);
    });
    modeSelect.value = exam.timerMode;
    modeSelect.addEventListener("change", () => {
      exam.timerMode = modeSelect.value;
      secondsLabel.style.display = exam.timerMode === "timed" ? "flex" : "none";
    });
    modeLabel.appendChild(modeSelect);
    timerRow.appendChild(modeLabel);
    const secondsLabel = document.createElement("label");
    secondsLabel.textContent = "Seconds per question";
    const secondsInput = document.createElement("input");
    secondsInput.type = "number";
    secondsInput.min = "10";
    secondsInput.className = "input";
    secondsInput.value = String(exam.secondsPerQuestion);
    secondsInput.addEventListener("input", () => {
      const val = Number(secondsInput.value);
      if (!Number.isNaN(val) && val > 0) exam.secondsPerQuestion = val;
    });
    secondsLabel.appendChild(secondsInput);
    secondsLabel.style.display = exam.timerMode === "timed" ? "flex" : "none";
    timerRow.appendChild(secondsLabel);
    form.appendChild(timerRow);
    const questionSection = document.createElement("div");
    questionSection.className = "exam-question-section";
    form.appendChild(questionSection);
    const questionsHeader = document.createElement("div");
    questionsHeader.className = "exam-question-header";
    const qTitle = document.createElement("h3");
    qTitle.textContent = "Questions";
    const addQuestion = document.createElement("button");
    addQuestion.type = "button";
    addQuestion.className = "btn secondary";
    addQuestion.textContent = "Add Question";
    addQuestion.addEventListener("click", () => {
      exam.questions.push(createBlankQuestion());
      renderQuestions();
    });
    questionsHeader.appendChild(qTitle);
    questionsHeader.appendChild(addQuestion);
    form.appendChild(questionsHeader);
    function renderQuestions() {
      questionSection.innerHTML = "";
      if (!exam.questions.length) {
        const empty = document.createElement("p");
        empty.className = "exam-question-empty";
        empty.textContent = "No questions yet. Add your first question to get started.";
        questionSection.appendChild(empty);
        return;
      }
      exam.questions.forEach((question, idx) => {
        const card = document.createElement("div");
        card.className = "exam-question-editor";
        const header = document.createElement("div");
        header.className = "exam-question-editor-header";
        const title = document.createElement("h4");
        title.textContent = `Question ${idx + 1}`;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "ghost-btn";
        remove.textContent = "Remove";
        remove.addEventListener("click", () => {
          exam.questions.splice(idx, 1);
          renderQuestions();
        });
        header.appendChild(title);
        header.appendChild(remove);
        card.appendChild(header);
        const stemLabel = document.createElement("label");
        stemLabel.textContent = "Prompt";
        const stemInput = document.createElement("textarea");
        stemInput.className = "input";
        stemInput.value = question.stem;
        stemInput.addEventListener("input", () => {
          question.stem = stemInput.value;
        });
        stemLabel.appendChild(stemInput);
        card.appendChild(stemLabel);
        const mediaLabel = document.createElement("label");
        mediaLabel.textContent = "Media (URL or upload)";
        const mediaInput = document.createElement("input");
        mediaInput.className = "input";
        mediaInput.placeholder = "https://example.com/image.png";
        mediaInput.value = question.media || "";
        mediaInput.addEventListener("input", () => {
          question.media = mediaInput.value.trim();
          updatePreview();
        });
        mediaLabel.appendChild(mediaInput);
        const mediaUpload = document.createElement("input");
        mediaUpload.type = "file";
        mediaUpload.accept = "image/*,video/*,audio/*";
        mediaUpload.addEventListener("change", () => {
          const file = mediaUpload.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            question.media = typeof reader.result === "string" ? reader.result : "";
            mediaInput.value = question.media;
            updatePreview();
          };
          reader.readAsDataURL(file);
        });
        mediaLabel.appendChild(mediaUpload);
        const clearMedia = document.createElement("button");
        clearMedia.type = "button";
        clearMedia.className = "ghost-btn";
        clearMedia.textContent = "Remove media";
        clearMedia.addEventListener("click", () => {
          question.media = "";
          mediaInput.value = "";
          mediaUpload.value = "";
          updatePreview();
        });
        mediaLabel.appendChild(clearMedia);
        card.appendChild(mediaLabel);
        const preview = document.createElement("div");
        preview.className = "exam-media-preview";
        function updatePreview() {
          preview.innerHTML = "";
          const el = mediaElement(question.media);
          if (el) preview.appendChild(el);
        }
        updatePreview();
        card.appendChild(preview);
        const tagsLabel = document.createElement("label");
        tagsLabel.textContent = "Tags (comma separated)";
        const tagsInput = document.createElement("input");
        tagsInput.className = "input";
        tagsInput.value = question.tags.join(", ");
        tagsInput.addEventListener("input", () => {
          question.tags = tagsInput.value.split(",").map((t) => t.trim()).filter(Boolean);
        });
        tagsLabel.appendChild(tagsInput);
        card.appendChild(tagsLabel);
        const explanationLabel = document.createElement("label");
        explanationLabel.textContent = "Explanation";
        const explanationInput = document.createElement("textarea");
        explanationInput.className = "input";
        explanationInput.value = question.explanation || "";
        explanationInput.addEventListener("input", () => {
          question.explanation = explanationInput.value;
        });
        explanationLabel.appendChild(explanationInput);
        card.appendChild(explanationLabel);
        const optionsWrap = document.createElement("div");
        optionsWrap.className = "exam-option-editor-list";
        function renderOptions() {
          optionsWrap.innerHTML = "";
          question.options.forEach((opt, optIdx) => {
            const row = document.createElement("div");
            row.className = "exam-option-editor";
            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = `correct-${question.id}`;
            radio.checked = question.answer === opt.id;
            radio.addEventListener("change", () => {
              question.answer = opt.id;
            });
            const text = document.createElement("input");
            text.className = "input";
            text.type = "text";
            text.placeholder = `Option ${optIdx + 1}`;
            text.value = opt.text;
            text.addEventListener("input", () => {
              opt.text = text.value;
            });
            const removeBtn = document.createElement("button");
            removeBtn.type = "button";
            removeBtn.className = "ghost-btn";
            removeBtn.textContent = "Remove";
            removeBtn.disabled = question.options.length <= 2;
            removeBtn.addEventListener("click", () => {
              question.options.splice(optIdx, 1);
              if (question.answer === opt.id) {
                question.answer = question.options[0]?.id || "";
              }
              renderOptions();
            });
            row.appendChild(radio);
            row.appendChild(text);
            row.appendChild(removeBtn);
            optionsWrap.appendChild(row);
          });
        }
        renderOptions();
        const addOption = document.createElement("button");
        addOption.type = "button";
        addOption.className = "btn secondary";
        addOption.textContent = "Add Option";
        addOption.addEventListener("click", () => {
          const opt = { id: uid(), text: "" };
          question.options.push(opt);
          renderOptions();
        });
        card.appendChild(optionsWrap);
        card.appendChild(addOption);
        questionSection.appendChild(card);
      });
    }
    renderQuestions();
    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn secondary";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => document.body.removeChild(overlay));
    actions.appendChild(cancel);
    const save = document.createElement("button");
    save.type = "submit";
    save.className = "btn";
    save.textContent = "Save Exam";
    actions.appendChild(save);
    form.appendChild(actions);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      error.textContent = "";
      const title = titleInput.value.trim();
      if (!title) {
        error.textContent = "Exam title is required.";
        return;
      }
      if (!exam.questions.length) {
        error.textContent = "Add at least one question.";
        return;
      }
      for (let i = 0; i < exam.questions.length; i++) {
        const question = exam.questions[i];
        question.stem = question.stem.trim();
        question.explanation = question.explanation?.trim() || "";
        question.media = question.media?.trim() || "";
        question.options = question.options.map((opt) => ({ id: opt.id, text: opt.text.trim() })).filter((opt) => opt.text);
        if (question.options.length < 2) {
          error.textContent = `Question ${i + 1} needs at least two answer options.`;
          return;
        }
        if (!question.answer || !question.options.some((opt) => opt.id === question.answer)) {
          error.textContent = `Select a correct answer for question ${i + 1}.`;
          return;
        }
        question.tags = question.tags.map((t) => t.trim()).filter(Boolean);
      }
      const payload = {
        ...exam,
        examTitle: title,
        updatedAt: Date.now()
      };
      await upsertExam(payload);
      document.body.removeChild(overlay);
      render2();
    });
    overlay.appendChild(form);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) document.body.removeChild(overlay);
    });
    document.body.appendChild(overlay);
    titleInput.focus();
  }

  // js/ui/components/popup.js
  var fieldDefs2 = {
    disease: [
      ["etiology", "Etiology"],
      ["pathophys", "Pathophys"],
      ["clinical", "Clinical"],
      ["diagnosis", "Diagnosis"],
      ["treatment", "Treatment"],
      ["complications", "Complications"],
      ["mnemonic", "Mnemonic"]
    ],
    drug: [
      ["class", "Class"],
      ["source", "Source"],
      ["moa", "MOA"],
      ["uses", "Uses"],
      ["sideEffects", "Side Effects"],
      ["contraindications", "Contraindications"],
      ["mnemonic", "Mnemonic"]
    ],
    concept: [
      ["type", "Type"],
      ["definition", "Definition"],
      ["mechanism", "Mechanism"],
      ["clinicalRelevance", "Clinical Relevance"],
      ["example", "Example"],
      ["mnemonic", "Mnemonic"]
    ]
  };
  function escapeHtml6(str = "") {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function collectExtras(item) {
    if (Array.isArray(item.extras) && item.extras.length) return item.extras;
    if (item.facts && item.facts.length) {
      return [{
        id: "legacy-facts",
        title: "Highlights",
        body: `<ul>${item.facts.map((f) => `<li>${escapeHtml6(f)}</li>`).join("")}</ul>`
      }];
    }
    return [];
  }
  function showPopup(item, options = {}) {
    const { onEdit } = options;
    const modal = document.createElement("div");
    modal.className = "modal";
    const card = document.createElement("div");
    card.className = "card";
    const kindColors2 = { disease: "var(--purple)", drug: "var(--blue)", concept: "var(--green)" };
    card.style.borderTop = `3px solid ${item.color || kindColors2[item.kind] || "var(--gray)"}`;
    const title = document.createElement("h2");
    title.textContent = item.name || item.concept || "Item";
    card.appendChild(title);
    const defs = fieldDefs2[item.kind] || [];
    defs.forEach(([field, label]) => {
      const val = item[field];
      if (!val) return;
      const sec = document.createElement("div");
      sec.className = "section";
      const tl = document.createElement("div");
      tl.className = "section-title";
      tl.textContent = label;
      sec.appendChild(tl);
      const txt = document.createElement("div");
      renderRichText(txt, val);
      sec.appendChild(txt);
      card.appendChild(sec);
    });
    const extras = collectExtras(item);
    extras.forEach((extra) => {
      if (!extra || !extra.body) return;
      const sec = document.createElement("div");
      sec.className = "section section--extra";
      const tl = document.createElement("div");
      tl.className = "section-title";
      tl.textContent = extra.title || "Additional Section";
      sec.appendChild(tl);
      const txt = document.createElement("div");
      renderRichText(txt, extra.body);
      sec.appendChild(txt);
      card.appendChild(sec);
    });
    const actions = document.createElement("div");
    actions.className = "modal-actions";
    if (typeof onEdit === "function") {
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "btn secondary";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", () => {
        modal.remove();
        onEdit();
      });
      actions.appendChild(editBtn);
    }
    const close = document.createElement("button");
    close.type = "button";
    close.className = "btn";
    close.textContent = "Close";
    close.addEventListener("click", () => modal.remove());
    actions.appendChild(close);
    card.appendChild(actions);
    modal.appendChild(card);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.remove();
    });
    document.body.appendChild(modal);
  }

  // js/ui/components/map.js
  var TOOL = {
    NAVIGATE: "navigate",
    HIDE: "hide",
    BREAK: "break-link",
    ADD_LINK: "add-link",
    AREA: "area"
  };
  function createCursor(svg, hotX = 8, hotY = 8) {
    const encoded = encodeURIComponent(svg.trim()).replace(/%0A/g, "").replace(/%20/g, " ");
    return `url("data:image/svg+xml,${encoded}") ${hotX} ${hotY}, pointer`;
  }
  var CURSOR_STYLE = {
    hide: createCursor(
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M6 19.5l9-9a3 3 0 0 1 4.24 0l6.5 6.5a3 3 0 0 1 0 4.24l-9 9H9a3 3 0 0 1-3-3z" fill="#f97316" /><path d="M8.2 21.2l8.6 8.6" stroke="#fed7aa" stroke-width="3" stroke-linecap="round" /><path d="M11.3 24.5l4 4" stroke="#fff7ed" stroke-width="2" stroke-linecap="round" /></svg>',
      7,
      26
    ),
    break: createCursor(
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="11" cy="11" r="4" fill="none" stroke="#f97316" stroke-width="2.2" /><circle cx="11" cy="21" r="4" fill="none" stroke="#f97316" stroke-width="2.2" /><path d="M14.5 13L24 3.5" stroke="#fbbf24" stroke-width="2.6" stroke-linecap="round" /><path d="M14.5 19L24 28.5" stroke="#fbbf24" stroke-width="2.6" stroke-linecap="round" /><path d="M6 6l7 7" stroke="#f97316" stroke-width="2.2" stroke-linecap="round" /><path d="M6 26l7-7" stroke="#f97316" stroke-width="2.2" stroke-linecap="round" /></svg>',
      18,
      18
    ),
    link: createCursor(
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M12 11h5a4.5 4.5 0 0 1 0 9h-3" fill="none" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /><path d="M14 15h-4a4.5 4.5 0 0 0 0 9h5" fill="none" stroke="#38bdf8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /><path d="M13 19h6" stroke="#bae6fd" stroke-width="2" stroke-linecap="round" /></svg>',
      9,
      23
    )
  };
  var ICONS = {
    sliders: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 7h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /><path d="M6 12h8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /><path d="M6 17h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /><circle cx="16" cy="7" r="2.5" stroke="currentColor" stroke-width="1.6" /><circle cx="11" cy="12" r="2.5" stroke="currentColor" stroke-width="1.6" /><circle cx="19" cy="17" r="2.5" stroke="currentColor" stroke-width="1.6" /></svg>',
    close: '<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>',
    plus: '<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" stroke="currentColor" stroke-width="1.6" /><path d="M4.5 12.5l1.8.52c.26.08.46.28.54.54l.52 1.8a.9.9 0 0 0 1.47.41l1.43-1.08a.9.9 0 0 1 .99-.07l1.63.82a.9.9 0 0 0 1.22-.41l.73-1.66a.9.9 0 0 1 .73-.52l1.88-.2a.9.9 0 0 0 .78-1.07l-.39-1.85a.9.9 0 0 1 .25-.83l1.29-1.29a.9.9 0 0 0-.01-1.27l-1.29-1.29a.9.9 0 0 0-.83-.25l-1.85.39a.9.9 0 0 1-1.07-.78l-.2-1.88A.9.9 0 0 0 13.3 2h-2.6a.9.9 0 0 0-.9.78l-.2 1.88a.9.9 0 0 1-1.07.78l-1.85-.39a.9.9 0 0 0-.83.25L4.56 6.59a.9.9 0 0 0-.01 1.27l1.29 1.29c.22.22.31.54.25.83l-.39 1.85a.9.9 0 0 0 .7 1.07z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" /></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 7h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /><path d="M9 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /><path d="M18 7v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /><path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>'
  };
  var DEFAULT_LINK_COLOR = "#888888";
  var DEFAULT_LINE_STYLE = "solid";
  var DEFAULT_LINE_THICKNESS = "regular";
  var LINE_STYLE_OPTIONS = [
    { value: "solid", label: "Solid" },
    { value: "dashed", label: "Dashed" },
    { value: "dotted", label: "Dotted" },
    { value: "arrow-end", label: "Arrow \u2192" },
    { value: "arrow-start", label: "Arrow \u2190" },
    { value: "arrow-both", label: "Double arrow \u2194" },
    { value: "glow", label: "Glow highlight" },
    { value: "blocked", label: "Blocked \u2715" }
  ];
  var LINE_STYLE_VALUE_SET = new Set(LINE_STYLE_OPTIONS.map((option) => option.value));
  var LINE_THICKNESS_VALUES = {
    thin: 2,
    regular: 4,
    bold: 7
  };
  var LINE_THICKNESS_OPTIONS = [
    { value: "thin", label: "Thin" },
    { value: "regular", label: "Regular" },
    { value: "bold", label: "Bold" }
  ];
  var mapState = {
    tool: TOOL.NAVIGATE,
    selectionIds: [],
    previewSelection: null,
    pendingLink: null,
    hiddenMenuTab: "nodes",
    panelVisible: true,
    menuPinned: false,
    listenersAttached: false,
    draggingView: false,
    nodeDrag: null,
    areaDrag: null,
    menuDrag: null,
    selectionRect: null,
    nodeWasDragged: false,
    viewBox: null,
    svg: null,
    g: null,
    positions: {},
    itemMap: {},
    elements: /* @__PURE__ */ new Map(),
    root: null,
    container: null,
    updateViewBox: () => {
    },
    selectionBox: null,
    sizeLimit: 2e3,
    minView: 100,
    lastPointer: { x: 0, y: 0 },
    autoPan: null,
    autoPanFrame: null,
    toolboxPos: { x: 16, y: 16 },
    toolboxDrag: null,
    toolboxEl: null,
    toolboxContainer: null,
    baseCursor: "grab",
    cursorOverride: null,
    defaultViewSize: null,
    justCompletedSelection: false,
    edgeTooltip: null,
    hoveredEdge: null,
    hoveredEdgePointer: { x: 0, y: 0 },
    currentScales: { nodeScale: 1, labelScale: 1, lineScale: 1 },
    suppressNextClick: false,
    mapConfig: null,
    mapConfigLoaded: false,
    blocks: [],
    visibleItems: [],
    searchValue: "",
    searchFeedback: null,
    searchInput: null,
    searchFeedbackEl: null,
    paletteSearch: ""
  };
  function normalizeMapTab(tab = {}) {
    const filter = tab.filter && typeof tab.filter === "object" ? tab.filter : {};
    const layout = {};
    if (tab.layout && typeof tab.layout === "object") {
      Object.entries(tab.layout).forEach(([id, pos]) => {
        if (!id || !pos || typeof pos !== "object") return;
        const x = Number(pos.x);
        const y = Number(pos.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        layout[id] = { x, y };
      });
    }
    const normalized2 = {
      id: tab.id || uid(),
      name: tab.name || "Untitled map",
      includeLinked: tab.includeLinked !== false,
      manualMode: Boolean(tab.manualMode),
      manualIds: Array.isArray(tab.manualIds) ? Array.from(new Set(tab.manualIds.filter(Boolean))) : [],
      layout,
      layoutSeeded: tab.layoutSeeded === true,
      filter: {
        blockId: filter.blockId || "",
        week: Number.isFinite(filter.week) ? filter.week : typeof filter.week === "string" && filter.week.trim() ? Number(filter.week) : "",
        lectureKey: filter.lectureKey || ""
      }
    };
    if (!Number.isFinite(normalized2.filter.week)) {
      normalized2.filter.week = "";
    }
    return normalized2;
  }
  function normalizeMapConfig(config = null) {
    const base = config && typeof config === "object" ? { ...config } : {};
    const tabs2 = Array.isArray(base.tabs) ? base.tabs.map(normalizeMapTab) : [normalizeMapTab({ id: "default", name: "All concepts", includeLinked: true, layoutSeeded: true })];
    const ids = /* @__PURE__ */ new Set();
    const deduped = [];
    tabs2.forEach((tab) => {
      if (ids.has(tab.id)) {
        const clone3 = { ...tab, id: uid() };
        ids.add(clone3.id);
        deduped.push(clone3);
      } else {
        ids.add(tab.id);
        deduped.push(tab);
      }
    });
    const active = deduped.find((tab) => tab.id === base.activeTabId) || deduped[0];
    return {
      activeTabId: active.id,
      tabs: deduped
    };
  }
  function ensureTabLayout(tab) {
    if (!tab) return {};
    if (!tab.layout || typeof tab.layout !== "object") {
      tab.layout = {};
    }
    return tab.layout;
  }
  async function ensureMapConfig() {
    if (mapState.mapConfigLoaded && mapState.mapConfig) {
      return mapState.mapConfig;
    }
    const raw = await getMapConfig();
    const normalized2 = normalizeMapConfig(raw);
    mapState.mapConfig = normalized2;
    mapState.mapConfigLoaded = true;
    if (JSON.stringify(raw) !== JSON.stringify(normalized2)) {
      await saveMapConfig(normalized2);
    }
    return normalized2;
  }
  async function persistMapConfig() {
    if (!mapState.mapConfig) return;
    const snapshot = JSON.parse(JSON.stringify(mapState.mapConfig));
    await saveMapConfig(snapshot);
  }
  function getActiveTab() {
    const config = mapState.mapConfig;
    if (!config) return null;
    return config.tabs.find((tab) => tab.id === config.activeTabId) || config.tabs[0] || null;
  }
  async function setActiveTab(tabId) {
    const config = mapState.mapConfig;
    if (!config) return;
    const tab = config.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    config.activeTabId = tab.id;
    mapState.searchValue = "";
    mapState.searchFeedback = null;
    mapState.paletteSearch = "";
    mapState.selectionIds = [];
    mapState.previewSelection = null;
    mapState.pendingLink = null;
    await persistMapConfig();
    await renderMap(mapState.root);
  }
  async function createMapTab() {
    const config = mapState.mapConfig || normalizeMapConfig(null);
    const count = config.tabs.length + 1;
    const tab = normalizeMapTab({
      id: uid(),
      name: `Map ${count}`,
      includeLinked: true,
      manualMode: false,
      manualIds: [],
      layoutSeeded: true,
      filter: { blockId: "", week: "", lectureKey: "" }
    });
    config.tabs.push(tab);
    config.activeTabId = tab.id;
    mapState.mapConfig = config;
    mapState.searchValue = "";
    mapState.searchFeedback = null;
    await persistMapConfig();
    await renderMap(mapState.root);
  }
  async function deleteActiveTab() {
    const config = mapState.mapConfig;
    if (!config) return;
    if (config.tabs.length <= 1) {
      alert("At least one map tab is required.");
      return;
    }
    const tab = getActiveTab();
    if (!tab) return;
    const confirmed = confirm(`Delete map \u201C${tab.name}\u201D?`);
    if (!confirmed) return;
    config.tabs = config.tabs.filter((t) => t.id !== tab.id);
    config.activeTabId = config.tabs[0]?.id || "";
    mapState.searchValue = "";
    mapState.searchFeedback = null;
    await persistMapConfig();
    await renderMap(mapState.root);
  }
  function updateSearchFeedback(message, type = "") {
    if (message) {
      mapState.searchFeedback = { message, type };
    } else {
      mapState.searchFeedback = null;
    }
    applyStoredSearchFeedback();
  }
  function applyStoredSearchFeedback() {
    const el = mapState.searchFeedbackEl;
    if (!el) return;
    const info = mapState.searchFeedback;
    if (info && info.message) {
      el.textContent = info.message;
      el.className = "map-search-feedback" + (info.type ? ` ${info.type}` : "");
    } else {
      el.textContent = "";
      el.className = "map-search-feedback";
    }
  }
  function setSearchInputState({ notFound = false } = {}) {
    const input = mapState.searchInput;
    if (!input) return;
    input.classList.toggle("not-found", Boolean(notFound));
  }
  function createMapTabsPanel(activeTab) {
    const config = mapState.mapConfig || { tabs: [] };
    const tabsWrap = document.createElement("div");
    tabsWrap.className = "map-tabs";
    const heading = document.createElement("div");
    heading.className = "map-tabs-heading";
    heading.textContent = "Concept maps";
    tabsWrap.appendChild(heading);
    const tabList = document.createElement("div");
    tabList.className = "map-tab-list";
    config.tabs.forEach((tab) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "map-tab" + (activeTab && tab.id === activeTab.id ? " active" : "");
      btn.textContent = tab.name || "Untitled map";
      btn.addEventListener("click", () => {
        if (!activeTab || tab.id !== activeTab.id) {
          setActiveTab(tab.id);
        }
      });
      tabList.appendChild(btn);
    });
    tabsWrap.appendChild(tabList);
    const actions = document.createElement("div");
    actions.className = "map-tab-actions";
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "map-icon-btn map-tab-add";
    addBtn.setAttribute("aria-label", "Create new map tab");
    addBtn.innerHTML = `${ICONS.plus}`;
    addBtn.addEventListener("click", () => {
      createMapTab();
    });
    actions.appendChild(addBtn);
    const settingsBtn = document.createElement("button");
    settingsBtn.type = "button";
    settingsBtn.className = "map-icon-btn map-tab-settings";
    settingsBtn.setAttribute("aria-label", "Open settings");
    settingsBtn.innerHTML = `${ICONS.gear}`;
    settingsBtn.addEventListener("click", () => {
      const headerSettings = document.querySelector(".header-settings-btn");
      if (headerSettings) {
        headerSettings.click();
      }
    });
    actions.appendChild(settingsBtn);
    tabsWrap.appendChild(actions);
    return tabsWrap;
  }
  function createSearchOverlay() {
    const searchWrap = document.createElement("div");
    searchWrap.className = "map-search-container map-search-overlay";
    const form = document.createElement("form");
    form.className = "map-search";
    form.addEventListener("submit", (evt) => {
      evt.preventDefault();
      handleSearchSubmit(input.value);
    });
    const input = document.createElement("input");
    input.type = "search";
    input.className = "input map-search-input";
    input.placeholder = "Search concepts\u2026";
    input.value = mapState.searchValue || "";
    input.addEventListener("input", () => {
      mapState.searchValue = input.value;
      setSearchInputState({ notFound: false });
      if (!input.value.trim()) {
        updateSearchFeedback("", "");
      }
    });
    form.appendChild(input);
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "map-search-btn";
    submit.textContent = "Go";
    form.appendChild(submit);
    searchWrap.appendChild(form);
    const feedback = document.createElement("div");
    feedback.className = "map-search-feedback";
    searchWrap.appendChild(feedback);
    mapState.searchInput = input;
    mapState.searchFeedbackEl = feedback;
    applyStoredSearchFeedback();
    return searchWrap;
  }
  function createMapControlsPanel(activeTab) {
    const controls = document.createElement("div");
    controls.className = "map-controls";
    if (!activeTab) {
      return controls;
    }
    const titleRow = document.createElement("div");
    titleRow.className = "map-controls-row";
    const nameLabel = document.createElement("label");
    nameLabel.className = "map-control map-control-name";
    nameLabel.textContent = "Map name";
    const nameInput = document.createElement("input");
    nameInput.className = "input map-name-input";
    nameInput.value = activeTab.name || "";
    nameInput.addEventListener("change", async () => {
      const next = nameInput.value.trim() || "Untitled map";
      if (next === activeTab.name) return;
      activeTab.name = next;
      await persistMapConfig();
      await renderMap(mapState.root);
    });
    nameLabel.appendChild(nameInput);
    titleRow.appendChild(nameLabel);
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "map-icon-btn danger map-delete-tab";
    deleteBtn.setAttribute("aria-label", "Delete map");
    deleteBtn.innerHTML = `${ICONS.trash}<span class="sr-only">Delete map</span>`;
    if ((mapState.mapConfig?.tabs || []).length <= 1) {
      deleteBtn.disabled = true;
    }
    deleteBtn.addEventListener("click", () => {
      deleteActiveTab();
    });
    titleRow.appendChild(deleteBtn);
    controls.appendChild(titleRow);
    const toggleRow = document.createElement("div");
    toggleRow.className = "map-controls-row";
    const manualToggle = document.createElement("label");
    manualToggle.className = "map-toggle";
    const manualInput = document.createElement("input");
    manualInput.type = "checkbox";
    manualInput.checked = Boolean(activeTab.manualMode);
    manualInput.addEventListener("change", async () => {
      activeTab.manualMode = manualInput.checked;
      if (manualInput.checked) {
        activeTab.filter.blockId = "";
        activeTab.filter.week = "";
        activeTab.filter.lectureKey = "";
        activeTab.includeLinked = false;
      } else {
        activeTab.includeLinked = true;
      }
      await persistMapConfig();
      await renderMap(mapState.root);
    });
    const manualSpan = document.createElement("span");
    manualSpan.textContent = "Manual mode";
    manualToggle.appendChild(manualInput);
    manualToggle.appendChild(manualSpan);
    toggleRow.appendChild(manualToggle);
    const linkedToggle = document.createElement("label");
    linkedToggle.className = "map-toggle";
    const linkedInput = document.createElement("input");
    linkedInput.type = "checkbox";
    linkedInput.checked = activeTab.manualMode ? false : activeTab.includeLinked !== false;
    linkedInput.addEventListener("change", async () => {
      activeTab.includeLinked = linkedInput.checked;
      await persistMapConfig();
      await renderMap(mapState.root);
    });
    const linkedSpan = document.createElement("span");
    linkedSpan.textContent = "Include linked concepts";
    linkedToggle.appendChild(linkedInput);
    linkedToggle.appendChild(linkedSpan);
    toggleRow.appendChild(linkedToggle);
    controls.appendChild(toggleRow);
    const filterRow = document.createElement("div");
    filterRow.className = "map-controls-row";
    const blockWrap = document.createElement("label");
    blockWrap.className = "map-control";
    blockWrap.textContent = "Block";
    const blockSelect = document.createElement("select");
    blockSelect.className = "map-select";
    const blocks = mapState.blocks || [];
    const blockDefault = document.createElement("option");
    blockDefault.value = "";
    blockDefault.textContent = "All blocks";
    blockSelect.appendChild(blockDefault);
    blocks.forEach((block) => {
      const opt = document.createElement("option");
      opt.value = block.blockId;
      opt.textContent = block.name || block.blockId;
      blockSelect.appendChild(opt);
    });
    blockSelect.value = activeTab.filter.blockId || "";
    blockSelect.disabled = Boolean(activeTab.manualMode);
    blockSelect.addEventListener("change", async () => {
      activeTab.filter.blockId = blockSelect.value;
      activeTab.filter.week = "";
      activeTab.filter.lectureKey = "";
      await persistMapConfig();
      await renderMap(mapState.root);
    });
    blockWrap.appendChild(blockSelect);
    filterRow.appendChild(blockWrap);
    const weekWrap = document.createElement("label");
    weekWrap.className = "map-control";
    weekWrap.textContent = "Week";
    const weekSelect = document.createElement("select");
    weekSelect.className = "map-select";
    const weekBlock = blocks.find((b) => b.blockId === blockSelect.value);
    const weekDefault = document.createElement("option");
    weekDefault.value = "";
    weekDefault.textContent = blockSelect.value ? "All weeks" : "Select a block";
    weekSelect.appendChild(weekDefault);
    if (weekBlock && blockSelect.value) {
      const weekNumbers = /* @__PURE__ */ new Set();
      if (Number(weekBlock.weeks)) {
        for (let i = 1; i <= Number(weekBlock.weeks); i++) {
          weekNumbers.add(i);
        }
      }
      (weekBlock.lectures || []).forEach((lec) => {
        if (Number.isFinite(lec?.week)) {
          weekNumbers.add(lec.week);
        }
      });
      Array.from(weekNumbers).sort((a, b) => a - b).forEach((num) => {
        const opt = document.createElement("option");
        opt.value = String(num);
        opt.textContent = `Week ${num}`;
        weekSelect.appendChild(opt);
      });
    }
    if (blockSelect.value && activeTab.filter.week) {
      weekSelect.value = String(activeTab.filter.week);
    } else {
      weekSelect.value = "";
    }
    weekSelect.disabled = !blockSelect.value || Boolean(activeTab.manualMode);
    weekSelect.addEventListener("change", async () => {
      const val = weekSelect.value;
      activeTab.filter.week = val ? Number(val) : "";
      activeTab.filter.lectureKey = "";
      await persistMapConfig();
      await renderMap(mapState.root);
    });
    weekWrap.appendChild(weekSelect);
    filterRow.appendChild(weekWrap);
    const lectureWrap = document.createElement("label");
    lectureWrap.className = "map-control";
    lectureWrap.textContent = "Lecture";
    const lectureSelect = document.createElement("select");
    lectureSelect.className = "map-select";
    const lectureDefault = document.createElement("option");
    lectureDefault.value = "";
    lectureDefault.textContent = blockSelect.value ? "All lectures" : "Select a block";
    lectureSelect.appendChild(lectureDefault);
    if (weekBlock && blockSelect.value) {
      const lectures = Array.isArray(weekBlock.lectures) ? weekBlock.lectures : [];
      const weekFilter = activeTab.filter.week;
      lectures.filter((lec) => !weekFilter || lec.week === weekFilter).forEach((lec) => {
        const opt = document.createElement("option");
        opt.value = `${weekBlock.blockId}|${lec.id}`;
        const label = lec.name ? `${lec.name} (Week ${lec.week})` : `Lecture ${lec.id}`;
        opt.textContent = label;
        lectureSelect.appendChild(opt);
      });
    }
    lectureSelect.value = activeTab.filter.lectureKey || "";
    lectureSelect.disabled = !blockSelect.value || Boolean(activeTab.manualMode);
    lectureSelect.addEventListener("change", async () => {
      activeTab.filter.lectureKey = lectureSelect.value || "";
      await persistMapConfig();
      await renderMap(mapState.root);
    });
    lectureWrap.appendChild(lectureSelect);
    filterRow.appendChild(lectureWrap);
    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "btn map-reset-filters";
    resetBtn.textContent = "Clear filters";
    resetBtn.disabled = Boolean(activeTab.manualMode);
    resetBtn.addEventListener("click", async () => {
      activeTab.filter.blockId = "";
      activeTab.filter.week = "";
      activeTab.filter.lectureKey = "";
      await persistMapConfig();
      await renderMap(mapState.root);
    });
    filterRow.appendChild(resetBtn);
    controls.appendChild(filterRow);
    return controls;
  }
  function createMapPalettePanel(items, activeTab) {
    if (!activeTab || !activeTab.manualMode) {
      return null;
    }
    const palette = document.createElement("div");
    palette.className = "map-palette";
    const title = document.createElement("h3");
    title.textContent = "Concept library";
    palette.appendChild(title);
    const description = document.createElement("p");
    description.className = "map-palette-hint";
    description.textContent = "Drag terms onto the canvas to add them to this map.";
    palette.appendChild(description);
    const searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.className = "input map-palette-search";
    searchInput.placeholder = "Filter terms";
    searchInput.value = mapState.paletteSearch || "";
    palette.appendChild(searchInput);
    const list = document.createElement("div");
    list.className = "map-palette-list";
    palette.appendChild(list);
    const manualSet = new Set(Array.isArray(activeTab.manualIds) ? activeTab.manualIds : []);
    const itemMap = mapState.itemMap || {};
    function renderList() {
      list.innerHTML = "";
      const query = searchInput.value.trim().toLowerCase();
      const available = items.filter((it) => !manualSet.has(it.id)).filter((it) => !query || titleOf3(it).toLowerCase().includes(query)).sort((a, b) => titleOf3(a).localeCompare(titleOf3(b)));
      if (!available.length) {
        const empty = document.createElement("div");
        empty.className = "map-palette-empty";
        empty.textContent = query ? "No matching terms." : "All terms have been added.";
        list.appendChild(empty);
        return;
      }
      available.forEach((it) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "map-palette-item";
        btn.textContent = titleOf3(it) || it.id;
        btn.addEventListener("mousedown", (evt) => {
          const sourceItem = itemMap[it.id] || it;
          startMenuDrag(sourceItem, evt, { source: "palette" });
        });
        list.appendChild(btn);
      });
    }
    searchInput.addEventListener("input", () => {
      mapState.paletteSearch = searchInput.value;
      renderList();
    });
    renderList();
    const activeWrap = document.createElement("div");
    activeWrap.className = "map-palette-active";
    const activeTitle = document.createElement("h4");
    activeTitle.textContent = `Active concepts (${manualSet.size})`;
    activeWrap.appendChild(activeTitle);
    const activeList = document.createElement("div");
    activeList.className = "map-palette-active-list";
    if (!manualSet.size) {
      const empty = document.createElement("div");
      empty.className = "map-palette-empty";
      empty.textContent = "No concepts yet. Drag from the library to begin.";
      activeList.appendChild(empty);
    } else {
      activeTab.manualIds.forEach((id) => {
        const item = itemMap[id];
        if (!item) return;
        const row = document.createElement("div");
        row.className = "map-palette-active-item";
        const label = document.createElement("span");
        label.textContent = titleOf3(item) || id;
        row.appendChild(label);
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "icon-btn ghost";
        removeBtn.setAttribute("aria-label", `Remove ${titleOf3(item) || "item"} from this map`);
        removeBtn.textContent = "\u2715";
        removeBtn.addEventListener("click", async () => {
          const tab = getActiveTab();
          if (!tab) return;
          tab.manualIds = (tab.manualIds || []).filter((mid) => mid !== id);
          await persistMapConfig();
          await renderMap(mapState.root);
        });
        row.appendChild(removeBtn);
        activeList.appendChild(row);
      });
    }
    activeWrap.appendChild(activeList);
    palette.appendChild(activeWrap);
    return palette;
  }
  function handleSearchSubmit(rawQuery) {
    const query = (rawQuery || "").trim();
    if (!query) {
      mapState.searchValue = "";
      updateSearchFeedback("", "");
      setSearchInputState({ notFound: false });
      return;
    }
    mapState.searchValue = rawQuery;
    const items = mapState.visibleItems || [];
    const lower = query.toLowerCase();
    let match = items.find((it) => (titleOf3(it) || "").toLowerCase() === lower);
    if (!match) {
      match = items.find((it) => (titleOf3(it) || "").toLowerCase().includes(lower));
    }
    if (!match) {
      updateSearchFeedback("No matching concept on this map.", "error");
      setSearchInputState({ notFound: true });
      return;
    }
    const success = centerOnNode(match.id);
    if (success) {
      updateSearchFeedback(`Centered on ${titleOf3(match)}.`, "success");
      setSearchInputState({ notFound: false });
    } else {
      updateSearchFeedback("Could not focus on that concept.", "error");
      setSearchInputState({ notFound: true });
    }
  }
  function centerOnNode(id) {
    if (!mapState.viewBox || !mapState.positions) return false;
    const pos = mapState.positions[id];
    if (!pos) return false;
    const width = mapState.viewBox.w;
    const height = mapState.viewBox.h;
    const limit = mapState.sizeLimit || 0;
    const maxX = Math.max(0, limit - width);
    const maxY = Math.max(0, limit - height);
    const nextX = clamp(pos.x - width / 2, 0, maxX);
    const nextY = clamp(pos.y - height / 2, 0, maxY);
    if (Number.isFinite(nextX)) mapState.viewBox.x = nextX;
    if (Number.isFinite(nextY)) mapState.viewBox.y = nextY;
    if (mapState.updateViewBox) {
      mapState.updateViewBox();
    }
    mapState.selectionIds = [id];
    updateSelectionHighlight();
    return true;
  }
  function matchesFilter(item, filter = {}) {
    if (!filter) return true;
    const blockId = filter.blockId || "";
    const week = filter.week;
    const lectureKey = filter.lectureKey || "";
    if (blockId) {
      const inBlock = (item.blocks || []).includes(blockId) || (item.lectures || []).some((lec) => lec.blockId === blockId);
      if (!inBlock) return false;
    }
    if (week !== "" && week !== null && week !== void 0) {
      const weekNum = Number(week);
      if (Number.isFinite(weekNum)) {
        if (blockId) {
          const matchesWeek = (item.lectures || []).some((lec) => lec.blockId === blockId && lec.week === weekNum) || (item.weeks || []).includes(weekNum);
          if (!matchesWeek) return false;
        } else if (!(item.weeks || []).includes(weekNum)) {
          return false;
        }
      }
    }
    if (lectureKey) {
      const [blk, lecStr] = lectureKey.split("|");
      const lecId = Number(lecStr);
      if (Number.isFinite(lecId)) {
        const blockMatch = blk || blockId;
        const hasLecture = (item.lectures || []).some((lec) => {
          if (!Number.isFinite(lec.id)) return false;
          if (blockMatch) {
            return lec.blockId === blockMatch && lec.id === lecId;
          }
          return lec.id === lecId;
        });
        if (!hasLecture) return false;
      }
    }
    return true;
  }
  function applyTabFilters(items, tab) {
    if (!tab) {
      return items.filter((it) => !it.mapHidden);
    }
    const manualSet = new Set(Array.isArray(tab.manualIds) ? tab.manualIds : []);
    let base;
    if (tab.manualMode) {
      base = items.filter((it) => manualSet.has(it.id));
    } else {
      base = items.filter((it) => !it.mapHidden && matchesFilter(it, tab.filter));
    }
    const allowed = new Set(base.map((it) => it.id));
    if (tab.includeLinked !== false) {
      const queue = [...allowed];
      while (queue.length) {
        const id = queue.pop();
        const item = mapState.itemMap?.[id];
        if (!item) continue;
        (item.links || []).forEach((link) => {
          const other = mapState.itemMap?.[link.id];
          if (!other) return;
          if (other.mapHidden && !manualSet.has(other.id)) return;
          if (!allowed.has(other.id)) {
            allowed.add(other.id);
            queue.push(other.id);
          }
        });
      }
    }
    return items.filter((it) => {
      if (!allowed.has(it.id)) return false;
      if (tab.manualMode) {
        if (manualSet.has(it.id)) return true;
        return !it.mapHidden;
      }
      return !it.mapHidden || manualSet.has(it.id);
    });
  }
  function openItemPopup(itemId) {
    const item = mapState.itemMap?.[itemId];
    if (!item) return;
    showPopup(item, {
      onEdit: () => openItemEditor(itemId)
    });
  }
  function openItemEditor(itemId) {
    const item = mapState.itemMap?.[itemId];
    if (!item) return;
    openEditor(item.kind, async () => {
      await renderMap(mapState.root);
    }, item);
  }
  function setAreaInteracting(active) {
    if (!mapState.root) return;
    mapState.root.classList.toggle("map-area-interacting", Boolean(active));
  }
  async function renderMap(root) {
    if (mapState.root && mapState.root !== root) {
      mapState.root.classList.remove("map-area-interacting");
    }
    mapState.root = root;
    root.innerHTML = "";
    mapState.nodeDrag = null;
    mapState.areaDrag = null;
    mapState.draggingView = false;
    mapState.menuDrag = null;
    mapState.selectionRect = null;
    mapState.previewSelection = null;
    mapState.nodeWasDragged = false;
    mapState.justCompletedSelection = false;
    mapState.searchInput = null;
    mapState.searchFeedbackEl = null;
    stopToolboxDrag();
    mapState.toolboxEl = null;
    mapState.toolboxContainer = null;
    mapState.cursorOverride = null;
    mapState.hoveredEdge = null;
    mapState.hoveredEdgePointer = { x: 0, y: 0 };
    stopAutoPan();
    setAreaInteracting(false);
    ensureListeners();
    await ensureMapConfig();
    mapState.blocks = await listBlocks();
    const items = [
      ...await listItemsByKind("disease"),
      ...await listItemsByKind("drug"),
      ...await listItemsByKind("concept")
    ];
    const hiddenNodes = items.filter((it) => it.mapHidden);
    const itemMap = Object.fromEntries(items.map((it) => [it.id, it]));
    mapState.itemMap = itemMap;
    const activeTab = getActiveTab();
    const visibleItems = applyTabFilters(items, activeTab);
    mapState.visibleItems = visibleItems;
    const base = 1e3;
    const size = Math.max(base, visibleItems.length * 150);
    const viewport = base;
    mapState.sizeLimit = size * 2;
    mapState.minView = 100;
    const wrapper = document.createElement("div");
    wrapper.className = "map-wrapper";
    root.appendChild(wrapper);
    const stage = document.createElement("div");
    stage.className = "map-stage";
    wrapper.appendChild(stage);
    const container = document.createElement("div");
    container.className = "map-container";
    stage.appendChild(container);
    mapState.container = container;
    const overlay = document.createElement("div");
    overlay.className = "map-overlay";
    stage.appendChild(overlay);
    const menu = document.createElement("div");
    menu.className = "map-menu";
    overlay.appendChild(menu);
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "map-menu-toggle";
    toggle.setAttribute("aria-haspopup", "true");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open map controls");
    toggle.innerHTML = `<span class="map-menu-icon" aria-hidden="true">${ICONS.sliders}</span><span class="sr-only">Open map controls</span>`;
    menu.appendChild(toggle);
    const panel = document.createElement("div");
    panel.className = "map-menu-panel";
    panel.setAttribute("aria-label", "Map controls");
    menu.appendChild(panel);
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "map-menu-close";
    closeBtn.setAttribute("aria-label", "Hide map controls");
    closeBtn.innerHTML = `<span class="sr-only">Hide map controls</span>${ICONS.close}`;
    panel.appendChild(closeBtn);
    const tabsPanel = createMapTabsPanel(activeTab);
    panel.appendChild(tabsPanel);
    const controlsPanel = createMapControlsPanel(activeTab);
    if (controlsPanel) {
      panel.appendChild(controlsPanel);
    }
    const palettePanel = createMapPalettePanel(items, activeTab);
    if (palettePanel) {
      panel.appendChild(palettePanel);
    }
    const searchOverlay = createSearchOverlay();
    overlay.appendChild(searchOverlay);
    let menuHoverOpen = Boolean(mapState.menuPinned);
    let menuHoverCloseTimer = null;
    const clearMenuHoverClose = () => {
      if (menuHoverCloseTimer !== null) {
        clearTimeout(menuHoverCloseTimer);
        menuHoverCloseTimer = null;
      }
    };
    const applyMenuState = () => {
      const open = Boolean(mapState.menuPinned) || menuHoverOpen;
      menu.classList.toggle("open", open);
      menu.classList.toggle("pinned", Boolean(mapState.menuPinned));
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-pressed", mapState.menuPinned ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Hide map controls" : "Open map controls");
    };
    const openMenu = ({ pinned = false } = {}) => {
      if (pinned) {
        mapState.menuPinned = true;
      }
      menuHoverOpen = true;
      clearMenuHoverClose();
      applyMenuState();
    };
    const closeMenu = ({ unpin = false } = {}) => {
      if (unpin) {
        mapState.menuPinned = false;
      }
      menuHoverOpen = false;
      clearMenuHoverClose();
      applyMenuState();
    };
    const scheduleMenuClose = () => {
      if (mapState.menuPinned) {
        return;
      }
      clearMenuHoverClose();
      menuHoverCloseTimer = setTimeout(() => {
        menuHoverCloseTimer = null;
        closeMenu();
      }, 140);
    };
    applyMenuState();
    toggle.addEventListener("click", (evt) => {
      evt.preventDefault();
      if (mapState.menuPinned) {
        closeMenu({ unpin: true });
      } else {
        openMenu({ pinned: true });
      }
    });
    const handleHoverOpen = () => openMenu();
    menu.addEventListener("mouseenter", handleHoverOpen);
    toggle.addEventListener("mouseenter", handleHoverOpen);
    panel.addEventListener("mouseenter", handleHoverOpen);
    toggle.addEventListener("focusin", handleHoverOpen);
    panel.addEventListener("focusin", handleHoverOpen);
    menu.addEventListener("mouseleave", scheduleMenuClose);
    menu.addEventListener("focusout", (evt) => {
      if (!menu.contains(evt.relatedTarget) && !mapState.menuPinned) {
        closeMenu();
      }
    });
    closeBtn.addEventListener("click", () => {
      closeMenu({ unpin: true });
    });
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("map-svg");
    const defaultView = {
      x: (size - viewport) / 2,
      y: (size - viewport) / 2,
      w: viewport,
      h: viewport
    };
    let viewBox;
    if (mapState.viewBox) {
      const current = mapState.viewBox;
      const cx = Number.isFinite(current.x) && Number.isFinite(current.w) ? current.x + current.w / 2 : defaultView.x + defaultView.w / 2;
      const cy = Number.isFinite(current.y) && Number.isFinite(current.h) ? current.y + current.h / 2 : defaultView.y + defaultView.h / 2;
      const minSize = mapState.minView || defaultView.w;
      const maxSize = mapState.sizeLimit || defaultView.w;
      const desiredSize = Number.isFinite(current.w) ? current.w : defaultView.w;
      const clamped = Math.min(Math.max(desiredSize, minSize), maxSize);
      viewBox = {
        x: cx - clamped / 2,
        y: cy - clamped / 2,
        w: clamped,
        h: clamped
      };
    } else {
      viewBox = { ...defaultView };
    }
    mapState.svg = svg;
    mapState.viewBox = viewBox;
    if (!Number.isFinite(mapState.defaultViewSize)) {
      mapState.defaultViewSize = viewBox.w;
    }
    const updateViewBox = () => {
      svg.setAttribute("viewBox", `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`);
      adjustScale();
    };
    mapState.updateViewBox = updateViewBox;
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    buildLineMarkers(defs);
    svg.appendChild(defs);
    svg.appendChild(g);
    mapState.g = g;
    container.appendChild(svg);
    const tooltip = document.createElement("div");
    tooltip.className = "map-edge-tooltip hidden";
    container.appendChild(tooltip);
    mapState.edgeTooltip = tooltip;
    const selectionBox = document.createElement("div");
    selectionBox.className = "map-selection hidden";
    container.appendChild(selectionBox);
    mapState.selectionBox = selectionBox;
    attachSvgEvents(svg);
    const positions = {};
    mapState.positions = positions;
    mapState.elements = /* @__PURE__ */ new Map();
    const linkCounts = Object.fromEntries(items.map((it) => [it.id, (it.links || []).length]));
    const maxLinks = Math.max(1, ...Object.values(linkCounts));
    const minRadius = 20;
    const maxRadius = 60;
    const center = size / 2;
    const newItems = [];
    const layout = activeTab ? ensureTabLayout(activeTab) : null;
    const allowLegacyPositions = Boolean(activeTab && activeTab.layoutSeeded !== true);
    let layoutDirty = false;
    let legacyImported = false;
    visibleItems.forEach((it) => {
      if (layout && layout[it.id]) {
        positions[it.id] = { ...layout[it.id] };
        return;
      }
      const legacy = it.mapPos;
      if (allowLegacyPositions && legacy && typeof legacy === "object" && Number.isFinite(Number(legacy.x)) && Number.isFinite(Number(legacy.y))) {
        const x = Number(legacy.x);
        const y = Number(legacy.y);
        positions[it.id] = { x, y };
        if (layout) {
          layout[it.id] = { x, y };
          layoutDirty = true;
          legacyImported = true;
        }
        return;
      }
      newItems.push(it);
    });
    newItems.sort((a, b) => (linkCounts[b.id] || 0) - (linkCounts[a.id] || 0));
    const step = 2 * Math.PI / Math.max(newItems.length, 1);
    newItems.forEach((it, idx) => {
      const angle = idx * step;
      const degree = linkCounts[it.id] || 0;
      const dist = 100 - degree / maxLinks * 50;
      const x = center + dist * Math.cos(angle);
      const y = center + dist * Math.sin(angle);
      positions[it.id] = { x, y };
      if (layout) {
        layout[it.id] = { x, y };
        layoutDirty = true;
      }
    });
    if (activeTab && legacyImported && activeTab.layoutSeeded !== true) {
      activeTab.layoutSeeded = true;
      layoutDirty = true;
    }
    if (layoutDirty) {
      await persistMapConfig();
    }
    mapState.selectionIds = mapState.selectionIds.filter((id) => positions[id]);
    const hiddenLinks = gatherHiddenLinks(items, itemMap);
    buildToolbox(container, hiddenNodes.length, hiddenLinks.length);
    buildHiddenPanel(container, hiddenNodes, hiddenLinks);
    const drawn = /* @__PURE__ */ new Set();
    visibleItems.forEach((it) => {
      (it.links || []).forEach((l) => {
        if (l.hidden) return;
        if (!positions[l.id]) return;
        const key = it.id < l.id ? `${it.id}|${l.id}` : `${l.id}|${it.id}`;
        if (drawn.has(key)) return;
        drawn.add(key);
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", calcPath(it.id, l.id));
        path.setAttribute("fill", "none");
        path.setAttribute("class", "map-edge");
        path.setAttribute("vector-effect", "non-scaling-stroke");
        applyLineStyle(path, l);
        path.dataset.a = it.id;
        path.dataset.b = l.id;
        path.dataset.label = l.name || "";
        path.addEventListener("click", (e) => {
          e.stopPropagation();
          handleEdgeClick(path, it.id, l.id, e);
        });
        path.addEventListener("mouseenter", (evt) => {
          if (mapState.tool === TOOL.HIDE) {
            applyCursorOverride("hide");
          } else if (mapState.tool === TOOL.BREAK) {
            applyCursorOverride("break");
          }
          showEdgeTooltip(path, evt);
        });
        path.addEventListener("mousemove", (evt) => {
          moveEdgeTooltip(path, evt);
        });
        path.addEventListener("mouseleave", () => {
          if (mapState.tool === TOOL.HIDE) {
            clearCursorOverride("hide");
          }
          if (mapState.tool === TOOL.BREAK) {
            clearCursorOverride("break");
          }
          hideEdgeTooltip(path);
        });
        g.appendChild(path);
      });
    });
    visibleItems.forEach((it) => {
      const pos = positions[it.id];
      if (!pos) return;
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", pos.x);
      circle.setAttribute("cy", pos.y);
      const baseR = minRadius + (maxRadius - minRadius) * (linkCounts[it.id] || 0) / maxLinks;
      circle.setAttribute("r", baseR);
      circle.dataset.radius = baseR;
      circle.setAttribute("class", "map-node");
      circle.dataset.id = it.id;
      const kindColors2 = { disease: "var(--purple)", drug: "var(--blue)" };
      const fill = kindColors2[it.kind] || it.color || "var(--gray)";
      circle.setAttribute("fill", fill);
      const handleNodePointerDown = (e) => {
        if (e.button !== 0) return;
        const isNavigateTool = mapState.tool === TOOL.NAVIGATE;
        const isAreaDrag = mapState.tool === TOOL.AREA && mapState.selectionIds.includes(it.id);
        if (!isNavigateTool && !isAreaDrag) return;
        e.stopPropagation();
        e.preventDefault();
        mapState.suppressNextClick = false;
        const { x, y } = clientToMap(e.clientX, e.clientY);
        const current = mapState.positions[it.id] || pos;
        if (isNavigateTool) {
          mapState.nodeDrag = {
            id: it.id,
            offset: { x: x - current.x, y: y - current.y }
          };
          mapState.nodeWasDragged = false;
          setAreaInteracting(true);
        } else {
          mapState.areaDrag = {
            ids: [...mapState.selectionIds],
            start: { x, y },
            origin: mapState.selectionIds.map((id) => {
              const source = mapState.positions[id] || positions[id] || { x: 0, y: 0 };
              return { id, pos: { ...source } };
            }),
            moved: false
          };
          mapState.nodeWasDragged = false;
          setAreaInteracting(true);
        }
        refreshCursor({ keepOverride: false });
      };
      circle.addEventListener("mousedown", handleNodePointerDown);
      circle.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (mapState.suppressNextClick) {
          mapState.suppressNextClick = false;
          mapState.nodeWasDragged = false;
          return;
        }
        if (mapState.tool === TOOL.NAVIGATE) {
          if (!mapState.nodeWasDragged) {
            openItemPopup(it.id);
          }
          mapState.nodeWasDragged = false;
        } else if (mapState.tool === TOOL.HIDE) {
          if (confirm(`Remove ${titleOf3(it)} from the map?`)) {
            await setNodeHidden(it.id, true);
            await renderMap(root);
          }
        } else if (mapState.tool === TOOL.ADD_LINK) {
          await handleAddLinkClick(it.id);
        }
      });
      circle.addEventListener("mouseenter", () => {
        if (mapState.tool === TOOL.HIDE) {
          applyCursorOverride("hide");
        } else if (mapState.tool === TOOL.ADD_LINK) {
          applyCursorOverride("link");
        }
      });
      circle.addEventListener("mouseleave", () => {
        if (mapState.tool === TOOL.HIDE) {
          clearCursorOverride("hide");
        }
        if (mapState.tool === TOOL.ADD_LINK) {
          clearCursorOverride("link");
        }
      });
      g.appendChild(circle);
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", pos.x);
      text.setAttribute("y", pos.y - (baseR + 12));
      text.setAttribute("class", "map-label");
      text.setAttribute("font-size", "16");
      text.dataset.id = it.id;
      text.textContent = it.name || it.concept || "?";
      text.addEventListener("mousedown", handleNodePointerDown);
      text.addEventListener("click", (e) => {
        e.stopPropagation();
        if (mapState.suppressNextClick) {
          mapState.suppressNextClick = false;
          mapState.nodeWasDragged = false;
          return;
        }
        if (mapState.tool === TOOL.NAVIGATE && !mapState.nodeWasDragged) {
          openItemPopup(it.id);
        }
        mapState.nodeWasDragged = false;
      });
      g.appendChild(text);
      mapState.elements.set(it.id, { circle, label: text });
    });
    updateSelectionHighlight();
    updatePendingHighlight();
    updateViewBox();
    refreshCursor();
  }
  function ensureListeners() {
    if (mapState.listenersAttached || typeof window === "undefined") return;
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    mapState.listenersAttached = true;
    if (!window._mapResizeAttached) {
      window.addEventListener("resize", adjustScale);
      window._mapResizeAttached = true;
    }
    if (!window._mapToolboxResizeAttached) {
      window.addEventListener("resize", ensureToolboxWithinBounds);
      window._mapToolboxResizeAttached = true;
    }
  }
  function buildLineMarkers(defs) {
    const svgNS = "http://www.w3.org/2000/svg";
    const configs = [
      {
        id: "arrow-end",
        viewBox: "0 0 12 12",
        refX: 12,
        refY: 6,
        markerWidth: 8,
        markerHeight: 8,
        path: "M0,0 L12,6 L0,12 Z"
      },
      {
        id: "arrow-start",
        viewBox: "0 0 12 12",
        refX: 0,
        refY: 6,
        markerWidth: 8,
        markerHeight: 8,
        path: "M12,0 L0,6 L12,12 Z"
      }
    ];
    configs.forEach((cfg) => {
      const marker = document.createElementNS(svgNS, "marker");
      marker.setAttribute("id", cfg.id);
      marker.setAttribute("viewBox", cfg.viewBox);
      marker.setAttribute("refX", String(cfg.refX));
      marker.setAttribute("refY", String(cfg.refY));
      marker.setAttribute("markerWidth", String(cfg.markerWidth));
      marker.setAttribute("markerHeight", String(cfg.markerHeight));
      marker.setAttribute("orient", "auto");
      marker.setAttribute("markerUnits", "strokeWidth");
      const path = document.createElementNS(svgNS, "path");
      path.setAttribute("d", cfg.path);
      path.setAttribute("fill", "currentColor");
      marker.appendChild(path);
      defs.appendChild(marker);
    });
  }
  function attachSvgEvents(svg) {
    svg.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (e.target !== svg) return;
      mapState.justCompletedSelection = false;
      if (mapState.tool !== TOOL.AREA) {
        e.preventDefault();
        mapState.draggingView = true;
        mapState.lastPointer = { x: e.clientX, y: e.clientY };
        setAreaInteracting(true);
        refreshCursor({ keepOverride: false });
      } else if (mapState.tool === TOOL.AREA) {
        e.preventDefault();
        mapState.selectionRect = {
          start: { x: e.clientX, y: e.clientY },
          current: { x: e.clientX, y: e.clientY }
        };
        mapState.selectionBox.classList.remove("hidden");
        setAreaInteracting(true);
      }
    });
    svg.addEventListener("click", (e) => {
      if (mapState.tool !== TOOL.AREA) return;
      if (e.target !== svg) return;
      if (mapState.justCompletedSelection) {
        mapState.justCompletedSelection = false;
        return;
      }
      if (mapState.selectionIds.length || mapState.previewSelection) {
        mapState.selectionIds = [];
        mapState.previewSelection = null;
        updateSelectionHighlight();
      }
      setAreaInteracting(false);
    });
    svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 0.9 : 1.1;
      const rect = svg.getBoundingClientRect();
      const mx = mapState.viewBox.x + (e.clientX - rect.left) / rect.width * mapState.viewBox.w;
      const my = mapState.viewBox.y + (e.clientY - rect.top) / rect.height * mapState.viewBox.h;
      const maxSize = mapState.sizeLimit || 2e3;
      const minSize = mapState.minView || 100;
      const nextW = Math.max(minSize, Math.min(maxSize, mapState.viewBox.w * factor));
      mapState.viewBox.w = nextW;
      mapState.viewBox.h = nextW;
      mapState.viewBox.x = mx - (e.clientX - rect.left) / rect.width * mapState.viewBox.w;
      mapState.viewBox.y = my - (e.clientY - rect.top) / rect.height * mapState.viewBox.h;
      mapState.updateViewBox();
    }, { passive: false });
  }
  function handleMouseMove(e) {
    if (!mapState.svg) return;
    if (mapState.toolboxDrag) {
      moveToolboxDrag(e.clientX, e.clientY);
      return;
    }
    if (mapState.menuDrag) {
      updateMenuDragPosition(e.clientX, e.clientY);
      return;
    }
    if (mapState.nodeDrag) {
      const entry = mapState.elements.get(mapState.nodeDrag.id);
      if (!entry || !entry.circle) return;
      const { x, y } = clientToMap(e.clientX, e.clientY);
      const nx = x - mapState.nodeDrag.offset.x;
      const ny = y - mapState.nodeDrag.offset.y;
      mapState.positions[mapState.nodeDrag.id] = { x: nx, y: ny };
      updateNodeGeometry(mapState.nodeDrag.id, entry);
      updateEdgesFor(mapState.nodeDrag.id);
      mapState.nodeWasDragged = true;
      return;
    }
    if (mapState.areaDrag) {
      updateAutoPanFromPointer(e.clientX, e.clientY);
      const { x, y } = clientToMap(e.clientX, e.clientY);
      const dx = x - mapState.areaDrag.start.x;
      const dy = y - mapState.areaDrag.start.y;
      mapState.areaDrag.moved = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;
      mapState.areaDrag.origin.forEach(({ id, pos }) => {
        const nx = pos.x + dx;
        const ny = pos.y + dy;
        mapState.positions[id] = { x: nx, y: ny };
        updateNodeGeometry(id);
        updateEdgesFor(id);
      });
      mapState.nodeWasDragged = true;
      return;
    }
    if (mapState.draggingView) {
      const scale = mapState.viewBox.w / mapState.svg.clientWidth;
      mapState.viewBox.x -= (e.clientX - mapState.lastPointer.x) * scale;
      mapState.viewBox.y -= (e.clientY - mapState.lastPointer.y) * scale;
      mapState.lastPointer = { x: e.clientX, y: e.clientY };
      mapState.updateViewBox();
      return;
    }
    if (mapState.selectionRect) {
      updateAutoPanFromPointer(e.clientX, e.clientY);
      mapState.selectionRect.current = { x: e.clientX, y: e.clientY };
      updateSelectionBox();
    }
  }
  async function handleMouseUp(e) {
    if (!mapState.svg) return;
    if (mapState.toolboxDrag) {
      stopToolboxDrag();
    }
    if (mapState.menuDrag) {
      await finishMenuDrag(e.clientX, e.clientY);
      return;
    }
    let cursorNeedsRefresh = false;
    if (mapState.nodeDrag) {
      const id = mapState.nodeDrag.id;
      mapState.nodeDrag = null;
      cursorNeedsRefresh = true;
      if (mapState.nodeWasDragged) {
        await persistNodePosition(id);
        mapState.suppressNextClick = true;
      } else {
        mapState.suppressNextClick = false;
      }
      mapState.nodeWasDragged = false;
      setAreaInteracting(false);
    }
    if (mapState.areaDrag) {
      const moved = mapState.areaDrag.moved;
      const ids = mapState.areaDrag.ids;
      mapState.areaDrag = null;
      cursorNeedsRefresh = true;
      if (moved) {
        for (const id of ids) {
          await persistNodePosition(id, { persist: false });
        }
        await persistMapConfig();
        mapState.suppressNextClick = true;
      } else {
        mapState.suppressNextClick = false;
      }
      mapState.nodeWasDragged = false;
      stopAutoPan();
      setAreaInteracting(false);
    }
    if (mapState.draggingView) {
      mapState.draggingView = false;
      cursorNeedsRefresh = true;
      setAreaInteracting(false);
    }
    if (mapState.selectionRect) {
      const selected = computeSelectionFromRect();
      mapState.selectionIds = selected;
      mapState.previewSelection = null;
      mapState.selectionRect = null;
      mapState.selectionBox.classList.add("hidden");
      updateSelectionHighlight();
      stopAutoPan();
      setAreaInteracting(false);
      mapState.justCompletedSelection = true;
    }
    if (cursorNeedsRefresh) {
      refreshCursor({ keepOverride: true });
    }
  }
  function clientToMap(clientX, clientY) {
    if (!mapState.svg) return { x: 0, y: 0 };
    const rect = mapState.svg.getBoundingClientRect();
    const x = mapState.viewBox.x + (clientX - rect.left) / rect.width * mapState.viewBox.w;
    const y = mapState.viewBox.y + (clientY - rect.top) / rect.height * mapState.viewBox.h;
    return { x, y };
  }
  function updateSelectionBox() {
    if (!mapState.selectionRect || !mapState.selectionBox || !mapState.svg) return;
    const { start, current } = mapState.selectionRect;
    const rect = mapState.svg.getBoundingClientRect();
    const left = Math.min(start.x, current.x) - rect.left;
    const top = Math.min(start.y, current.y) - rect.top;
    const width = Math.abs(start.x - current.x);
    const height = Math.abs(start.y - current.y);
    mapState.selectionBox.style.left = `${left}px`;
    mapState.selectionBox.style.top = `${top}px`;
    mapState.selectionBox.style.width = `${width}px`;
    mapState.selectionBox.style.height = `${height}px`;
    const from = clientToMap(start.x, start.y);
    const to = clientToMap(current.x, current.y);
    const minX = Math.min(from.x, to.x);
    const maxX = Math.max(from.x, to.x);
    const minY = Math.min(from.y, to.y);
    const maxY = Math.max(from.y, to.y);
    const preview = [];
    Object.entries(mapState.positions).forEach(([id, pos]) => {
      if (pos.x >= minX && pos.x <= maxX && pos.y >= minY && pos.y <= maxY) {
        preview.push(id);
      }
    });
    mapState.previewSelection = preview;
    updateSelectionHighlight();
  }
  function updateAutoPanFromPointer(clientX, clientY) {
    if (!mapState.svg || mapState.tool !== TOOL.AREA) return;
    const vector = computeAutoPanVector(clientX, clientY);
    if (vector) {
      startAutoPan(vector);
    } else {
      stopAutoPan();
    }
  }
  function computeAutoPanVector(clientX, clientY) {
    const rect = mapState.svg.getBoundingClientRect();
    const threshold = 40;
    const baseSpeed = 25;
    let dx = 0;
    let dy = 0;
    const leftDist = clientX - rect.left;
    const rightDist = rect.right - clientX;
    const topDist = clientY - rect.top;
    const bottomDist = rect.bottom - clientY;
    if (leftDist < threshold) {
      const intensity = Math.min(1, Math.max(0, threshold - leftDist) / threshold);
      dx -= intensity * baseSpeed;
    } else if (rightDist < threshold) {
      const intensity = Math.min(1, Math.max(0, threshold - rightDist) / threshold);
      dx += intensity * baseSpeed;
    }
    if (topDist < threshold) {
      const intensity = Math.min(1, Math.max(0, threshold - topDist) / threshold);
      dy -= intensity * baseSpeed;
    } else if (bottomDist < threshold) {
      const intensity = Math.min(1, Math.max(0, threshold - bottomDist) / threshold);
      dy += intensity * baseSpeed;
    }
    if (dx || dy) {
      return { dx, dy };
    }
    return null;
  }
  function startAutoPan(vector) {
    mapState.autoPan = vector;
    applyAutoPan(vector);
    if (typeof window === "undefined") return;
    if (mapState.autoPanFrame) return;
    const step = () => {
      if (!mapState.autoPan) {
        mapState.autoPanFrame = null;
        return;
      }
      applyAutoPan(mapState.autoPan);
      mapState.autoPanFrame = window.requestAnimationFrame(step);
    };
    mapState.autoPanFrame = window.requestAnimationFrame(step);
  }
  function applyAutoPan(vector) {
    if (!mapState.svg || !mapState.viewBox || !mapState.updateViewBox) return;
    const rect = mapState.svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const scaleX = mapState.viewBox.w / rect.width;
    const scaleY = mapState.viewBox.h / rect.height;
    mapState.viewBox.x += vector.dx * scaleX;
    mapState.viewBox.y += vector.dy * scaleY;
    mapState.updateViewBox();
  }
  function stopAutoPan() {
    mapState.autoPan = null;
    if (mapState.autoPanFrame && typeof window !== "undefined") {
      window.cancelAnimationFrame(mapState.autoPanFrame);
    }
    mapState.autoPanFrame = null;
  }
  function computeSelectionFromRect() {
    if (mapState.previewSelection) return mapState.previewSelection.slice();
    return mapState.selectionIds.slice();
  }
  function getCurrentScales() {
    return mapState.currentScales || { nodeScale: 1, labelScale: 1, lineScale: 1 };
  }
  function getLineThicknessValue(key) {
    return LINE_THICKNESS_VALUES[key] || LINE_THICKNESS_VALUES[DEFAULT_LINE_THICKNESS];
  }
  function normalizeLineStyle(style) {
    if (!style) return DEFAULT_LINE_STYLE;
    if (style === "arrow") return "arrow-end";
    return LINE_STYLE_VALUE_SET.has(style) ? style : DEFAULT_LINE_STYLE;
  }
  function updateNodeGeometry(id, entry = mapState.elements.get(id)) {
    if (!entry) return;
    const { circle, label } = entry;
    const pos = mapState.positions[id];
    if (!circle || !pos) return;
    const baseR = Number(circle.dataset.radius) || 20;
    const scales = getCurrentScales();
    const nodeScale = scales.nodeScale || 1;
    const labelScale = scales.labelScale || 1;
    circle.setAttribute("cx", pos.x);
    circle.setAttribute("cy", pos.y);
    circle.setAttribute("r", baseR * nodeScale);
    if (label) {
      label.setAttribute("x", pos.x);
      const offset = (baseR + 12) * nodeScale;
      label.setAttribute("y", pos.y - offset);
      label.setAttribute("font-size", 16 * labelScale);
    }
  }
  function updateSelectionHighlight() {
    const ids = mapState.previewSelection || mapState.selectionIds;
    const set = new Set(ids);
    mapState.elements.forEach(({ circle, label }, id) => {
      if (set.has(id)) {
        circle.classList.add("selected");
        label.classList.add("selected");
      } else {
        circle.classList.remove("selected");
        label.classList.remove("selected");
      }
    });
  }
  function updatePendingHighlight() {
    mapState.elements.forEach(({ circle, label }, id) => {
      if (mapState.pendingLink === id) {
        circle.classList.add("pending");
        label.classList.add("pending");
      } else {
        circle.classList.remove("pending");
        label.classList.remove("pending");
      }
    });
  }
  function updateEdgesFor(id) {
    if (!mapState.g) return;
    mapState.g.querySelectorAll(`path[data-a='${id}'], path[data-b='${id}']`).forEach((edge) => {
      edge.setAttribute("d", calcPath(edge.dataset.a, edge.dataset.b));
      syncLineDecoration(edge);
    });
  }
  function buildToolbox(container, hiddenNodeCount, hiddenLinkCount) {
    const tools = [
      { id: TOOL.NAVIGATE, icon: "\u{1F9ED}", label: "Navigate" },
      { id: TOOL.HIDE, icon: "\u{1FA84}", label: "Hide" },
      { id: TOOL.BREAK, icon: "\u2702\uFE0F", label: "Break link" },
      { id: TOOL.ADD_LINK, icon: "\u{1F517}", label: "Add link" },
      { id: TOOL.AREA, icon: "\u{1F4E6}", label: "Select area" }
    ];
    const box = document.createElement("div");
    box.className = "map-toolbox";
    box.style.left = `${mapState.toolboxPos.x}px`;
    box.style.top = `${mapState.toolboxPos.y}px`;
    mapState.toolboxEl = box;
    mapState.toolboxContainer = container;
    box.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      if (event.target.closest(".map-tool") || event.target.closest(".map-toolbox-drag")) return;
      startToolboxDrag(event);
    });
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "map-toolbox-drag";
    handle.setAttribute("aria-label", "Drag toolbar");
    handle.innerHTML = "<span>\u22EE</span>";
    handle.addEventListener("mousedown", startToolboxDrag);
    box.appendChild(handle);
    const list = document.createElement("div");
    list.className = "map-tool-list";
    tools.forEach((tool) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "map-tool" + (mapState.tool === tool.id ? " active" : "");
      btn.textContent = tool.icon;
      btn.title = tool.label;
      btn.addEventListener("click", () => {
        if (mapState.tool !== tool.id) {
          mapState.tool = tool.id;
          if (tool.id !== TOOL.AREA) {
            mapState.selectionIds = [];
            mapState.previewSelection = null;
          }
          if (tool.id !== TOOL.ADD_LINK) {
            mapState.pendingLink = null;
          }
          if (tool.id === TOOL.HIDE) {
            mapState.hiddenMenuTab = mapState.hiddenMenuTab === "links" ? "links" : "nodes";
            mapState.panelVisible = true;
          }
          mapState.cursorOverride = null;
          renderMap(mapState.root);
        }
      });
      list.appendChild(btn);
    });
    box.appendChild(list);
    const badges = document.createElement("div");
    badges.className = "map-tool-badges";
    const nodeBadge = document.createElement("span");
    nodeBadge.className = "map-tool-badge";
    nodeBadge.setAttribute("title", `${hiddenNodeCount} hidden node${hiddenNodeCount === 1 ? "" : "s"}`);
    nodeBadge.innerHTML = `<span>\u{1F648}</span><strong>${hiddenNodeCount}</strong>`;
    badges.appendChild(nodeBadge);
    const linkBadge = document.createElement("span");
    linkBadge.className = "map-tool-badge";
    linkBadge.setAttribute("title", `${hiddenLinkCount} hidden link${hiddenLinkCount === 1 ? "" : "s"}`);
    linkBadge.innerHTML = `<span>\u{1F578}\uFE0F</span><strong>${hiddenLinkCount}</strong>`;
    badges.appendChild(linkBadge);
    box.appendChild(badges);
    container.appendChild(box);
    ensureToolboxWithinBounds();
  }
  function buildHiddenPanel(container, hiddenNodes, hiddenLinks) {
    const allowPanel = mapState.tool === TOOL.HIDE;
    const panel = document.createElement("div");
    panel.className = "map-hidden-panel";
    if (!(allowPanel && mapState.panelVisible)) {
      panel.classList.add("hidden");
    }
    const header = document.createElement("div");
    header.className = "map-hidden-header";
    const tabs2 = document.createElement("div");
    tabs2.className = "map-hidden-tabs";
    const nodeTab = document.createElement("button");
    nodeTab.type = "button";
    nodeTab.textContent = `Nodes (${hiddenNodes.length})`;
    nodeTab.className = mapState.hiddenMenuTab === "nodes" ? "active" : "";
    nodeTab.addEventListener("click", () => {
      mapState.hiddenMenuTab = "nodes";
      renderMap(mapState.root);
    });
    tabs2.appendChild(nodeTab);
    const linkTab = document.createElement("button");
    linkTab.type = "button";
    linkTab.textContent = `Links (${hiddenLinks.length})`;
    linkTab.className = mapState.hiddenMenuTab === "links" ? "active" : "";
    linkTab.addEventListener("click", () => {
      mapState.hiddenMenuTab = "links";
      renderMap(mapState.root);
    });
    tabs2.appendChild(linkTab);
    header.appendChild(tabs2);
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "map-hidden-close";
    closeBtn.textContent = mapState.panelVisible ? "Hide" : "Show";
    closeBtn.addEventListener("click", () => {
      mapState.panelVisible = !mapState.panelVisible;
      renderMap(mapState.root);
    });
    header.appendChild(closeBtn);
    panel.appendChild(header);
    const body = document.createElement("div");
    body.className = "map-hidden-body";
    if (mapState.hiddenMenuTab === "nodes") {
      const list = document.createElement("div");
      list.className = "map-hidden-list";
      if (hiddenNodes.length === 0) {
        const empty = document.createElement("div");
        empty.className = "map-hidden-empty";
        empty.textContent = "No hidden nodes.";
        list.appendChild(empty);
      } else {
        hiddenNodes.slice().sort((a, b) => titleOf3(a).localeCompare(titleOf3(b))).forEach((it) => {
          const item = document.createElement("div");
          item.className = "map-hidden-item";
          item.classList.add("draggable");
          item.textContent = titleOf3(it) || it.id;
          item.addEventListener("mousedown", (e) => {
            if (mapState.tool !== TOOL.HIDE) return;
            startMenuDrag(it, e, { source: "hidden" });
          });
          list.appendChild(item);
        });
      }
      body.appendChild(list);
    } else {
      const list = document.createElement("div");
      list.className = "map-hidden-list";
      if (hiddenLinks.length === 0) {
        const empty = document.createElement("div");
        empty.className = "map-hidden-empty";
        empty.textContent = "No hidden links.";
        list.appendChild(empty);
      } else {
        hiddenLinks.forEach((link) => {
          const item = document.createElement("div");
          item.className = "map-hidden-item";
          const label = document.createElement("span");
          label.textContent = `${titleOf3(link.a)} \u2194 ${titleOf3(link.b)}`;
          item.appendChild(label);
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = "Unhide";
          btn.addEventListener("click", async () => {
            await setLinkHidden(link.a.id, link.b.id, false);
            await renderMap(mapState.root);
          });
          item.appendChild(btn);
          list.appendChild(item);
        });
      }
      body.appendChild(list);
    }
    panel.appendChild(body);
    container.appendChild(panel);
    if (allowPanel && !mapState.panelVisible) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "map-hidden-toggle";
      toggle.textContent = "Show menu";
      toggle.addEventListener("click", () => {
        mapState.panelVisible = true;
        renderMap(mapState.root);
      });
      container.appendChild(toggle);
    }
  }
  function startMenuDrag(item, event, options = {}) {
    event.preventDefault();
    const ghost = document.createElement("div");
    ghost.className = "map-drag-ghost";
    ghost.textContent = titleOf3(item) || item.id;
    document.body.appendChild(ghost);
    mapState.menuDrag = {
      id: item.id,
      ghost,
      source: options.source || "hidden",
      tabId: options.tabId || (getActiveTab()?.id || null)
    };
    updateMenuDragPosition(event.clientX, event.clientY);
  }
  async function finishMenuDrag(clientX, clientY) {
    const drag = mapState.menuDrag;
    mapState.menuDrag = null;
    if (drag?.ghost) drag.ghost.remove();
    if (!drag || !mapState.svg) return;
    const rect = mapState.svg.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      return;
    }
    const { x, y } = clientToMap(clientX, clientY);
    const item = await getItem(drag.id);
    if (!item) return;
    if (drag.source === "palette") {
      const tab2 = getActiveTab();
      if (!tab2 || !tab2.manualMode) return;
      if (drag.tabId && tab2.id !== drag.tabId) return;
      if (!Array.isArray(tab2.manualIds)) {
        tab2.manualIds = [];
      }
      let shouldPersist = false;
      if (!tab2.manualIds.includes(item.id)) {
        tab2.manualIds.push(item.id);
        shouldPersist = true;
      }
      item.mapHidden = false;
      await upsertItem(item);
      const layout = ensureTabLayout(tab2);
      const prev = layout[item.id];
      layout[item.id] = { x, y };
      if (!prev || prev.x !== x || prev.y !== y) {
        shouldPersist = true;
      }
      if (shouldPersist) {
        await persistMapConfig();
      }
      await renderMap(mapState.root);
      return;
    }
    item.mapHidden = false;
    await upsertItem(item);
    const tab = getActiveTab();
    if (tab) {
      const layout = ensureTabLayout(tab);
      const prev = layout[item.id];
      layout[item.id] = { x, y };
      if (!prev || prev.x !== x || prev.y !== y) {
        await persistMapConfig();
      }
    }
    await renderMap(mapState.root);
  }
  function updateMenuDragPosition(clientX, clientY) {
    if (!mapState.menuDrag?.ghost) return;
    mapState.menuDrag.ghost.style.left = `${clientX + 12}px`;
    mapState.menuDrag.ghost.style.top = `${clientY + 12}px`;
  }
  function startToolboxDrag(event) {
    if (event.button !== 0) return;
    if (!mapState.toolboxEl || !mapState.toolboxContainer) return;
    if (event.target.closest(".map-toolbox-toggle")) return;
    event.preventDefault();
    const boxRect = mapState.toolboxEl.getBoundingClientRect();
    const containerRect = mapState.toolboxContainer.getBoundingClientRect();
    mapState.toolboxDrag = {
      offsetX: event.clientX - boxRect.left,
      offsetY: event.clientY - boxRect.top,
      boxWidth: boxRect.width,
      boxHeight: boxRect.height,
      containerRect
    };
    if (typeof document !== "undefined") {
      document.body.classList.add("map-toolbox-dragging");
    }
  }
  function moveToolboxDrag(clientX, clientY) {
    const drag = mapState.toolboxDrag;
    if (!drag || !mapState.toolboxEl) return;
    const { containerRect, offsetX, offsetY, boxWidth, boxHeight } = drag;
    const width = containerRect.width;
    const height = containerRect.height;
    if (!width || !height) return;
    let x = clientX - containerRect.left - offsetX;
    let y = clientY - containerRect.top - offsetY;
    const maxX = Math.max(0, width - boxWidth);
    const maxY = Math.max(0, height - boxHeight);
    x = clamp(x, 0, maxX);
    y = clamp(y, 0, maxY);
    mapState.toolboxPos = { x, y };
    mapState.toolboxEl.style.left = `${x}px`;
    mapState.toolboxEl.style.top = `${y}px`;
  }
  function stopToolboxDrag() {
    if (typeof document !== "undefined") {
      document.body.classList.remove("map-toolbox-dragging");
    }
    if (!mapState.toolboxDrag) {
      ensureToolboxWithinBounds();
      return;
    }
    mapState.toolboxDrag = null;
    ensureToolboxWithinBounds();
  }
  function ensureToolboxWithinBounds() {
    const box = mapState.toolboxEl;
    const container = mapState.toolboxContainer;
    if (!box || !container || !box.isConnected || !container.isConnected) return;
    const containerRect = container.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    const width = containerRect.width;
    const height = containerRect.height;
    if (!width || !height) return;
    const maxX = Math.max(0, width - boxRect.width);
    const maxY = Math.max(0, height - boxRect.height);
    const x = clamp(mapState.toolboxPos.x, 0, maxX);
    const y = clamp(mapState.toolboxPos.y, 0, maxY);
    mapState.toolboxPos = { x, y };
    box.style.left = `${x}px`;
    box.style.top = `${y}px`;
  }
  function determineBaseCursor() {
    if (mapState.draggingView || mapState.nodeDrag || mapState.areaDrag) return "grabbing";
    switch (mapState.tool) {
      case TOOL.AREA:
        return "crosshair";
      case TOOL.NAVIGATE:
        return "grab";
      case TOOL.HIDE:
      case TOOL.BREAK:
      case TOOL.ADD_LINK:
        return "grab";
      default:
        return "pointer";
    }
  }
  function refreshCursor(options = {}) {
    if (!mapState.svg) return;
    const { keepOverride = false } = options;
    const base = determineBaseCursor();
    mapState.baseCursor = base;
    if (mapState.cursorOverride) {
      const overrideStyle = CURSOR_STYLE[mapState.cursorOverride];
      if (keepOverride && overrideStyle) {
        mapState.svg.style.cursor = overrideStyle;
        return;
      }
      mapState.cursorOverride = null;
    }
    mapState.svg.style.cursor = base;
  }
  function applyCursorOverride(kind) {
    if (!mapState.svg) return;
    if (mapState.nodeDrag || mapState.areaDrag || mapState.draggingView) return;
    const style = CURSOR_STYLE[kind];
    if (!style) return;
    mapState.cursorOverride = kind;
    mapState.svg.style.cursor = style;
  }
  function clearCursorOverride(kind) {
    if (mapState.cursorOverride !== kind) return;
    mapState.cursorOverride = null;
    refreshCursor();
  }
  async function persistNodePosition(id, options = {}) {
    const tab = getActiveTab();
    if (!tab) return;
    const pos = mapState.positions[id];
    if (!pos) return;
    const layout = ensureTabLayout(tab);
    layout[id] = { x: pos.x, y: pos.y };
    if (options.persist !== false) {
      await persistMapConfig();
    }
  }
  function gatherHiddenLinks(items, itemMap) {
    const hidden = [];
    const seen = /* @__PURE__ */ new Set();
    items.forEach((it) => {
      (it.links || []).forEach((link) => {
        if (!link.hidden) return;
        const other = itemMap[link.id];
        if (!other) return;
        const key = it.id < link.id ? `${it.id}|${link.id}` : `${link.id}|${it.id}`;
        if (seen.has(key)) return;
        seen.add(key);
        hidden.push({ a: it, b: other });
      });
    });
    return hidden;
  }
  async function handleAddLinkClick(nodeId) {
    if (!mapState.pendingLink) {
      mapState.pendingLink = nodeId;
      updatePendingHighlight();
      return;
    }
    if (mapState.pendingLink === nodeId) {
      mapState.pendingLink = null;
      updatePendingHighlight();
      return;
    }
    const from = mapState.itemMap[mapState.pendingLink];
    const to = mapState.itemMap[nodeId];
    if (!from || !to) {
      mapState.pendingLink = null;
      updatePendingHighlight();
      return;
    }
    const existing = (from.links || []).find((l) => l.id === nodeId);
    if (existing) {
      if (existing.hidden) {
        if (confirm("A hidden link already exists. Unhide it?")) {
          await setLinkHidden(from.id, to.id, false);
          await renderMap(mapState.root);
        }
      } else {
        alert("These concepts are already linked.");
      }
      mapState.pendingLink = null;
      updatePendingHighlight();
      return;
    }
    if (!confirm(`Create a link between ${titleOf3(from)} and ${titleOf3(to)}?`)) {
      mapState.pendingLink = null;
      updatePendingHighlight();
      return;
    }
    const label = prompt("Optional label for this link:", "") || "";
    await createLink(from.id, to.id, {
      name: label,
      color: DEFAULT_LINK_COLOR,
      style: DEFAULT_LINE_STYLE,
      thickness: DEFAULT_LINE_THICKNESS,
      hidden: false
    });
    mapState.pendingLink = null;
    updatePendingHighlight();
    await renderMap(mapState.root);
  }
  function handleEdgeClick(path, aId, bId, evt) {
    hideEdgeTooltip(path);
    if (mapState.tool === TOOL.NAVIGATE) {
      openLineMenu(evt, path, aId, bId);
    } else if (mapState.tool === TOOL.BREAK) {
      if (confirm("Are you sure you want to delete this link?")) {
        removeLink(aId, bId).then(() => renderMap(mapState.root));
      }
    } else if (mapState.tool === TOOL.HIDE) {
      if (confirm("Hide this link on the map?")) {
        setLinkHidden(aId, bId, true).then(() => renderMap(mapState.root));
      }
    }
  }
  function showEdgeTooltip(line, evt) {
    const tooltip = mapState.edgeTooltip;
    const container = mapState.container;
    if (!tooltip || !container) return;
    const text = line?.dataset?.label || "";
    if (!text) {
      hideEdgeTooltip(line);
      return;
    }
    tooltip.textContent = text;
    tooltip.classList.remove("hidden");
    mapState.hoveredEdge = line;
    if (evt && Number.isFinite(evt.clientX) && Number.isFinite(evt.clientY)) {
      mapState.hoveredEdgePointer = { x: evt.clientX, y: evt.clientY };
    }
    positionEdgeTooltip(evt);
  }
  function moveEdgeTooltip(line, evt) {
    if (mapState.hoveredEdge !== line) return;
    if (!mapState.edgeTooltip || mapState.edgeTooltip.classList.contains("hidden")) return;
    if (evt && Number.isFinite(evt.clientX) && Number.isFinite(evt.clientY)) {
      mapState.hoveredEdgePointer = { x: evt.clientX, y: evt.clientY };
    }
    positionEdgeTooltip(evt);
  }
  function hideEdgeTooltip(line) {
    if (line && mapState.hoveredEdge && mapState.hoveredEdge !== line) return;
    const tooltip = mapState.edgeTooltip;
    if (!tooltip) return;
    tooltip.classList.add("hidden");
    tooltip.textContent = "";
    mapState.hoveredEdge = null;
  }
  function positionEdgeTooltip(evt) {
    const tooltip = mapState.edgeTooltip;
    const container = mapState.container;
    if (!tooltip || !container) return;
    const rect = container.getBoundingClientRect();
    const pointer = evt && Number.isFinite(evt.clientX) && Number.isFinite(evt.clientY) ? { x: evt.clientX, y: evt.clientY } : mapState.hoveredEdgePointer;
    const rawX = pointer.x - rect.left + 14;
    const rawY = pointer.y - rect.top + 14;
    const maxX = rect.width - tooltip.offsetWidth - 12;
    const maxY = rect.height - tooltip.offsetHeight - 12;
    const clampedX = clamp(rawX, 12, Math.max(12, maxX));
    const clampedY = clamp(rawY, 12, Math.max(12, maxY));
    tooltip.style.left = `${clampedX}px`;
    tooltip.style.top = `${clampedY}px`;
  }
  function adjustScale() {
    const svg = mapState.svg;
    if (!svg) return;
    const vb = svg.getAttribute("viewBox");
    if (!vb) return;
    const [, , w] = vb.split(" ").map(Number);
    if (!Number.isFinite(w) || w <= 0) return;
    const defaultSize = Number.isFinite(mapState.defaultViewSize) ? mapState.defaultViewSize : w;
    const zoomInRatio = defaultSize / w;
    const zoomOutRatio = w / defaultSize;
    const nodeScale = clamp(Math.pow(zoomInRatio, 0.5), 0.65, 2.6);
    const labelScale = clamp(Math.pow(zoomOutRatio, 0.4), 1.2, 3.2);
    const lineScale = clamp(Math.pow(zoomInRatio, 0.33), 0.7, 2.4);
    mapState.currentScales = { nodeScale, labelScale, lineScale };
    mapState.elements.forEach((entry, id) => {
      updateNodeGeometry(id, entry);
    });
    svg.querySelectorAll(".map-edge").forEach((line) => {
      updateLineStrokeWidth(line);
      syncLineDecoration(line);
    });
  }
  function pointToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    if (!l2) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    return Math.hypot(px - projX, py - projY);
  }
  function calcPath(aId, bId) {
    const positions = mapState.positions;
    const a = positions[aId];
    const b = positions[bId];
    if (!a || !b) return "";
    const x1 = a.x, y1 = a.y;
    const x2 = b.x, y2 = b.y;
    let cx = (x1 + x2) / 2;
    let cy = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    for (const id in positions) {
      if (id === aId || id === bId) continue;
      const p = positions[id];
      if (pointToSegment(p.x, p.y, x1, y1, x2, y2) < 40) {
        const nx = -dy / len;
        const ny = dx / len;
        const side = (p.x - x1) * nx + (p.y - y1) * ny > 0 ? 1 : -1;
        cx += nx * 80 * side;
        cy += ny * 80 * side;
        break;
      }
    }
    return `M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}`;
  }
  function applyLineStyle(line, info = {}) {
    const previousColor = line.dataset.color;
    const previousStyle = line.dataset.style;
    const previousThickness = line.dataset.thickness;
    const previousLabel = line.dataset.label;
    const color = info.color ?? previousColor ?? DEFAULT_LINK_COLOR;
    const style = normalizeLineStyle(info.style ?? previousStyle);
    const thickness = info.thickness ?? previousThickness ?? DEFAULT_LINE_THICKNESS;
    const label = info.name ?? previousLabel ?? "";
    line.dataset.color = color;
    line.dataset.style = style;
    line.dataset.thickness = thickness;
    line.dataset.baseWidth = String(getLineThicknessValue(thickness));
    line.dataset.label = label;
    line.style.stroke = color;
    line.style.color = color;
    line.style.filter = "";
    line.removeAttribute("marker-start");
    line.removeAttribute("marker-end");
    line.removeAttribute("marker-mid");
    line.removeAttribute("stroke-dasharray");
    line.classList.remove("edge-glow");
    updateLineStrokeWidth(line);
    if (style === "dashed") {
      const base = getLineThicknessValue(thickness);
      line.setAttribute("stroke-dasharray", `${base * 3},${base * 2}`);
      line.setAttribute("stroke-linecap", "round");
    } else if (style === "dotted") {
      const base = Math.max(1, getLineThicknessValue(thickness) * 0.9);
      line.setAttribute("stroke-dasharray", `${base},${base * 2.1}`);
      line.setAttribute("stroke-linecap", "round");
    } else {
      line.removeAttribute("stroke-dasharray");
      line.setAttribute("stroke-linecap", "round");
    }
    if (style === "arrow-end") {
      line.setAttribute("marker-end", "url(#arrow-end)");
    } else if (style === "arrow-start") {
      line.setAttribute("marker-start", "url(#arrow-start)");
    } else if (style === "arrow-both") {
      line.setAttribute("marker-start", "url(#arrow-start)");
      line.setAttribute("marker-end", "url(#arrow-end)");
    }
    if (style === "glow") {
      line.classList.add("edge-glow");
    }
    const title = line.querySelector("title");
    if (title) title.remove();
    if (label) {
      line.setAttribute("aria-label", label);
    } else {
      line.removeAttribute("aria-label");
    }
    if (mapState.hoveredEdge === line) {
      if (label) {
        showEdgeTooltip(line, { clientX: mapState.hoveredEdgePointer.x, clientY: mapState.hoveredEdgePointer.y });
      } else {
        hideEdgeTooltip(line);
      }
    }
    syncLineDecoration(line);
  }
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }
  function updateLineStrokeWidth(line) {
    if (!line) return;
    const baseWidth = Number(line.dataset.baseWidth) || getLineThicknessValue(line.dataset.thickness);
    const { lineScale = 1 } = getCurrentScales();
    const strokeWidth = baseWidth * lineScale;
    if (Number.isFinite(strokeWidth)) {
      line.setAttribute("stroke-width", strokeWidth);
    }
    if (line._overlay) {
      const overlayBase = Number(line._overlay.dataset.baseWidth) || baseWidth * 0.85;
      const overlayWidth = overlayBase * lineScale;
      if (Number.isFinite(overlayWidth)) {
        line._overlay.setAttribute("stroke-width", overlayWidth);
      }
    }
  }
  function syncLineDecoration(line) {
    const style = normalizeLineStyle(line?.dataset?.style);
    if (style === "blocked") {
      const overlay = ensureLineOverlay(line);
      if (overlay) updateBlockedOverlay(line, overlay);
    } else {
      removeLineOverlay(line);
    }
  }
  function ensureLineOverlay(line) {
    if (!line || !line.parentNode) return null;
    let overlay = line._overlay;
    if (overlay && overlay.parentNode !== line.parentNode) {
      overlay.remove();
      overlay = null;
    }
    if (!overlay) {
      overlay = document.createElementNS("http://www.w3.org/2000/svg", "path");
      overlay.classList.add("map-edge-decoration");
      overlay.setAttribute("fill", "none");
      overlay.setAttribute("pointer-events", "none");
      overlay.setAttribute("stroke-linecap", "round");
      overlay.setAttribute("stroke-linejoin", "round");
      line.parentNode.insertBefore(overlay, line.nextSibling);
      line._overlay = overlay;
    }
    return overlay;
  }
  function removeLineOverlay(line) {
    if (line && line._overlay) {
      line._overlay.remove();
      line._overlay = null;
    }
  }
  function updateBlockedOverlay(line, overlay) {
    if (!line || !overlay) return;
    const a = mapState.positions[line.dataset.a];
    const b = mapState.positions[line.dataset.b];
    if (!a || !b) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (!len) return;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const tx = dx / len;
    const ty = dy / len;
    const nx = -ty;
    const ny = tx;
    const diag1x = tx + nx;
    const diag1y = ty + ny;
    const diag2x = tx - nx;
    const diag2y = ty - ny;
    const norm1 = Math.hypot(diag1x, diag1y) || 1;
    const norm2 = Math.hypot(diag2x, diag2y) || 1;
    const baseWidth = Number(line.dataset.baseWidth) || getLineThicknessValue(line.dataset.thickness);
    const armLength = Math.max(28, baseWidth * 4.2);
    const d = `M${midX - diag1x / norm1 * armLength} ${midY - diag1y / norm1 * armLength} L${midX + diag1x / norm1 * armLength} ${midY + diag1y / norm1 * armLength} M${midX - diag2x / norm2 * armLength} ${midY - diag2y / norm2 * armLength} L${midX + diag2x / norm2 * armLength} ${midY + diag2y / norm2 * armLength}`;
    overlay.setAttribute("d", d);
    const overlayBase = baseWidth * 1.6;
    overlay.dataset.baseWidth = String(overlayBase);
    const scales = getCurrentScales();
    overlay.setAttribute("stroke", "#dc2626");
    overlay.setAttribute("stroke-width", overlayBase * (scales.lineScale || 1));
  }
  async function setNodeHidden(id, hidden) {
    const item = await getItem(id);
    if (!item) return;
    item.mapHidden = hidden;
    await upsertItem(item);
  }
  async function createLink(aId, bId, info) {
    const a = await getItem(aId);
    const b = await getItem(bId);
    if (!a || !b) return;
    const linkInfo = {
      id: bId,
      style: DEFAULT_LINE_STYLE,
      thickness: DEFAULT_LINE_THICKNESS,
      color: DEFAULT_LINK_COLOR,
      name: "",
      hidden: false,
      ...info
    };
    const reverseInfo = { ...linkInfo, id: aId };
    a.links = a.links || [];
    b.links = b.links || [];
    a.links.push({ ...linkInfo });
    b.links.push({ ...reverseInfo });
    await upsertItem(a);
    await upsertItem(b);
  }
  async function removeLink(aId, bId) {
    const a = await getItem(aId);
    const b = await getItem(bId);
    if (!a || !b) return;
    a.links = (a.links || []).filter((l) => l.id !== bId);
    b.links = (b.links || []).filter((l) => l.id !== aId);
    await upsertItem(a);
    await upsertItem(b);
  }
  async function setLinkHidden(aId, bId, hidden) {
    await updateLink(aId, bId, { hidden });
  }
  function titleOf3(item) {
    return item?.name || item?.concept || "";
  }
  async function openLineMenu(evt, line, aId, bId) {
    const existing = await getItem(aId);
    const link = existing.links.find((l) => l.id === bId) || {};
    const menu = document.createElement("div");
    menu.className = "line-menu";
    menu.style.left = evt.pageX + "px";
    menu.style.top = evt.pageY + "px";
    const colorLabel = document.createElement("label");
    colorLabel.textContent = "Color";
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = link.color || "#888888";
    colorLabel.appendChild(colorInput);
    menu.appendChild(colorLabel);
    const typeLabel = document.createElement("label");
    typeLabel.textContent = "Style";
    const typeSel = document.createElement("select");
    LINE_STYLE_OPTIONS.forEach((option) => {
      const opt = document.createElement("option");
      opt.value = option.value;
      opt.textContent = option.label;
      typeSel.appendChild(opt);
    });
    typeSel.value = normalizeLineStyle(link.style || DEFAULT_LINE_STYLE);
    typeLabel.appendChild(typeSel);
    menu.appendChild(typeLabel);
    const thickLabel = document.createElement("label");
    thickLabel.textContent = "Thickness";
    const thickSel = document.createElement("select");
    LINE_THICKNESS_OPTIONS.forEach((option) => {
      const opt = document.createElement("option");
      opt.value = option.value;
      opt.textContent = option.label;
      thickSel.appendChild(opt);
    });
    thickSel.value = link.thickness || DEFAULT_LINE_THICKNESS;
    thickLabel.appendChild(thickSel);
    menu.appendChild(thickLabel);
    const nameLabel = document.createElement("label");
    nameLabel.textContent = "Label";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = link.name || "";
    nameLabel.appendChild(nameInput);
    menu.appendChild(nameLabel);
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.textContent = "Save";
    btn.addEventListener("click", async () => {
      const patch = {
        color: colorInput.value,
        style: typeSel.value,
        thickness: thickSel.value,
        name: nameInput.value
      };
      await updateLink(aId, bId, patch);
      applyLineStyle(line, patch);
      document.body.removeChild(menu);
    });
    menu.appendChild(btn);
    document.body.appendChild(menu);
    const closer = (e) => {
      if (!menu.contains(e.target)) {
        document.body.removeChild(menu);
        document.removeEventListener("mousedown", closer);
      }
    };
    setTimeout(() => document.addEventListener("mousedown", closer), 0);
  }
  async function updateLink(aId, bId, patch) {
    const a = await getItem(aId);
    const b = await getItem(bId);
    if (!a || !b) return;
    const apply = (item, otherId) => {
      item.links = item.links || [];
      const l = item.links.find((x) => x.id === otherId);
      if (l) Object.assign(l, patch);
    };
    apply(a, bId);
    apply(b, aId);
    await upsertItem(a);
    await upsertItem(b);
  }

  // js/ui/components/entry-controls.js
  var defaultOptions = [
    { value: "disease", label: "Disease" },
    { value: "drug", label: "Drug" },
    { value: "concept", label: "Concept" }
  ];
  function createEntryAddControl(onAdded, initialKind = "disease") {
    const wrapper = document.createElement("div");
    wrapper.className = "entry-add-control";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fab-btn";
    button.innerHTML = '<span class="sr-only">Add new entry</span><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    button.setAttribute("aria-label", "Add new entry");
    const menu = document.createElement("div");
    menu.className = "entry-add-menu hidden";
    const options = [...defaultOptions];
    if (initialKind) {
      const idx = options.findIndex((opt) => opt.value === initialKind);
      if (idx > 0) {
        const [preferred] = options.splice(idx, 1);
        options.unshift(preferred);
      }
    }
    options.forEach((opt) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "entry-add-menu-item";
      item.textContent = opt.label;
      item.addEventListener("click", () => {
        closeMenu();
        openEditor(opt.value, onAdded);
      });
      menu.appendChild(item);
    });
    function setOpen(open) {
      menu.classList.toggle("hidden", !open);
      wrapper.classList.toggle("open", open);
      button.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) document.addEventListener("mousedown", handleOutside);
      else document.removeEventListener("mousedown", handleOutside);
    }
    function closeMenu() {
      setOpen(false);
    }
    function handleOutside(e) {
      if (!wrapper.contains(e.target)) {
        closeMenu();
      }
    }
    button.addEventListener("click", () => {
      const willOpen = menu.classList.contains("hidden");
      setOpen(willOpen);
    });
    wrapper.appendChild(button);
    wrapper.appendChild(menu);
    setOpen(false);
    return wrapper;
  }

  // js/main.js
  var tabs = ["Diseases", "Drugs", "Concepts", "Cards", "Study", "Exams", "Map"];
  async function render() {
    const root = document.getElementById("app");
    const activeEl = document.activeElement;
    const shouldRestoreSearch = activeEl && activeEl.dataset && activeEl.dataset.role === "global-search";
    const selectionStart = shouldRestoreSearch && typeof activeEl.selectionStart === "number" ? activeEl.selectionStart : null;
    const selectionEnd = shouldRestoreSearch && typeof activeEl.selectionEnd === "number" ? activeEl.selectionEnd : null;
    root.innerHTML = "";
    const header = document.createElement("header");
    header.className = "header";
    const left = document.createElement("div");
    left.className = "header-left";
    const brand = document.createElement("div");
    brand.className = "brand";
    brand.textContent = "\u2728 Sevenn";
    left.appendChild(brand);
    const nav = document.createElement("nav");
    nav.className = "tabs";
    nav.setAttribute("aria-label", "Primary sections");
    const tabClassMap = {
      Diseases: "tab-disease",
      Drugs: "tab-drug",
      Concepts: "tab-concept",
      Cards: "tab-cards",
      Study: "tab-study",
      Exams: "tab-exams",
      Map: "tab-map"
    };
    tabs.forEach((t) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tab";
      if (state.tab === t) btn.classList.add("active");
      const variant = tabClassMap[t];
      if (variant) btn.classList.add(variant);
      btn.textContent = t;
      btn.addEventListener("click", () => {
        setTab(t);
        render();
      });
      nav.appendChild(btn);
    });
    left.appendChild(nav);
    header.appendChild(left);
    const right = document.createElement("div");
    right.className = "header-right";
    const searchField = document.createElement("label");
    searchField.className = "search-field";
    searchField.setAttribute("aria-label", "Search entries");
    const searchIcon = document.createElement("span");
    searchIcon.className = "search-icon";
    searchIcon.setAttribute("aria-hidden", "true");
    searchIcon.innerHTML = '<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M14.5 14.5L18 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="9" cy="9" r="5.8" stroke="currentColor" stroke-width="1.6"/></svg>';
    searchField.appendChild(searchIcon);
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Search entries";
    search.value = state.query;
    search.autocomplete = "off";
    search.spellcheck = false;
    search.className = "search-input";
    search.dataset.role = "global-search";
    search.addEventListener("input", (e) => {
      setQuery(e.target.value);
      render();
    });
    search.addEventListener("search", (e) => {
      setQuery(e.target.value);
      render();
    });
    searchField.appendChild(search);
    right.appendChild(searchField);
    const settingsBtn = document.createElement("button");
    settingsBtn.type = "button";
    settingsBtn.className = "header-settings-btn";
    if (state.tab === "Settings") settingsBtn.classList.add("active");
    settingsBtn.setAttribute("aria-label", "Settings");
    settingsBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.8" stroke="currentColor" stroke-width="1.6"/></svg>';
    settingsBtn.addEventListener("click", () => {
      setTab("Settings");
      render();
    });
    right.appendChild(settingsBtn);
    header.appendChild(right);
    root.appendChild(header);
    if (shouldRestoreSearch) {
      requestAnimationFrame(() => {
        search.focus();
        if (selectionStart !== null && selectionEnd !== null && search.setSelectionRange) {
          search.setSelectionRange(selectionStart, selectionEnd);
        } else {
          const len = search.value.length;
          if (search.setSelectionRange) search.setSelectionRange(len, len);
        }
      });
    }
    const main = document.createElement("main");
    if (state.tab === "Map") main.className = "map-main";
    root.appendChild(main);
    if (state.tab === "Settings") {
      await renderSettings(main);
    } else if (["Diseases", "Drugs", "Concepts"].includes(state.tab)) {
      const kindMap = { Diseases: "disease", Drugs: "drug", Concepts: "concept" };
      const kind = kindMap[state.tab];
      main.appendChild(createEntryAddControl(render, kind));
      const listHost = document.createElement("div");
      listHost.className = "tab-content";
      main.appendChild(listHost);
      const filter = { ...state.filters, types: [kind], query: state.query };
      const query = findItemsByFilter(filter);
      await renderCardList(listHost, query, kind, render);
    } else if (state.tab === "Cards") {
      main.appendChild(createEntryAddControl(render, "disease"));
      const content = document.createElement("div");
      content.className = "tab-content";
      main.appendChild(content);
      const filter = { ...state.filters, query: state.query };
      const query = findItemsByFilter(filter);
      const items = await query.toArray();
      await renderCards(content, items, render);
    } else if (state.tab === "Study") {
      main.appendChild(createEntryAddControl(render, "disease"));
      const content = document.createElement("div");
      content.className = "tab-content";
      main.appendChild(content);
      if (state.flashSession) {
        renderFlashcards(content, render);
      } else if (state.quizSession) {
        renderQuiz(content, render);
      } else {
        const wrap = document.createElement("div");
        await renderBuilder(wrap);
        content.appendChild(wrap);
        const subnav = document.createElement("div");
        subnav.className = "tabs row subtabs";
        ["Flashcards", "Review", "Quiz", "Blocks"].forEach((st) => {
          const sb = document.createElement("button");
          sb.className = "tab";
          const isActive = state.subtab.Study === st;
          if (isActive) sb.classList.add("active");
          sb.dataset.toggle = "true";
          sb.dataset.active = isActive ? "true" : "false";
          sb.setAttribute("aria-pressed", isActive ? "true" : "false");
          sb.textContent = st;
          sb.addEventListener("click", () => {
            setSubtab("Study", st);
            render();
          });
          subnav.appendChild(sb);
        });
        content.appendChild(subnav);
        if (state.cohort.length) {
          if (state.subtab.Study === "Flashcards") {
            const startBtn = document.createElement("button");
            startBtn.className = "btn";
            startBtn.textContent = "Start Flashcards";
            startBtn.addEventListener("click", () => {
              setFlashSession({ idx: 0, pool: state.cohort });
              render();
            });
            content.appendChild(startBtn);
          } else if (state.subtab.Study === "Review") {
            renderReview(content, render);
          } else if (state.subtab.Study === "Quiz") {
            const startBtn = document.createElement("button");
            startBtn.className = "btn";
            startBtn.textContent = "Start Quiz";
            startBtn.addEventListener("click", () => {
              setQuizSession({ idx: 0, score: 0, pool: state.cohort });
              render();
            });
            content.appendChild(startBtn);
          } else if (state.subtab.Study === "Blocks") {
            renderBlockMode(content);
          }
        }
      }
    } else if (state.tab === "Exams") {
      main.appendChild(createEntryAddControl(render, "disease"));
      const content = document.createElement("div");
      content.className = "tab-content";
      main.appendChild(content);
      if (state.examSession) {
        renderExamRunner(content, render);
      } else {
        await renderExams(content, render);
      }
    } else if (state.tab === "Map") {
      main.appendChild(createEntryAddControl(render, "disease"));
      const mapHost = document.createElement("div");
      mapHost.className = "tab-content map-host";
      main.appendChild(mapHost);
      await renderMap(mapHost);
    } else {
      main.textContent = `Currently viewing: ${state.tab}`;
    }
  }
  async function bootstrap() {
    try {
      await initDB();
      render();
    } catch (err) {
      const root = document.getElementById("app");
      if (root) root.textContent = "Failed to load app";
      console.error(err);
    }
  }
  bootstrap();
})();
