(() => {
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
  const money = value => `TZS ${Number(value || 0).toLocaleString('sw-TZ')}`;
  const formatDate = value => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleDateString('sw-TZ', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  const approvedTotal = record => (record.payments || [])
    .filter(payment => payment.status === 'approved')
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  function receiptMarkup(record) {
    if (record?.blank) {
      return `<article class="mw-receipt mw-receipt-blank">
        <header class="mw-receipt-head"><span class="mw-receipt-mark">MW</span><div><strong>Mickey Water</strong><small>TAARIFA YA BILI NA MALIPO</small></div></header>
        <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:3mm;padding:1mm 0"><div><small>Namba ya risiti / invoice</small><span style="display:block;height:4mm;border-bottom:1px solid #697a73"></span></div><div><small>Tarehe ya bili</small><span style="display:block;height:4mm;border-bottom:1px solid #697a73"></span></div></div>
        <div class="mw-blank-customer" style="display:grid;grid-template-columns:1.5fr 1fr;gap:3mm;padding:1mm 0"><div><small>Jina la mteja</small><span style="display:block;height:7mm;border-bottom:1px solid #697a73"></span></div><div><small>Namba ya simu</small><span style="display:block;height:7mm;border-bottom:1px solid #697a73"></span></div></div>
        <div class="mw-blank-readings" style="display:grid;grid-template-columns:repeat(3,1fr);gap:3mm;padding:2mm 0;border-top:1px solid #d6dfd9;border-bottom:1px solid #d6dfd9"><div><small>Usomaji uliopita</small><span style="display:block;height:8mm;border-bottom:1px solid #697a73"></span></div><div><small>Usomaji wa sasa</small><span style="display:block;height:8mm;border-bottom:1px solid #697a73"></span></div><div><small>Matumizi (Units)</small><span style="display:block;height:8mm;border-bottom:1px solid #697a73"></span></div></div>
        <div class="mw-blank-totals" style="display:grid;grid-template-columns:repeat(3,1fr);gap:3mm;padding:2mm 0"><div><small>Bili ya mwezi</small><span style="display:block;height:6mm;border-bottom:1px solid #697a73"></span></div><div><small>Deni la nyuma</small><span style="display:block;height:6mm;border-bottom:1px solid #697a73"></span></div><div><small>Jumla ya bili</small><span style="display:block;height:6mm;border-bottom:1px solid #697a73"></span></div></div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:3mm;padding:1mm 0"><div><small>Kiasi kilicholipwa</small><span style="display:block;height:5mm;border-bottom:1px solid #697a73"></span></div><div><small>Salio linalodaiwa</small><span style="display:block;height:5mm;border-bottom:1px solid #697a73"></span></div><div><small>Tarehe ya malipo</small><span style="display:block;height:5mm;border-bottom:1px solid #697a73"></span></div></div>
        <footer class="mw-receipt-foot">Asante, Mickey Water.<div class="mw-blank-signature" style="display:flex;justify-content:space-between;gap:8mm;margin-top:1mm;font-size:8px"><span style="width:44%;padding-top:1.5mm;border-top:1px solid #87938d">Sahihi ya mpokeaji</span><span style="width:44%;padding-top:1.5mm;border-top:1px solid #87938d">Sahihi ya mtoaji</span></div></footer>
      </article>`;
    }
    const paid = approvedTotal(record);
    const total = Number(record.total || 0);
    const balance = Math.max(0, total - paid);
    const status = balance <= 0 ? 'Imelipwa' : paid > 0 ? 'Imelipwa sehemu' : 'Haijalipwa';
    const statusClass = balance <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    const invoiceNumber = record.invoiceNumber || 'Bili ya zamani';
    const receiptNumber = `MW-${String(record._id || '').slice(-8).toUpperCase()}`;
    const payments = (record.payments || []).filter(payment => payment.status === 'approved').sort((left, right) => new Date(left.approvedAt || left.submittedAt) - new Date(right.approvedAt || right.submittedAt));
    const lastPaymentDate = payments[payments.length - 1]?.approvedAt || payments[payments.length - 1]?.submittedAt;
    const paymentRows = payments.slice(-3).map(payment => `<div class="mw-payment-row"><span>${escapeHtml(formatDate(payment.approvedAt || payment.submittedAt))}${payment.reference ? ` · ${escapeHtml(payment.reference)}` : ''}</span><strong>${escapeHtml(money(payment.amount))}</strong></div>`).join('');
    return `<article class="mw-receipt">
      <header class="mw-receipt-head"><span class="mw-receipt-mark">MW</span><div><strong>Mickey Water</strong><small>TAARIFA YA BILI NA MALIPO</small></div></header>
      <div class="mw-receipt-meta"><span>Namba ya risiti</span><strong>${escapeHtml(receiptNumber)}</strong><span>Invoice</span><strong>${escapeHtml(invoiceNumber)}</strong><span>Tarehe ya bili</span><strong>${escapeHtml(formatDate(record.date))}</strong><span>Usomaji uliopita</span><strong>${escapeHtml(record.prevReading ?? 0)} Units</strong><span>Usomaji wa sasa</span><strong>${escapeHtml(record.currReading ?? 0)} Units</strong><span>Matumizi</span><strong>${escapeHtml(record.units ?? Math.max(0, Number(record.currReading || 0) - Number(record.prevReading || 0)))} Units</strong></div>
      <div class="mw-receipt-customer"><small>MTEJA</small><strong>${escapeHtml(record.customerName || 'Mteja')}</strong><span>${escapeHtml(record.phone || '')}</span></div>
      <div class="mw-receipt-status ${statusClass}">${escapeHtml(status)}</div>
      <div class="mw-receipt-amount"><span>Jumla ya bili</span><strong>${escapeHtml(money(total))}</strong></div>
      <div class="mw-receipt-meta"><span>Imelipwa hadi sasa</span><strong>${escapeHtml(money(paid))}</strong><span>Salio linalodaiwa</span><strong>${escapeHtml(money(balance))}</strong><span>Malipo ya mwisho</span><strong>${escapeHtml(lastPaymentDate ? formatDate(lastPaymentDate) : '-')}</strong></div>
      ${paymentRows ? `<section class="mw-payment-list"><strong>Malipo 3 ya mwisho</strong>${paymentRows}</section>` : ''}
      <footer class="mw-receipt-foot">${balance > 0 ? 'Salio hili bado halijalipwa.' : 'Bili hii imelipwa kikamilifu.'} · Asante, Mickey Water.</footer>
    </article>`;
  }

  function printReceipts(items, title = 'Risiti za malipo', options = {}) {
    const requestedPerPage = Number(options.perPage || 6);
    const receiptsPerA4Page = Number.isInteger(requestedPerPage) ? Math.min(7, Math.max(3, requestedPerPage)) : 6;
    const maxA4Pages = 3;
    const receiptItems = items.filter(item => item?.record || item?.blank);
    if (!receiptItems.length || receiptItems.length > receiptsPerA4Page * maxA4Pages) return false;
    const popup = window.open('', '_blank');
    if (!popup) return false;
    const pages = Array.from({ length: Math.ceil(receiptItems.length / receiptsPerA4Page) }, (_, pageIndex) => {
      const start = pageIndex * receiptsPerA4Page;
      const pageItems = receiptItems.slice(start, start + receiptsPerA4Page);
      const columns = pageItems.length <= 3 ? 1 : 2;
      const rows = Math.ceil(pageItems.length / columns);
      const slips = pageItems.map(item => receiptMarkup(item.blank ? { blank: true } : item.record)).join('');
      const compact = pageItems.length > 3 && pageItems.some(item => !item.blank);
      return `<section class="mw-page${compact ? ' mw-page-compact' : ''}" style="grid-template-columns:repeat(${columns},minmax(0,1fr));grid-template-rows:repeat(${rows},minmax(0,1fr))">${slips}</section>`;
    }).join('');
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="sw"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
      *{box-sizing:border-box}body{margin:0;color:#17221f;font:10px/1.35 Arial,sans-serif}.mw-receipt{padding:4mm 4mm 3mm;border:1px dashed #89958f;break-inside:avoid;page-break-inside:avoid}.mw-receipt-head{display:flex;align-items:center;gap:6px;padding-bottom:2mm;border-bottom:1px solid #d6dfd9}.mw-receipt-mark{display:grid;place-items:center;width:25px;height:25px;background:#087f73;color:#fff;font-size:9px;font-weight:700;border-radius:5px}.mw-receipt-head strong,.mw-receipt-head small{display:block}.mw-receipt-head strong{font:700 12px Georgia,serif}.mw-receipt-head small{margin-top:1px;color:#087f73;font-size:7px;font-weight:700;letter-spacing:.6px}.mw-receipt-meta{display:grid;grid-template-columns:1fr auto;gap:2px 6px;padding:2mm 0;color:#627772;font-size:8px}.mw-receipt-meta strong{max-width:42mm;color:#17221f;text-align:right;overflow-wrap:anywhere}.mw-receipt-customer{padding:1mm 0 2mm}.mw-receipt-customer small,.mw-receipt-customer strong,.mw-receipt-customer span{display:block}.mw-receipt-customer small{color:#627772;font-size:7px;font-weight:700;letter-spacing:.7px}.mw-receipt-customer strong{margin:1px 0;font:700 11px Georgia,serif;overflow-wrap:anywhere}.mw-receipt-customer span{color:#627772;font-size:8px}.mw-receipt-status{margin:1mm 0;padding:1.5mm 2mm;border-radius:3px;font-size:8px;font-weight:700;text-align:center}.mw-receipt-status.paid{background:#e5f3e9;color:#23704a}.mw-receipt-status.partial{background:#fff3d4;color:#946b00}.mw-receipt-status.unpaid{background:#fff0e9;color:#b64226}.mw-payment-list{padding:1mm 0;border-top:1px solid #d6dfd9;font-size:7px}.mw-payment-list>strong{display:block;padding:1mm 0;color:#627772}.mw-payment-row{display:flex;justify-content:space-between;gap:4px;padding:.5mm 0}.mw-payment-row span{overflow-wrap:anywhere}.mw-payment-row strong{white-space:nowrap}.mw-receipt-foot{margin-top:1mm;padding-top:1.5mm;border-top:1px solid #d6dfd9;color:#627772;font-size:7px}.mw-cut-marker{height:5mm;display:flex;align-items:center;gap:5px;color:#687873;font-size:6px;letter-spacing:.6px}.mw-cut-marker:before,.mw-cut-marker:after{content:"";flex:1;border-top:1px dashed #89958f}@page{size:80mm 297mm;margin:3mm}@media screen{body{max-width:440px;margin:20px auto;padding:0 12px}.mw-receipt{margin-bottom:4mm}.mw-cut-marker{height:8mm}}
      </style><style>.mw-page-compact .mw-receipt{padding:2mm}.mw-page-compact .mw-receipt-head{gap:4px;padding-bottom:1mm}.mw-page-compact .mw-receipt-mark{width:6mm;height:6mm;font-size:7px}.mw-page-compact .mw-receipt-head strong{font-size:9px}.mw-page-compact .mw-receipt-head small{font-size:6px}.mw-page-compact .mw-receipt-meta{gap:1px 4px;padding:1mm 0;font-size:6px}.mw-page-compact .mw-receipt-meta strong{max-width:38mm}.mw-page-compact .mw-receipt-customer{padding:.5mm 0 1mm}.mw-page-compact .mw-receipt-customer small,.mw-page-compact .mw-receipt-customer span{font-size:6px}.mw-page-compact .mw-receipt-customer strong{font-size:8px}.mw-page-compact .mw-receipt-status{margin:.5mm 0;padding:1mm;font-size:6px}.mw-page-compact .mw-payment-list{display:none}.mw-page-compact .mw-receipt-foot{margin-top:.5mm;padding-top:.5mm;font-size:6px}.mw-page-compact .mw-blank-customer,.mw-page-compact .mw-blank-readings,.mw-page-compact .mw-blank-totals{gap:1mm;padding:1.5mm 0}.mw-page-compact .mw-blank-customer small,.mw-page-compact .mw-blank-readings small,.mw-page-compact .mw-blank-totals small{font-size:6px}.mw-page-compact .mw-blank-customer span{height:5mm}.mw-page-compact .mw-blank-readings span{height:6mm}.mw-page-compact .mw-blank-totals span{height:5mm}.mw-page-compact .mw-blank-signature{gap:8mm;margin-top:2mm;font-size:6px}.mw-page-compact .mw-blank-signature span{padding-top:1mm}</style></head><body><main>${pages}</main>`);
    popup.document.write(`<style>@page{size:A4 portrait;margin:8mm}.mw-page{height:281mm;display:grid;grid-template-rows:repeat(3,minmax(0,1fr));gap:3mm;break-after:page;page-break-after:always}.mw-page:last-child{break-after:auto;page-break-after:auto}.mw-receipt{min-height:0;overflow:hidden;padding:4mm}.mw-receipt-head{gap:7px}.mw-receipt-mark{flex:0 0 9mm;height:9mm}.mw-receipt-head>b{margin-left:auto;font-size:8px}.mw-blank-customer,.mw-blank-readings,.mw-blank-totals{display:grid;gap:3mm;padding:4mm 0}.mw-blank-customer{grid-template-columns:1.5fr 1fr}.mw-blank-readings{grid-template-columns:repeat(3,1fr);border-top:1px solid #d6dfd9;border-bottom:1px solid #d6dfd9}.mw-blank-totals{grid-template-columns:repeat(3,1fr)}.mw-blank-customer>div,.mw-blank-readings>div,.mw-blank-totals>div{min-width:0}.mw-blank-customer small,.mw-blank-readings small,.mw-blank-totals small{display:block;color:#627772;font-size:7px;font-weight:700}.mw-blank-customer span,.mw-blank-readings span,.mw-blank-totals span{display:block;height:8mm;margin-top:1mm;border-bottom:1px solid #697a73}.mw-blank-readings span{height:11mm}.mw-blank-signature{display:flex;justify-content:space-between;gap:15mm;margin-top:6mm;color:#627772;font-size:7px}.mw-blank-signature span{width:44%;padding-top:2mm;border-top:1px solid #697a73}</style></body></html>`);
    popup.onload = () => setTimeout(() => { popup.focus(); popup.print(); }, 150);
      popup.document.write('<style>.mw-receipt{border-color:#b8c9bf;background:#fffefa}.mw-receipt-head{border-color:#d5e0d9}.mw-receipt-mark{background:#187454}.mw-receipt-head small{color:#10563e}.mw-receipt-meta{color:#607572}.mw-receipt-amount{display:flex;justify-content:space-between;align-items:center;margin:1mm 0;padding:2mm 0;border-top:1px solid #d5e0d9;border-bottom:1px solid #d5e0d9;color:#526a61;font-size:8px;font-weight:700}.mw-receipt-amount strong{color:#10563e;font-size:12px}.mw-receipt-status.paid{background:#e5f1e8;color:#236747}.mw-receipt-status.partial{background:#faf0d2;color:#866617}.mw-receipt-status.unpaid{background:#f8e9e3;color:#9e4935}.mw-receipt-foot{color:#607572}.mw-receipt-blank small{color:#526a61;font-size:8px;font-weight:700}.mw-receipt-blank span{border-color:#82968b!important}</style>');
    popup.document.close();
    return true;
  }

  let activeReceipt = null;
  let previewModal = null;
  function ensurePreviewModal() {
    if (previewModal) return previewModal;
    previewModal = document.createElement('div');
    previewModal.className = 'mw-preview-modal';
    previewModal.innerHTML = '<section class="mw-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="mwPreviewTitle"><header class="mw-preview-toolbar"><h2 id="mwPreviewTitle">Preview ya risiti</h2><div><button type="button" class="mw-preview-print" data-preview-print>Chapisha</button><button type="button" class="mw-preview-close" data-preview-close aria-label="Funga">Funga</button></div></header><div class="mw-preview-content"></div></section>';
    previewModal.addEventListener('click', event => {
      if (event.target === previewModal || event.target.closest('[data-preview-close]')) previewModal.classList.remove('show');
      if (event.target.closest('[data-preview-print]') && activeReceipt) printReceipts([activeReceipt], 'Risiti ya malipo', activeReceipt.options);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') previewModal.classList.remove('show');
    });
    const style = document.createElement('style');
    style.textContent = '.mw-preview-modal{display:none;position:fixed;inset:0;z-index:1000;align-items:center;justify-content:center;padding:16px;background:rgba(16,42,43,.62)}.mw-preview-modal.show{display:flex}.mw-preview-dialog{width:min(560px,100%);max-height:92vh;overflow:auto;padding:16px;background:var(--white,#fff);border:1px solid var(--line,#c8d9d0);border-radius:10px;box-shadow:0 24px 70px rgba(0,0,0,.3)}.mw-preview-toolbar{position:sticky;top:-16px;z-index:1;display:flex;justify-content:space-between;align-items:center;gap:12px;margin:-16px -16px 14px;padding:12px 16px;background:var(--white,#fff);border-bottom:1px solid var(--line,#c8d9d0)}.mw-preview-toolbar h2{margin:0;font:700 1rem Arial,sans-serif}.mw-preview-toolbar>div{display:flex;gap:7px}.mw-preview-toolbar button{min-height:38px;padding:8px 12px;border:1px solid var(--line,#c8d9d0);border-radius:6px;background:transparent;color:var(--ink,#17221f);font:700 .75rem Arial,sans-serif;cursor:pointer}.mw-preview-toolbar .mw-preview-print{background:var(--teal,#087f73);border-color:var(--teal,#087f73);color:#fff}.mw-preview-content .mw-receipt{padding:22px;border:1px dashed var(--line,#c8d9d0);color:var(--ink,#17221f);font:12px/1.5 Arial,sans-serif}.mw-preview-content .mw-receipt-head{display:flex;align-items:center;gap:9px;padding-bottom:14px;border-bottom:1px solid var(--line,#c8d9d0)}.mw-preview-content .mw-receipt-mark{display:grid;place-items:center;width:36px;height:36px;background:var(--teal,#087f73);color:#fff;font-weight:700;border-radius:7px}.mw-preview-content .mw-receipt-head strong,.mw-preview-content .mw-receipt-head small{display:block}.mw-preview-content .mw-receipt-head strong{font:700 16px Georgia,serif}.mw-preview-content .mw-receipt-head small{margin-top:3px;color:var(--teal,#087f73);font-size:9px;font-weight:700;letter-spacing:1px}.mw-preview-content .mw-receipt-number{margin-left:auto;font-size:10px;font-weight:700}.mw-preview-content .mw-receipt-meta{display:grid;grid-template-columns:1fr 1.4fr;gap:6px 12px;padding:14px 0;color:var(--muted,#627772);font-size:10px}.mw-preview-content .mw-receipt-meta strong{color:var(--ink,#17221f);text-align:right;overflow-wrap:anywhere}.mw-preview-content .mw-receipt-customer{padding:10px 0}.mw-preview-content .mw-receipt-customer small,.mw-preview-content .mw-receipt-customer strong,.mw-preview-content .mw-receipt-customer span{display:block}.mw-preview-content .mw-receipt-customer small{color:var(--muted,#627772);font-size:8px;font-weight:700;letter-spacing:1px}.mw-preview-content .mw-receipt-customer strong{margin:4px 0;font:700 14px Georgia,serif}.mw-preview-content .mw-receipt-customer span{color:var(--muted,#627772);font-size:10px}.mw-preview-content .mw-receipt-amount{display:flex;justify-content:space-between;align-items:center;padding:13px 0;border-top:1px solid var(--line,#c8d9d0);border-bottom:1px solid var(--line,#c8d9d0);font-size:11px}.mw-preview-content .mw-receipt-amount strong{color:var(--teal,#087f73);font-size:17px}.mw-preview-content .mw-receipt-foot{margin-top:7px;padding-top:10px;border-top:1px solid var(--line,#c8d9d0);color:var(--muted,#627772);font-size:10px}@media(max-width:520px){.mw-preview-modal{padding:8px}.mw-preview-dialog{padding:12px}.mw-preview-toolbar{top:-12px;margin:-12px -12px 12px;padding:10px 12px}.mw-preview-content .mw-receipt{padding:16px}}@media print{.mw-preview-modal{display:none!important}}';
    style.textContent += '.mw-preview-content .mw-receipt-status{margin:7px 0;padding:7px;border-radius:4px;font-size:10px;font-weight:700;text-align:center}.mw-preview-content .mw-receipt-status.paid{background:#e5f3e9;color:#23704a}.mw-preview-content .mw-receipt-status.partial{background:#fff3d4;color:#946b00}.mw-preview-content .mw-receipt-status.unpaid{background:#fff0e9;color:#b64226}.mw-preview-content .mw-payment-list{padding:7px 0;border-top:1px solid var(--line,#c8d9d0);font-size:9px}.mw-preview-content .mw-payment-list>strong{display:block;padding:5px 0;color:var(--muted,#627772)}.mw-preview-content .mw-payment-row{display:flex;justify-content:space-between;gap:8px;padding:3px 0}.mw-preview-content .mw-payment-row span{overflow-wrap:anywhere}.mw-preview-content .mw-payment-row strong{white-space:nowrap}';
    document.head.append(style);
    const receiptThemeStyle = document.createElement('style');
    receiptThemeStyle.textContent = '.mw-preview-content .mw-receipt{border-color:#b8c9bf;background:#fffefa}.mw-preview-content .mw-receipt-head{border-color:#d5e0d9}.mw-preview-content .mw-receipt-mark{background:#187454}.mw-preview-content .mw-receipt-head small{color:#10563e}.mw-preview-content .mw-receipt-meta{color:#607572}.mw-preview-content .mw-receipt-status.paid{background:#e5f1e8;color:#236747}.mw-preview-content .mw-receipt-status.partial{background:#faf0d2;color:#866617}.mw-preview-content .mw-receipt-status.unpaid{background:#f8e9e3;color:#9e4935}.mw-preview-content .mw-receipt-blank small{color:#526a61;font-size:9px;font-weight:700}.mw-preview-content .mw-receipt-blank span{border-color:#82968b!important}';
    document.head.append(receiptThemeStyle);
    document.body.append(previewModal);
    return previewModal;
  }

  function preview(record, payment, options = {}) {
    if (!record) return false;
    activeReceipt = { record, payment, options };
    const modal = ensurePreviewModal();
    const content = modal.querySelector('.mw-preview-content');
    const closeButton = modal.querySelector('[data-preview-close]');
    if (!content || !closeButton) return false;
    content.innerHTML = receiptMarkup(record);
    modal.classList.add('show');
    closeButton.focus();
    return true;
  }

  window.MickeyReceiptPrint = { preview, print: printReceipts };
})();