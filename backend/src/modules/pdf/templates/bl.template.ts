import { fmtDate } from './base.helpers';
import type { BLPDFData, PDFLanguage } from '../pdf.service';

interface CompanyData {
  name: string; legal_name: string; ice: string; rc?: string|null; if?: string|null;
  cnss?: string|null; address: string; phone?: string|null; email?: string|null;
  logo_url?: string|null; website?: string|null;
}
interface BLTemplateInput extends BLPDFData { company: CompanyData; lang: PDFLanguage; }

const CSS = `
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
.meta{display:flex;margin:0 48px;padding:18px 0;border-bottom:1px solid #E6E6E6;}
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
.party.dest{background:#FFFBF0;border:1.5px solid #F5C842;}
.ptag{font-size:7.5px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#ADADAD;margin-bottom:7px;display:block;}
.party.dest .ptag{color:#D4A017;}
.pname{font-size:14px;font-weight:700;color:#0C0C0C;margin-bottom:3px;}
.pdet{font-size:11px;color:#6B6B6B;line-height:1.8;}
.pdet strong{color:#1A1A1A;font-weight:500;}

/* TABLE */
.twrap{margin:0 48px 20px;}
.twrap table{width:100%;border-collapse:collapse;}
.twrap thead tr{background:#F5C842;}
.twrap thead th{padding:10px 12px;font-size:8px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#0C0C0C;text-align:left;}
.twrap thead th.c{text-align:center;}
.twrap thead th:first-child{border-radius:4px 0 0 0;}
.twrap thead th:last-child{border-radius:0 4px 0 0;}
.twrap tbody tr{border-bottom:1px solid #E6E6E6;}
.twrap tbody tr:nth-child(even){background:#F8F8F8;}
.twrap tbody td{padding:11px 12px;font-size:12.5px;vertical-align:middle;color:#1A1A1A;}
.twrap tbody td.c{text-align:center;}
.tdref{font-size:9.5px;font-weight:700;color:#D4A017;letter-spacing:0.5px;}
.tdtit{font-weight:600;color:#0C0C0C;}

/* STATUS BADGES */
.qbadge{display:inline-block;padding:3px 9px;border-radius:20px;font-size:10.5px;font-weight:700;}
.qok{background:#DCFCE7;color:#16A34A;}
.qpart{background:#FFF8E1;color:#D4A017;}
.qno{background:#FEF2F2;color:#DC2626;}

/* RECAP BAR */
.recap{margin:0 48px 20px;background:#F5C842;border-radius:5px;padding:13px 20px;display:flex;}
.ri{flex:1;text-align:center;border-right:1px solid rgba(0,0,0,0.1);padding:0 14px;}
.ri:first-child{padding-left:0;}
.ri:last-child{border-right:none;padding-right:0;}
.rl{font-size:7.5px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:rgba(0,0,0,0.45);display:block;margin-bottom:3px;}
.rv{font-size:18px;font-weight:900;color:#0C0C0C;}

/* SIGNATURES */
.sigs{margin:auto 48px 32px;display:flex;}
.sblock{max-width:280px;}
.sblock h5{font-size:8px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#6B6B6B;margin-bottom:10px;}
.sarea{display:flex;flex-direction:column;gap:8px;}
.sarea .sp{font-size:10px;color:#ADADAD;font-style:italic;}
.sarea img{max-height:90px;max-width:190px;object-fit:contain;display:block;}

/* FOOTER */
.footer{margin-top:auto;background:#F5C842;padding:14px 48px;display:flex;justify-content:space-between;align-items:center;}
.fbrand{font-size:11px;font-weight:700;color:#0C0C0C;}
.fleg{font-size:8.5px;color:rgba(0,0,0,0.45);text-align:center;line-height:1.6;}
.fpg{font-size:8.5px;color:rgba(0,0,0,0.45);text-align:right;}
.fpg span{color:#0C0C0C;font-weight:700;}
`;

