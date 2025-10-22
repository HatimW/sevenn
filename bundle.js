      const number = document.createElement("span");
      number.className = "question-map__number";
      number.textContent = String(idx + 1);
      item.appendChild(number);
      const isFlagged = flaggedSet.has(idx);
      item.dataset.flagged = isFlagged ? "true" : "false";
      item.classList.toggle("is-flagged", isFlagged);
      if (isFlagged) {
        const flagIcon = document.createElement("span");
        flagIcon.className = "question-map__flag";
        flagIcon.setAttribute("aria-hidden", "true");
        flagIcon.textContent = "\u{1F6A9}";
        item.appendChild(flagIcon);
        tooltipParts.push("Flagged");
      }
      const tooltipText = tooltipParts.join(" \xB7 ");
      if (tooltipText) {
        item.title = tooltipText;
      }
      const ariaDescription = tooltipParts.length ? ` \u2014 ${tooltipParts.join(", ")}` : "";
      item.setAttribute("aria-label", `Question ${idx + 1}${ariaDescription}`);
//# sourceMappingURL=bundle.js.map
