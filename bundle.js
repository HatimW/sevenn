    const defaultExpanded = layout?.detailsVisible !== false;
    const forceExpanded = layoutMode === "row";
    const isExpanded = forceExpanded ? true : expandedState != null ? expandedState : defaultExpanded;
    if (isExpanded) {
    } else {
    if (!forceExpanded) {
      summaryButton.setAttribute("aria-expanded", "true");
    if (isExpanded) {
    if (last && isExpanded) {
    if (savedSession && isExpanded) {
    if (!forceExpanded) {
      const toggleDetails = document.createElement("button");
      toggleDetails.type = "button";
      toggleDetails.className = "btn secondary exam-card-details-toggle";
      toggleDetails.textContent = isExpanded ? "Hide details" : "Show details";
      toggleDetails.setAttribute("aria-pressed", isExpanded ? "true" : "false");
      toggleDetails.addEventListener("click", (event) => {
        event.stopPropagation();
        setExamAttemptExpanded(exam.id, !isExpanded);
        render();
      });
      quickAction.appendChild(toggleDetails);
    }
    const details = document.createElement("div");
    details.className = "exam-card-details";
    if (!isExpanded) {
      details.setAttribute("hidden", "true");
    }
    card.appendChild(details);
    const stats = document.createElement("div");
    stats.className = "exam-card-stats";
    stats.appendChild(createStat("Attempts", String(exam.results.length)));
    stats.appendChild(createStat("Best Score", best ? formatScore(best) : "\u2014"));
    stats.appendChild(createStat("Last Score", last ? formatScore(last) : "\u2014"));
    details.appendChild(stats);
    if (savedSession) {
      const banner = document.createElement("div");
      banner.className = "exam-saved-banner";
      const updated = savedSession.updatedAt ? new Date(savedSession.updatedAt).toLocaleString() : null;
      banner.textContent = updated ? `Saved attempt \u2022 ${updated}` : "Saved attempt available";
      details.appendChild(banner);
    }
    const actions = document.createElement("div");
    actions.className = "exam-card-actions";
    details.appendChild(actions);
    if (savedSession) {
      const startFresh = document.createElement("button");
      startFresh.className = "btn secondary";
      startFresh.textContent = "Start Fresh";
      startFresh.disabled = exam.questions.length === 0;
      startFresh.addEventListener("click", async () => {
        const confirm2 = await confirmModal("Start a new attempt and discard saved progress?");
        if (!confirm2) return;
        await deleteExamSessionProgress(exam.id);
        setExamSession(createTakingSession(exam));
        render();
      actions.appendChild(startFresh);
    }
    if (last) {
      const reviewBtn = document.createElement("button");
      reviewBtn.className = "btn secondary";
      reviewBtn.textContent = "Review Last Attempt";
      reviewBtn.addEventListener("click", () => {
        setExamSession({ mode: "review", exam: clone5(exam), result: clone5(last), idx: 0 });
      actions.appendChild(reviewBtn);
    }
    const editBtn = document.createElement("button");
    editBtn.className = "btn secondary";
    editBtn.textContent = "Edit Exam";
    editBtn.addEventListener("click", () => openExamEditor(exam, render));
    actions.appendChild(editBtn);
    const exportWrap = document.createElement("div");
    exportWrap.className = "exam-export";
    actions.appendChild(exportWrap);
    const exportBtn = document.createElement("button");
    exportBtn.type = "button";
    exportBtn.className = "btn secondary exam-export-toggle";
    exportBtn.textContent = "Export";
    exportBtn.setAttribute("aria-haspopup", "true");
    exportBtn.setAttribute("aria-expanded", "false");
    exportWrap.appendChild(exportBtn);
    const exportMenu = document.createElement("div");
    exportMenu.className = "exam-export-menu";
    exportMenu.setAttribute("role", "menu");
    exportMenu.hidden = true;
    const exportJson = document.createElement("button");
    exportJson.type = "button";
    exportJson.className = "exam-export-option";
    exportJson.setAttribute("role", "menuitem");
    exportJson.textContent = "JSON (.json)";
    exportJson.addEventListener("click", () => {
      const ok = triggerExamDownload(exam);
      if (!ok && statusEl) {
        statusEl.textContent = "Unable to export exam.";
      } else if (ok && statusEl) {
        statusEl.textContent = "Exam exported as JSON.";
      }
      hideMenu();
    });
    exportMenu.appendChild(exportJson);
    const exportCsv = document.createElement("button");
    exportCsv.type = "button";
    exportCsv.className = "exam-export-option";
    exportCsv.setAttribute("role", "menuitem");
    exportCsv.textContent = "CSV (.csv)";
    exportCsv.addEventListener("click", () => {
      try {
        downloadExamCsv(exam);
        if (statusEl) statusEl.textContent = "Exam exported as CSV.";
      } catch (err) {
        console.warn("Failed to export exam CSV", err);
        if (statusEl) statusEl.textContent = "Unable to export exam CSV.";
      }
      hideMenu();
    });
    exportMenu.appendChild(exportCsv);
    exportWrap.appendChild(exportMenu);
    let menuOpen = false;
    const handleOutside = (event) => {
      if (!menuOpen) return;
      if (exportWrap.contains(event.target)) return;
      hideMenu();
    };
    function hideMenu() {
      if (!menuOpen) return;
      menuOpen = false;
      exportMenu.hidden = true;
      exportMenu.classList.remove("open");
      exportBtn.setAttribute("aria-expanded", "false");
      document.removeEventListener("click", handleOutside, true);
    }
    function showMenu() {
      if (menuOpen) return;
      menuOpen = true;
      exportMenu.hidden = false;
      exportMenu.classList.add("open");
      exportBtn.setAttribute("aria-expanded", "true");
      document.addEventListener("click", handleOutside, true);
    }
    exportBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      if (menuOpen) {
        hideMenu();
        showMenu();
    });
    const delBtn = document.createElement("button");
    delBtn.className = "btn danger";
    delBtn.textContent = "Delete";
    delBtn.addEventListener("click", async () => {
      const ok = await confirmModal(`Delete "${exam.examTitle}"? This will remove all attempts.`);
      if (!ok) return;
      await deleteExamSessionProgress(exam.id).catch(() => {
      });
      await deleteExam(exam.id);
      render();
    });
    actions.appendChild(delBtn);
    const attemptsWrap = document.createElement("div");
    attemptsWrap.className = "exam-attempts";
    const attemptsTitle = document.createElement("h3");
    attemptsTitle.textContent = "Attempts";
    attemptsWrap.appendChild(attemptsTitle);
    if (!exam.results.length) {
      const none = document.createElement("p");
      none.className = "exam-attempt-empty";
      none.textContent = "No attempts yet.";
      attemptsWrap.appendChild(none);
    } else {
      const list = document.createElement("div");
      list.className = "exam-attempt-list";
      [...exam.results].sort((a, b) => b.when - a.when).forEach((result) => {
        list.appendChild(buildAttemptRow(exam, result, render));
      });
      attemptsWrap.appendChild(list);
    details.appendChild(attemptsWrap);
      const isCurrent = sess.idx === idx;
      btn.classList.toggle("is-current", isCurrent);
      btn.setAttribute("aria-pressed", isCurrent ? "true" : "false");
      if (isCurrent) {
        btn.setAttribute("aria-current", "true");
      } else {
        btn.removeAttribute("aria-current");
      }
