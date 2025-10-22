(() => {
    const syncMenuGap = () => {
      if (!menuOpen) return;
      const panelHeight = menuPanel.offsetHeight;
      if (!Number.isFinite(panelHeight)) return;
      const gap = Math.max(0, Math.ceil(panelHeight + 24));
      menuWrap.style.setProperty("--exam-card-menu-gap", `${gap}px`);
    };
      syncMenuGap();
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(syncMenuGap);
      } else {
        setTimeout(syncMenuGap, 16);
      }
      if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
        window.addEventListener("resize", syncMenuGap);
      }
      menuWrap.style.removeProperty("--exam-card-menu-gap");
      if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
        window.removeEventListener("resize", syncMenuGap);
      }
      const number = document.createElement("span");
      number.className = "question-map__number";
      number.textContent = String(idx + 1);
      item.appendChild(number);
      const flagBadge = document.createElement("span");
      flagBadge.className = "question-map__flag";
      flagBadge.setAttribute("aria-hidden", "true");
      flagBadge.textContent = "\u{1F6A9}";
      item.appendChild(flagBadge);
      item.dataset.answered = answered ? "true" : "false";
        tooltipParts.push("Flagged");
      const ariaParts = [`Question ${idx + 1}`];
      if (tooltipParts.length) {
        ariaParts.push(tooltipParts.join(", "));
      }
      item.setAttribute("aria-label", ariaParts.join(". "));
//# sourceMappingURL=bundle.js.map
