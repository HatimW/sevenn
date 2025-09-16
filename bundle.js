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
      mapPos: item.mapPos || null,
      mapHidden: !!item.mapHidden,
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
  async function findItemsByFilter(filter) {
    const i = await store("items");
    let items = await prom2(i.getAll());
    if (filter.types && filter.types.length) {
      items = items.filter((it) => filter.types.includes(it.kind));
    }
    if (filter.block) {
      if (filter.block === "__unlabeled") {
        items = items.filter((it) => !it.blocks || !it.blocks.length);
      } else {
        items = items.filter((it) => (it.blocks || []).includes(filter.block));
      }
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
    blocks.forEach((b, i) => {
      const wrap = document.createElement("div");
      wrap.className = "block";
      const title = document.createElement("h3");
      title.textContent = `${b.blockId} \u2013 ${b.title}`;
      wrap.appendChild(title);
      const wkInfo = document.createElement("div");
      wkInfo.textContent = `Weeks: ${b.weeks}`;
      wrap.appendChild(wkInfo);
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
      const lecList = document.createElement("ul");
      (b.lectures || []).slice().sort((a, b2) => b2.week - a.week || b2.id - a.id).forEach((l) => {
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
        if (lecture.week < 1 || lecture.week > b.weeks) return;
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
  async function openEditor(kind, onSave, existing = null) {
    const overlay = document.createElement("div");
    overlay.className = "modal";
    const form = document.createElement("form");
    form.className = "card modal-form";
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
    colorInput.className = "input";
    colorInput.value = existing?.color || "#ffffff";
    colorLabel.appendChild(colorInput);
    form.appendChild(colorLabel);
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
    const blockWrap = document.createElement("div");
    blockWrap.className = "tag-wrap";
    const blockTitle = document.createElement("div");
    blockTitle.textContent = "Tags";
    blockWrap.appendChild(blockTitle);
    blocks.forEach((b) => {
      const blockDiv = document.createElement("div");
      const blkLabel = document.createElement("label");
      blkLabel.className = "row";
      const blkCb = document.createElement("input");
      blkCb.type = "checkbox";
      blkCb.checked = blockSet.has(b.blockId);
      blkLabel.appendChild(blkCb);
      blkLabel.appendChild(document.createTextNode(b.title || b.blockId));
      blockDiv.appendChild(blkLabel);
      const weekWrap = document.createElement("div");
      weekWrap.className = "builder-sub";
      weekWrap.style.display = blkCb.checked ? "block" : "none";
      blockDiv.appendChild(weekWrap);
      blkCb.addEventListener("change", () => {
        if (blkCb.checked) blockSet.add(b.blockId);
        else blockSet.delete(b.blockId);
        weekWrap.style.display = blkCb.checked ? "block" : "none";
      });
      const weeks = Array.from({ length: b.weeks || 0 }, (_, i) => i + 1);
      weeks.forEach((w) => {
        const wkLabel = document.createElement("label");
        wkLabel.className = "row";
        const wkCb = document.createElement("input");
        wkCb.type = "checkbox";
        const wkKey = `${b.blockId}|${w}`;
        wkCb.checked = weekSet.has(wkKey);
        wkLabel.appendChild(wkCb);
        wkLabel.appendChild(document.createTextNode(`Week ${w}`));
        weekWrap.appendChild(wkLabel);
        const lecWrap = document.createElement("div");
        lecWrap.className = "builder-sub";
        lecWrap.style.display = wkCb.checked ? "block" : "none";
        wkLabel.appendChild(lecWrap);
        wkCb.addEventListener("change", () => {
          if (wkCb.checked) weekSet.add(wkKey);
          else weekSet.delete(wkKey);
          lecWrap.style.display = wkCb.checked ? "block" : "none";
        });
        (b.lectures || []).filter((l) => l.week === w).forEach((l) => {
          const key = `${b.blockId}|${l.id}`;
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "chip" + (lectSet.has(key) ? " active" : "");
          btn.textContent = l.name;
          btn.addEventListener("click", () => {
            if (lectSet.has(key)) lectSet.delete(key);
            else lectSet.add(key);
            btn.classList.toggle("active");
          });
          lecWrap.appendChild(btn);
        });
      });
      blockWrap.appendChild(blockDiv);
    });
    form.appendChild(blockWrap);
    const saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "btn";
    saveBtn.textContent = "Save";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => document.body.removeChild(overlay));
    const actions = document.createElement("div");
    actions.className = "modal-actions";
    actions.appendChild(cancel);
    actions.appendChild(saveBtn);
    form.appendChild(actions);
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
      item.blocks = Array.from(blockSet);
      const weekNums = new Set(Array.from(weekSet).map((k) => Number(k.split("|")[1])));
      item.weeks = Array.from(weekNums);
      const lectures = [];
      for (const key of lectSet) {
        const [blockId, lecIdStr] = key.split("|");
        const lecId = Number(lecIdStr);
        const blk = blockMap.get(blockId);
        const l = blk?.lectures.find((l2) => l2.id === lecId);
        if (l) lectures.push({ blockId, id: l.id, name: l.name, week: l.week });
      }
      item.lectures = lectures;
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
    const gear = document.createElement("button");
    gear.className = "icon-btn";
    gear.textContent = "\u2699\uFE0F";
    gear.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.toggle("hidden");
    });
    settings.append(menu, gear);
    header.appendChild(settings);
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
    menu.appendChild(fav);
    const link = document.createElement("button");
    link.className = "icon-btn";
    link.textContent = "\u{1FAA2}";
    link.title = "Links";
    link.setAttribute("aria-label", "Manage links");
    link.addEventListener("click", (e) => {
      e.stopPropagation();
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
      navigator.clipboard && navigator.clipboard.writeText(item.name || item.concept || "");
    });
    menu.appendChild(copy);
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
        txt.textContent = item[f];
        txt.style.whiteSpace = "pre-wrap";
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
  async function renderCardList(container, items, kind, onChange) {
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
  function renderCards(container, items, onChange) {
    const decks = /* @__PURE__ */ new Map();
    items.forEach((it) => {
      if (it.lectures && it.lectures.length) {
        it.lectures.forEach((l) => {
          const key = l.name || `Lecture ${l.id}`;
          if (!decks.has(key)) decks.set(key, []);
          decks.get(key).push(it);
        });
      } else {
        if (!decks.has("Unassigned")) decks.set("Unassigned", []);
        decks.get("Unassigned").push(it);
      }
    });
    const list = document.createElement("div");
    list.className = "deck-list";
    container.appendChild(list);
    const viewer = document.createElement("div");
    viewer.className = "deck-viewer hidden";
    container.appendChild(viewer);
    decks.forEach((cards, lecture) => {
      const deck = document.createElement("div");
      deck.className = "deck";
      const title = document.createElement("div");
      title.className = "deck-title";
      title.textContent = lecture;
      const meta = document.createElement("div");
      meta.className = "deck-meta";
      const blocks = Array.from(new Set(cards.flatMap((c) => c.blocks || []))).join(", ");
      const weeks = Array.from(new Set(cards.flatMap((c) => c.weeks || []))).join(", ");
      meta.textContent = `${blocks}${blocks && weeks ? " \u2022 " : ""}${weeks ? "Week " + weeks : ""}`;
      deck.appendChild(title);
      deck.appendChild(meta);
      deck.addEventListener("click", () => {
        stopPreview(deck);
        openDeck(lecture, cards);
      });
      let hoverTimer;
      deck.addEventListener("mouseenter", () => {
        hoverTimer = setTimeout(() => startPreview(deck, cards), 3e3);
      });
      deck.addEventListener("mouseleave", () => {
        clearTimeout(hoverTimer);
        stopPreview(deck);
      });
      list.appendChild(deck);
    });
    function startPreview(deckEl, cards) {
      if (deckEl._preview) return;
      deckEl.classList.add("pop");
      const fan = document.createElement("div");
      fan.className = "deck-fan";
      deckEl.appendChild(fan);
      const show = cards.slice(0, 5);
      const spread = 20;
      const offset = (show.length - 1) * spread / 2;
      show.forEach((c, i) => {
        const mini = document.createElement("div");
        mini.className = "fan-card";
        mini.textContent = c.name || c.concept || "";
        fan.appendChild(mini);
        const angle = -offset + i * spread;
        mini.style.transform = `rotate(${angle}deg) translateY(-80px)`;
        setTimeout(() => {
          mini.style.opacity = 1;
        }, i * 100);
      });
      deckEl._preview = { fan };
    }
    function stopPreview(deckEl) {
      const prev = deckEl._preview;
      if (prev) {
        prev.fan.remove();
        deckEl.classList.remove("pop");
        deckEl._preview = null;
      }
    }
    function openDeck(title, cards) {
      list.classList.add("hidden");
      viewer.classList.remove("hidden");
      viewer.innerHTML = "";
      const header = document.createElement("h2");
      header.textContent = title;
      viewer.appendChild(header);
      const cardHolder = document.createElement("div");
      cardHolder.className = "deck-card";
      viewer.appendChild(cardHolder);
      const prev = document.createElement("button");
      prev.className = "deck-prev";
      prev.textContent = "\u25C0";
      const next = document.createElement("button");
      next.className = "deck-next";
      next.textContent = "\u25B6";
      viewer.appendChild(prev);
      viewer.appendChild(next);
      const toggle = document.createElement("button");
      toggle.className = "deck-related-toggle btn";
      toggle.textContent = "Show Related";
      viewer.appendChild(toggle);
      const relatedWrap = document.createElement("div");
      relatedWrap.className = "deck-related hidden";
      viewer.appendChild(relatedWrap);
      const close = document.createElement("button");
      close.className = "deck-close btn";
      close.textContent = "Close";
      viewer.appendChild(close);
      let idx = 0;
      let showRelated = false;
      function renderCard() {
        cardHolder.innerHTML = "";
        cardHolder.appendChild(createItemCard(cards[idx], onChange));
        renderRelated();
      }
      function renderRelated() {
        relatedWrap.innerHTML = "";
        if (!showRelated) return;
        const current = cards[idx];
        (current.links || []).forEach((l) => {
          const item = items.find((it) => it.id === l.id);
          if (item) {
            const el = createItemCard(item, onChange);
            el.classList.add("related-card");
            relatedWrap.appendChild(el);
            requestAnimationFrame(() => el.classList.add("visible"));
          }
        });
      }
      prev.addEventListener("click", () => {
        idx = (idx - 1 + cards.length) % cards.length;
        renderCard();
      });
      next.addEventListener("click", () => {
        idx = (idx + 1) % cards.length;
        renderCard();
      });
      toggle.addEventListener("click", () => {
        showRelated = !showRelated;
        toggle.textContent = showRelated ? "Hide Related" : "Show Related";
        relatedWrap.classList.toggle("hidden", !showRelated);
        renderRelated();
      });
      close.addEventListener("click", () => {
        document.removeEventListener("keydown", keyHandler);
        viewer.classList.add("hidden");
        viewer.innerHTML = "";
        list.classList.remove("hidden");
      });
      function keyHandler(e) {
        if (e.key === "ArrowLeft") prev.click();
        if (e.key === "ArrowRight") next.click();
        if (e.key === "Escape") close.click();
      }
      document.addEventListener("keydown", keyHandler);
      renderCard();
    }
  }

  // js/ui/components/builder.js
  async function renderBuilder(root) {
    root.innerHTML = "";
    const wrap = document.createElement("div");
    wrap.className = "builder";
    root.appendChild(wrap);
    const blocks = await listBlocks();
    blocks.push({ blockId: "__unlabeled", title: "Unlabeled", weeks: 0, lectures: [] });
    blocks.forEach((b) => {
      const blockDiv = document.createElement("div");
      blockDiv.className = "builder-section";
      const blkLabel = document.createElement("label");
      blkLabel.className = "row";
      const blkCb = document.createElement("input");
      blkCb.type = "checkbox";
      blkCb.checked = state.builder.blocks.includes(b.blockId);
      blkLabel.appendChild(blkCb);
      blkLabel.appendChild(document.createTextNode(b.title || b.blockId));
      blockDiv.appendChild(blkLabel);
      const weekWrap = document.createElement("div");
      weekWrap.className = "builder-sub";
      weekWrap.style.display = blkCb.checked ? "block" : "none";
      blockDiv.appendChild(weekWrap);
      blkCb.addEventListener("change", () => {
        const set = new Set(state.builder.blocks);
        if (blkCb.checked) set.add(b.blockId);
        else set.delete(b.blockId);
        setBuilder({ blocks: Array.from(set) });
        weekWrap.style.display = blkCb.checked ? "block" : "none";
      });
      const weeks = Array.from({ length: b.weeks || 8 }, (_, i) => i + 1);
      weeks.forEach((w) => {
        const wkLabel = document.createElement("label");
        wkLabel.className = "row";
        const wkCb = document.createElement("input");
        wkCb.type = "checkbox";
        const wkKey = `${b.blockId}|${w}`;
        wkCb.checked = state.builder.weeks.includes(wkKey);
        wkLabel.appendChild(wkCb);
        wkLabel.appendChild(document.createTextNode(`Week ${w}`));
        weekWrap.appendChild(wkLabel);
        const lecWrap = document.createElement("div");
        lecWrap.className = "builder-sub";
        lecWrap.style.display = wkCb.checked ? "block" : "none";
        wkLabel.appendChild(lecWrap);
        wkCb.addEventListener("change", () => {
          const set = new Set(state.builder.weeks);
          if (wkCb.checked) set.add(wkKey);
          else set.delete(wkKey);
          setBuilder({ weeks: Array.from(set) });
          lecWrap.style.display = wkCb.checked ? "block" : "none";
        });
        (b.lectures || []).filter((l) => l.week === w).forEach((l) => {
          const key = `${b.blockId}|${l.id}`;
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "chip" + (state.builder.lectures.includes(key) ? " active" : "");
          btn.textContent = l.name;
          btn.addEventListener("click", () => {
            const set = new Set(state.builder.lectures);
            if (set.has(key)) set.delete(key);
            else set.add(key);
            setBuilder({ lectures: Array.from(set) });
            btn.classList.toggle("active");
          });
          lecWrap.appendChild(btn);
        });
      });
      wrap.appendChild(blockDiv);
    });
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
        if (state.builder.blocks.length) {
          const wantUnlabeled = state.builder.blocks.includes("__unlabeled");
          const hasMatch = it.blocks?.some((b) => state.builder.blocks.includes(b));
          if (!hasMatch) {
            if (!(wantUnlabeled && (!it.blocks || !it.blocks.length))) return false;
          }
        }
        if (state.builder.weeks.length) {
          const ok = state.builder.weeks.some((pair) => {
            const [b, w] = pair.split("|");
            return it.blocks?.includes(b) && it.weeks?.includes(Number(w));
          });
          if (!ok) return false;
        }
        if (state.builder.lectures.length) {
          const ok = it.lectures?.some((l) => state.builder.lectures.includes(`${l.blockId}|${l.id}`));
          if (!ok) return false;
        }
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
    const card = document.createElement("section");
    card.className = "card flashcard";
    card.tabIndex = 0;
    const title = document.createElement("h2");
    title.textContent = item.name || item.concept || "";
    card.appendChild(title);
    sectionsFor(item).forEach(([label, field]) => {
      const sec = document.createElement("div");
      sec.className = "flash-section";
      const head = document.createElement("div");
      head.className = "flash-heading";
      head.textContent = label;
      const body = document.createElement("div");
      body.className = "flash-body";
      body.textContent = item[field] || "";
      sec.appendChild(head);
      sec.appendChild(body);
      sec.addEventListener("click", () => {
        sec.classList.toggle("revealed");
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
      body.textContent = item[field];
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
  function showPopup(item) {
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
      txt.textContent = val;
      txt.style.whiteSpace = "pre-wrap";
      sec.appendChild(txt);
      card.appendChild(sec);
    });
    if (item.facts && item.facts.length) {
      const facts = document.createElement("div");
      facts.className = "facts";
      facts.textContent = item.facts.join(", ");
      card.appendChild(facts);
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
  var DEFAULT_LINK_COLOR = "#888888";
  var mapState = {
    tool: TOOL.NAVIGATE,
    selectionIds: [],
    previewSelection: null,
    pendingLink: null,
    hiddenMenuTab: "nodes",
    panelVisible: true,
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
    defaultViewSize: null
  };
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
    stopToolboxDrag();
    mapState.toolboxEl = null;
    mapState.toolboxContainer = null;
    mapState.cursorOverride = null;
    stopAutoPan();
    setAreaInteracting(false);
    ensureListeners();
    const items = [
      ...await listItemsByKind("disease"),
      ...await listItemsByKind("drug"),
      ...await listItemsByKind("concept")
    ];
    const hiddenNodes = items.filter((it) => it.mapHidden);
    const visibleItems = items.filter((it) => !it.mapHidden);
    const itemMap = Object.fromEntries(items.map((it) => [it.id, it]));
    mapState.itemMap = itemMap;
    const base = 1e3;
    const size = Math.max(base, visibleItems.length * 150);
    const viewport = base;
    mapState.sizeLimit = size * 2;
    mapState.minView = 100;
    const container = document.createElement("div");
    container.className = "map-container";
    root.appendChild(container);
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
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    marker.setAttribute("id", "arrow");
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "10");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "6");
    marker.setAttribute("markerHeight", "6");
    marker.setAttribute("orient", "auto");
    const arrowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    arrowPath.setAttribute("d", "M0,0 L10,5 L0,10 Z");
    arrowPath.setAttribute("fill", "inherit");
    marker.appendChild(arrowPath);
    defs.appendChild(marker);
    svg.appendChild(defs);
    svg.appendChild(g);
    mapState.g = g;
    container.appendChild(svg);
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
    visibleItems.forEach((it) => {
      if (it.mapPos) positions[it.id] = { ...it.mapPos };
      else newItems.push(it);
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
      it.mapPos = positions[it.id];
    });
    for (const it of newItems) await upsertItem(it);
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
        path.addEventListener("click", (e) => {
          e.stopPropagation();
          handleEdgeClick(path, it.id, l.id, e);
        });
        path.addEventListener("mouseenter", () => {
          if (mapState.tool === TOOL.HIDE) {
            applyCursorOverride("hide");
          } else if (mapState.tool === TOOL.BREAK) {
            applyCursorOverride("break");
          }
        });
        path.addEventListener("mouseleave", () => {
          if (mapState.tool === TOOL.HIDE) {
            clearCursorOverride("hide");
          }
          if (mapState.tool === TOOL.BREAK) {
            clearCursorOverride("break");
          }
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
        const { x, y } = clientToMap(e.clientX, e.clientY);
        const current = mapState.positions[it.id] || pos;
        if (isNavigateTool) {
          mapState.nodeDrag = {
            id: it.id,
            offset: { x: x - current.x, y: y - current.y }
          };
          mapState.nodeWasDragged = false;
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
        if (mapState.tool === TOOL.NAVIGATE) {
          if (!mapState.nodeWasDragged) showPopup(it);
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
      text.setAttribute("y", pos.y - (baseR + 8));
      text.setAttribute("class", "map-label");
      text.dataset.id = it.id;
      text.textContent = it.name || it.concept || "?";
      text.addEventListener("mousedown", handleNodePointerDown);
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
  function attachSvgEvents(svg) {
    svg.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      if (e.target !== svg) return;
      if (mapState.tool !== TOOL.AREA) {
        mapState.draggingView = true;
        mapState.lastPointer = { x: e.clientX, y: e.clientY };
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
      const { circle, label } = mapState.elements.get(mapState.nodeDrag.id) || {};
      if (!circle) return;
      const { x, y } = clientToMap(e.clientX, e.clientY);
      const nx = x - mapState.nodeDrag.offset.x;
      const ny = y - mapState.nodeDrag.offset.y;
      mapState.positions[mapState.nodeDrag.id] = { x: nx, y: ny };
      circle.setAttribute("cx", nx);
      circle.setAttribute("cy", ny);
      if (label) {
        label.setAttribute("x", nx);
        const baseR = Number(circle.dataset.radius) || 20;
        label.setAttribute("y", ny - (baseR + 8));
      }
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
        const entry = mapState.elements.get(id);
        if (entry) {
          entry.circle.setAttribute("cx", nx);
          entry.circle.setAttribute("cy", ny);
          entry.label.setAttribute("x", nx);
          const baseR = Number(entry.circle.dataset.radius) || 20;
          entry.label.setAttribute("y", ny - (baseR + 8));
        }
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
      }
      mapState.nodeWasDragged = false;
    }
    if (mapState.areaDrag) {
      const moved = mapState.areaDrag.moved;
      const ids = mapState.areaDrag.ids;
      mapState.areaDrag = null;
      cursorNeedsRefresh = true;
      if (moved) {
        await Promise.all(ids.map((id) => persistNodePosition(id)));
      }
      mapState.nodeWasDragged = false;
      stopAutoPan();
      setAreaInteracting(false);
    }
    if (mapState.draggingView) {
      mapState.draggingView = false;
      cursorNeedsRefresh = true;
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
            startMenuDrag(it, e);
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
  function startMenuDrag(item, event) {
    event.preventDefault();
    const ghost = document.createElement("div");
    ghost.className = "map-drag-ghost";
    ghost.textContent = titleOf3(item) || item.id;
    document.body.appendChild(ghost);
    mapState.menuDrag = { id: item.id, ghost };
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
    item.mapHidden = false;
    item.mapPos = { x, y };
    await upsertItem(item);
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
  async function persistNodePosition(id) {
    const item = mapState.itemMap[id];
    if (!item) return;
    const next = { ...item, mapPos: { ...mapState.positions[id] } };
    mapState.itemMap[id] = next;
    await upsertItem(next);
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
    await createLink(from.id, to.id, { name: label, color: DEFAULT_LINK_COLOR, style: "solid", hidden: false });
    mapState.pendingLink = null;
    updatePendingHighlight();
    await renderMap(mapState.root);
  }
  function handleEdgeClick(path, aId, bId, evt) {
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
    const nodeScale = clamp(Math.pow(zoomInRatio, 0.3), 0.5, 1.6);
    const labelScale = clamp(Math.pow(zoomOutRatio, 0.3), 1, 1.7);
    const lineScale = clamp(Math.pow(zoomInRatio, 0.2), 0.6, 1.8);
    mapState.elements.forEach(({ circle, label }) => {
      const baseR = Number(circle.dataset.radius) || 20;
      const scaledRadius = baseR * nodeScale;
      circle.setAttribute("r", scaledRadius);
      const pos = mapState.positions[circle.dataset.id];
      if (pos && label) {
        label.setAttribute("font-size", 12 * labelScale);
        label.setAttribute("y", pos.y - (baseR + 8) * nodeScale);
      }
    });
    svg.querySelectorAll(".map-edge").forEach((line) => {
      line.setAttribute("stroke-width", 4 * lineScale);
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
  function applyLineStyle(line, info) {
    const color = info.color || "var(--gray)";
    line.style.stroke = color;
    if (info.style === "dashed") line.setAttribute("stroke-dasharray", "4,4");
    else line.removeAttribute("stroke-dasharray");
    if (info.style === "arrow") line.setAttribute("marker-end", "url(#arrow)");
    else line.removeAttribute("marker-end");
    let title = line.querySelector("title");
    if (!title) {
      title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      line.appendChild(title);
    }
    title.textContent = info.name || "";
  }
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
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
    const linkInfo = { id: bId, style: "solid", color: DEFAULT_LINK_COLOR, name: "", hidden: false, ...info };
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
    ["solid", "dashed", "arrow"].forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      typeSel.appendChild(opt);
    });
    typeSel.value = link.style || "solid";
    typeLabel.appendChild(typeSel);
    menu.appendChild(typeLabel);
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
      const patch = { color: colorInput.value, style: typeSel.value, name: nameInput.value };
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

  // js/main.js
  var tabs = ["Diseases", "Drugs", "Concepts", "Cards", "Study", "Exams", "Map", "Settings"];
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
    if (state.tab === "Map") main.className = "map-main";
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
      const filter = { ...state.filters, types: [kind], query: state.query };
      const items = await findItemsByFilter(filter);
      await renderCardList(main, items, kind, render);
    } else if (state.tab === "Cards") {
      const filter = { ...state.filters, query: state.query };
      const items = await findItemsByFilter(filter);
      renderCards(main, items, render);
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
