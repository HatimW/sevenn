export function chipsInput(values = [], onChange) {
  const box = document.createElement('div');
  box.className = 'chips';

  function render() {
    box.innerHTML = '';
    values.forEach((v, i) => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = v;
      const x = document.createElement('button');
      x.className = 'chip-remove';
      x.textContent = '×';
      x.addEventListener('click', () => {
        values.splice(i, 1);
        render();
        onChange && onChange(values);
      });
      chip.appendChild(x);
      box.appendChild(chip);
    });
    const input = document.createElement('input');
    input.className = 'chip-input';
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        values.push(input.value.trim());
        input.value = '';
        render();
        onChange && onChange(values);
      }
    });
    box.appendChild(input);
  }

  render();
  return box;
}

export function chipList(values = []) {
  const box = document.createElement('div');
  box.className = 'chips';
  values.forEach(v => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = v;
    box.appendChild(chip);
  });
  return box;
}
