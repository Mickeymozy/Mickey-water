(() => {
  const isAdmin = user.role === 'admin';
  document.body.classList.add('portal-dashboard');
  const overview = document.createElement('section');
  overview.className = 'dashboard-overview';
  overview.setAttribute('aria-label', 'Muhtasari wa bili na matumizi');
  overview.innerHTML = '<section class="overview-bill"><div class="overview-head"><div><p class="overview-kicker">BILI YA KARIBUNI</p><p class="overview-invoice" id="overviewInvoice">Inapakia taarifa...</p></div><span class="status" id="overviewStatus"></span></div><strong class="overview-amount" id="overviewAmount">TZS 0</strong><div class="overview-details"><span id="overviewDate"></span><span id="overviewBalance"></span></div><div class="overview-progress"><span id="overviewProgress"></span></div><button class="primary" id="overviewPay" type="button">Lipa sasa</button></section><section class="overview-consumption"><div class="overview-consumption-head"><div><p class="overview-kicker">MATUMIZI YA MAJI</p><h2>Miezi ya karibuni</h2></div><span id="overviewUnits">0 Units</span></div><div class="consumption-chart" id="overviewChart" role="img" aria-label="Grafu ya matumizi ya maji ya miezi sita ya karibuni"></div></section>';
  const views = document.querySelector('.view-tabs');
  if (!isAdmin && views) views.before(overview);
  if (views) {
    const layout = document.createElement('div');
    layout.className = 'dashboard-layout';
    views.before(layout);
    layout.append(views, document.querySelector('.workspace'));
    views.setAttribute('aria-label', 'Sehemu kuu za portal');
  }

  function renderOverview() {
    if (isAdmin || !overview.isConnected) return;
    const records = [...state.records].sort((left, right) => new Date(right.date) - new Date(left.date));
    const latest = records[0];
    const chart = document.getElementById('overviewChart');
    if (!latest) {
      document.getElementById('overviewInvoice').textContent = 'Hakuna bili zilizopatikana';
      document.getElementById('overviewAmount').textContent = money(0);
      document.getElementById('overviewStatus').textContent = 'Hakuna bili';
      document.getElementById('overviewStatus').className = 'status';
      document.getElementById('overviewDate').textContent = '';
      document.getElementById('overviewBalance').textContent = '';
      document.getElementById('overviewProgress').style.width = '0%';
      document.getElementById('overviewPay').hidden = true;
      chart.innerHTML = '<p class="overview-empty">Matumizi yataonekana baada ya bili ya kwanza.</p>';
      document.getElementById('overviewUnits').textContent = '0 Units';
      return;
    }
    const paid = (latest.payments || []).filter(payment => payment.status === 'approved').reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const total = Number(latest.total || 0);
    const balance = Math.max(0, total - paid);
    const status = paymentStatus(latest);
    document.getElementById('overviewInvoice').textContent = latest.invoiceNumber || 'Bili ya zamani';
    document.getElementById('overviewAmount').textContent = money(total);
    const statusElement = document.getElementById('overviewStatus');
    statusElement.textContent = status.className === 'partial' ? 'Imelipwa sehemu' : status.label;
    statusElement.className = `status ${status.className}`;
    document.getElementById('overviewDate').textContent = `Tarehe ya bili: ${date(latest.date)}`;
    document.getElementById('overviewBalance').textContent = `Salio: ${money(balance)}`;
    document.getElementById('overviewProgress').style.width = `${total ? Math.min(100, paid / total * 100) : 0}%`;
    const payButton = document.getElementById('overviewPay');
    payButton.hidden = balance <= 0;
    payButton.onclick = () => payById(latest._id);

    const monthly = new Map();
    records.forEach(record => {
      const month = String(record.date).slice(0, 7);
      monthly.set(month, (monthly.get(month) || 0) + Number(record.units || 0));
    });
    const lastMonths = [...monthly.entries()].sort(([left], [right]) => left.localeCompare(right)).slice(-6);
    const maxUnits = Math.max(...lastMonths.map(([, units]) => units), 1);
    document.getElementById('overviewUnits').textContent = `${records.reduce((sum, record) => sum + Number(record.units || 0), 0).toLocaleString('sw-TZ')} Units jumla`;
    chart.innerHTML = lastMonths.map(([month, units]) => {
      const label = new Date(`${month}-01T12:00:00`).toLocaleDateString('sw-TZ', { month: 'short' });
      const height = Math.max(8, units / maxUnits * 100);
      return `<div class="consumption-month" title="${escapeHtml(label)}: ${units} Units"><span class="consumption-value">${Number(units).toLocaleString('sw-TZ')}</span><span class="consumption-bar" style="height:${height}%"></span><small>${escapeHtml(label)}</small></div>`;
    }).join('') || '<p class="overview-empty">Hakuna matumizi ya kuonyesha.</p>';
  }

  function organizeActions() {
    document.querySelectorAll('#records .record-actions').forEach(actions => {
      if (actions.querySelector('.record-action-menu')) return;
      const buttons = [...actions.querySelectorAll(':scope > button')];
      if (buttons.length < 3) return;
      const primary = buttons.find(button => button.classList.contains('pay'));
      const menu = document.createElement('details');
      menu.className = 'record-action-menu';
      menu.innerHTML = '<summary>Vitendo vingine</summary><div class="record-action-menu-content"></div>';
      const content = menu.querySelector('.record-action-menu-content');
      buttons.filter(button => button !== primary).forEach(button => content.append(button));
      actions.replaceChildren(...(primary ? [primary, menu] : [menu]));
    });
  }

  document.addEventListener('click', event => {
    document.querySelectorAll('.record-action-menu[open]').forEach(menu => {
      if (!menu.contains(event.target)) menu.open = false;
    });
  });
  const previousRender = render;
  render = function() {
    previousRender();
    renderOverview();
    organizeActions();
  };
  renderOverview();
  organizeActions();
})();
