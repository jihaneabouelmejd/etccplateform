import { fmt, fmtAr, fmtDate, montantEnLettresMAD } from './base.helpers';
import type { InvoicePDFData, PDFLanguage } from '../pdf.service';

interface CompanyData {
  name: string; legal_name: string; ice: string; rc?: string|null; if?: string|null;
  cnss?: string|null; address: string; phone?: string|null; email?: string|null;
  logo_url?: string|null; bank?: string|null; rib?: string|null; iban?: string|null; swift?: string|null;
  website?: string|null;
}

// Personnalisation libre du PDF, stockée par facture (Invoice.custom_layout, JSONB).
export interface CustomLayout {
  labelOverrides?: Record<string, string>;
  extraSections?: { id?: string; title?: string; content?: string; position?: BlockKey | string }[];
  blockOrder?: string[];
  hiddenBlocks?: string[];
  theme?: { accentColor?: string; font?: string };
}

interface InvoiceTemplateInput extends InvoicePDFData {
  company: CompanyData;
  lang: PDFLanguage;
  custom_layout?: CustomLayout | null;
}

type BlockKey = 'meta' | 'parties' | 'table' | 'totals' | 'mlettres' | 'pay' | 'sigs';
const DEFAULT_ORDER: BlockKey[] = ['meta', 'parties', 'table', 'totals', 'mlettres', 'pay', 'sigs'];

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Décale chaque canal RGB d'un hex de `amt` (positif = plus clair, négatif = plus foncé), borné [0,255].
function shadeHex(hex: string, amt: number): string {
  let h = (hex || '#F5C842').replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) h = 'F5C842';
  const num = parseInt(h, 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = clamp((num >> 16) + amt);
  const g = clamp(((num >> 8) & 0x00ff) + amt);
  const b = clamp((num & 0x0000ff) + amt);
  return '#' + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1).toUpperCase();
}

// Remplace les couleurs et la police de marque dans CSS_TEMPLATE par le thème choisi pour cette facture.
function buildCss(accent: string, accentDeep: string, font: string): string {
  return CSS_TEMPLATE
    .split('#F5C842').join(accent)
    .split('#D4A017').join(accentDeep)
    .split('Arial,Helvetica,sans-serif').join(font);
}

