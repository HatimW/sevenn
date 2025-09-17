import { openEditor } from './editor.js';

const defaultOptions = [
  { value: 'disease', label: 'Disease' },
  { value: 'drug', label: 'Drug' },
  { value: 'concept', label: 'Concept' }
];

export function createEntryAddControl(onAdded, initialKind = 'disease') {
  const wrapper = document.createElement('div');
  wrapper.className = 'entry-add-control';

  const select = document.createElement('select');
  select.className = 'input entry-add-select';
  defaultOptions.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    select.appendChild(option);
  });
  if (initialKind) {
    select.value = initialKind;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn';
  button.textContent = 'Add';
  button.addEventListener('click', () => {
    const kind = select.value;
    if (!kind) return;
    openEditor(kind, onAdded);
  });

  wrapper.appendChild(select);
  wrapper.appendChild(button);
  return wrapper;
}
