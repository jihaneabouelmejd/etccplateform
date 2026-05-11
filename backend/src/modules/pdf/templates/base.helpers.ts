// ============================================================================
// Shared PDF Helpers — ETCC
// ============================================================================

export function fmt(n: number): string {
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function fmtAr(n: number): string {
  return new Intl.NumberFormat('ar-MA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function fmtDate(dateStr: string | Date, lang: 'FR' | 'AR'): string {
  const d = new Date(dateStr);
  return new Intl.DateTimeFormat(lang === 'AR' ? 'ar-MA' : 'fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

export const HONEY = {
  dark: '#1A141A',
  caramel: '#E59312',
  gold: '#F4B315',
  orange: '#8E5915',
  cream: '#FFF8EE',
  beige: '#E8D4B0',
  beigeMid: '#D3AF85',
};

export const baseStyles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Cairo:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'DM Sans', sans-serif;
    font-size: 16px;
    color: #1A141A;
    background: white;
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  body.rtl {
    font-family: 'Cairo', sans-serif;
    direction: rtl;
    text-align: right;
  }

  .page {
    width: 210mm;
    min-height: 297mm;
    padding: 12mm;
    background: white;
    display: flex;
    flex-direction: column;
  }

  /* Header */
  .doc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 12px;
    border-bottom: 2px solid #F4B315;
    margin-bottom: 14px;
  }

  .company-block {}
  .company-logo {
    height: 44px;
    width: auto;
    max-width: 120px;
    object-fit: contain;
    margin-bottom: 6px;
  }
  .company-name {
    font-size: 18px;
    font-weight: 700;
    color: #1A141A;
    letter-spacing: -0.3px;
  }
  .company-name span { color: #8E5915; }
  .company-legal {
    font-size: 15px;
    color: #E59312;
    margin-top: 2px;
    line-height: 1.6;
  }

  /* Doc title block */
  .doc-title-block {
    text-align: right;
  }
  body.rtl .doc-title-block { text-align: left; }

  .doc-title {
    font-size: 22px;
    font-weight: 700;
    color: #E59312;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .doc-number {
    font-size: 13px;
    font-weight: 600;
    color: #1A141A;
    font-family: 'JetBrains Mono', monospace;
    margin-top: 4px;
  }
  .doc-date {
    font-size: 15px;
    color: #E59312;
    margin-top: 2px;
  }

  /* Parties */
  .parties {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 14px;
  }

  .party-card {
    background: #FFF8EE;
    border: 1px solid #E8D4B0;
    border-radius: 6px;
    padding: 10px 12px;
  }
  .party-label {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: #8E5915;
    margin-bottom: 5px;
    padding-bottom: 4px;
    border-bottom: 1px solid #E8D4B0;
  }
  .party-name {
    font-size: 16px;
    font-weight: 600;
    color: #1A141A;
    margin-bottom: 2px;
  }
  .party-info {
    font-size: 15px;
    color: #E59312;
    line-height: 1.7;
  }

  /* References row */
  .refs-row {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }
  .ref-chip {
    background: #FFF8EE;
    border: 1px solid #E8D4B0;
    border-radius: 4px;
    padding: 4px 10px;
    font-size: 15px;
    color: #E59312;
    font-weight: 500;
  }
  .ref-chip strong {
    color: #1A141A;
    font-family: 'JetBrains Mono', monospace;
  }

  /* Lines table */
  .lines-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 12px;
    font-size: 15px;
  }
  .lines-table thead tr {
    background: #1A141A;
    color: white;
  }
  .lines-table thead th {
    padding: 8px 10px;
    text-align: left;
    font-size: 15px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  body.rtl .lines-table thead th { text-align: right; }
  .lines-table thead th.num { text-align: right; }
  body.rtl .lines-table thead th.num { text-align: left; }

  .lines-table tbody tr:nth-child(even) { background: #FFF8EE; }
  .lines-table tbody tr:nth-child(odd) { background: white; }
  .lines-table tbody tr:hover { background: #FFF3E0; }

  .lines-table tbody td {
    padding: 7px 10px;
    border-bottom: 1px solid #E8D4B0;
    vertical-align: middle;
    color: #1A141A;
  }
  .lines-table tbody td.num {
    text-align: right;
    font-family: 'JetBrains Mono', monospace;
    font-weight: 500;
  }
  body.rtl .lines-table tbody td.num { text-align: left; }
  .row-num {
    color: #D3AF85;
    font-size: 15px;
    font-weight: 500;
    width: 20px;
  }

  /* Totals */
  .totals-section {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 14px;
  }
  body.rtl .totals-section { justify-content: flex-start; }

  .totals-box {
    width: 260px;
    border: 1px solid #E8D4B0;
    border-radius: 6px;
    overflow: hidden;
  }
  .total-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 10px;
    font-size: 15px;
    border-bottom: 1px solid #E8D4B0;
  }
  .total-row:last-child { border-bottom: none; }
  body.rtl .total-row { flex-direction: row-reverse; }
  .total-row .label { color: #E59312; }
  .total-row .value {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 500;
    color: #1A141A;
  }
  .total-row.discount { background: #FFF3E0; }
  .total-row.discount .label { color: #D32F2F; }
  .total-row.discount .value { color: #D32F2F; }
  .total-row.ht-net { background: #E8D4B0; }
  .total-row.grand {
    background: #F4B315;
    padding: 9px 10px;
  }
  .total-row.grand .label {
    color: #1A141A;
    font-weight: 700;
    font-size: 16px;
  }
  .total-row.grand .value {
    color: #1A141A;
    font-weight: 700;
    font-size: 18px;
  }

  /* Signature zone */
  .signature-zone {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px dashed #D3AF85;
  }
  .sig-company, .sig-client {
    text-align: center;
    flex: 1;
  }
  .sig-label {
    font-size: 15px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #E59312;
    margin-bottom: 8px;
  }
  .sig-image {
    height: 55px;
    max-width: 150px;
    object-fit: contain;
    margin: 0 auto;
    display: block;
  }
  .sig-line {
    width: 140px;
    margin: 0 auto;
    border-bottom: 1px solid #D3AF85;
    margin-top: 40px;
  }
  .sig-name {
    font-size: 15px;
    color: #E59312;
    margin-top: 4px;
  }

  /* Footer */
  .doc-footer {
    margin-top: auto;
    padding-top: 12px;
    border-top: 1px solid #E8D4B0;
    text-align: center;
    font-size: 13px;
    color: #D3AF85;
    line-height: 1.7;
  }

  /* Notes box */
  .notes-box {
    background: #FFF8EE;
    border-left: 3px solid #F4B315;
    padding: 8px 10px;
    margin-bottom: 12px;
    font-size: 15px;
    color: #E59312;
    border-radius: 0 4px 4px 0;
  }
  body.rtl .notes-box {
    border-left: none;
    border-right: 3px solid #F4B315;
    border-radius: 4px 0 0 4px;
  }
  .notes-label {
    font-size: 15px;
    font-weight: 700;
    text-transform: uppercase;
    color: #8E5915;
    margin-bottom: 3px;
  }

  /* Watermark for BL — no prices */
  .no-price-badge {
    display: inline-block;
    background: #EAF3DE;
    color: #3B6D11;
    border: 1px solid #97C459;
    border-radius: 3px;
    padding: 1px 6px;
    font-size: 8px;
    font-weight: 600;
    margin-left: 6px;
    vertical-align: middle;
  }

  /* Status badge */
  .status-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 600;
  }
  .status-paid { background: #E8F5E9; color: #2E7D32; }
  .status-unpaid { background: #FFF3E0; color: #F57F17; }
  .status-overdue { background: #FFEBEE; color: #C62828; }
`;

export const labels = {
  FR: {
    devis: 'DEVIS', bl: 'BON DE LIVRAISON', invoice: 'FACTURE',
    from: 'DE', to: 'À', client: 'CLIENT',
    refBC: 'Réf. BC', refDevis: 'Réf. Devis', refBL: 'Réf. BL',
    description: 'Description', qty: 'Qté', unitPrice: 'P.U. HT',
    totalHT: 'Total HT', tva: 'TVA', totalTTC: 'Total TTC',
    htBrut: 'Total HT brut', discount: 'Réduction', htNet: 'Total HT net',
    tvaLine: 'TVA 20%', grandTotal: 'TOTAL TTC', balance: 'Net à payer',
    acompte: 'Acompte', validity: 'Valable jusqu\'au',
    paymentTerms: 'Conditions de paiement', notes: 'Notes',
    signature: 'Cachet & Signature', clientSig: 'Signature client',
    delivery: 'Livré par', address: 'Adresse livraison',
    bank: 'Coordonnées bancaires', ice: 'ICE', rc: 'RC', if: 'IF',
    noPrice: 'Sans prix', page: 'Page', of: 'sur',
    status: { PAID: 'Payée', UNPAID: 'Impayée', OVERDUE: 'En retard' },
  },
  AR: {
    devis: 'عرض السعر', bl: 'سند التسليم', invoice: 'الفاتورة',
    from: 'من', to: 'إلى', client: 'الزبون',
    refBC: 'مرجع BC', refDevis: 'مرجع العرض', refBL: 'مرجع BL',
    description: 'الوصف', qty: 'الكمية', unitPrice: 'السعر HT',
    totalHT: 'المجموع HT', tva: 'TVA', totalTTC: 'المجموع TTC',
    htBrut: 'المجموع الإجمالي HT', discount: 'التخفيض', htNet: 'المجموع الصافي HT',
    tvaLine: 'TVA 20%', grandTotal: 'المجموع الكلي TTC', balance: 'الصافي للأداء',
    acompte: 'التسبيق', validity: 'صالح حتى',
    paymentTerms: 'شروط الأداء', notes: 'ملاحظات',
    signature: 'الختم و التوقيع', clientSig: 'توقيع الزبون',
    delivery: 'المسلم', address: 'عنوان التسليم',
    bank: 'المعلومات البنكية', ice: 'ICE', rc: 'RC', if: 'المعرف الجبائي',
    noPrice: 'بلا أسعار', page: 'صفحة', of: 'من',
    status: { PAID: 'مؤداة', UNPAID: 'غير مؤداة', OVERDUE: 'متأخرة' },
  },
};
