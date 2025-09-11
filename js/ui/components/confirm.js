export function confirmModal(message) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal';

    const box = document.createElement('div');
    box.className = 'card';

    const msg = document.createElement('p');
    msg.textContent = message;
    box.appendChild(msg);

    const actions = document.createElement('div');
    actions.className = 'row';

    const yes = document.createElement('button');
    yes.className = 'btn';
    yes.textContent = 'Yes';
    yes.addEventListener('click', () => {
      document.body.removeChild(overlay);
      resolve(true);
    });

    const no = document.createElement('button');
    no.className = 'btn';
    no.textContent = 'No';
    no.addEventListener('click', () => {
      document.body.removeChild(overlay);
      resolve(false);
    });

    actions.appendChild(yes);
    actions.appendChild(no);
    box.appendChild(actions);
    overlay.appendChild(box);

    overlay.addEventListener('click', e => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
        resolve(false);
      }
    });

    document.body.appendChild(overlay);
    yes.focus();
  });
}
