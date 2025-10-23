(() => {
      const panelHeight = menuPanel.offsetHeight;
      const extraSpace = Math.max(panelHeight + 16, 0);
      menuWrap.style.setProperty("--exam-menu-open-space", `${extraSpace}px`);
      menuWrap.style.removeProperty("--exam-menu-open-space");
      const questionNumber = idx + 1;
      const label = document.createElement("span");
      label.className = "question-map__item-label";
      label.textContent = String(questionNumber);
      item.appendChild(label);
      const flagIcon = document.createElement("span");
      flagIcon.className = "question-map__item-flag";
      flagIcon.setAttribute("aria-hidden", "true");
      flagIcon.textContent = "\u{1F6A9}";
      item.appendChild(flagIcon);
      const accessibleParts = [`Question ${questionNumber}`];
        accessibleParts.push("Current question");
      const addStatus = (text) => {
        tooltipParts.push(text);
        accessibleParts.push(text);
      };
          addStatus(isCorrect ? "Answered correctly" : "Answered incorrectly");
          addStatus("Not answered");
            addStatus("Changed from correct to incorrect");
            addStatus("Changed from incorrect to correct");
            addStatus("Changed answer");
          addStatus("Changed answers but returned to start");
          addStatus(isCorrect ? "Checked correct" : "Checked incorrect");
          addStatus("Answered");
          addStatus(wasChecked ? "Checked without answer" : "Not answered");
      const flagged = flaggedSet.has(idx);
      if (flagged) {
        item.classList.add("is-flagged");
        addStatus("Flagged");
        item.classList.remove("is-flagged");
      } else {
        item.removeAttribute("title");
      }
      if (accessibleParts.length) {
        item.setAttribute("aria-label", accessibleParts.join(", "));
      } else {
        item.removeAttribute("aria-label");
//# sourceMappingURL=bundle.js.map
