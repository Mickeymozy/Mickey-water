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

  function receiptMarkup(record, payment) {
    const balance = Math.max(0, Number(record.total || 0) - approvedTotal(record));
    const receiptNumber = payment.receiptNumber || `MW-${String(record._id || '').slice(-8).toUpperCase()}`;
    const invoiceNumber = record.invoiceNumber || 'Bili ya zamani';
    const paymentDate = payment.approvedAt || payment.submittedAt || record.date;
    return `<article class="mw-receipt">
      <header class="mw-receipt-head"><span class="mw-receipt-mark">MW</span><div><strong>Mickey Water</strong><small>RISITI YA MALIPO</small></div><span class="mw-receipt-number">${escapeHtml(receiptNumber)}</span></header>
      <div class="mw-receipt-meta"><span>Invoice</span><strong>${escapeHtml(invoiceNumber)}</strong><span>Tarehe ya malipo</span><strong>${escapeHtml(formatDate(paymentDate))}</strong></div>
      <div class="mw-receipt-customer"><small>IMETOLEWA KWA</small><strong>${escapeHtml(record.customerName || 'Mteja')}</strong><span>${escapeHtml(record.phone || '')}</span></div>
      <div class="mw-receipt-amount"><span>Kiasi kilichopokelewa</span><strong>${escapeHtml(money(payment.amount))}</strong></div>
      <div class="mw-receipt-meta"><span>Rejea ya malipo</span><strong>${escapeHtml(payment.reference || 'Haijawekwa')}</strong><span>Jumla iliyolipwa kwenye bili</span><strong>${escapeHtml(money(approvedTotal(record)))}</strong><span>Salio la bili</span><strong>${escapeHtml(money(balance))}</strong></div>
      <footer class="mw-receipt-foot">${balance > 0 ? 'Malipo yamepokelewa kwa sehemu.' : 'Malipo yamepokelewa kikamilifu.'} Asante kwa kutumia Mickey Water.</footer>
    </article>`;
  }

  function printReceipts(items, title = 'Risiti za malipo') {
    const approvedItems = items.filter(item => item?.record && item?.payment?.status === 'approved');
    if (!approvedItems.length) return false;
    const popup = window.open('', '_blank');
    if (!popup) return false;
    const slips = approvedItems.map((item, index) => `${receiptMarkup(item.record, item.payment)}${index < approvedItems.length - 1 ? '<div class="mw-cut-marker"><span>KATA HAPA</span></div>' : ''}`).join('');
    popup.document.open();
    popup.document.write(`<!doctype html><html lang="sw"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
      *{box-sizing:border-box}body{margin:0;color:#17221f;font:12px/1.45 Arial,sans-serif}.mw-print-heading{padding:0 0 5mm;border-bottom:1px solid #c8d9d0;margin-bottom:5mm}.mw-print-heading h1{margin:0;font:700 16px Arial,sans-serif}.mw-print-heading p{margin:3px 0 0;color:#627772;font-size:10px}.mw-receipt{padding:7mm 8mm;border:1px dashed #7b8b85;break-inside:avoid;page-break-inside:avoid}.mw-receipt-head{display:flex;align-items:center;gap:9px;padding-bottom:4mm;border-bottom:1px solid #d6dfd9}.mw-receipt-mark{display:grid;place-items:center;width:34px;height:34px;background:#087f73;color:#fff;font-weight:700;border-radius:7px}.mw-receipt-head strong,.mw-receipt-head small{display:block}.mw-receipt-head strong{font:700 15px Georgia,serif}.mw-receipt-head small{margin-top:2px;color:#087f73;font-size:9px;font-weight:700;letter-spacing:1px}.mw-receipt-number{margin-left:auto;font-size:10px;font-weight:700}.mw-receipt-meta{display:grid;grid-template-columns:1fr 1.4fr;gap:3px 12px;padding:4mm 0;color:#627772;font-size:10px}.mw-receipt-meta strong{color:#17221f;text-align:right;overflow-wrap:anywhere}.mw-receipt-customer{padding:3mm 0}.mw-receipt-customer small,.mw-receipt-customer strong,.mw-receipt-customer span{display:block}.mw-receipt-customer small{color:#627772;font-size:8px;font-weight:700;letter-spacing:1px}.mw-receipt-customer strong{margin:3px 0;font:700 13px Georgia,serif}.mw-receipt-customer span{color:#627772;font-size:10px}.mw-receipt-amount{display:flex;justify-content:space-between;align-items:center;padding:4mm 0;border-top:1px solid #d6dfd9;border-bottom:1px solid #d6dfd9;font-size:11px}.mw-receipt-amount strong{color:#087f73;font-size:16px}.mw-receipt-foot{margin-top:2mm;padding-top:3mm;border-top:1px solid #d6dfd9;color:#627772;font-size:9px}.mw-cut-marker{height:8mm;display:flex;align-items:center;gap:8px;color:#687873;font-size:8px;letter-spacing:1px}.mw-cut-marker:before,.mw-cut-marker:after{content:"";flex:1;border-top:1px dashed #89958f}@page{size:A4 portrait;margin:9mm}@media screen{body{max-width:760px;margin:20px auto;padding:0 18px}.mw-print-heading{margin-top:8px}.mw-receipt{margin-bottom:4mm}.mw-cut-marker{height:10mm}}
      </style></head><body><header class="mw-print-heading"><h1>Mickey Water</h1><p>${escapeHtml(title)} · ${approvedItems.length} risiti</p></header><main>${slips}</main></body></html>`);
    popup.onload = () => setTimeout(() => { popup.focus(); popup.print(); }, 150);
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
      if (event.target.closest('[data-preview-print]') && activeReceipt) printReceipts([activeReceipt], 'Risiti ya malipo');
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') previewModal.classList.remove('show');
    });
    const style = document.createElement('style');
    style.textContent = '.mw-preview-modal{display:none;position:fixed;inset:0;z-index:1000;align-items:center;justify-content:center;padding:16px;background:rgba(16,42,43,.62)}.mw-preview-modal.show{display:flex}.mw-preview-dialog{width:min(560px,100%);max-height:92vh;overflow:auto;padding:16px;background:var(--white,#fff);border:1px solid var(--line,#c8d9d0);border-radius:10px;box-shadow:0 24px 70px rgba(0,0,0,.3)}.mw-preview-toolbar{position:sticky;top:-16px;z-index:1;display:flex;justify-content:space-between;align-items:center;gap:12px;margin:-16px -16px 14px;padding:12px 16px;background:var(--white,#fff);border-bottom:1px solid var(--line,#c8d9d0)}.mw-preview-toolbar h2{margin:0;font:700 1rem Arial,sans-serif}.mw-preview-toolbar>div{display:flex;gap:7px}.mw-preview-toolbar button{min-height:38px;padding:8px 12px;border:1px solid var(--line,#c8d9d0);border-radius:6px;background:transparent;color:var(--ink,#17221f);font:700 .75rem Arial,sans-serif;cursor:pointer}.mw-preview-toolbar .mw-preview-print{background:var(--teal,#087f73);border-color:var(--teal,#087f73);color:#fff}.mw-preview-content .mw-receipt{padding:22px;border:1px dashed var(--line,#c8d9d0);color:var(--ink,#17221f);font:12px/1.5 Arial,sans-serif}.mw-preview-content .mw-receipt-head{display:flex;align-items:center;gap:9px;padding-bottom:14px;border-bottom:1px solid var(--line,#c8d9d0)}.mw-preview-content .mw-receipt-mark{display:grid;place-items:center;width:36px;height:36px;background:var(--teal,#087f73);color:#fff;font-weight:700;border-radius:7px}.mw-preview-content .mw-receipt-head strong,.mw-preview-content .mw-receipt-head small{display:block}.mw-preview-content .mw-receipt-head strong{font:700 16px Georgia,serif}.mw-preview-content .mw-receipt-head small{margin-top:3px;color:var(--teal,#087f73);font-size:9px;font-weight:700;letter-spacing:1px}.mw-preview-content .mw-receipt-number{margin-left:auto;font-size:10px;font-weight:700}.mw-preview-content .mw-receipt-meta{display:grid;grid-template-columns:1fr 1.4fr;gap:6px 12px;padding:14px 0;color:var(--muted,#627772);font-size:10px}.mw-preview-content .mw-receipt-meta strong{color:var(--ink,#17221f);text-align:right;overflow-wrap:anywhere}.mw-preview-content .mw-receipt-customer{padding:10px 0}.mw-preview-content .mw-receipt-customer small,.mw-preview-content .mw-receipt-customer strong,.mw-preview-content .mw-receipt-customer span{display:block}.mw-preview-content .mw-receipt-customer small{color:var(--muted,#627772);font-size:8px;font-weight:700;letter-spacing:1px}.mw-preview-content .mw-receipt-customer strong{margin:4px 0;font:700 14px Georgia,serif}.mw-preview-content .mw-receipt-customer span{color:var(--muted,#627772);font-size:10px}.mw-preview-content .mw-receipt-amount{display:flex;justify-content:space-between;align-items:center;padding:13px 0;border-top:1px solid var(--line,#c8d9d0);border-bottom:1px solid var(--line,#c8d9d0);font-size:11px}.mw-preview-content .mw-receipt-amount strong{color:var(--teal,#087f73);font-size:17px}.mw-preview-content .mw-receipt-foot{margin-top:7px;padding-top:10px;border-top:1px solid var(--line,#c8d9d0);color:var(--muted,#627772);font-size:10px}@media(max-width:520px){.mw-preview-modal{padding:8px}.mw-preview-dialog{padding:12px}.mw-preview-toolbar{top:-12px;margin:-12px -12px 12px;padding:10px 12px}.mw-preview-content .mw-receipt{padding:16px}}@media print{.mw-preview-modal{display:none!important}}';
    document.head.append(style);
    document.body.append(previewModal);
    return previewModal;
  }

  function preview(record, payment) {
    if (!record || !payment || payment.status !== 'approved') return false;
    activeReceipt = { record, payment };
    const modal = ensurePreviewModal();
    modal.querySelector('.mw-preview-content').innerHTML = receiptMarkup(record, payment);
    modal.classList.add('show');
    modal.querySelector('[data-preview-close]').focus();
    return true;
  }

  window.MickeyReceiptPrint = { preview, print: printReceipts };
})();