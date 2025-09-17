import { openEditor } from './editor.js';

const defaultOptions = [
  { value: 'disease', label: 'Disease', emoji: '🧬' },
  { value: 'drug', label: 'Drug', emoji: '💊' },
  { value: 'concept', label: 'Concept', emoji: '🧠' }
];

export function createEntryAddControl(onAdded, initialKind = 'disease') {
  const wrapper = document.createElement('div');
  wrapper.className = 'entry-add-control';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn';
  button.textContent = 'Add';

  const menu = document.createElement('div');
  menu.className = 'entry-add-menu';
  const sorted = defaultOptions.slice().sort((a, b) => {
    if (a.value === initialKind) return -1;
    if (b.value === initialKind) return 1;
    return a.label.localeCompare(b.label);
  });
  sorted.forEach(opt => {
    const optBtn = document.createElement('button');
    optBtn.type = 'button';
    optBtn.className = 'entry-add-option';
    optBtn.innerHTML = `<span>${opt.emoji}</span><span>${opt.label}</span>`;
    if (opt.value === initialKind) {
      optBtn.dataset.default = 'true';
    }
    optBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      openEditor(opt.value, onAdded);
      menu.classList.remove('open');
    });
    menu.appendChild(optBtn);
  });

  function closeMenu(event) {
    if (event && wrapper.contains(event.target)) return;
    menu.classList.remove('open');
    document.removeEventListener('click', closeMenu);
  }

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const willOpen = !menu.classList.contains('open');
    document.removeEventListener('click', closeMenu);
    if (willOpen) {
      menu.classList.add('open');
      document.addEventListener('click', closeMenu);
    } else {
      menu.classList.remove('open');
    }
  });

  wrapper.appendChild(button);
  wrapper.appendChild(menu);
  return wrapper;
}
