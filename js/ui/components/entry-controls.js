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
  button.className = 'btn';
  button.textContent = 'Add';
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

  function closeMenu() {
    menu.classList.add('hidden');
    document.removeEventListener('mousedown', handleOutside);
  }

  function handleOutside(e) {
    if (!wrapper.contains(e.target)) {
      closeMenu();
    }
  }

  button.addEventListener('click', () => {
    const willOpen = menu.classList.contains('hidden');
    if (willOpen) {
      menu.classList.remove('hidden');
      document.addEventListener('mousedown', handleOutside);
    } else {
      closeMenu();
    }
  });

  wrapper.appendChild(button);
  wrapper.appendChild(menu);
  return wrapper;
}