const CSS_TEMPLATE = `
*{box-sizing:border-box;margin:0;padding:0;}
body{
  font-family:Arial,Helvetica,sans-serif;font-size:13px;
  color:#0C0C0C;background:#FAFAFA;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;
}
.page{width:210mm;min-height:297mm;background:#FFFFFF;display:flex;flex-direction:column;}

/* HEADER */
.header{
  padding:36px 48px 0 48px;display:flex;
  justify-content:space-between;align-items:flex-start;
  position:relative;overflow:hidden;
}
.header::before{
  content:'';position:absolute;top:0;right:0;
  width:190px;height:190px;background:#F5C842;
  clip-path:polygon(100% 0,0 0,100% 100%);z-index:0;
}
.header::after{
  content:'';position:absolute;top:24px;right:24px;
  width:8px;height:8px;background:#0C0C0C;z-index:2;border-radius:50%;
}
.brand{position:relative;z-index:1;}
.brand-name{font-size:24px;font-weight:900;letter-spacing:-1px;color:#0C0C0C;text-transform:uppercase;line-height:1;}
.doc-id{position:relative;z-index:1;text-align:right;padding-top:6px;}
.doc-type{font-size:8.5px;font-weight:700;letter-spacing:4.5px;text-transform:uppercase;color:#0C0C0C;display:block;margin-bottom:3px;}
.doc-num{font-size:32px;font-weight:900;color:#0C0C0C;letter-spacing:-2px;line-height:1;}


/* BAR */
.bar{height:3px;background:linear-gradient(90deg,#F5C842 0%,#D4A017 65%,transparent 100%);margin:22px 48px 0;}

/* META */
.meta{display:flex;margin:0 48px;padding:17px 0;border-bottom:1px solid #E6E6E6;}
.mc{flex:1;padding-right:18px;}
.mc:last-child{padding-right:0;}
.mc+.mc{border-left:1px solid #E6E6E6;padding-left:18px;}
.ml{font-size:8px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#D4A017;margin-bottom:3px;display:block;}
.mv{font-size:13px;font-weight:600;color:#0C0C0C;}
.ms{font-size:10.5px;color:#6B6B6B;font-weight:300;}

/* PARTIES */
.parties{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:18px 48px;}
.party{padding:16px 18px;border-radius:5px;}
.party.emit{background:#F4F4F4;}
.party.clt{background:#FFFBF0;border:1.5px solid #F5C842;}
.ptag{font-size:7.5px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#ADADAD;margin-bottom:7px;display:block;}
.party.clt .ptag{color:#D4A017;}
.pname{font-size:14px;font-weight:700;color:#0C0C0C;margin-bottom:3px;}
.pdet{font-size:11px;color:#6B6B6B;line-height:1.8;}
.pdet strong{color:#1A1A1A;font-weight:500;}

/* TABLE */
.twrap{margin:0 48px 18px;}
.twrap table{width:100%;border-collapse:collapse;}
.twrap thead tr{background:#F5C842;}
.twrap thead th{padding:10px 12px;font-size:8px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#0C0C0C;text-align:left;}
.twrap thead th.r{text-align:right;}
.twrap thead th:first-child{border-radius:4px 0 0 0;}
.twrap thead th:last-child{border-radius:0 4px 0 0;}
.twrap tbody tr{border-bottom:1px solid #E6E6E6;}
.twrap tbody tr:nth-child(even){background:#F8F8F8;}
.twrap tbody td{padding:11px 12px;font-size:12.5px;vertical-align:top;color:#1A1A1A;}
.twrap tbody td.r{text-align:right;font-weight:500;color:#0C0C0C;}
.tdref{font-size:9.5px;font-weight:700;color:#D4A017;letter-spacing:0.5px;}
.tdtit{font-weight:600;color:#0C0C0C;margin-bottom:2px;}

/* TOTAUX */
.bottom{margin:0 48px 18px;display:flex;justify-content:flex-end;}
.totals{width:280px;}
.tline{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #E6E6E6;font-size:12.5px;}
.tline .tl{color:#6B6B6B;}
.tline .tv{font-weight:500;color:#1A1A1A;}
.tline.disc .tl,.tline.disc .tv{color:#DC2626;font-size:11px;}
.tline.bal{border-bottom:2px solid #F5C842;}
.tfinal{background:#F5C842;border-radius:5px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:9px;white-space:nowrap;}
.tfl{font-size:9px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:rgba(0,0,0,0.5);white-space:nowrap;}
.tfl.long{font-size:7.5px;letter-spacing:0.8px;}
.tfv{font-size:20px;font-weight:900;color:#0C0C0C;letter-spacing:-1px;white-space:nowrap;}
.tfv.long{font-size:16px;}

/* MONTANT EN LETTRES */
.mlettres{margin:0 48px 18px;padding:11px 16px;background:#FFFBF0;border:1.5px dashed #D4A017;border-radius:5px;}
.mlettres .mll{font-size:8px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#D4A017;display:block;margin-bottom:4px;}
.mlettres .mlv{font-size:12px;font-style:italic;font-weight:600;color:#1A1A1A;}

/* RUBRIQUE (bloc libre ajouté par l'utilisateur) */
.rubrique{margin:0 48px 18px;padding:12px 16px;background:#FFFBF0;border:1.5px dashed #D4A017;border-radius:5px;}
.rubrique .rtag{font-size:8px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#D4A017;display:block;margin-bottom:5px;}
.rubrique .rcontent{font-size:11.5px;color:#1A1A1A;line-height:1.7;white-space:pre-wrap;}

/* PAIEMENT */
.pay{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:0 48px 18px;}
.pay-block{background:#F4F4F4;border-radius:5px;padding:14px 18px;}
.pay-block h5{font-size:8px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#D4A017;margin-bottom:8px;}
.pay-block p{font-size:11px;color:#6B6B6B;line-height:1.8;}
.pay-block strong{color:#1A1A1A;font-weight:600;}
.iban{font-size:10.5px;font-family:monospace;background:#F5C842;color:#0C0C0C;padding:5px 8px;border-radius:3px;letter-spacing:1.5px;margin-top:5px;display:inline-block;font-weight:700;}


/* SIGNATURES */
.sigs{margin:auto 48px 28px;display:flex;}
.sblock{max-width:260px;}
.sblock h5{font-size:8px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#6B6B6B;margin-bottom:10px;}
.sarea{display:flex;flex-direction:column;gap:8px;}
.sarea .sp{font-size:10px;color:#ADADAD;font-style:italic;}
.sarea img{max-height:60px;max-width:160px;object-fit:contain;display:block;}

/* FOOTER */
.footer{margin-top:auto;background:#F5C842;padding:14px 48px;display:flex;justify-content:space-between;align-items:center;}
.fbrand{font-size:11px;font-weight:700;color:#0C0C0C;}
.fleg{font-size:8.5px;color:rgba(0,0,0,0.45);text-align:center;line-height:1.6;}
.fpg{font-size:8.5px;color:rgba(0,0,0,0.45);text-align:right;}
.fpg span{color:#0C0C0C;font-weight:700;}
`;

