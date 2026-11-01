(() => {
  const rows = document.getElementById('adminExistingRows');
  if (!rows) return;

  function organizeActions() {
    rows.querySelectorAll('tr').forEach(row => {
      const cell = row.lastElementChild;
      if (!cell || cell.querySelector('.record-action-menu')) return;
      const buttons = [...cell.querySelectorAll(':scope > .button')];
      if (buttons.length < 4) return;
      const primary = buttons.filter(button => button.matches('[data-edit-admin-bill],.admin-action-paid'));
      const secondary = buttons.filter(button => !primary.includes(button));
      if (!secondary.length) return;
      const menu = document.createElement('details');
      menu.className = 'record-action-menu';
      menu.innerHTML = `<summary>Vitendo (${secondary.length})</summary><div class="record-action-menu-content"></div>`;
      const content = menu.querySelector('.record-action-menu-content');
      secondary.forEach(button => content.append(button));
      cell.replaceChildren(...primary, menu);
    });
  }

  organizeActions();
  new MutationObserver(organizeActions).observe(rows, { childList: true, subtree: true });
})();
