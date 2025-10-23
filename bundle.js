    const updateMenuOffset = () => {
      if (!menuOpen) return;
      const panelHeight = menuPanel.scrollHeight || menuPanel.offsetHeight || 0;
      const offset = Math.max(panelHeight + 24, 160);
      menuWrap.style.setProperty("--menu-open-offset", `${offset}px`);
      card.classList.add("exam-card--menu-open");
    };
    const handleResize = () => {
      if (!menuOpen) return;
      requestAnimationFrame(updateMenuOffset);
    };
      requestAnimationFrame(updateMenuOffset);
      window.addEventListener("resize", handleResize);
      menuWrap.style.removeProperty("--menu-open-offset");
      card.classList.remove("exam-card--menu-open");
      window.removeEventListener("resize", handleResize);
    const statusDescriptions = {
      correct: "Answered correctly",
      incorrect: "Answered incorrectly",
      answered: "Answered",
      unanswered: "Not answered yet",
      "review-unanswered": "Not answered"
    };
      const label = document.createElement("span");
      label.className = "question-map__number";
      label.textContent = String(idx + 1);
      item.appendChild(label);
      const flagIcon = document.createElement("span");
      flagIcon.className = "question-map__flag";
      flagIcon.textContent = "\u{1F6A9}";
      flagIcon.setAttribute("aria-hidden", "true");
      item.appendChild(flagIcon);
      const isFlagged = flaggedSet.has(idx);
      item.dataset.flagged = isFlagged ? "true" : "false";
      flagIcon.hidden = !isFlagged;
      if (isFlagged) {
        tooltipParts.push("Flagged");
      const statusLabel = statusDescriptions[status];
      const ariaParts = [`Question ${idx + 1}`];
      if (statusLabel) ariaParts.push(statusLabel);
      if (isFlagged) ariaParts.push("Flagged");
      const tooltipForAria = tooltipParts.filter((part) => part !== "Flagged");
      if (tooltipForAria.length) {
        ariaParts.push(tooltipForAria.join(", "));
      }
      item.setAttribute("aria-label", ariaParts.join(". "));
//# sourceMappingURL=bundle.js.map
