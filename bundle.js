(() => {
    let menuResizeHandler = null;
    const runAfterFrame = typeof requestAnimationFrame === "function" ? requestAnimationFrame : ((cb) => setTimeout(cb, 0));
    const updateMenuGap = () => {
      if (!menuOpen) return;
      const height = menuPanel.offsetHeight;
      if (height > 0) {
        const offset = Math.ceil(height + 24);
        card.style.setProperty("--exam-card-menu-gap", `${offset}px`);
      } else {
        card.style.setProperty("--exam-card-menu-gap", "32px");
      }
    };
    const scheduleMenuGap = () => {
      runAfterFrame(() => {
        updateMenuGap();
      });
    };
      card.classList.add("exam-card--menu-open");
      scheduleMenuGap();
      if (typeof window !== "undefined") {
        menuResizeHandler = () => updateMenuGap();
        window.addEventListener("resize", menuResizeHandler);
      }
      card.classList.remove("exam-card--menu-open");
      card.style.removeProperty("--exam-card-menu-gap");
      if (typeof window !== "undefined" && menuResizeHandler) {
        window.removeEventListener("resize", menuResizeHandler);
      }
      menuResizeHandler = null;
    const flaggedSource = sess.mode === "review" ? Array.isArray(sess.result?.flagged) ? sess.result.flagged : [] : Object.entries(sess.flagged || {}).filter(([_, v]) => v).map(([idx]) => idx);
    const flaggedSet = new Set(flaggedSource.map((idx) => Number(idx)));
      const isFlagged = flaggedSet.has(idx);
      if (isFlagged) {
        item.classList.add("is-flagged");
        tooltipParts.push("Flagged");
        const flagIcon = document.createElement("span");
        flagIcon.className = "question-map__flag";
        flagIcon.setAttribute("aria-hidden", "true");
        flagIcon.textContent = "\u{1F6A9}";
        item.appendChild(flagIcon);
        item.classList.remove("is-flagged");
//# sourceMappingURL=bundle.js.map
