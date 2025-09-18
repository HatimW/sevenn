import { openEditor } from './editor.js';

const defaultOptions = [
  { value: 'disease', label: 'Disease' },
  { value: 'drug', label: 'Drug' },
  { value: 'concept', label: 'Concept' }
];

export function createEntryAddControl(onAdded, initialKind = 'disease') {
  const wrapper = document.createElement('div');
  wrapper.className = 'entry-add-control';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'fab-btn';
  button.innerHTML = '<span class="sr-only">Add new entry</span><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  button.setAttribute('aria-label', 'Add new entry');
  const menu = document.createElement('div');
  menu.className = 'entry-add-menu hidden';

  const options = [...defaultOptions];
  if (initialKind) {
    const idx = options.findIndex(opt => opt.value === initialKind);
    if (idx > 0) {
      const [preferred] = options.splice(idx, 1);
      options.unshift(preferred);
    }
  }

  options.forEach(opt => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'entry-add-menu-item';
    item.textContent = opt.label;
    item.addEventListener('click', () => {
      closeMenu();
      openEditor(opt.value, onAdded);
    });
    menu.appendChild(item);
  });

  function setOpen(open) {
    menu.classList.toggle('hidden', !open);
    wrapper.classList.toggle('open', open);
    button.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) document.addEventListener('mousedown', handleOutside);
    else document.removeEventListener('mousedown', handleOutside);
  }

  function closeMenu() {
    setOpen(false);
  }

  function handleOutside(e) {
    if (!wrapper.contains(e.target)) {
      closeMenu();
    }
  }

  button.addEventListener('click', () => {
    const willOpen = menu.classList.contains('hidden');
    setOpen(willOpen);
  });

  wrapper.appendChild(button);
  wrapper.appendChild(menu);
  setOpen(false);
  return wrapper;
}
