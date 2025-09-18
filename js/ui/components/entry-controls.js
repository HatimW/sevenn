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
  button.className = 'entry-add-fab';
  button.innerHTML = '<span>＋</span>';
  button.setAttribute('aria-label', 'Add new entry');
  button.setAttribute('aria-expanded', 'false');

  const menu = document.createElement('div');
  menu.className = 'entry-add-menu';
  menu.setAttribute('role', 'menu');

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
    item.setAttribute('role', 'menuitem');
    item.addEventListener('click', () => {
      closeMenu();
      openEditor(opt.value, onAdded);
    });
    menu.appendChild(item);
  });

  function closeMenu() {
    wrapper.classList.remove('open');
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', handleOutside);
  }

  function handleOutside(e) {
    if (!wrapper.contains(e.target)) {
      closeMenu();
    }
  }

  wrapper.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeMenu();
      button.focus();
    }
  });

  button.addEventListener('click', () => {
    const willOpen = !wrapper.classList.contains('open');
    if (willOpen) {
      wrapper.classList.add('open');
      button.setAttribute('aria-expanded', 'true');
      document.addEventListener('mousedown', handleOutside);
      const firstItem = menu.querySelector('.entry-add-menu-item');
      if (firstItem) {
        setTimeout(() => firstItem.focus(), 0);
      }
    } else {
      closeMenu();
    }
  });

  wrapper.appendChild(menu);
  wrapper.appendChild(button);
  return wrapper;
}
