'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Check, AlertCircle, X, RefreshCw, Download,
  FileText, Eye, ChevronLeft, Building2, CheckCircle,
  AlertTriangle, Banknote, TrendingDown
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n';
import { cn, formatCurrency } from '@/lib/utils';
import api from '@/lib/api';

/* ── helpers ─────────────────────────────────────────────────────────── */
async function downloadFile(url: string, filename = 'document') {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    const res = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(objUrl);
  } catch { window.open(url, '_blank'); }
}

const formatDate = (d: string | null | undefined) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' });
};
const fmt = (n: number) =>
  new Intl.NumberFormat('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' MAD';

/* ── Suivi factures manquantes (localStorage) ─────────────────────────── */
const SUIVI_KEY = 'rapprochement_suivi_v1';
type SuiviStatus = 'a_demander' | 'demandee' | 'reçue';
const loadSuivi = (): Record<string, SuiviStatus> => {
  try { return JSON.parse(localStorage.getItem(SUIVI_KEY) || '{}'); } catch { return {}; }
};
const saveSuivi = (s: Record<string, SuiviStatus>) => {
  try { localStorage.setItem(SUIVI_KEY, JSON.stringify(s)); } catch {}
};

const suiviConfig: Record<SuiviStatus, { label: string; bg: string; color: string; border: string }> = {
  a_demander: { label: 'À demander',  bg: '#FFF7ED', color: '#C2410C', border: '#FDBA74' },
  demandee:   { label: 'Demandée',    bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  reçue:      { label: 'Reçue ✓',    bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' },
};

const matchStatusConfig: Record<string, { label: string; bg: string; color: string; border: string }> = {
  MATCHED:    { label: '✓ Matché',      bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' },
  SUGGESTED:  { label: '? Suggestion',  bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  NO_INVOICE: { label: '⚠ Sans facture', bg: '#FFF5F5', color: '#DC2626', border: '#FECACA' },
  UNMATCHED:  { label: '? Non matché', bg: '#F8FAFC', color: '#64748B', border: '#CBD5E1' },
};

/* ── styles ──────────────────────────────────────────────────────────── */
const card = { background: 'white', border: '1.5px solid #F5E6D3', borderRadius: 12, padding: '14px 18px' } as const;
const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #E8D4B0', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const };
const labelStyle = { display: 'block' as const, fontSize: 11, fontWeight: 700 as const, color: '#8E5915', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 6 };
const btnBlue = { padding: '9px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#3B82F6,#2563EB)', color: 'white', fontSize: 13, fontWeight: 700 as const, cursor: 'pointer' as const };
const btnSecondary = { padding: '9px 18px', borderRadius: 8, border: '1.5px solid #E8D4B0', background: 'white', color: '#8E5915', fontSize: 13, fontWeight: 600 as const, cursor: 'pointer' as const };

export default function RapprochementPage() {
  /* ── state ─────────────────────────────────────────────────────────── */
  const [history, setHistory]         = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [selectedStmt, setSelectedStmt]     = useState<any>(null);
  const [lines, setLines]             = useState<any[]>([]);
  const [loadingLines, setLoadingLines]     = useState(false);
  const [statusFilter, setStatusFilter]     = useState('');
  const [viewReleve, setViewReleve]   = useState<string | null>(null);

  // Suivi statut des lignes NO_INVOICE
  const [suivi, setSuivi]             = useState<Record<string, SuiviStatus>>(loadSuivi);

  // Lier facture modal
  const [linkTarget, setLinkTarget]   = useState<any>(null);
  const [linkSearch, setLinkSearch]   = useState('');
  const [linkInvoices, setLinkInvoices] = useState<any[]>([]);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkSaving, setLinkSaving]   = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [confirmingId, setConfirmingId]       = useState<string | null>(null);

  /* ── loaders ─────────────────────────────────────────────────────────── */
  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const r = await api.get('/rapprochement/statements', { params: { page: 1 } });
      setHistory(r.data?.data || r.data || []);
    } catch {}
    finally { setLoadingHistory(false); }
  };

  const loadLines = async (stmt: any) => {
    setSelectedStmt(stmt);
    setStatusFilter('');
    setLoadingLines(true);
    try {
      const r = await api.get(`/rapprochement/statements/${stmt.id}/lines`);
      setLines(r.data || []);
    } catch { setLines([]); }
    finally { setLoadingLines(false); }
  };

  useEffect(() => {
    loadHistory();
    const handleStorage = (e: StorageEvent) => { if (e.key === 'releves_updated') loadHistory(); };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  /* ── suivi ──────────────────────────────────────────────────────────── */
  const updateSuivi = (lineId: string, status: SuiviStatus) => {
    setSuivi(prev => { const next = { ...prev, [lineId]: status }; saveSuivi(next); return next; });
  };

  /* ── actions ─────────────────────────────────────────────────────────── */
  const handleConfirm = async (line: any) => {
    setConfirmingId(line.id);
    try {
      await api.patch(`/rapprochement/lines/${line.id}/confirm`, {
        invoice_id: line.matched_invoice_id || line.invoice_id || '',
      });
      await loadLines(selectedStmt);
    } finally { setConfirmingId(null); }
  };

  const openLinkModal = async (line: any) => {
    setLinkTarget(line); setLinkSearch(''); setSelectedInvoice(null); setLinkLoading(true);
    try {
      const res = await api.get('/invoices', { params: { limit: 100 } });
      setLinkInvoices(res.data?.data || []);
    } catch { setLinkInvoices([]); }
    finally { setLinkLoading(false); }
  };

  const handleLinkInvoice = async () => {
    if (!linkTarget || !selectedInvoice) return;
    setLinkSaving(true);
    try {
      await api.patch(`/rapprochement/lines/${linkTarget.id}/confirm`, { invoice_id: selectedInvoice.id });
      setLinkTarget(null);
      await loadLines(selectedStmt);
    } finally { setLinkSaving(false); }
  };

  /* ── computed ────────────────────────────────────────────────────────── */
  const filteredLines = statusFilter ? lines.filter(l => l.match_status === statusFilter) : lines;
  const counts = lines.reduce((acc, l) => { acc[l.match_status] = (acc[l.match_status] || 0) + 1; return acc; }, {} as Record<string, number>);
  const debitLines   = lines.filter(l => !l.is_credit);
  const totalDebits  = debitLines.reduce((s, l) => s + Number(l.amount || 0), 0);
  const noInvoiceLines = lines.filter(l => l.match_status === 'NO_INVOICE');
  const matchedLines   = lines.filter(l => l.match_status === 'MATCHED');
  const tauxCouverture = debitLines.length > 0 ? (matchedLines.filter(l => !l.is_credit).length / debitLines.length) * 100 : 0;
  const totalManquant  = noInvoiceLines.reduce((s, l) => s + Number(l.amount || 0), 0);

  const searchedInvoices = linkInvoices.filter(inv =>
    !linkSearch ||
    (inv.number || inv.invoice_number || '').toLowerCase().includes(linkSearch.toLowerCase()) ||
    (inv.client?.commercial_name || inv.fournisseur?.name || '').toLowerCase().includes(linkSearch.toLowerCase())
  );

  /* ── PDF export ──────────────────────────────────────────────────────── */
  const generatePDF = () => {
    if (!selectedStmt) return;
    const dateStr = new Date().toLocaleDateString('fr-FR');
    const suiviLabels: Record<string, string> = { a_demander: 'À demander', demandee: 'Demandée', reçue: 'Reçue' };
    const rows = lines.map(l => `
      <tr>
        <td>${formatDate(l.date)}</td>
        <td>${l.beneficiary || l.description?.slice(0,40) || '—'}</td>
        <td style="text-align:right;font-family:monospace;font-weight:bold;color:${l.is_credit?'#16A34A':'#1A141A'}">
          ${l.is_credit ? '+' : '−'}${fmt(Number(l.amount))}
        </td>
        <td style="font-size:11px">${l.rib_detected || '—'}</td>
        <td><span style="font-weight:600;font-size:11px;color:${matchStatusConfig[l.match_status]?.color||'#6B7280'}">${matchStatusConfig[l.match_status]?.label||l.match_status}</span>
          ${l.matched_invoice?.number || l.matched_invoice?.invoice_number ? `<br/><span style="font-size:10px;color:#16A34A">${l.matched_invoice?.number||l.matched_invoice?.invoice_number}</span>` : ''}
          ${l.match_status === 'NO_INVOICE' && suivi[l.id] ? `<br/><span style="font-size:10px;color:#1D4ED8">${suiviLabels[suivi[l.id]]||''}</span>` : ''}
        </td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
<title>Rapprochement — ${selectedStmt.bank_name}</title>
<style>* {margin:0;padding:0;box-sizing:border-box;}body{font-family:Arial,sans-serif;font-size:12px;color:#1A141A;padding:32px;}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #F4B315;}
.logo{font-size:22px;font-weight:900;color:#1A141A;}.logo span{color:#F4B315;}
.title{font-size:20px;font-weight:800;margin-bottom:4px;}.subtitle{font-size:12px;color:#8E5915;}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;}
.kpi{background:#FFF8EE;border:1px solid #F5E6D3;border-radius:8px;padding:12px;}
.kpi-label{font-size:10px;color:#8E5915;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;}
.kpi-value{font-size:18px;font-weight:800;font-family:monospace;}
table{width:100%;border-collapse:collapse;}thead tr{background:#FFF3CC;}
th{padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;color:#8E5915;border-bottom:2px solid #F4B315;}
td{padding:8px 10px;border-bottom:1px solid #F5E6D3;vertical-align:top;}
tr:nth-child(even){background:#FFFDF7;}
.footer{margin-top:24px;padding-top:12px;border-top:1px solid #F5E6D3;font-size:10px;color:#8E5915;text-align:center;}
@media print{body{padding:16px;}}
</style></head><body>
<div class="header"><div><div class="logo">ETCC<span>.</span></div>
<div class="title">Rapprochement bancaire — ${selectedStmt.bank_name||'Banque'}</div>
<div class="subtitle">Généré le ${dateStr}</div></div>
<div style="font-size:11px;color:#5C4033;text-align:right">
<p><strong>${lines.length}</strong> lignes</p>
<p>Débits: <strong>${fmt(totalDebits)}</strong></p>
<p>Factures manquantes: <strong style="color:#DC2626">${noInvoiceLines.length}</strong></p>
</div></div>
<div class="kpis">
<div class="kpi"><div class="kpi-label">Matchés auto</div><div class="kpi-value" style="color:#16A34A">${counts['MATCHED']||0}</div></div>
<div class="kpi"><div class="kpi-label">Sans facture</div><div class="kpi-value" style="color:#DC2626">${counts['NO_INVOICE']||0}</div></div>
<div class="kpi"><div class="kpi-label">Total débits</div><div class="kpi-value">${fmt(totalDebits)}</div></div>
<div class="kpi"><div class="kpi-label">Taux couverture</div><div class="kpi-value" style="color:#1D4ED8">${tauxCouverture.toFixed(0)}%</div></div>
</div>
<table><thead><tr><th>Date</th><th>Bénéficiaire</th><th style="text-align:right">Montant</th><th>RIB</th><th>Statut</th></tr></thead>
<tbody>${rows}</tbody></table>
<div class="footer">ETCC — Document confidentiel — ${dateStr}</div>
<script>window.onload=()=>{window.print();}<\/script>
</body></html>`;
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  /* ════════════════════════════════════════════════════════════════════ */
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1A141A', margin: 0, fontFamily: 'var(--font-display)' }}>Rapprochement bancaire</h1>
          <p style={{ fontSize: 13, color: '#8E5915', margin: '4px 0 0' }}>Analysez vos relevés et suivez les factures manquantes</p>
        </div>
        <button onClick={loadHistory}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: '1.5px solid #E8D4B0', background: 'white', color: '#8E5915', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          <RefreshCw size={13}/> Rafraîchir
        </button>
      </div>

      {/* ═══ RELEVÉS BANCAIRES — cartes ══════════════════════════════════ */}
      {!selectedStmt && (
        <>
          {loadingHistory ? (
            <p style={{ textAlign: 'center', padding: '60px 0', color: '#8E5915', fontSize: 14 }}>Chargement des relevés...</p>
          ) : history.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: '56px 20px' }}>
              <Building2 size={44} style={{ color: '#E59312', margin: '0 auto 14px' }}/>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#8E5915', margin: 0 }}>Aucun relevé importé</p>
              <p style={{ fontSize: 12, color: '#B8A090', marginTop: 6 }}>
                Importez vos relevés dans la rubrique <strong>Comptabilité interne</strong> pour les analyser ici.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {history.map((stmt: any) => {
                const isPdf = stmt.file_url?.toLowerCase().includes('.pdf');
                const hasFile = !!stmt.file_url;
                return (
                  <div key={stmt.id} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Aperçu fichier */}
                    {hasFile ? (
                      !isPdf ? (
                        <div style={{ width: '100%', height: 110, borderRadius: 8, overflow: 'hidden', border: '1px solid #F5E6D3', cursor: 'pointer', flexShrink: 0 }}
                          onClick={() => setViewReleve(stmt.file_url)}>
                          <img src={stmt.file_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
                        </div>
                      ) : (
                        <div style={{ width: '100%', height: 90, borderRadius: 8, background: '#FFF3E0', border: '1px solid #F5E6D3', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer', flexShrink: 0 }}
                          onClick={() => setViewReleve(stmt.file_url)}>
                          <FileText size={30} style={{ color: '#E59312' }}/>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#8E5915' }}>PDF</span>
                        </div>
                      )
                    ) : (
                      <div style={{ width: '100%', height: 70, borderRadius: 8, background: '#F8FAFC', border: '1px dashed #CBD5E1', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Building2 size={24} style={{ color: '#94A3B8' }}/>
                      </div>
                    )}

                    {/* Infos */}
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1A141A' }}>{stmt.bank_name || 'Relevé bancaire'}</p>
                      <p style={{ margin: '3px 0 0', fontSize: 11, color: '#8E5915' }}>
                        {formatDate(stmt.period_from)} — {formatDate(stmt.period_to)}
                      </p>
                      {stmt.total_lines != null && (
                        <p style={{ margin: '3px 0 0', fontSize: 11, color: '#94A3B8' }}>{stmt.total_lines} ligne(s)</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 6 }}>
                      {hasFile && (
                        <button onClick={() => setViewReleve(stmt.file_url)}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '7px 10px', borderRadius: 7, border: '1px solid #E8D4B0', background: 'white', color: '#8E5915', fontSize: 11, fontWeight: 600, cursor: 'pointer', flex: 1 }}>
                          <Eye size={11}/> Voir
                        </button>
                      )}
                      <button onClick={() => loadLines(stmt)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '7px 12px', borderRadius: 7, border: 'none', background: 'linear-gradient(135deg,#F4B315,#E59312)', color: '#1A141A', fontSize: 11, fontWeight: 700, cursor: 'pointer', flex: 2 }}>
                        🔍 Analyser
                      </button>
                      <button onClick={async () => {
                        if (!confirm('Supprimer ce relevé ?')) return;
                        try {
                          await api.delete(`/rapprochement/statements/${stmt.id}`);
                          loadHistory();
                        } catch { alert('Erreur lors de la suppression'); }
                      }}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '7px 10px', borderRadius: 7, border: '1px solid #FECACA', background: 'white', color: '#DC2626', fontSize: 11, cursor: 'pointer' }}
                        title="Supprimer ce relevé">
                        🗑
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ═══ ANALYSE D'UN RELEVÉ ═════════════════════════════════════════ */}
      {selectedStmt && (
        <>
          {/* Header analyse */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <button onClick={() => { setSelectedStmt(null); setLines([]); setStatusFilter(''); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1.5px solid #E8D4B0', background: 'white', color: '#8E5915', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <ChevronLeft size={14}/> Retour
            </button>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1A141A' }}>
                📊 {selectedStmt.bank_name || 'Relevé bancaire'}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#8E5915' }}>
                {formatDate(selectedStmt.period_from)} — {formatDate(selectedStmt.period_to)}
              </p>
            </div>
            {selectedStmt.file_url && (
              <button onClick={() => setViewReleve(selectedStmt.file_url)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1.5px solid #E8D4B0', background: 'white', color: '#8E5915', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                <Eye size={13}/> Voir relevé
              </button>
            )}
            <button onClick={generatePDF}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: '1.5px solid #E8D4B0', background: 'white', color: '#8E5915', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              <Download size={13}/> Exporter PDF
            </button>
          </div>

          {loadingLines ? (
            <p style={{ textAlign: 'center', padding: '60px 0', color: '#8E5915' }}>Chargement de l'analyse...</p>
          ) : (
            <>
              {/* KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 18 }}>
                {[
                  { label: 'Total débits (sorties)', value: fmt(totalDebits), color: '#1A141A', icon: <TrendingDown size={16} style={{ color: '#EF4444' }}/> },
                  { label: 'Factures manquantes', value: `${noInvoiceLines.length} · ${fmt(totalManquant)}`, color: '#DC2626', icon: <AlertTriangle size={16} style={{ color: '#DC2626' }}/> },
                  { label: 'Factures liées', value: `${counts['MATCHED'] || 0}`, color: '#15803D', icon: <CheckCircle size={16} style={{ color: '#15803D' }}/> },
                  { label: 'Taux de couverture', value: `${tauxCouverture.toFixed(0)}%`, color: '#1D4ED8', icon: <Banknote size={16} style={{ color: '#1D4ED8' }}/> },
                ].map(k => (
                  <div key={k.label} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <p style={{ margin: 0, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#8E5915' }}>{k.label}</p>
                      {k.icon}
                    </div>
                    <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: k.color, fontFamily: 'monospace' }}>{k.value}</p>
                  </div>
                ))}
              </div>

              {/* ── SECTION : Factures à demander aux fournisseurs ───────── */}
              {noInvoiceLines.length > 0 && (
                <div style={{ ...card, marginBottom: 18, borderColor: '#FECACA', background: '#FFF5F5' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <AlertTriangle size={18} style={{ color: '#DC2626' }}/>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#991B1B' }}>
                      Factures à demander aux fournisseurs ({noInvoiceLines.length})
                    </p>
                  </div>
                  <p style={{ margin: '0 0 14px', fontSize: 12, color: '#DC2626' }}>
                    Ces paiements ont été débités mais aucune facture fournisseur correspondante n'a été trouvée dans le système.
                    Suivez leur statut ci-dessous.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {noInvoiceLines.map((line: any) => {
                      const s = suivi[line.id] || 'a_demander';
                      const sc = suiviConfig[s];
                      return (
                        <div key={line.id} style={{ background: 'white', border: '1px solid #FECACA', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          {/* Infos */}
                          <div style={{ flex: 1, minWidth: 160 }}>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1A141A' }}>
                              {line.beneficiary || line.description?.slice(0, 50) || '—'}
                            </p>
                            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#8E5915' }}>{formatDate(line.date)}</p>
                          </div>
                          {/* Montant */}
                          <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#DC2626', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                            −{fmt(Number(line.amount))}
                          </p>
                          {/* Statut suivi */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <select
                              value={s}
                              onChange={e => updateSuivi(line.id, e.target.value as SuiviStatus)}
                              style={{ padding: '5px 10px', borderRadius: 7, border: `1.5px solid ${sc.border}`, background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 700, cursor: 'pointer', outline: 'none' }}>
                              <option value="a_demander">À demander</option>
                              <option value="demandee">Demandée</option>
                              <option value="reçue">Reçue ✓</option>
                            </select>
                          </div>
                          {/* Bouton lier */}
                          <button onClick={() => openLinkModal(line)}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 7, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            🔗 Lier facture
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Filtres rapides ──────────────────────────────────────── */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                {([['', 'Toutes'], ['MATCHED', '✓ Matchées'], ['NO_INVOICE', '⚠ Sans facture'], ['SUGGESTED', '? Suggestions'], ['UNMATCHED', '? Non matchées']] as const).map(([v, l]) => (
                  <button key={v} onClick={() => setStatusFilter(v as string)}
                    style={{ padding: '5px 14px', borderRadius: 20, border: `1.5px solid ${statusFilter === v ? '#E59312' : '#E8D4B0'}`, background: statusFilter === v ? '#FFF8E7' : 'white', color: statusFilter === v ? '#8E5915' : '#B8977A', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    {l} {v ? `(${counts[v as string]||0})` : `(${lines.length})`}
                  </button>
                ))}
              </div>

              {/* ── Table toutes les lignes ──────────────────────────────── */}
              <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#FDF6E9' }}>
                        {['Date', 'Bénéficiaire / Description', 'Flux', 'Montant', 'RIB détecté', 'Statut', 'Suivi / Action'].map(h => (
                          <th key={h} style={{ padding: '9px 12px', textAlign: 'left', color: '#8E5915', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', whiteSpace: 'nowrap', borderBottom: '1px solid #F5E6D3' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLines.length === 0 ? (
                        <tr><td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: '#8E5915' }}>Aucune ligne</td></tr>
                      ) : filteredLines.map((line: any, i: number) => {
                        const ms = matchStatusConfig[line.match_status] || matchStatusConfig['UNMATCHED'];
                        const s  = suivi[line.id] || 'a_demander';
                        const sc = suiviConfig[s];
                        return (
                          <tr key={line.id} style={{ borderBottom: '1px solid #F5E6D3', background: i % 2 === 0 ? 'white' : '#FFFDF7' }}>
                            <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11, color: '#8E5915', whiteSpace: 'nowrap' }}>
                              {formatDate(line.date)}
                            </td>
                            <td style={{ padding: '8px 12px', maxWidth: 200 }}>
                              <p style={{ margin: 0, fontWeight: 600, color: '#1A141A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {line.beneficiary || '—'}
                              </p>
                              {line.description && (
                                <p style={{ margin: '2px 0 0', fontSize: 10, color: '#94A3B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {line.description.slice(0, 50)}
                                </p>
                              )}
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 20, border: '1px solid', background: line.is_credit ? '#F0FDF4' : '#FFF5F5', color: line.is_credit ? '#15803D' : '#DC2626', borderColor: line.is_credit ? '#BBF7D0' : '#FECACA', fontWeight: 700 }}>
                                {line.is_credit ? '↑ Crédit' : '↓ Débit'}
                              </span>
                            </td>
                            <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 700, color: line.is_credit ? '#15803D' : '#1A141A', whiteSpace: 'nowrap' }}>
                              {line.is_credit ? '+' : '−'}{fmt(Number(line.amount || 0))}
                            </td>
                            <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 10, color: '#8E5915' }}>
                              {line.rib_detected || '—'}
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, border: `1px solid ${ms.border}`, background: ms.bg, color: ms.color, fontWeight: 600 }}>
                                {ms.label}
                              </span>
                              {(line.matched_invoice?.number || line.matched_invoice?.invoice_number) && (
                                <p style={{ margin: '3px 0 0', fontSize: 10, color: '#15803D', fontFamily: 'monospace', fontWeight: 600 }}>
                                  {line.matched_invoice?.number || line.matched_invoice?.invoice_number}
                                </p>
                              )}
                            </td>
                            <td style={{ padding: '8px 12px' }}>
                              {line.match_status === 'NO_INVOICE' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <select value={s} onChange={e => updateSuivi(line.id, e.target.value as SuiviStatus)}
                                    style={{ padding: '3px 7px', borderRadius: 6, border: `1px solid ${sc.border}`, background: sc.bg, color: sc.color, fontSize: 10, fontWeight: 700, cursor: 'pointer', outline: 'none' }}>
                                    <option value="a_demander">À demander</option>
                                    <option value="demandee">Demandée</option>
                                    <option value="reçue">Reçue ✓</option>
                                  </select>
                                  <button onClick={() => openLinkModal(line)}
                                    style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>
                                    Lier
                                  </button>
                                </div>
                              )}
                              {line.match_status === 'SUGGESTED' && (
                                <button disabled={confirmingId === line.id} onClick={() => handleConfirm(line)}
                                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8', fontSize: 10, fontWeight: 700, cursor: 'pointer', opacity: confirmingId === line.id ? 0.5 : 1 }}>
                                  <Check size={10}/> {confirmingId === line.id ? '...' : 'Confirmer'}
                                </button>
                              )}
                              {line.match_status === 'UNMATCHED' && (
                                <button onClick={() => openLinkModal(line)}
                                  style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #E8D4B0', background: 'white', color: '#8E5915', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>
                                  Lier manuellement
                                </button>
                              )}
                              {line.match_status === 'MATCHED' && (
                                <span style={{ fontSize: 11, color: '#15803D', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <Check size={11}/> Validé
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ═══ VIEWER PLEIN ÉCRAN ══════════════════════════════════════════ */}
      {viewReleve && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.92)' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '10px 18px', gap: 10, flexShrink: 0 }}>
            <button onClick={() => downloadFile(viewReleve, 'releve')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#F4B315,#E59312)', color: '#1A141A', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              <Download size={13}/> Télécharger
            </button>
            <button onClick={() => setViewReleve(null)}
              style={{ width: 34, height: 34, borderRadius: '50%', background: '#EF4444', border: 'none', color: 'white', fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              &#x2715;
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px 16px' }}>
            {viewReleve.toLowerCase().match(/\.(jpe?g|png|webp|gif|bmp)/) ? (
              <img src={viewReleve} alt="relevé" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 10, objectFit: 'contain' }}/>
            ) : (
              <iframe src={viewReleve} style={{ width: '88vw', height: '88vh', border: 'none', borderRadius: 10, background: 'white' }} title="Relevé bancaire"/>
            )}
          </div>
        </div>
      )}

      {/* ═══ MODAL LIER FACTURE ══════════════════════════════════════════ */}
      {linkTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setLinkTarget(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(26,20,26,0.5)', backdropFilter: 'blur(4px)' }}/>
          <div style={{ position: 'relative', zIndex: 10, background: 'white', borderRadius: 16, width: '100%', maxWidth: 540, margin: '0 16px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #F5E6D3', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1A141A' }}>🔗 Lier une facture fournisseur</h2>
              <button onClick={() => setLinkTarget(null)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#8E5915' }}>×</button>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ background: '#FFF8EE', border: '1px solid #F5E6D3', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1A141A' }}>
                  {linkTarget.beneficiary || linkTarget.description?.slice(0, 50)}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 14, color: '#DC2626', fontFamily: 'monospace', fontWeight: 800 }}>
                  −{fmt(Number(linkTarget.amount))} · {formatDate(linkTarget.date)}
                </p>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Rechercher une facture</label>
                <input value={linkSearch} onChange={e => setLinkSearch(e.target.value)}
                  placeholder="N° facture, fournisseur..." style={inputStyle} autoFocus/>
              </div>
              <div style={{ maxHeight: 280, overflowY: 'auto', border: '1.5px solid #E8D4B0', borderRadius: 8 }}>
                {linkLoading ? (
                  <p style={{ padding: 20, textAlign: 'center', fontSize: 13, color: '#8E5915' }}>Chargement...</p>
                ) : searchedInvoices.length === 0 ? (
                  <p style={{ padding: 20, textAlign: 'center', fontSize: 13, color: '#8E5915' }}>Aucune facture trouvée</p>
                ) : searchedInvoices.map(inv => (
                  <div key={inv.id} onClick={() => setSelectedInvoice(inv)}
                    style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #F5E6D3', background: selectedInvoice?.id === inv.id ? '#FFF3D4' : 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onMouseEnter={e => { if (selectedInvoice?.id !== inv.id) e.currentTarget.style.background = '#FFF8EE'; }}
                    onMouseLeave={e => { if (selectedInvoice?.id !== inv.id) e.currentTarget.style.background = 'white'; }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1A141A' }}>
                        {selectedInvoice?.id === inv.id && '✓ '}{inv.number || inv.invoice_number || '—'}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#8E5915' }}>
                        {inv.client?.commercial_name || inv.fournisseur?.name || '—'}
                      </p>
                    </div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1A141A', fontFamily: 'monospace' }}>
                      {fmt(Number(inv.total_ttc || 0))}
                    </p>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 20, marginTop: 4, borderTop: '1px solid #F5E6D3' }}>
                <button onClick={() => setLinkTarget(null)} style={btnSecondary}>Annuler</button>
                <button onClick={handleLinkInvoice} disabled={!selectedInvoice || linkSaving}
                  style={{ ...btnBlue, opacity: (!selectedInvoice || linkSaving) ? 0.5 : 1 }}>
                  {linkSaving ? 'Liaison...' : '🔗 Confirmer la liaison'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
