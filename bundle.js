      const label = document.createElement("span");
      label.className = "question-map__label";
      label.textContent = String(idx + 1);
      item.appendChild(label);
      const flagIndicator = document.createElement("span");
      flagIndicator.className = "question-map__flag";
      flagIndicator.setAttribute("aria-hidden", "true");
      flagIndicator.textContent = "\u{1F6A9}";
      item.appendChild(flagIndicator);
      const isFlagged = flaggedSet.has(idx);
      item.dataset.flagged = isFlagged ? "true" : "false";
      if (isFlagged) {
        tooltipParts.push("Flagged");
//# sourceMappingURL=bundle.js.map