export function invoiceTemplate(data: InvoiceTemplateInput): string {
  const isAR = data.lang === 'AR';
  const f = isAR ? fmtAr : fmt;
  const c = data.company;
  const isPaid = data.balance <= 0;
  // Retenue de garantie (%) : n'apparaît sur le PDF que si un taux > 0 a été saisi sur la facture.
  // Quand elle s'applique, la somme en lettres doit correspondre au montant TTC à régler
  // avec retenue de garantie (le montant réellement dû, mis en avant en jaune) — pas au Total TTC brut.
  const retenueRate = Number(data.retenue_garantie_rate || 0);
  const retenueAmount = retenueRate > 0 ? Math.round(data.total_ttc * (retenueRate / 100) * 100) / 100 : 0;
  const totalTtcAvecRetenue = data.total_ttc - retenueAmount - data.acompte_amount;
  const amountToSpell = retenueRate > 0 ? totalTtcAvecRetenue : (data.balance > 0 ? data.balance : data.total_ttc);
  const amountInWords = montantEnLettresMAD(amountToSpell);

  const cl = data.custom_layout || {};
  const ov = cl.labelOverrides || {};
  const L = (key: string, fallback: string): string => {
    const v = ov[key];
    return v ? esc(v) : fallback;
  };

  // Thème (couleur d'accent + police), appliqué à toute la CSS via substitution des tokens de marque.
  const accent = /^#[0-9a-fA-F]{3,6}$/.test(cl.theme?.accentColor || '') ? (cl.theme!.accentColor as string) : '#F5C842';
  const accentDeep = shadeHex(accent, -40);
  const font = cl.theme?.font && cl.theme.font.trim() ? cl.theme.font : 'Arial,Helvetica,sans-serif';
  const CSS = buildCss(accent, accentDeep, font);

  const rawName = c.legal_name || c.name || '';
  const brandName = rawName.length >= 2
    ? `<span style="color:#0C0C0C">${rawName[0]}</span><span style="color:${accent}">${rawName[1]}</span><span style="color:#0C0C0C">${rawName.slice(2)}</span>`
    : `<span>${rawName}</span>`;

  const stampSrc = data.signature_url || c.logo_url || null;
  const signBlock = stampSrc
    ? `<img src="${stampSrc}" style="max-height:60px;max-width:160px;object-fit:contain;display:block;"/>`
    : '';

  const lines = data.lines.map((l, i) => `
    <tr>
      <td><span class="tdref">${String(i + 1).padStart(2, '0')}</span></td>
      <td><div class="tdtit">${l.description}</div></td>
      <td class="r">${f(l.quantity)}</td>
      <td class="r">${f(l.unit_price)} DH</td>
      <td class="r" style="width:50px">20 %</td>
      <td class="r">${f(l.total_ht)} DH</td>
    </tr>`).join('');

  const refs = [
    data.devis_number ? `Devis : <strong>${data.devis_number}</strong>` : '',
    data.bc_number    ? `BC : <strong>${data.bc_number}</strong>` : '',
    data.bc_client_number ? `N° BC client : <strong>${data.bc_client_number}</strong>` : '',
    data.bl_number    ? `BL : <strong>${data.bl_number}</strong>` : '',
  ].filter(Boolean).join(' &nbsp;|&nbsp; ');

  // (retenueRate / retenueAmount / totalTtcAvecRetenue calculés plus haut, avant amountToSpell)
  const tflLabel = retenueRate > 0
    ? L('lblTotalTtcRetenue', 'Montant TTC à régler avec retenue de garantie')
    : (data.acompte_amount > 0 ? L('lblSolde', 'Solde à régler') : L('lblNetAPayer', 'Net à payer'));
  const mlettresLabel = isAR
    ? L('lblMontantLettresAr', 'Montant en lettres')
    : (retenueRate > 0
      ? L('lblMontantLettresRetenue', 'Arrêtée la présente facture, montant TTC à régler avec retenue de garantie à la somme de')
      : (data.acompte_amount > 0
        ? L('lblMontantLettresSolde', 'Arrêtée la présente facture, solde à régler à la somme de')
        : L('lblMontantLettresFull', 'Arrêtée la présente facture à la somme de')));

  // Blocs standards, chacun réordonnable / masquable via custom_layout.blockOrder / hiddenBlocks.
  const blocksMap: Record<BlockKey, string> = {
    meta: `
<div class="meta">
  <div class="mc">
    <span class="ml">${L('lblEmission', "Date d'émission")}</span>
    <div class="mv">${fmtDate(data.issue_date, data.lang)}</div>
  </div>
  ${data.due_date ? `<div class="mc"><span class="ml">${L('lblEcheance', 'Échéance')}</span><div class="mv">${fmtDate(data.due_date, data.lang)}</div></div>` : ''}
  ${refs ? `<div class="mc"><span class="ml">${L('lblReferences', 'Références')}</span><div class="mv" style="font-size:11px;">${refs}</div></div>` : ''}
  ${data.site ? `<div class="mc"><span class="ml">${L('lblSite', 'Site / Chantier')}</span><div class="mv" style="font-size:12px;">${data.site}</div></div>` : ''}
</div>`,

    parties: `
<div class="parties">
  <div class="party emit">
    <span class="ptag">${L('lblEmetteur', 'Émetteur')}</span>
    <div class="pname">${c.legal_name || c.name}</div>
    <div class="pdet">
      ${c.address ? `${c.address}<br>` : ''}
      ${c.ice ? `<strong>${L('lblICE', 'ICE')} :</strong> ${c.ice}<br>` : ''}
      ${(c as any).if ? `<strong>${L('lblIF', 'IF')} :</strong> ${(c as any).if}<br>` : ''}
      ${c.phone ? `<strong>${L('lblTel', 'Tél')} :</strong> ${c.phone}<br>` : ''}
      ${c.email ? `<strong>${L('lblEmail', 'Email')} :</strong> ${c.email}` : ''}
    </div>
  </div>
  <div class="party clt">
    <span class="ptag">${L('lblClient', 'Client')}</span>
    <div class="pname">${data.client.commercial_name}</div>
    <div class="pdet">
      ${data.client.address ? `${data.client.address}${data.client.city ? ', ' + data.client.city : ''}<br>` : ''}
      ${data.client.ice ? `<strong>${L('lblICE', 'ICE')} :</strong> ${data.client.ice}<br>` : ''}
      ${data.client.rc ? `<strong>${L('lblRC', 'RC')} :</strong> ${data.client.rc}<br>` : ''}
      ${data.client.phone ? `<strong>${L('lblTel', 'Tél')} :</strong> ${data.client.phone}<br>` : ''}
      ${data.client.email ? `<strong>${L('lblEmail', 'Email')} :</strong> ${data.client.email}` : ''}
    </div>
  </div>
</div>`,

    table: `
<div class="twrap">
  <table>
    <thead>
      <tr>
        <th style="width:40px">${L('thNum', 'N°')}</th>
        <th>${L('thDesignation', 'Désignation / Prestation')}</th>
        <th class="r" style="width:55px">${L('thQte', 'Qté')}</th>
        <th class="r" style="width:90px">${L('thPu', 'P.U. HT')}</th>
        <th class="r" style="width:50px">${L('thTva', 'TVA')}</th>
        <th class="r" style="width:90px">${L('thTotal', 'Total HT')}</th>
      </tr>
    </thead>
    <tbody>${lines}</tbody>
  </table>
</div>`,

    totals: `
<div class="bottom">
  <div class="totals" style="${retenueRate > 0 ? 'width:440px' : ''}">
    ${data.discount_rate > 0 ? `
    <div class="tline"><span class="tl">${L('lblTotalHtBrut', 'Total HT brut')}</span><span class="tv">${f(data.total_ht_brut)} DH</span></div>
    <div class="tline disc"><span class="tl">${L('lblRemise', 'Remise')} (${f(data.discount_rate)} %)</span><span class="tv">− ${f(data.discount_amount)} DH</span></div>` : ''}
    <div class="tline"><span class="tl">${L('lblTotalHtNet', 'Total HT net')}</span><span class="tv">${f(data.total_ht_net)} DH</span></div>
    <div class="tline"><span class="tl">${L('lblTva', 'TVA')} ${f(data.tva_rate)} %</span><span class="tv">${f(data.tva_amount)} DH</span></div>
    <div class="tline"><span class="tl">${L('lblTotalTtc', 'Total TTC')}</span><span class="tv">${f(data.total_ttc)} DH</span></div>
    ${retenueRate > 0 ? `
    <div class="tline"><span class="tl">${L('lblRetenueGarantie', 'Retenue de garantie')} (${f(retenueRate)} %)</span><span class="tv">− ${f(retenueAmount)} DH</span></div>` : ''}
    ${data.acompte_amount > 0 ? `<div class="tline bal"><span class="tl">${L('lblAcompte', 'Acompte versé')}</span><span class="tv">− ${f(data.acompte_amount)} DH</span></div>` : ''}
    <div class="tfinal">
      <span class="tfl${retenueRate > 0 ? ' long' : ''}">${tflLabel}</span>
      <span class="tfv${retenueRate > 0 ? ' long' : ''}">${f(retenueRate > 0 ? totalTtcAvecRetenue : (data.balance > 0 ? data.balance : data.total_ttc))} DH</span>
    </div>
  </div>
</div>`,

    mlettres: `
<div class="mlettres">
  <span class="mll">${mlettresLabel}</span>
  <span class="mlv">${amountInWords}</span>
</div>`,

    pay: `
<div class="pay">
  <div class="pay-block">
    <h5>${L('lblModalites', 'Modalités de paiement')}</h5>
    <p>${data.payment_method ? `<strong>${L('lblMode', 'Mode')} :</strong> ${data.payment_method}<br>` : ''}${data.payment_terms || 'À réception de facture.'}</p>
  </div>
  <div class="pay-block">
    <h5>${L('lblCoordonnees', 'Coordonnées bancaires')}</h5>
    ${c.bank ? `<p><strong>${L('lblBanque', 'Banque')} :</strong> ${c.bank}</p>` : ''}
    ${c.rib ? `<p class="iban">${c.rib}</p>` : ''}
    ${c.iban ? `<p class="iban">${c.iban}</p>` : ''}
  </div>
</div>`,

    sigs: `
<div class="sigs">
  <div class="sblock">
    <h5>${L('lblSignature', 'Signature émetteur — ETCC')}</h5>
    <div class="sarea">
      ${signBlock}
    </div>
  </div>
</div>`,
  };

  // Rubriques libres ajoutées par l'utilisateur, insérées juste après le bloc `position` visé
  // (ou en fin de document si aucune position valide/visible n'est indiquée).
  const renderRubrique = (sec: NonNullable<CustomLayout['extraSections']>[number], idx: number): string => {
    const title = sec.title && sec.title.trim() ? esc(sec.title) : `Rubrique ${idx + 1}`;
    const content = sec.content ? esc(sec.content).replace(/\n/g, '<br>') : '';
    return `
<div class="rubrique">
  <span class="rtag">${title}</span>
  <div class="rcontent">${content}</div>
</div>`;
  };

  const extraSections = Array.isArray(cl.extraSections) ? cl.extraSections : [];
  const hidden = new Set(Array.isArray(cl.hiddenBlocks) ? cl.hiddenBlocks : []);
  const requestedOrder = Array.isArray(cl.blockOrder) ? cl.blockOrder.filter((k): k is BlockKey => DEFAULT_ORDER.includes(k as BlockKey)) : [];
  const order: BlockKey[] = requestedOrder.length
    ? [...requestedOrder, ...DEFAULT_ORDER.filter((k) => !requestedOrder.includes(k))]
    : DEFAULT_ORDER;

  let bodyBlocks = '';
  const insertedSections = new Set<number>();
  order.forEach((key) => {
    if (hidden.has(key)) return;
    bodyBlocks += blocksMap[key] || '';
    extraSections.forEach((sec, idx) => {
      if (sec.position === key) {
        bodyBlocks += renderRubrique(sec, idx);
        insertedSections.add(idx);
      }
    });
  });
  extraSections.forEach((sec, idx) => {
    if (!insertedSections.has(idx)) bodyBlocks += renderRubrique(sec, idx);
  });

  return `<!DOCTYPE html><html lang="${isAR ? 'ar' : 'fr'}"><head>
<meta charset="utf-8">
<style>${CSS}</style>
</head><body>
<div class="page">

<div class="header">
  <div class="brand">
    <div class="brand-name">${brandName}<span style="color:${accent}">.</span></div>
  </div>
  <div class="doc-id">
    <span class="doc-type">${L('lblDocType', 'Facture')}</span>
    <div class="doc-num">${data.number}</div>
  </div>
</div>
<div class="bar"></div>

${bodyBlocks}

<div class="footer">
  <span class="fbrand">${c.name}.</span>
  <div class="fleg">
    ${c.legal_name || c.name} — ${L('lblICE', 'ICE')} : ${c.ice || '—'}${c.rc ? ' — ' + L('lblRC', 'RC') + ' : ' + c.rc : ''}${(c as any).if ? ' — ' + L('lblIF', 'IF') + ' : ' + (c as any).if : ''}<br>
    ${c.address || ''} ${c.phone ? '— ' + c.phone : ''} ${c.email ? '— ' + c.email : ''}
  </div>
  <div class="fpg">Page <span>1</span></div>
</div>

</div>
<div id="a4-ref" style="position:absolute;visibility:hidden;pointer-events:none;width:0;height:277mm;overflow:hidden;top:0;left:0;"></div>
<script>
// Auto-shrinks the invoice to fit on a single A4 page when content overflows.
// 277mm = A4 height (297mm) minus the 10mm top/bottom print margins set in pdf.service.ts —
// keep these two values in sync if the print margins ever change.
window.fitPageToA4 = function() {
  var ref = document.getElementById('a4-ref');
  var page = document.querySelector('.page');
  if (!ref || !page) return;
  var target = ref.offsetHeight;
  document.body.style.zoom = 1;
  page.style.width = '210mm';
  var actual = document.documentElement.scrollHeight;
  if (actual > target) {
    var scale = Math.max(0.55, (target / actual) * 0.98);
    // Widen .page before shrinking so the visual width stays a full 210mm
    // after zoom is applied — otherwise zoom shrinks width too, leaving a
    // blank strip on the right of the printed page.
    page.style.width = (210 / scale) + 'mm';
    document.body.style.zoom = scale;
  }
};
window.fitPageToA4();
</script>
</body></html>`;
}