export function blTemplate(data: BLTemplateInput): string {
  const isAR = data.lang === 'AR';
  const c = data.company;

  const rawName = c.legal_name || c.name || '';
  const brandName = rawName.length >= 2
    ? `<span style="color:#0C0C0C">${rawName[0]}</span><span style="color:#F5C842">${rawName[1]}</span><span style="color:#0C0C0C">${rawName.slice(2)}</span>`
    : `<span>${rawName}</span>`;

  const stampSrc = data.signature_url || c.logo_url || null;
  const signBlock = stampSrc
    ? `<img src="${stampSrc}" style="max-height:60px;max-width:160px;object-fit:contain;display:block;"/>`
    : '';

  const total = data.lines.length;
  const refs = [
    data.bc_number    ? `BC : <strong>${data.bc_number}</strong>` : '',
    data.devis_number ? `Devis : <strong>${data.devis_number}</strong>` : '',
  ].filter(Boolean).join(' &nbsp;|&nbsp; ');

  const lines = data.lines.map((l, i) => `
    <tr>
      <td><span class="tdref">${String(i + 1).padStart(2, '0')}</span></td>
      <td><div class="tdtit">${l.description}</div></td>
      <td class="c">${l.quantity}</td>
      <td class="c">${l.quantity}</td>
      <td class="c"><span class="qbadge qok">✓ Livré</span></td>
      <td style="font-size:10.5px;color:#6B6B6B;font-style:italic;">Conforme</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html lang="${isAR ? 'ar' : 'fr'}"><head>
<meta charset="utf-8">
<style>${CSS}</style>
</head><body>
<div class="page">

<div class="header">
  <div class="brand">
    <div class="brand-name">${brandName}<span style="color:#F5C842">.</span></div>
  </div>
  <div class="doc-id">
    <span class="doc-type">Bon de livraison</span>
    <div class="doc-num">${data.number}</div>
  </div>
</div>
<div class="bar"></div>

<div class="meta">
  <div class="mc">
    <span class="ml">Date d'expédition</span>
    <div class="mv">${fmtDate(data.issue_date, data.lang)}</div>
  </div>
  <div class="mc">
    <span class="ml">Livraison prévue</span>
    <div class="mv">${data.delivery_date ? fmtDate(data.delivery_date, data.lang) : '—'}</div>
  </div>
  ${refs ? `<div class="mc"><span class="ml">Références</span><div class="mv" style="font-size:11px;">${refs}</div></div>` : ''}
  ${data.project_name ? `<div class="mc"><span class="ml">Projet</span><div class="mv" style="font-size:12px;">${data.project_name}</div></div>` : ''}
  ${data.site ? `<div class="mc"><span class="ml">Site / Chantier</span><div class="mv" style="font-size:12px;">${data.site}</div></div>` : ''}
</div>

<div class="parties">
  <div class="party emit">
    <span class="ptag">Expéditeur</span>
    <div class="pname">${c.legal_name || c.name}</div>
    <div class="pdet">
      ${c.address ? `${c.address}<br>` : ''}
      ${c.phone ? `<strong>Tél :</strong> ${c.phone}<br>` : ''}
      ${c.email ? `<strong>Email :</strong> ${c.email}` : ''}
      ${data.delivered_by ? `<br><strong>Livré par :</strong> ${data.delivered_by}` : ''}
    </div>
  </div>
  <div class="party dest">
    <span class="ptag">Destinataire</span>
    <div class="pname">${data.client.commercial_name}</div>
    <div class="pdet">
      ${data.client.address ? `${data.client.address}${data.client.city ? ', ' + data.client.city : ''}<br>` : ''}
      ${data.client.ice ? `<strong>ICE :</strong> ${data.client.ice}<br>` : ''}
      ${data.delivery_address ? `<strong>Livraison :</strong> ${data.delivery_address}` : ''}
    </div>
  </div>
</div>

<div class="twrap">
  <table>
    <thead>
      <tr>
        <th style="width:40px">N°</th>
        <th>Désignation du livrable</th>
        <th class="c" style="width:70px">Qté cmd.</th>
        <th class="c" style="width:70px">Qté livrée</th>
        <th class="c" style="width:80px">État</th>
        <th style="width:100px">Observations</th>
      </tr>
    </thead>
    <tbody>${lines}</tbody>
  </table>
</div>

<div class="recap">
  <div class="ri"><span class="rl">Articles</span><div class="rv">${total}</div></div>
  <div class="ri"><span class="rl">Livrés</span><div class="rv">${total}</div></div>
  <div class="ri"><span class="rl">En attente</span><div class="rv">0</div></div>
  <div class="ri"><span class="rl">Taux livraison</span><div class="rv">100 %</div></div>
  <div class="ri"><span class="rl">Date livraison</span><div class="rv" style="font-size:13px;">${data.delivery_date ? fmtDate(data.delivery_date, data.lang) : '—'}</div></div>
</div>


<div class="sigs">
  <div class="sblock">
    <h5>Signature expéditeur — ETCC</h5>
    <div class="sarea">
      ${signBlock ? signBlock : '<span class="sp">Signature et cachet de l\'expéditeur</span>'}
    </div>
  </div>
</div>

<div class="footer">
  <span class="fbrand">${c.name}.</span>
  <div class="fleg">
    ${c.legal_name || c.name} — ICE : ${c.ice || '—'}<br>
    ${c.address || ''} ${c.phone ? '— ' + c.phone : ''}
  </div>
  <div class="fpg">Page <span>1</span></div>
</div>

</div></body></html>`;
}
