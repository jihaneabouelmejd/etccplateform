import { fmt, fmtAr, fmtDate } from './base.helpers';
import type { BCPDFData, PDFLanguage } from '../pdf.service';

interface CompanyData {
  name: string; legal_name: string; ice: string; rc?: string|null; if?: string|null;
  cnss?: string|null; address: string; phone?: string|null; email?: string|null;
  logo_url?: string|null; website?: string|null;
}
interface BCTemplateInput extends BCPDFData { company: CompanyData; lang: PDFLanguage; }

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
.doc-sub{font-size:11px;color:#6B6B6B;margin-top:3px;font-style:italic;}

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
.party.ach{background:#F4F4F4;}
.party.four{background:#FFFBF0;border:1.5px solid #F5C842;}
.ptag{font-size:7.5px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#ADADAD;margin-bottom:7px;display:block;}
.party.four .ptag{color:#D4A017;}
.pname{font-size:14px;font-weight:700;color:#0C0C0C;margin-bottom:3px;}
.pdet{font-size:11px;color:#6B6B6B;line-height:1.8;}
.pdet strong{color:#1A1A1A;font-weight:500;}

/* LIVRAISON HIGHLIGHT */
.dlv{margin:0 48px 18px;background:#F5C842;border-radius:5px;padding:14px 20px;display:flex;gap:0;}
.di{flex:1;border-right:1px solid rgba(0,0,0,0.1);padding:0 16px;}
.di:first-child{padding-left:0;}
.di:last-child{border-right:none;padding-right:0;}
.dl{font-size:7.5px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:rgba(0,0,0,0.5);display:block;margin-bottom:3px;}
.dv{font-size:13px;font-weight:700;color:#0C0C0C;}
.ds{font-size:10px;color:rgba(0,0,0,0.4);font-weight:300;}

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
.tdref{font-size:9.5px;font-weight:700;color:#D4A017;font-family:monospace;letter-spacing:1px;}
.tdtit{font-weight:600;color:#0C0C0C;margin-bottom:2px;}

/* TOTAUX */
.bottom{margin:0 48px 18px;display:flex;justify-content:space-between;align-items:flex-start;gap:20px;}
.notes{flex:1;}
.notes h4{font-size:8px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#D4A017;margin-bottom:7px;}
.notes p{font-size:11px;color:#6B6B6B;line-height:1.8;max-width:230px;}
.totals{width:270px;flex-shrink:0;}
.tline{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #E6E6E6;font-size:12.5px;}
.tline .tl{color:#6B6B6B;}
.tline .tv{font-weight:500;color:#1A1A1A;}
.tfinal{background:#F5C842;border-radius:5px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;margin-top:9px;}
.tfl{font-size:9px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:rgba(0,0,0,0.5);}
.tfv{font-size:20px;font-weight:900;color:#0C0C0C;letter-spacing:-1px;}

/* CONDITIONS */
.conds{margin:auto 48px 18px;background:#F4F4F4;border-radius:5px;padding:14px 18px;display:grid;grid-template-columns:1fr 1fr;gap:16px;}
.cond h5{font-size:7.5px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#D4A017;margin-bottom:5px;}
.cond p{font-size:11px;color:#6B6B6B;line-height:1.7;}
.cond strong{color:#1A1A1A;font-weight:600;}

/* SIGNATURES */
.sigs{margin:0 48px 30px;display:grid;grid-template-columns:1fr 1fr;gap:24px;}
.sblock h5{font-size:8px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:#6B6B6B;margin-bottom:9px;}
.sarea{border:1.5px dashed #E6E6E6;border-radius:5px;height:100px;display:flex;flex-direction:column;justify-content:space-between;padding:10px 14px;}
.sarea p{font-size:10px;color:#ADADAD;font-style:italic;}
.sarea .sline{border-top:1px solid #E6E6E6;font-size:8.5px;color:#ADADAD;padding-top:6px;}
.sblock.four .sarea{border-color:#F5C842;background:#FFFBF0;border-width:2px;}

/* FOOTER */
.footer{margin-top:auto;background:#F5C842;padding:14px 48px;display:flex;justify-content:space-between;align-items:center;}
.fbrand{font-size:11px;font-weight:700;color:#0C0C0C;}
.fleg{font-size:8.5px;color:rgba(0,0,0,0.45);text-align:center;line-height:1.6;}
.fpg{font-size:8.5px;color:rgba(0,0,0,0.45);text-align:right;}
.fpg span{color:#0C0C0C;font-weight:700;}
`;

export function bcTemplate(data: BCTemplateInput): string {
  const isAR = data.lang === 'AR';
  const f = isAR ? fmtAr : fmt;
  const c = data.company;

  const rawName = c.legal_name || c.name || '';
  const brandName = rawName.length >= 2
    ? `<span style="color:#0C0C0C">${rawName[0]}</span><span style="color:#F5C842">${rawName[1]}</span><span style="color:#0C0C0C">${rawName.slice(2)}</span>`
    : `<span>${rawName}</span>`;

  const lines = data.lines.map((l, i) => `
    <tr>
      <td><span class="tdref">REF-${String(i + 1).padStart(2, '0')}</span></td>
      <td><div class="tdtit">${l.description}</div></td>
      <td class="r">${f(l.quantity)}</td>
      <td class="r">${l.unit_price !== undefined ? f(l.unit_price) + ' DH' : '—'}</td>
      <td class="r">${l.unit_price !== undefined ? f(l.quantity * (l.unit_price || 0)) + ' DH' : '—'}</td>
    </tr>`).join('');

  const hasAmount = data.total_ht !== undefined && data.total_ttc !== undefined;

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
    <span class="doc-type">Bon de commande</span>
    <div class="doc-num">${data.number}</div>
    <div class="doc-sub">Émis le ${fmtDate(data.issue_date, data.lang)}</div>
  </div>
</div>
<div class="bar"></div>

<div class="meta">
  <div class="mc">
    <span class="ml">Date de commande</span>
    <div class="mv">${fmtDate(data.issue_date, data.lang)}</div>
  </div>
  <div class="mc">
    <span class="ml">Livraison souhaitée</span>
    <div class="mv">${data.expected_delivery ? fmtDate(data.expected_delivery, data.lang) : '—'}</div>
  </div>
  ${data.devis_number ? `<div class="mc"><span class="ml">Devis de référence</span><div class="mv">${data.devis_number}</div></div>` : ''}
  <div class="mc">
    <span class="ml">Statut</span>
    <div class="mv">${data.status || 'OPEN'}</div>
  </div>
</div>

<div class="parties">
  <div class="party ach">
    <span class="ptag">Donneur d'ordre (Acheteur)</span>
    <div class="pname">${c.legal_name || c.name}</div>
    <div class="pdet">
      ${c.address ? `${c.address}<br>` : ''}
      ${c.ice ? `<strong>ICE :</strong> ${c.ice}<br>` : ''}
      ${c.phone ? `<strong>Tél :</strong> ${c.phone}<br>` : ''}
      ${c.email ? `<strong>Email :</strong> ${c.email}` : ''}
    </div>
  </div>
  <div class="party four">
    <span class="ptag">Fournisseur / Prestataire</span>
    <div class="pname">${data.client.commercial_name}</div>
    <div class="pdet">
      ${data.client.address ? `${data.client.address}${data.client.city ? ', ' + data.client.city : ''}<br>` : ''}
      ${data.client.ice ? `<strong>ICE :</strong> ${data.client.ice}<br>` : ''}
      ${data.client.rc ? `<strong>RC :</strong> ${data.client.rc}<br>` : ''}
      ${data.client.phone ? `<strong>Tél :</strong> ${data.client.phone}<br>` : ''}
      ${data.client.email ? `<strong>Email :</strong> ${data.client.email}` : ''}
    </div>
  </div>
</div>

<div class="dlv">
  <div class="di">
    <span class="dl">Adresse de livraison</span>
    <div class="dv" style="font-size:12px;">${data.client.address || c.address || '—'}</div>
  </div>
  <div class="di">
    <span class="dl">Mode de livraison</span>
    <div class="dv">Livraison directe</div>
    <div class="ds">À convenir avec le prestataire</div>
  </div>
  <div class="di">
    <span class="dl">Délai contractuel</span>
    <div class="dv">${data.expected_delivery ? fmtDate(data.expected_delivery, data.lang) : '—'}</div>
  </div>
  <div class="di">
    <span class="dl">Source BC</span>
    <div class="dv">${data.source || 'INTERNAL'}</div>
  </div>
</div>

<div class="twrap">
  <table>
    <thead>
      <tr>
        <th style="width:90px">Réf. Article</th>
        <th>Désignation</th>
        <th class="r" style="width:55px">Qté</th>
        <th class="r" style="width:88px">P.U. HT</th>
        <th class="r" style="width:88px">Total HT</th>
      </tr>
    </thead>
    <tbody>${lines}</tbody>
  </table>
</div>

<div class="bottom">
  <div class="notes">
    ${data.notes ? `<h4>Instructions particulières</h4><p>${data.notes}</p>` : ''}
  </div>
  ${hasAmount ? `
  <div class="totals">
    <div class="tline"><span class="tl">Total HT</span><span class="tv">${f(data.total_ht!)} DH</span></div>
    <div class="tline"><span class="tl">TVA 20 %</span><span class="tv">${f(data.total_ttc! - data.total_ht!)} DH</span></div>
    <div class="tfinal">
      <span class="tfl">Total TTC commandé</span>
      <span class="tfv">${f(data.total_ttc!)} DH</span>
    </div>
  </div>` : ''}
</div>

<div class="conds">
  <div class="cond">
    <h5>Conditions générales</h5>
    <p>Cette commande est régie par les <strong>CGV</strong> du prestataire annexées au devis de référence.</p>
  </div>
  <div class="cond">
    <h5>Transfert de propriété</h5>
    <p>Le transfert intervient à la <strong>réception et validation</strong> des livrables par l'acheteur.</p>
  </div>
</div>

<div class="sigs">
  <div class="sblock">
    <h5>Signature acheteur — Bon pour commande</h5>
    <div class="sarea">
      <p>Signature, cachet et mention « Bon pour commande »</p>
      <div class="sline">Date : _____ / _____ / _______</div>
    </div>
  </div>
  <div class="sblock four">
    <h5>Accusé de réception — Fournisseur</h5>
    <div class="sarea">
      <p>Signature et date d'accusé de réception</p>
      <div class="sline">Date : _____ / _____ / _______</div>
    </div>
  </div>
</div>

<div class="footer">
  <span class="fbrand">${c.name}.</span>
  <div class="fleg">
    ${c.legal_name || c.name} — ICE : ${c.ice || '—'}${c.rc ? ' — RC : ' + c.rc : ''}<br>
    ${c.address || ''} ${c.phone ? '— ' + c.phone : ''} ${c.email ? '— ' + c.email : ''}
  </div>
  <div class="fpg">Page <span>1</span></div>
</div>

</div></body></html>`;
}
