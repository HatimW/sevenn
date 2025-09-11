var Sevenn = (() => {
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
    builder: { blocks: [], weeks: [], lectures: [], types: ["disease", "drug", "concept"], tags: [], onlyFav: false, manualPicks: [] },
    cohort: [],
    review: { count: 20, format: "flashcards" },
    quizSession: null,
    flashSession: null,
    examSession: null,
    map: { panzoom: false }
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

  // js/storage/idb.js
  var DB_NAME = "sevenn-db";
  var DB_VERSION = 2;
  function openDB() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in globalThis)) {
        reject(new Error("IndexedDB not supported"));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      const timer = setTimeout(() => reject(new Error("IndexedDB open timeout")), 5e3);
      req.onerror = () => {
        clearTimeout(timer);
        reject(req.error);
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
      };
      req.onsuccess = () => {
        clearTimeout(timer);
        resolve(req.result);
      };
    });
  }

  // js/search.js
  function tokenize(str) {
    return str.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  }
  function buildTokens(item) {
    const fields = [];
    if (item.name) fields.push(item.name);
    if (item.concept) fields.push(item.concept);
    fields.push(...item.facts || [], ...item.tags || []);
    if (item.lectures) fields.push(...item.lectures.map((l) => l.name));
    return Array.from(new Set(tokenize(fields.join(" ")))).slice(0, 200).join(" ");
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
  function cleanItem(item) {
    return {
      ...item,
      favorite: !!item.favorite,
      color: item.color || null,
      facts: item.facts || [],
      tags: item.tags || [],
      links: item.links || [],
      blocks: item.blocks || [],
      weeks: item.weeks || [],
      lectures: item.lectures || [],
      sr: item.sr || { box: 0, last: 0, due: 0, ease: 2.5 }
    };
  }

  // js/storage/storage.js
  var dbPromise;
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
  async function listBlocks() {
    try {
      const b = await store("blocks");
      return await prom2(b.getAll());
    } catch (err) {
      console.warn("listBlocks failed", err);
      return [];
    }
  }
  async function upsertBlock(def) {
    const b = await store("blocks", "readwrite");
    const existing = await prom2(b.get(def.blockId));
    const now = Date.now();
    const next = {
      ...def,
      lectures: def.lectures || [],
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    await prom2(b.put(next));
  }
  async function deleteBlock(blockId) {
    const b = await store("blocks", "readwrite");
    await prom2(b.delete(blockId));
  }
  async function listItemsByKind(kind) {
    const i = await store("items");
    const idx = i.index("by_kind");
    return await prom2(idx.getAll(kind));
  }
  function titleOf(item) {
    return item.name || item.concept || "";
  }
  async function findItemsByFilter(filter) {
    const i = await store("items");
    let items = await prom2(i.getAll());
    if (filter.types && filter.types.length) {
      items = items.filter((it) => filter.types.includes(it.kind));
    }
    if (filter.block) {
      items = items.filter((it) => (it.blocks || []).includes(filter.block));
    }
    if (filter.week) {
      items = items.filter((it) => (it.weeks || []).includes(filter.week));
    }
    if (filter.onlyFav) {
      items = items.filter((it) => it.favorite);
    }
    if (filter.query && filter.query.trim()) {
      const toks = tokenize(filter.query);
      items = items.filter((it) => {
        const t = it.tokens || "";
        return toks.every((tok) => t.includes(tok));
      });
    }
    if (filter.sort === "name") {
      items.sort((a, b) => titleOf(a).localeCompare(titleOf(b)));
    } else {
      items.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return items;
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
    for (const link of next.links) {
      const other = await prom2(i.get(link.id));
      if (other) {
        other.links = other.links || [];
        if (!other.links.find((l) => l.id === next.id)) {
          other.links.push({ id: next.id, type: link.type });
          other.tokens = buildTokens(other);
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
    blocks.forEach((b) => {
      const wrap = document.createElement("div");
      wrap.className = "block";
      const title = document.createElement("h3");
      title.textContent = `${b.blockId} \u2013 ${b.title}`;
      wrap.appendChild(title);
      const del = document.createElement("button");
      del.className = "btn";
      del.textContent = "Delete";
      del.addEventListener("click", async () => {
        if (await confirmModal("Delete block?")) {
          await deleteBlock(b.blockId);
          await renderSettings(root);
        }
      });
      wrap.appendChild(del);
      const lecList = document.createElement("ul");
      b.lectures.forEach((l) => {
        const li = document.createElement("li");
        li.textContent = `${l.id}: ${l.name} (W${l.week})`;
        lecList.appendChild(li);
      });
      wrap.appendChild(lecList);
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
        const updated = { ...b, lectures: [...b.lectures, lecture] };
        await upsertBlock(updated);
        await renderSettings(root);
      });
      wrap.appendChild(lecForm);
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
    const add = document.createElement("button");
    add.className = "btn";
    add.type = "submit";
    add.textContent = "Add block";
    form.append(id, titleInput, weeks, add);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const def = {
        blockId: id.value.trim(),
        title: titleInput.value.trim(),
        weeks: Number(weeks.value),
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

  // js/ui/components/editor.js
  var fieldMap = {
    disease: [
      ["etiology", "Etiology"],
      ["pathophys", "Pathophys"],
      ["clinical", "Clinical"],
      ["diagnosis", "Diagnosis"],
      ["treatment", "Treatment"],
      ["complications", "Complications"],
      ["mnemonic", "Mnemonic"],
      ["facts", "Facts (comma separated)"]
    ],
    drug: [
      ["class", "Class"],
      ["source", "Source"],
      ["moa", "MOA"],
      ["uses", "Uses"],
      ["sideEffects", "Side Effects"],
      ["contraindications", "Contraindications"],
      ["mnemonic", "Mnemonic"],
      ["facts", "Facts (comma separated)"]
    ],
    concept: [
      ["type", "Type"],
      ["definition", "Definition"],
      ["mechanism", "Mechanism"],
      ["clinicalRelevance", "Clinical Relevance"],
      ["example", "Example"],
      ["mnemonic", "Mnemonic"],
      ["facts", "Facts (comma separated)"]
    ]
  };
  function openEditor(kind, onSave, existing = null) {
    const overlay = document.createElement("div");
    overlay.className = "modal";
    const form = document.createElement("form");
    form.className = "card";
    const title = document.createElement("h2");
    title.textContent = (existing ? "Edit " : "Add ") + kind;
    form.appendChild(title);
    const nameLabel = document.createElement("label");
    nameLabel.textContent = kind === "concept" ? "Concept" : "Name";
    const nameInput = document.createElement("input");
    nameInput.className = "input";
    nameInput.value = existing ? existing.name || existing.concept || "" : "";
    nameLabel.appendChild(nameInput);
    form.appendChild(nameLabel);
    const fieldInputs = {};
    fieldMap[kind].forEach(([field, label]) => {
      const lbl = document.createElement("label");
      lbl.textContent = label;
      let inp;
      if (field === "facts") {
        inp = document.createElement("input");
        inp.className = "input";
        inp.value = existing ? (existing.facts || []).join(", ") : "";
      } else {
        inp = document.createElement("textarea");
        inp.className = "input";
        inp.value = existing ? existing[field] || "" : "";
      }
      lbl.appendChild(inp);
      form.appendChild(lbl);
      fieldInputs[field] = inp;
    });
    const colorLabel = document.createElement("label");
    colorLabel.textContent = "Color";
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = existing?.color || "#ffffff";
    colorLabel.appendChild(colorInput);
    form.appendChild(colorLabel);
    const saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "btn";
    saveBtn.textContent = "Save";
    form.appendChild(saveBtn);
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => document.body.removeChild(overlay));
    form.appendChild(cancel);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const titleKey = kind === "concept" ? "concept" : "name";
      const item = existing || { id: uid(), kind };
      item[titleKey] = nameInput.value.trim();
      if (!item[titleKey]) return;
      fieldMap[kind].forEach(([field]) => {
        const v = fieldInputs[field].value.trim();
        if (field === "facts") {
          item.facts = v ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];
        } else {
          item[field] = v;
        }
      });
      item.color = colorInput.value;
      await upsertItem(item);
      document.body.removeChild(overlay);
      onSave && onSave();
    });
    overlay.appendChild(form);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) document.body.removeChild(overlay);
    });
    document.body.appendChild(overlay);
    nameInput.focus();
  }

  // js/ui/components/chips.js
  function chipList(values = []) {
    const box = document.createElement("div");
    box.className = "chips";
    values.forEach((v) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = v;
      box.appendChild(chip);
    });
    return box;
  }

  // js/ui/components/linker.js
  function openLinker() {
    alert("Linker not implemented yet");
  }

  // js/ui/components/cardlist.js
  var kindColors = { disease: "var(--pink)", drug: "var(--blue)", concept: "var(--green)" };
  var collapsedPref = {
    disease: ["pathophys", "clinical"],
    drug: ["moa", "uses"],
    concept: ["definition", "mechanism"]
  };
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
  var expanded = /* @__PURE__ */ new Set();
  function createItemCard(item, onChange) {
    const card = document.createElement("div");
    card.className = `item-card card--${item.kind}`;
    const color = item.color || kindColors[item.kind] || "var(--gray)";
    card.style.borderTop = `3px solid ${color}`;
    const header = document.createElement("div");
    header.className = "card-header";
    const mainBtn = document.createElement("button");
    mainBtn.className = "header-main";
    mainBtn.setAttribute("aria-expanded", expanded.has(item.id));
    mainBtn.addEventListener("click", () => {
      if (expanded.has(item.id)) expanded.delete(item.id);
      else expanded.add(item.id);
      renderBody();
      card.classList.toggle("expanded");
      mainBtn.setAttribute("aria-expanded", expanded.has(item.id));
    });
    const badge = document.createElement("span");
    badge.className = `kind-badge ${item.kind}`;
    badge.textContent = item.kind.charAt(0).toUpperCase() + item.kind.slice(1);
    mainBtn.appendChild(badge);
    const title = document.createElement("span");
    title.className = "card-title";
    title.textContent = item.name || item.concept || "Untitled";
    mainBtn.appendChild(title);
    header.appendChild(mainBtn);
    const actions = document.createElement("div");
    actions.className = "card-actions";
    const fav = document.createElement("button");
    fav.className = "icon-btn";
    fav.textContent = item.favorite ? "\u2605" : "\u2606";
    fav.title = "Toggle Favorite";
    fav.setAttribute("aria-label", "Toggle Favorite");
    fav.addEventListener("click", async (e) => {
      e.stopPropagation();
      item.favorite = !item.favorite;
      await upsertItem(item);
      fav.textContent = item.favorite ? "\u2605" : "\u2606";
      onChange && onChange();
    });
    actions.appendChild(fav);
    const link = document.createElement("button");
    link.className = "icon-btn";
    link.textContent = "\u{1FAA2}";
    link.title = "Links";
    link.setAttribute("aria-label", "Manage links");
    link.addEventListener("click", (e) => {
      e.stopPropagation();
      openLinker();
    });
    actions.appendChild(link);
    const edit = document.createElement("button");
    edit.className = "icon-btn";
    edit.textContent = "\u270F\uFE0F";
    edit.title = "Edit";
    edit.setAttribute("aria-label", "Edit");
    edit.addEventListener("click", (e) => {
      e.stopPropagation();
      openEditor(item.kind, onChange, item);
    });
    actions.appendChild(edit);
    const copy = document.createElement("button");
    copy.className = "icon-btn";
    copy.textContent = "\u{1F4CB}";
    copy.title = "Copy Title";
    copy.setAttribute("aria-label", "Copy Title");
    copy.addEventListener("click", (e) => {
      e.stopPropagation();
      navigator.clipboard && navigator.clipboard.writeText(item.name || item.concept || "");
    });
    actions.appendChild(copy);
    const del = document.createElement("button");
    del.className = "icon-btn";
    del.textContent = "\u{1F5D1}\uFE0F";
    del.title = "Delete";
    del.setAttribute("aria-label", "Delete");
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (await confirmModal("Delete this item?")) {
        await deleteItem(item.id);
        onChange && onChange();
      }
    });
    actions.appendChild(del);
    header.appendChild(actions);
    card.appendChild(header);
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
    card.appendChild(identifiers);
    const body = document.createElement("div");
    body.className = "card-body";
    card.appendChild(body);
    function renderBody() {
      body.innerHTML = "";
      const defs = fieldDefs[item.kind] || [];
      const showAll = expanded.has(item.id);
      const fields = showAll ? defs : defs.filter((d) => collapsedPref[item.kind].includes(d[0]));
      fields.forEach(([f, label, icon]) => {
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
        txt.textContent = item[f];
        sec.appendChild(txt);
        body.appendChild(sec);
      });
      if (item.links && item.links.length) {
        const lc = document.createElement("span");
        lc.className = "chip link-chip";
        lc.textContent = `\u{1FAA2} ${item.links.length}`;
        body.appendChild(lc);
      }
      if (item.facts && item.facts.length) {
        const facts = chipList(item.facts);
        facts.classList.add("facts");
        body.appendChild(facts);
      }
    }
    renderBody();
    if (expanded.has(item.id)) card.classList.add("expanded");
    return card;
  }
  async function renderCardList(container, items, kind, onChange) {
    const blocks = await listBlocks();
    const blockTitle = (id) => blocks.find((b) => b.blockId === id)?.title || id;
    const groups = /* @__PURE__ */ new Map();
    items.forEach((it) => {
      const bs = it.blocks && it.blocks.length ? it.blocks : ["_"];
      const ws = it.weeks && it.weeks.length ? it.weeks : ["_"];
      bs.forEach((b) => {
        if (!groups.has(b)) groups.set(b, /* @__PURE__ */ new Map());
        const wkMap = groups.get(b);
        ws.forEach((w) => {
          const arr = wkMap.get(w) || [];
          arr.push(it);
          wkMap.set(w, arr);
        });
      });
    });
    const sortedBlocks = Array.from(groups.keys()).sort((a, b) => {
      if (a === "_" && b !== "_") return 1;
      if (b === "_" && a !== "_") return -1;
      return a.localeCompare(b);
    });
    sortedBlocks.forEach((b) => {
      const blockSec = document.createElement("section");
      blockSec.className = "block-section";
      const h2 = document.createElement("div");
      h2.className = "block-header";
      h2.textContent = b === "_" ? "Unassigned" : `${blockTitle(b)} (${b})`;
      blockSec.appendChild(h2);
      const wkMap = groups.get(b);
      const sortedWeeks = Array.from(wkMap.keys()).sort((a, b2) => {
        if (a === "_" && b2 !== "_") return 1;
        if (b2 === "_" && a !== "_") return -1;
        return Number(a) - Number(b2);
      });
      sortedWeeks.forEach((w) => {
        const weekSec = document.createElement("div");
        weekSec.className = "week-section";
        const h3 = document.createElement("h3");
        h3.textContent = w === "_" ? "Unassigned" : `Week ${w}`;
        weekSec.appendChild(h3);
        const list = document.createElement("div");
        list.className = "card-list";
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
  }

  // js/ui/components/cards.js
  function renderCards(container, items, kind, onChange) {
    const grid = document.createElement("div");
    grid.className = "card-grid";
    items.forEach((it) => {
      const card = createItemCard(it, onChange);
      grid.appendChild(card);
    });
    container.appendChild(grid);
  }

  // js/ui/components/stats.js
  function renderStats(container, items) {
    const wrap = document.createElement("div");
    wrap.className = "stats";
    const total = document.createElement("div");
    total.textContent = `Total items: ${items.length}`;
    const fav = document.createElement("div");
    fav.textContent = `Favorites: ${items.filter((i) => i.favorite).length}`;
    wrap.appendChild(total);
    wrap.appendChild(fav);
    container.appendChild(wrap);
  }

  // js/ui/components/builder.js
  async function renderBuilder(root) {
    root.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "builder";
    root.appendChild(wrap);
    const blocks = await listBlocks();
    const blockSection = document.createElement("div");
    blockSection.className = "builder-section";
    const blockTitle = document.createElement("div");
    blockTitle.textContent = "Blocks:";
    blockSection.appendChild(blockTitle);
    blocks.forEach((b) => {
      const label = document.createElement("label");
      label.className = "row";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = state.builder.blocks.includes(b.blockId);
      cb.addEventListener("change", () => {
        const set = new Set(state.builder.blocks);
        if (cb.checked) set.add(b.blockId);
        else set.delete(b.blockId);
        setBuilder({ blocks: Array.from(set) });
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(b.title || b.blockId));
      blockSection.appendChild(label);
    });
    wrap.appendChild(blockSection);
    const weekSection = document.createElement("div");
    weekSection.className = "builder-section";
    const weekTitle = document.createElement("div");
    weekTitle.textContent = "Weeks:";
    weekSection.appendChild(weekTitle);
    for (let w = 1; w <= 8; w++) {
      const label = document.createElement("label");
      label.className = "row";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = state.builder.weeks.includes(w);
      cb.addEventListener("change", () => {
        const set = new Set(state.builder.weeks);
        if (cb.checked) set.add(w);
        else set.delete(w);
        setBuilder({ weeks: Array.from(set) });
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(String(w)));
      weekSection.appendChild(label);
    }
    wrap.appendChild(weekSection);
    const typeSection = document.createElement("div");
    typeSection.className = "builder-section";
    const typeTitle = document.createElement("div");
    typeTitle.textContent = "Types:";
    typeSection.appendChild(typeTitle);
    const typeMap = { disease: "Disease", drug: "Drug", concept: "Concept" };
    Object.entries(typeMap).forEach(([val, labelText]) => {
      const label = document.createElement("label");
      label.className = "row";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = state.builder.types.includes(val);
      cb.addEventListener("change", () => {
        const set = new Set(state.builder.types);
        if (cb.checked) set.add(val);
        else set.delete(val);
        setBuilder({ types: Array.from(set) });
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(labelText));
      typeSection.appendChild(label);
    });
    wrap.appendChild(typeSection);
    const favSection = document.createElement("label");
    favSection.className = "row";
    const favCb = document.createElement("input");
    favCb.type = "checkbox";
    favCb.checked = state.builder.onlyFav;
    favCb.addEventListener("change", () => setBuilder({ onlyFav: favCb.checked }));
    favSection.appendChild(favCb);
    favSection.appendChild(document.createTextNode("Only favorites"));
    wrap.appendChild(favSection);
    const buildBtn = document.createElement("button");
    buildBtn.className = "btn btn-primary";
    buildBtn.textContent = "Build Set";
    const count = document.createElement("div");
    count.className = "builder-count";
    count.textContent = `Set size: ${state.cohort.length}`;
    buildBtn.addEventListener("click", async () => {
      let items = [];
      for (const kind of state.builder.types) {
        items = items.concat(await listItemsByKind(kind));
      }
      items = items.filter((it) => {
        if (state.builder.onlyFav && !it.favorite) return false;
        if (state.builder.blocks.length && !it.blocks?.some((b) => state.builder.blocks.includes(b))) return false;
        if (state.builder.weeks.length && !it.weeks?.some((w) => state.builder.weeks.includes(w))) return false;
        return true;
      });
      setCohort(items);
      count.textContent = `Set size: ${items.length}`;
    });
    wrap.appendChild(buildBtn);
    wrap.appendChild(count);
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
    const { question, answer, details } = buildCard(item);
    const card = document.createElement("section");
    card.className = "card flashcard";
    card.tabIndex = 0;
    const qEl = document.createElement("div");
    qEl.className = "flash-question";
    qEl.textContent = question;
    card.appendChild(qEl);
    const aEl = document.createElement("div");
    aEl.className = "flash-answer";
    aEl.textContent = answer + (details ? "\n" + details : "");
    card.appendChild(aEl);
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
    const reveal = document.createElement("button");
    reveal.className = "btn";
    reveal.textContent = "Reveal";
    reveal.addEventListener("click", () => {
      card.classList.toggle("revealed");
    });
    controls.appendChild(reveal);
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
      if (e.code === "Space") {
        e.preventDefault();
        reveal.click();
      } else if (e.key === "ArrowRight") {
        next.click();
      } else if (e.key === "ArrowLeft") {
        prev.click();
      }
    });
  }
  function buildCard(item) {
    const mainMap = {
      disease: ["pathophys", "clinical", "treatment"],
      drug: ["moa", "uses", "sideEffects"],
      concept: ["definition", "mechanism", "clinicalRelevance"]
    };
    const extraMap = {
      disease: ["mnemonic", "diagnosis", "complications"],
      drug: ["mnemonic", "contraindications"],
      concept: ["mnemonic", "example"]
    };
    const fields = mainMap[item.kind] || [];
    let questionField = "";
    for (const f of fields) {
      if (item[f]) {
        questionField = item[f];
        break;
      }
    }
    let question = questionField || "";
    const answers = [];
    question = question.replace(/{{c\d+::(.*?)}}/g, (_m, p1) => {
      answers.push(p1);
      return "_____";
    });
    const answer = answers.length ? answers.join(" / ") : item.name || item.concept || "";
    const detailParts = [];
    fields.filter((f) => f !== fields[0]).forEach((f) => {
      if (item[f]) detailParts.push(item[f]);
    });
    (extraMap[item.kind] || []).forEach((f) => {
      if (item[f]) detailParts.push(item[f]);
    });
    const details = detailParts.join("\n");
    return { question, answer, details };
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
  function questionOf(item) {
    return item.definition || item.pathophys || item.clinical || item.moa || item.uses || "";
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
    const q = document.createElement("div");
    q.className = "quiz-question";
    q.textContent = questionOf(item);
    form.appendChild(q);
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

  // js/ui/components/exams.js
  async function renderExams(root, render2) {
    root.innerHTML = "";
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "application/json";
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const exam = JSON.parse(text);
        exam.id = exam.id || crypto.randomUUID();
        exam.createdAt = exam.createdAt || Date.now();
        exam.updatedAt = Date.now();
        exam.results = exam.results || [];
        await upsertExam(exam);
        render2();
      } catch (err) {
        alert("Invalid exam JSON");
      }
    });
    root.appendChild(fileInput);
    const exams = await listExams();
    const list = document.createElement("div");
    exams.forEach((ex) => {
      const row = document.createElement("div");
      row.className = "row";
      const title = document.createElement("span");
      title.textContent = ex.examTitle;
      const start = document.createElement("button");
      start.className = "btn";
      start.textContent = "Start";
      start.addEventListener("click", () => {
        setExamSession({ exam: ex, idx: 0, answers: [] });
        render2();
      });
      row.appendChild(title);
      row.appendChild(start);
      list.appendChild(row);
    });
    root.appendChild(list);
  }
  function renderExamRunner(root, render2) {
    const sess = state.examSession;
    const q = sess.exam.questions[sess.idx];
    root.innerHTML = "";
    const h = document.createElement("h2");
    h.textContent = `Question ${sess.idx + 1} / ${sess.exam.questions.length}`;
    root.appendChild(h);
    const stem = document.createElement("p");
    stem.textContent = q.stem;
    root.appendChild(stem);
    q.options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.className = "btn";
      btn.textContent = opt.text;
      btn.addEventListener("click", () => {
        sess.answers.push(opt.id);
        sess.idx++;
        if (sess.idx >= sess.exam.questions.length) {
          const correct = sess.exam.questions.filter((qu, i) => sess.answers[i] === qu.answer).length;
          alert(`Score: ${correct}/${sess.exam.questions.length}`);
          setExamSession(null);
        }
        render2();
      });
      root.appendChild(btn);
    });
  }

  // js/ui/components/popup.js
  function showPopup(item) {
    const modal = document.createElement("div");
    modal.className = "modal";
    const card = document.createElement("div");
    card.className = "card";
    const title = document.createElement("h2");
    title.textContent = item.name || item.concept || "Item";
    card.appendChild(title);
    const kind = document.createElement("div");
    kind.textContent = `Type: ${item.kind}`;
    card.appendChild(kind);
    if (item.mnemonic) {
      const m = document.createElement("div");
      m.textContent = `Mnemonic: ${item.mnemonic}`;
      card.appendChild(m);
    }
    const close = document.createElement("button");
    close.className = "btn";
    close.textContent = "Close";
    close.addEventListener("click", () => modal.remove());
    card.appendChild(close);
    modal.appendChild(card);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.remove();
    });
    document.body.appendChild(modal);
  }

  // js/ui/components/map.js
  async function renderMap(root) {
    root.innerHTML = "";
    const items = [
      ...await listItemsByKind("disease"),
      ...await listItemsByKind("drug"),
      ...await listItemsByKind("concept")
    ];
    const size = 600;
    const center = size / 2;
    const radius = size / 2 - 40;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
    svg.classList.add("map-svg");
    const positions = {};
    items.forEach((it, idx) => {
      const angle = 2 * Math.PI * idx / items.length;
      const x = center + radius * Math.cos(angle);
      const y = center + radius * Math.sin(angle);
      positions[it.id] = { x, y };
    });
    const drawn = /* @__PURE__ */ new Set();
    items.forEach((it) => {
      (it.links || []).forEach((l) => {
        if (!positions[l.id]) return;
        const key = it.id < l.id ? it.id + "|" + l.id : l.id + "|" + it.id;
        if (drawn.has(key)) return;
        drawn.add(key);
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", positions[it.id].x);
        line.setAttribute("y1", positions[it.id].y);
        line.setAttribute("x2", positions[l.id].x);
        line.setAttribute("y2", positions[l.id].y);
        line.setAttribute("class", "map-edge");
        svg.appendChild(line);
      });
    });
    items.forEach((it) => {
      const pos = positions[it.id];
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", pos.x);
      circle.setAttribute("cy", pos.y);
      circle.setAttribute("r", 16);
      circle.setAttribute("class", "map-node");
      circle.addEventListener("click", () => showPopup(it));
      svg.appendChild(circle);
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", pos.x);
      text.setAttribute("y", pos.y - 20);
      text.setAttribute("class", "map-label");
      text.textContent = it.name || it.concept || "?";
      svg.appendChild(text);
    });
    root.appendChild(svg);
  }

  // js/main.js
  var tabs = ["Diseases", "Drugs", "Concepts", "Study", "Exams", "Map", "Settings"];
  async function render() {
    const root = document.getElementById("app");
    root.innerHTML = "";
    const header = document.createElement("header");
    header.className = "header row";
    const brand = document.createElement("div");
    brand.className = "brand";
    brand.textContent = "\u2728 Sevenn";
    header.appendChild(brand);
    const nav = document.createElement("nav");
    nav.className = "tabs row";
    tabs.forEach((t) => {
      const btn = document.createElement("button");
      const kindClass = { Diseases: "disease", Drugs: "drug", Concepts: "concept" }[t];
      btn.className = "tab" + (state.tab === t ? " active" : "");
      if (kindClass) btn.classList.add(kindClass);
      btn.textContent = t;
      btn.addEventListener("click", () => {
        setTab(t);
        render();
      });
      nav.appendChild(btn);
    });
    header.appendChild(nav);
    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Search";
    search.value = state.query;
    search.addEventListener("input", (e) => {
      setQuery(e.target.value);
      render();
    });
    header.appendChild(search);
    root.appendChild(header);
    const main = document.createElement("main");
    root.appendChild(main);
    if (state.tab === "Settings") {
      await renderSettings(main);
    } else if (["Diseases", "Drugs", "Concepts"].includes(state.tab)) {
      const kindMap = { Diseases: "disease", Drugs: "drug", Concepts: "concept" };
      const kind = kindMap[state.tab];
      const addBtn = document.createElement("button");
      addBtn.className = "btn";
      addBtn.textContent = "Add " + kind;
      addBtn.addEventListener("click", () => openEditor(kind, render));
      main.appendChild(addBtn);
      const subnav = document.createElement("div");
      subnav.className = "tabs row subtabs";
      ["Browse", "Cards", "Stats"].forEach((st) => {
        const sb = document.createElement("button");
        sb.className = "tab" + (state.subtab[state.tab] === st ? " active" : "");
        sb.textContent = st;
        sb.addEventListener("click", () => {
          setSubtab(state.tab, st);
          render();
        });
        subnav.appendChild(sb);
      });
      main.appendChild(subnav);
      const filter = { ...state.filters, types: [kind], query: state.query };
      const items = await findItemsByFilter(filter);
      if (state.subtab[state.tab] === "Cards") {
        renderCards(main, items, kind, render);
      } else if (state.subtab[state.tab] === "Stats") {
        renderStats(main, items);
      } else {
        await renderCardList(main, items, kind, render);
      }
    } else if (state.tab === "Study") {
      if (state.flashSession) {
        renderFlashcards(main, render);
      } else if (state.quizSession) {
        renderQuiz(main, render);
      } else {
        const wrap = document.createElement("div");
        await renderBuilder(wrap);
        main.appendChild(wrap);
        const subnav = document.createElement("div");
        subnav.className = "tabs row subtabs";
        ["Flashcards", "Review", "Quiz"].forEach((st) => {
          const sb = document.createElement("button");
          sb.className = "tab" + (state.subtab.Study === st ? " active" : "");
          sb.textContent = st;
          sb.addEventListener("click", () => {
            setSubtab("Study", st);
            render();
          });
          subnav.appendChild(sb);
        });
        main.appendChild(subnav);
        if (state.cohort.length) {
          if (state.subtab.Study === "Flashcards") {
            const startBtn = document.createElement("button");
            startBtn.className = "btn";
            startBtn.textContent = "Start Flashcards";
            startBtn.addEventListener("click", () => {
              setFlashSession({ idx: 0, pool: state.cohort });
              render();
            });
            main.appendChild(startBtn);
          } else if (state.subtab.Study === "Review") {
            renderReview(main, render);
          } else {
            const startBtn = document.createElement("button");
            startBtn.className = "btn";
            startBtn.textContent = "Start Quiz";
            startBtn.addEventListener("click", () => {
              setQuizSession({ idx: 0, score: 0, pool: state.cohort });
              render();
            });
            main.appendChild(startBtn);
          }
        }
      }
    } else if (state.tab === "Exams") {
      if (state.examSession) {
        renderExamRunner(main, render);
      } else {
        await renderExams(main, render);
      }
    } else if (state.tab === "Map") {
      await renderMap(main);
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
