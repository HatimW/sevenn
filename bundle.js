    const applyMenuGap = () => {
      const panelHeight = menuPanel.scrollHeight || menuPanel.offsetHeight || 0;
      const clearance = Math.max(panelHeight + 24, 48);
      card.style.setProperty("--exam-card-menu-gap", `${clearance}px`);
    };
    const clearMenuGap = () => {
      card.style.removeProperty("--exam-card-menu-gap");
    };
      const frame = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function" ? window.requestAnimationFrame : null;
      if (frame) {
        frame(() => applyMenuGap());
      } else {
        applyMenuGap();
      }
      clearMenuGap();
      const isFlagged = flaggedSet.has(idx);
      if (isFlagged) {
        tooltipParts.push("Flagged");
        const flagIcon = document.createElement("span");
        flagIcon.className = "question-map__flag";
        flagIcon.textContent = "\u{1F6A9}";
        flagIcon.setAttribute("aria-hidden", "true");
        item.appendChild(flagIcon);
//# sourceMappingURL=bundle.js.map
