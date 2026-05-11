'use client';

import { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, Receipt, FileText, Building2, Upload, AlertTriangle, CheckCircle, ChevronDown, ChevronRight, Search, Download } from 'lucide-react';
import api, { invoicesApi, depensesApi, comptaApi, uploadApi } from '@/lib/api';
import { useLanguage } from '@/lib/i18n';
import { formatCurrency, formatDate, cn } from '@/lib/utils';

const MONTHS = ['Jan','Fev','Mar','Avr','Mai','Juin','Juil','Aou','Sep','Oct','Nov','Dec'];

async function downloadFile(url: string, filename = 'document') {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    const res = await fetch(url, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const blob = await res.blob();
    const ext = url.toLowerCase().endsWith('.pdf') ? '.pdf'
              : (url.toLowerCase().match(/\.(jpe?g|png|webp)/)?.[0] ?? '');
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filename + ext;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objUrl);
  } catch {
    window.open(url, '_blank');
  }
}

function dlUrl(url?: string | null): string {
  if (!url) return '#';
  return url.includes('?') ? url + '&dl=1' : url + '?dl=1';
}

const CATEGORY_LABELS: Record<string, string> = {
  MATERIEL: 'Materiaux / Materiel', MAIN_OEUVRE: 'Main d\'oeuvre',
  TRANSPORT: 'Transport', CARBURANT: 'Carburant',
  OUTILS: 'Outillage', SOUS_TRAITANCE: 'Sous-traitance', AUTRE: 'Autre',
};

const CATEGORY_COLORS: Record<string, string> = {
  MATERIEL: '#F4B315', MAIN_OEUVRE: '#3B82F6', TRANSPORT: '#10B981',
  CARBURANT: '#EF4444', OUTILS: '#8B5CF6', SOUS_TRAITANCE: '#F97316', AUTRE: '#94A3B8',
};

function fmt(n: number) { return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n); }

export default function ComptabiliteInternePage() {
  const [tab, setTab] = useState<'synthèse' | 'factures' | 'releves' | 'dépenses' | 'encaissements'>('synthèse');
  const year = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // --- Synthèse state ---
  const [tvaData, setTvaData] = useState<any[]>([]);
  const [loadingTva, setLoadingTva] = useState(true);

  // --- Factures state ---
  const [issuedList, setIssuedList] = useState<any[]>([]);
  const [purchaseList, setPurchaseList] = useState<any[]>([]);
  const [loadingFact, setLoadingFact] = useState(true);

  // --- Releves state ---
  const [statements, setStatements] = useState<any[]>([]);
  const [selectedStmt, setSelectedStmt] = useState<any>(null);
  const [stmtSummary, setStmtSummary] = useState<any>(null);
  const [stmtLines, setStmtLines] = useState<any[]>([]);
  const [lineFilter, setLineFilter] = useState('');
  const [loadingStmt, setLoadingStmt] = useState(false);
  const [viewReleve, setViewReleve] = useState<string | null>(null);
  const [importingCSV, setImportingCSV] = useState(false);
  const [importingPDF, setImportingPDF] = useState(false);
  const [csvForm, setCsvForm] = useState({ bank_name: '', account: '', period_from: `${year}-01-01`, period_to: `${year}-12-31` });
  const [pdfForm, setPdfForm] = useState({ bank_name: '', account: '', period_from: `${year}-01-01`, period_to: `${year}-12-31` });
  const [showImportForm, setShowImportForm] = useState(false);
  const [showImportPdfForm, setShowImportPdfForm] = useState(false);
  const [importMsg, setImportMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);

  // --- Dépenses state ---
  const [depStats, setDepStats] = useState<any>(null);
  const [depByProject, setDepByProject] = useState<any[]>([]);
  const [loadingDep, setLoadingDep] = useState(true);
  const [depMonth, setDepMonth] = useState(0); // 0 = all year

  useEffect(() => {
    if (tab === 'synthèse') loadTVA();
    if (tab === 'factures') loadFactures();
    // silent si on a déjà des données (pas de blanc à l'écran), avec spinner si liste vide
    if (tab === 'releves') loadReleves(statements.length > 0);
    if (tab === 'dépenses') loadDépenses();
    if (tab === 'encaissements') loadEncaissements();
  }, [tab, depMonth]);

  // ==================== TVA ====================
  const loadTVA = async () => {
    setLoadingTva(true);
    try {
      const months = await Promise.all(
        Array.from({ length: currentMonth }, (_, i) => i + 1).map(async (m) => {
          const [issued, purchase] = await Promise.all([
            invoicesApi.stats(m, year),
            invoicesApi.list({ direction: 'RECEIVED', page: 1 }),
          ]);
          const s = issued.data;
          const purchaseTva = (purchase.data.data || [])
            .filter((inv: any) => {
              const d = new Date(inv.issue_date);
              return d.getMonth() + 1 === m && d.getFullYear() === year;
            })
            .reduce((sum: number, inv: any) => sum + Number(inv.tva_amount || 0), 0);
          return {
            month: m, label: MONTHS[m - 1],
            tva_collectee: s.tva_collected || 0,
            tva_deductible: purchaseTva,
            tva_due: Math.max(0, (s.tva_collected || 0) - purchaseTva),
            ca: s.ca_month || 0,
          };
        })
      );
      setTvaData(months);
    } catch (e) { console.error(e); }
    finally { setLoadingTva(false); }
  };

  // ==================== FACTURES ====================
  const loadFactures = async () => {
    setLoadingFact(true);
    try {
      const [issued, purchase] = await Promise.all([
        invoicesApi.list({ direction: 'ISSUED', page: 1 }),
        invoicesApi.list({ direction: 'RECEIVED', page: 1 }),
      ]);
      setIssuedList(issued.data.data || []);
      setPurchaseList(purchase.data.data || []);
    } catch (e) { console.error(e); }
    finally { setLoadingFact(false); }
  };

  // ==================== RELEVES ====================
  const CACHE_KEY = 'releves_list_cache';

  const saveCache = (list: any[]) => {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(list)); } catch {}
  };
  const loadCache = (): any[] => {
    try { const c = sessionStorage.getItem(CACHE_KEY); return c ? JSON.parse(c) : []; } catch { return []; }
  };

  const loadReleves = async (silent = false) => {
    // Afficher le cache immédiatement si on n'a pas de données
    if (statements.length === 0) {
      const cached = loadCache();
      if (cached.length > 0) setStatements(cached);
    }
    if (!silent) setLoadingStmt(true);
    try {
      const res = await comptaApi.rapprochementStatements();
      const list = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      if (list.length > 0 || !silent) {
        setStatements(list);
        saveCache(list);
      }
    } catch (e) {
      console.error('[loadReleves]', e);
      // En cas d'erreur, restaurer le cache si liste vide
      if (statements.length === 0) {
        const cached = loadCache();
        if (cached.length > 0) setStatements(cached);
      }
    }
    finally { setLoadingStmt(false); }
  };

  const openStatement = async (stmt: any) => {
    setSelectedStmt(stmt); setStmtSummary(null); setStmtLines([]); setLineFilter('');
    try {
      const [sumRes, linesRes] = await Promise.all([
        comptaApi.rapprochementSummary(stmt.id),
        comptaApi.rapprochementLines(stmt.id),
      ]);
      setStmtSummary(sumRes.data);
      setStmtLines(linesRes.data || []);
    } catch (e) { console.error(e); }
  };

  const handleImportCSV = async (file: File) => {
    setImportingCSV(true);
    setImportMsg(null);
    try {
      const text = await file.text();
      const res = await api.post('/rapprochement/import', { csv_content: text, ...csvForm });
      const newStmt = res.data;
      setShowImportForm(false);
      if (newStmt) {
        setStatements(prev => {
          const updated = [newStmt, ...prev];
          saveCache(updated);
          return updated;
        });
      }
      setImportMsg({ type: 'success', text: 'Relevé CSV importé avec succès !' });
      localStorage.setItem('releves_updated', Date.now().toString());
      setTimeout(() => setImportMsg(null), 5000);
      await loadReleves(true);
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || 'Erreur import CSV';
      setImportMsg({ type: 'error', text: msg });
    } finally { setImportingCSV(false); }
  };

  const handleImportPDF = async (file: File) => {
    setImportingPDF(true);
    setImportMsg(null);
    try {
      // Étape 1 : upload du fichier
      setImportMsg({ type: 'success', text: 'Upload du fichier...' });
      const fd = new FormData();
      fd.append('file', file);
      let upRes: any;
      try {
        upRes = await api.post('/upload', fd);
      } catch (e: any) {
        const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || 'erreur réseau';
        throw new Error(`Upload échoué : ${msg}`);
      }
      const d = upRes.data;
      const fileUrl = d?.url || (d?.filename ? `/api/upload/files/${d.filename}` : null);
      if (!fileUrl) throw new Error('Serveur n\'a pas retourné l\'URL du fichier');

      // Étape 2 : création du relevé en base
      setImportMsg({ type: 'success', text: 'Enregistrement du relevé...' });
      let newStmt: any;
      try {
        const stmtRes = await api.post('/rapprochement/import-scan', {
          file_url:    fileUrl,
          bank_name:   pdfForm.bank_name  || 'Relevé',
          account:     pdfForm.account    || '',
          period_from: pdfForm.period_from || new Date().toISOString().slice(0, 10),
          period_to:   pdfForm.period_to   || new Date().toISOString().slice(0, 10),
        });
        newStmt = stmtRes.data;
      } catch (e: any) {
        const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || 'erreur serveur';
        throw new Error(`Enregistrement échoué : ${msg}`);
      }

      // Étape 3 : mise à jour de l'état
      setShowImportPdfForm(false);
      if (newStmt) {
        setStatements(prev => {
          const updated = [newStmt, ...prev];
          saveCache(updated);
          return updated;
        });
      }
      setImportMsg({ type: 'success', text: `Relevé "${pdfForm.bank_name || 'Relevé'}" importé avec succès !` });
      localStorage.setItem('releves_updated', Date.now().toString());
      setTimeout(() => setImportMsg(null), 6000);
      // Reload silencieux — met à jour le cache avec les données serveur
      await loadReleves(true);
    } catch (e: any) {
      console.error('[Import relevé PDF]', e);
      setImportMsg({ type: 'error', text: e?.message || 'Erreur inconnue lors de l\'import.' });
    } finally { setImportingPDF(false); }
  };

  // ==================== ENCAISSEMENTS ====================
  const loadEncaissements = async () => {
    setLoadingEnc(true);
    try {
      const res = await invoicesApi.list({ direction: 'ISSUED', page: 1 });
      setEncInvoices(res.data.data || []);
    } catch(e) { console.error(e); }
    finally { setLoadingEnc(false); }
  };

  const openInvoiceDetail = async (inv: any) => {
    setSelectedInv(inv);
    setInvDetail(null);
    setLoadingDetail(true);
    setShowPayForm(false);
    setPayError(''); setPaySuccess('');
    try {
      const res = await invoicesApi.get(inv.id);
      setInvDetail(res.data);
    } catch(e) { console.error(e); }
    finally { setLoadingDetail(false); }
  };

  const handlePay = async () => {
    if (!selectedInv || !payForm.amount) return;
    setPayLoading(true); setPayError(''); setPaySuccess('');
    try {
      await invoicesApi.pay(selectedInv.id, {
        type: payForm.type,
        amount: parseFloat(payForm.amount),
        reference: payForm.reference || undefined,
        date: new Date(payForm.date),
      });
      setPaySuccess('Paiement enregistre avec succes !');
      setPayForm({ amount:'', type:'VIREMENT', reference:'', date: new Date().toISOString().slice(0,10) });
      setShowPayForm(false);
      // Refresh detail + list
      const [detRes, listRes] = await Promise.all([
        invoicesApi.get(selectedInv.id),
        invoicesApi.list({ direction: 'ISSUED', page: 1 }),
      ]);
      setInvDetail(detRes.data);
      setSelectedInv(detRes.data);
      setEncInvoices(listRes.data.data || []);
      setTimeout(() => setPaySuccess(''), 4000);
    } catch(e: any) {
      setPayError(e?.response?.data?.message || e?.message || 'Erreur inconnue');
    } finally { setPayLoading(false); }
  };

  // ==================== DEPENSES ====================
  const loadDépenses = async () => {
    setLoadingDep(true);
    try {
      const [statsRes, listRes] = await Promise.all([
        depMonth > 0
          ? comptaApi.dépensesStats(depMonth, year)
          : comptaApi.dépensesStats(undefined, year),
        fetch(`/api/dépenses?year=${year}${depMonth > 0 ? `&month=${depMonth}` : ''}&limit=500`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` }
        }).then(r => r.json()),
      ]);
      setDepStats(statsRes.data);
      // Group by project
      const byProject: Record<string, any> = {};
      (listRes.data || []).forEach((d: any) => {
        const key = d.project?.name || 'Sans chantier';
        if (!byProject[key]) byProject[key] = { name: key, total: 0, especes: 0, items: [] };
        byProject[key].total += Number(d.amount);
        if (d.payment_method === 'ESPECES' || !d.payment_method) byProject[key].especes += Number(d.amount);
        byProject[key].items.push(d);
      });
      setDepByProject(Object.values(byProject).sort((a: any, b: any) => b.total - a.total));
    } catch (e) { console.error(e); }
    finally { setLoadingDep(false); }
  };

  // --- Encaissements state ---
  const [encInvoices, setEncInvoices]     = useState<any[]>([]);
  const [loadingEnc, setLoadingEnc]       = useState(false);
  const [selectedClient, setSelectedClient] = useState<string|null>(null);
  const [selectedInv, setSelectedInv]     = useState<any>(null);
  const [invDetail, setInvDetail]         = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showPayForm, setShowPayForm]     = useState(false);
  const [payForm, setPayForm]             = useState({ amount:'', type:'VIREMENT', reference:'', date: new Date().toISOString().slice(0,10) });
  const [payLoading, setPayLoading]       = useState(false);
  const [payError, setPayError]           = useState('');
  const [paySuccess, setPaySuccess]       = useState('');

  // ==================== UI helpers ====================
  const totalTvaCollectee = tvaData.reduce((s, m) => s + m.tva_collectee, 0);
  const totalTvaDeductible = tvaData.reduce((s, m) => s + m.tva_deductible, 0);
  const totalTvaDue = tvaData.reduce((s, m) => s + m.tva_due, 0);
  const totalCA = tvaData.reduce((s, m) => s + m.ca, 0);

  const issuedTotal = issuedList.reduce((s, i) => s + Number(i.total_ttc), 0);
  const issuedPaid = issuedList.filter(i => i.status === 'PAID').reduce((s, i) => s + Number(i.total_ttc), 0);
  const issuedUnpaid = issuedList.filter(i => ['SENT','PARTIAL','OVERDUE'].includes(i.status)).reduce((s, i) => s + Number(i.balance || 0), 0);
  const purchaseTotal = purchaseList.reduce((s, i) => s + Number(i.total_ttc), 0);

  const filteredLines = stmtLines.filter(l => {
    if (!lineFilter) return true;
    if (lineFilter === 'UNMATCHED') return l.match_status === 'UNMATCHED' || l.match_status === 'NO_INVOICE';
    if (lineFilter === 'CREDIT') return l.is_credit;
    if (lineFilter === 'DEBIT') return !l.is_credit;
    return true;
  });
  const missingInvoices = stmtLines.filter(l => l.match_status === 'UNMATCHED' || l.match_status === 'NO_INVOICE');
  const totalCredits = stmtLines.filter(l => l.is_credit).reduce((s, l) => s + Number(l.amount), 0);
  const totalDebits = stmtLines.filter(l => !l.is_credit).reduce((s, l) => s + Number(l.amount), 0);

  const cardStyle = { background:'white', borderRadius:12, border:'1px solid #F5E6D3', padding:'16px 20px' };
  const kpiStyle = { ...cardStyle, textAlign:'center' as const };

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[22px] font-bold text-honey-dark font-display tracking-tight">Comptabilite interne</h1>
        <p className="text-sm text-honey-caramel mt-0.5">Analyse financiere, TVA, releves bancaires et dépenses</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-honey-beige-soft">
        {([
          ['synthèse', 'Synthèse TVA', TrendingUp],
          ['factures', 'Analyse factures', FileText],
          ['releves', 'Relevés bancaires', Building2],
          ['dépenses', 'Dépenses', Receipt],
          ['encaissements', 'Encaissements', TrendingUp],
        ] as const).map(([value, label, Icon]) => (
          <button key={value} onClick={() => setTab(value as any)}
            className={cn('px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-all flex items-center gap-2',
              tab === value ? 'border-honey-gold text-honey-dark' : 'border-transparent text-honey-caramel hover:text-honey-dark')}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* ======== TAB SYNTHESE TVA ======== */}
      {tab === 'synthèse' && (
        <div>
          {loadingTva ? <p className="text-center py-12 text-honey-caramel">Chargement...</p> : (
            <>
              {/* KPIs annuels */}
              {/* Row 1 — CA & TVA */}
              <div className="grid grid-cols-4 gap-3 mb-3">
                {[
                  { label: `CA TTC ${year}`, value: fmt(totalCA), sub: `HT: ${fmt(totalCA/1.2)} MAD`, color: '#F4B315' },
                  { label: 'TVA collectee', value: fmt(totalTvaCollectee), sub: `${((totalTvaCollectee/(totalCA||1))*100).toFixed(1)}% du CA`, color: '#10B981' },
                  { label: 'TVA deductible', value: fmt(totalTvaDeductible), sub: 'Factures achats', color: '#3B82F6' },
                  { label: 'TVA due (solde)', value: fmt(totalTvaDue), sub: totalTvaDue>0?'A reverser':'Excedent', color: totalTvaDue>0?'#EF4444':'#10B981' },
                ].map(k => (
                  <div key={k.label} style={kpiStyle}>
                    <p style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:0.5, color:'#8E5915', marginBottom:6 }}>{k.label}</p>
                    <p style={{ fontSize:18, fontWeight:800, color:k.color, fontFamily:'monospace', margin:'0 0 2px' }}>{k.value}</p>
                    <p style={{ fontSize:10, color:'#B8A090' }}>{k.sub}</p>
                  </div>
                ))}
              </div>
              {/* Row 2 — Analyse financière */}
              {(() => {
                const caHT = totalCA / 1.2;
                const achatHT = purchaseList.reduce((s:number,i:any)=>s+Number(i.total_ttc||0),0) / 1.2;
                const depTot = 0; // loaded in dépenses tab
                const margeHT = caHT - achatHT;
                const tauxMarge = caHT>0?(margeHT/caHT)*100:0;
                const encaisse = issuedList.filter((i:any)=>i.status==='PAID').reduce((s:number,i:any)=>s+Number(i.total_ttc||0),0);
                const creance = issuedList.filter((i:any)=>['SENT','PARTIAL','OVERDUE'].includes(i.status)).reduce((s:number,i:any)=>s+Number(i.balance||0),0);
                const tauxRecouvrement = totalCA>0?(encaisse/totalCA)*100:0;
                return (
                  <div className="grid grid-cols-4 gap-3 mb-6">
                    {[
                      { label:'Marge brute HT', value:fmt(margeHT)+' MAD', sub:`Taux: ${tauxMarge.toFixed(1)}%`, color:margeHT>=0?'#10B981':'#EF4444', bg:margeHT>=0?'#F0FDF4':'#FFF5F5' },
                      { label:'Achats HT', value:fmt(achatHT)+' MAD', sub:`${purchaseList.length} facture(s)`, color:'#EF4444', bg:'#FFF5F5' },
                      { label:'Encaisse TTC', value:fmt(encaisse)+' MAD', sub:`Taux: ${tauxRecouvrement.toFixed(1)}%`, color:'#10B981', bg:'#F0FDF4' },
                      { label:'Creances clients', value:fmt(creance)+' MAD', sub:`${issuedList.filter((i:any)=>['SENT','PARTIAL','OVERDUE'].includes(i.status)).length} fact. en cours`, color:'#F97316', bg:'#FFF7ED' },
                    ].map(k => (
                      <div key={k.label} style={{ ...kpiStyle, background:k.bg }}>
                        <p style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:0.5, color:'#8E5915', marginBottom:6 }}>{k.label}</p>
                        <p style={{ fontSize:16, fontWeight:800, color:k.color, fontFamily:'monospace', margin:'0 0 2px' }}>{k.value}</p>
                        <p style={{ fontSize:10, color:'#B8A090' }}>{k.sub}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Table TVA mensuelle */}
              <div style={cardStyle}>
                <h3 style={{ fontSize:13, fontWeight:700, color:'#1A141A', marginBottom:16 }}>TVA mensuelle {year}</h3>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ background:'linear-gradient(135deg,#8E5915,#B8730A)', color:'white' }}>
                      {['Mois', 'CA TTC', 'TVA collectee (20%)', 'TVA deductible', 'TVA due', 'Statut'].map(h => (
                        <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:600, textTransform:'uppercase', letterSpacing:0.5 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tvaData.map((m, i) => {
                      const isPast = m.month < currentMonth;
                      const isCurrent = m.month === currentMonth;
                      return (
                        <tr key={m.month} style={{ background: i % 2 === 0 ? 'white' : '#FFFDF5', borderBottom:'1px solid #F5E6D3' }}>
                          <td style={{ padding:'10px 12px', fontWeight:700, color:'#1A141A' }}>
                            {m.label}
                            {isCurrent && <span style={{ marginLeft:6, fontSize:9, background:'#F4B315', color:'#1A141A', padding:'1px 6px', borderRadius:4, fontWeight:700 }}>En cours</span>}
                          </td>
                          <td style={{ padding:'10px 12px', fontFamily:'monospace', fontWeight:600, color:'#1A141A' }}>{fmt(m.ca)} MAD</td>
                          <td style={{ padding:'10px 12px', fontFamily:'monospace', color:'#10B981', fontWeight:600 }}>{fmt(m.tva_collectee)} MAD</td>
                          <td style={{ padding:'10px 12px', fontFamily:'monospace', color:'#3B82F6', fontWeight:600 }}>{fmt(m.tva_deductible)} MAD</td>
                          <td style={{ padding:'10px 12px', fontFamily:'monospace', fontWeight:700, color: m.tva_due > 0 ? '#EF4444' : '#10B981' }}>{fmt(m.tva_due)} MAD</td>
                          <td style={{ padding:'10px 12px' }}>
                            {isPast || isCurrent ? (
                              <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:4,
                                background: m.tva_due > 0 ? '#FEF2F2' : '#F0FFF4',
                                color: m.tva_due > 0 ? '#DC2626' : '#16A34A',
                                border: `1px solid ${m.tva_due > 0 ? '#FECACA' : '#86EFAC'}` }}>
                                {m.tva_due > 0 ? `A payer: ${fmt(m.tva_due)} MAD` : 'Solde'}
                              </span>
                            ) : <span style={{ color:'#B8A090', fontSize:11 }}>-</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background:'linear-gradient(135deg,#F4B315,#E59312)', fontWeight:800 }}>
                      <td style={{ padding:'10px 12px', color:'#1A141A' }}>TOTAL {year}</td>
                      <td style={{ padding:'10px 12px', fontFamily:'monospace', color:'#1A141A' }}>{fmt(totalCA)} MAD</td>
                      <td style={{ padding:'10px 12px', fontFamily:'monospace', color:'#1A141A' }}>{fmt(totalTvaCollectee)} MAD</td>
                      <td style={{ padding:'10px 12px', fontFamily:'monospace', color:'#1A141A' }}>{fmt(totalTvaDeductible)} MAD</td>
                      <td style={{ padding:'10px 12px', fontFamily:'monospace', color:'#1A141A' }}>{fmt(totalTvaDue)} MAD</td>
                      <td style={{ padding:'10px 12px' }}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ======== TAB FACTURES ======== */}
      {tab === 'factures' && (
        <div>
          {loadingFact ? <p className="text-center py-12 text-honey-caramel">Chargement...</p> : (
            <>
              <div className="grid grid-cols-4 gap-4 mb-6">
                {[
                  { label: 'CA emis (TTC)', value: fmt(issuedTotal), color: '#F4B315' },
                  { label: 'Encaisse', value: fmt(issuedPaid), color: '#10B981' },
                  { label: 'Restant a encaisser', value: fmt(issuedUnpaid), color: '#F97316' },
                  { label: 'Total achats (TTC)', value: fmt(purchaseTotal), color: '#EF4444' },
                ].map(k => (
                  <div key={k.label} style={kpiStyle}>
                    <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:0.5, color:'#8E5915', marginBottom:8 }}>{k.label}</p>
                    <p style={{ fontSize:20, fontWeight:800, color:k.color, fontFamily:'monospace', margin:0 }}>{k.value}</p>
                    <p style={{ fontSize:10, color:'#B8A090' }}>MAD</p>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4">
                {/* Factures emises */}
                <div style={cardStyle}>
                  <h3 style={{ fontSize:13, fontWeight:700, marginBottom:12, color:'#1A141A', display:'flex', alignItems:'center', gap:8 }}>
                    <TrendingUp size={15} color="#10B981" /> Factures emises ({issuedList.length})
                  </h3>
                  <div style={{ maxHeight:400, overflowY:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                      <thead><tr style={{ background:'#FDF6E9' }}>
                        {['Numero','Client','TTC','Statut'].map(h => <th key={h} style={{ padding:'6px 10px', textAlign:'left', fontSize:9, color:'#8E5915', fontWeight:600, textTransform:'uppercase', borderBottom:'1px solid #F5E6D3' }}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {issuedList.slice(0, 50).map(inv => (
                          <tr key={inv.id} style={{ borderBottom:'1px solid #F5E6D3' }}>
                            <td style={{ padding:'7px 10px', fontFamily:'monospace', fontWeight:700, fontSize:11, color:'#1A141A' }}>{inv.number}</td>
                            <td style={{ padding:'7px 10px', fontSize:11, color:'#1A141A' }}>{inv.client?.commercial_name}</td>
                            <td style={{ padding:'7px 10px', fontFamily:'monospace', fontWeight:600, color:'#1A141A' }}>{fmt(Number(inv.total_ttc))}</td>
                            <td style={{ padding:'7px 10px' }}>
                              <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:4,
                                background: inv.status==='PAID' ? '#F0FFF4' : inv.status==='OVERDUE' ? '#FEF2F2' : '#FEF9E9',
                                color: inv.status==='PAID' ? '#16A34A' : inv.status==='OVERDUE' ? '#DC2626' : '#D97706',
                                border: `1px solid ${inv.status==='PAID' ? '#86EFAC' : inv.status==='OVERDUE' ? '#FECACA' : '#FDE68A'}` }}>
                                {inv.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                {/* Factures achat */}
                <div style={cardStyle}>
                  <h3 style={{ fontSize:13, fontWeight:700, marginBottom:12, color:'#1A141A', display:'flex', alignItems:'center', gap:8 }}>
                    <TrendingDown size={15} color="#EF4444" /> Factures d'achat ({purchaseList.length})
                  </h3>
                  <div style={{ maxHeight:400, overflowY:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                      <thead><tr style={{ background:'#FDF6E9' }}>
                        {['Numero','Fournisseur','HT','TVA','TTC'].map(h => <th key={h} style={{ padding:'6px 10px', textAlign:'left', fontSize:9, color:'#8E5915', fontWeight:600, textTransform:'uppercase', borderBottom:'1px solid #F5E6D3' }}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {purchaseList.slice(0, 50).map(inv => (
                          <tr key={inv.id} style={{ borderBottom:'1px solid #F5E6D3' }}>
                            <td style={{ padding:'7px 10px', fontFamily:'monospace', fontWeight:700, fontSize:11, color:'#1A141A' }}>{inv.number}</td>
                            <td style={{ padding:'7px 10px', fontSize:11, color:'#1A141A' }}>{inv.fournisseur?.name}</td>
                            <td style={{ padding:'7px 10px', fontFamily:'monospace', fontSize:11 }}>{fmt(Number(inv.total_ht_brut))}</td>
                            <td style={{ padding:'7px 10px', fontFamily:'monospace', fontSize:11, color:'#3B82F6' }}>{fmt(Number(inv.tva_amount))}</td>
                            <td style={{ padding:'7px 10px', fontFamily:'monospace', fontWeight:600, color:'#1A141A' }}>{fmt(Number(inv.total_ttc))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ======== TAB RELEVES ======== */}
      {tab === 'releves' && (
        <div>
          {!selectedStmt ? (
            <>
              <div className="flex justify-between items-center mb-4">
                <h3 style={{ fontSize:14, fontWeight:700, color:'#1A141A' }}>Relevés bancaires importés</h3>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => { setShowImportPdfForm(v => !v); setShowImportForm(false); }}
                    style={{ padding:'8px 16px', borderRadius:8, border:'1.5px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                    <Upload size={13} /> Relevé PDF/Scan
                  </button>
                  <button onClick={() => { setShowImportForm(v => !v); setShowImportPdfForm(false); }}
                    style={{ padding:'8px 16px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#F4B315,#E59312)', color:'#1A141A', fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                    <Upload size={13} /> Relevé CSV
                  </button>
                </div>
              </div>

              {importMsg && (
                <div style={{ padding:'10px 16px', borderRadius:8, marginBottom:12, fontSize:12, fontWeight:600,
                  background: importMsg.type === 'success' ? '#F0FDF4' : '#FEF2F2',
                  color: importMsg.type === 'success' ? '#16A34A' : '#DC2626',
                  border: `1px solid ${importMsg.type === 'success' ? '#BBF7D0' : '#FECACA'}` }}>
                  {importMsg.type === 'success' ? '✓ ' : '⚠ '}{importMsg.text}
                </div>
              )}

              {showImportForm && (
                <div style={{ ...cardStyle, marginBottom:16, background:'#FFFDF5', border:'1.5px solid #F4B315' }}>
                  <h4 style={{ fontSize:13, fontWeight:700, marginBottom:14, color:'#1A141A' }}>Importer un relevé bancaire (CSV)</h4>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:12, marginBottom:12 }}>
                    {[
                      { label:'Banque', key:'bank_name', placeholder:'CIH, Attijariwafa...' },
                      { label:'Compte', key:'account', placeholder:'N° compte' },
                      { label:'Debut période', key:'period_from', type:'date' },
                      { label:'Fin période', key:'period_to', type:'date' },
                    ].map(f => (
                      <div key={f.key}>
                        <label style={{ display:'block', fontSize:10, fontWeight:700, color:'#8E5915', textTransform:'uppercase', marginBottom:4 }}>{f.label}</label>
                        <input type={f.type || 'text'} placeholder={f.placeholder || ''} value={(csvForm as any)[f.key]}
                          onChange={e => setCsvForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                          style={{ width:'100%', padding:'8px 10px', borderRadius:7, border:'1.5px solid #E8D4B0', fontSize:12, outline:'none', boxSizing:'border-box' }} />
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize:11, color:'#8E5915', marginBottom:10 }}>
                    Format CSV attendu: <strong>Date ; Libelle ; Debit ; Credit ; Solde</strong> (séparateur point-virgule)
                  </p>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => setShowImportForm(false)}
                      style={{ padding:'8px 14px', borderRadius:7, border:'1.5px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                      Annuler
                    </button>
                    <button onClick={() => csvRef.current?.click()} disabled={importingCSV}
                      style={{ padding:'8px 16px', borderRadius:7, border:'none', background:'linear-gradient(135deg,#F4B315,#E59312)', color:'#1A141A', fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                      <Upload size={12} /> {importingCSV ? 'Import...' : 'Choisir le fichier CSV'}
                    </button>
                    <input ref={csvRef} type="file" accept=".csv,.txt" style={{ display:'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleImportCSV(f); }} />
                  </div>
                </div>
              )}

              {showImportPdfForm && (
                <div style={{ ...cardStyle, marginBottom:16, background:'#FFFDF5', border:'1.5px solid #F4B315' }}>
                  <h4 style={{ fontSize:13, fontWeight:700, marginBottom:14, color:'#1A141A' }}>Importer un relevé PDF / Scan</h4>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:12, marginBottom:12 }}>
                    {[
                      { label:'Banque', key:'bank_name', placeholder:'CIH, Attijariwafa...' },
                      { label:'Compte', key:'account', placeholder:'N° compte' },
                      { label:'Debut période', key:'period_from', type:'date' },
                      { label:'Fin période', key:'period_to', type:'date' },
                    ].map(f => (
                      <div key={f.key}>
                        <label style={{ display:'block', fontSize:10, fontWeight:700, color:'#8E5915', textTransform:'uppercase', marginBottom:4 }}>{f.label}</label>
                        <input type={f.type || 'text'} placeholder={f.placeholder || ''} value={(pdfForm as any)[f.key]}
                          onChange={e => setPdfForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                          style={{ width:'100%', padding:'8px 10px', borderRadius:7, border:'1.5px solid #E8D4B0', fontSize:12, outline:'none', boxSizing:'border-box' }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => setShowImportPdfForm(false)}
                      style={{ padding:'8px 14px', borderRadius:7, border:'1.5px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                      Annuler
                    </button>
                    <button onClick={() => pdfRef.current?.click()} disabled={importingPDF}
                      style={{ padding:'8px 16px', borderRadius:7, border:'none', background:'linear-gradient(135deg,#F4B315,#E59312)', color:'#1A141A', fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6, opacity: importingPDF ? 0.7 : 1 }}>
                      <Upload size={12} /> {importingPDF ? 'Import en cours...' : 'Choisir PDF / Image'}
                    </button>
                    <input ref={pdfRef} type="file" accept="image/*,.pdf,application/pdf,application/octet-stream" style={{ display:'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) { setImportingPDF(true); handleImportPDF(f); } }} />
                  </div>
                </div>
              )}

              {loadingStmt ? <p className="text-center py-8 text-honey-caramel">Chargement...</p> : statements.length === 0 ? (
                <div style={{ ...cardStyle, textAlign:'center', padding:'48px 20px' }}>
                  <Building2 size={40} style={{ margin:'0 auto 12px', color:'#D3AF85' }} />
                  <p style={{ fontSize:14, fontWeight:600, color:'#8E5915' }}>Aucun relevé bancaire importe</p>
                  <p style={{ fontSize:12, color:'#B8A090', marginTop:4 }}>Importez un fichier CSV de votre banque pour analyser vos transactions</p>
                </div>
              ) : (
                <div style={{ display:'grid', gap:10 }}>
                  {statements.map(stmt => (
                    <div key={stmt.id}
                      style={{ ...cardStyle, display:'flex', justifyContent:'space-between', alignItems:'center', transition:'all 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor='#F4B315')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor='#F5E6D3')}>
                      <div style={{ flex:1, cursor:'pointer' }} onClick={() => openStatement(stmt)}>
                        <p style={{ fontSize:13, fontWeight:700, color:'#1A141A', margin:'0 0 4px' }}>
                          {stmt.bank_name || 'Banque'} — {stmt.account || ''}
                        </p>
                        <p style={{ fontSize:11, color:'#8E5915', margin:0 }}>
                          {formatDate(stmt.period_from)} → {formatDate(stmt.period_to)} &bull; {stmt._count?.lines || 0} transactions
                        </p>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                        {stmt.file_url && (
                          <>
                            <button
                              onClick={e => { e.stopPropagation(); setViewReleve(stmt.file_url); }}
                              title="Voir le relevé"
                              style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:7, border:'none', background:'linear-gradient(135deg,#F4B315,#E59312)', color:'#1A141A', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                              Voir
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); downloadFile(stmt.file_url, stmt.bank_name || 'releve'); }}
                              title="Télécharger le relevé PDF"
                              style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:7, border:'1px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                              <Download size={12}/> PDF
                            </button>
                          </>
                        )}
                        <button onClick={async e => {
                          e.stopPropagation();
                          if (!confirm('Supprimer ce relevé ?')) return;
                          try { await api.delete(`/rapprochement/statements/${stmt.id}`); loadReleves(false); }
                          catch { alert('Erreur suppression'); }
                        }} style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'6px 8px', borderRadius:7, border:'1px solid #FECACA', background:'white', color:'#DC2626', fontSize:13, cursor:'pointer' }} title="Supprimer">
                          🗑
                        </button>
                        <ChevronRight size={18} color="#D3AF85" style={{ cursor:'pointer' }} onClick={() => openStatement(stmt)} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* Detail relevé */
            <div>
              <button onClick={() => { setSelectedStmt(null); setStmtSummary(null); setStmtLines([]); }}
                style={{ marginBottom:16, padding:'7px 14px', borderRadius:7, border:'1.5px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:12, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                &larr; Retour aux relevés
              </button>

              <h3 style={{ fontSize:15, fontWeight:700, color:'#1A141A', marginBottom:16 }}>
                {selectedStmt.bank_name} — {formatDate(selectedStmt.period_from)} au {formatDate(selectedStmt.period_to)}
              </h3>

              {/* KPIs relevé */}
              <div className="grid grid-cols-4 gap-3 mb-5">
                {[
                  { label: 'Total crédits', value: fmt(totalCredits), color: '#10B981' },
                  { label: 'Total debits', value: fmt(totalDebits), color: '#EF4444' },
                  { label: 'Factures manquantes', value: missingInvoices.length, color: '#F97316' },
                  { label: 'Transactions', value: stmtLines.length, color: '#F4B315' },
                ].map(k => (
                  <div key={k.label} style={kpiStyle}>
                    <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:'#8E5915', marginBottom:6 }}>{k.label}</p>
                    <p style={{ fontSize:20, fontWeight:800, color:k.color, fontFamily:'monospace', margin:0 }}>{k.value}</p>
                    <p style={{ fontSize:10, color:'#B8A090' }}>MAD</p>
                  </div>
                ))}
              </div>

              {/* Filtres */}
              <div className="flex gap-2 mb-4">
                {[['','Toutes'],['CREDIT','Encaissements'],['DEBIT','Dépenses'],['UNMATCHED','Factures manquantes']].map(([v, l]) => (
                  <button key={v} onClick={() => setLineFilter(v)}
                    style={{ padding:'6px 14px', borderRadius:7, fontSize:11, fontWeight:700, cursor:'pointer', border:'none',
                      background: lineFilter === v ? (v === 'UNMATCHED' ? '#FEF2F2' : '#F4B315') : '#F5E6D3',
                      color: lineFilter === v ? (v === 'UNMATCHED' ? '#DC2626' : '#1A141A') : '#8E5915' }}>
                    {l} {v === 'UNMATCHED' && missingInvoices.length > 0 && `(${missingInvoices.length})`}
                  </button>
                ))}
              </div>

              <div style={cardStyle}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                  <thead><tr style={{ background:'linear-gradient(135deg,#8E5915,#B8730A)', color:'white' }}>
                    {['Date','Libelle','Debit','Credit','Statut'].map(h => (
                      <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:9, fontWeight:600, textTransform:'uppercase' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {filteredLines.map(l => (
                      <tr key={l.id} style={{ borderBottom:'1px solid #F5E6D3', background: l.match_status === 'UNMATCHED' || l.match_status === 'NO_INVOICE' ? '#FFF7F0' : 'white' }}>
                        <td style={{ padding:'8px 12px', color:'#1A141A' }}>{formatDate(l.date)}</td>
                        <td style={{ padding:'8px 12px', color:'#1A141A', maxWidth:260, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.description}</td>
                        <td style={{ padding:'8px 12px', fontFamily:'monospace', fontWeight:600, color: !l.is_credit ? '#EF4444' : '#B8A090' }}>
                          {!l.is_credit ? `${fmt(Number(l.amount))} MAD` : '-'}
                        </td>
                        <td style={{ padding:'8px 12px', fontFamily:'monospace', fontWeight:600, color: l.is_credit ? '#10B981' : '#B8A090' }}>
                          {l.is_credit ? `${fmt(Number(l.amount))} MAD` : '-'}
                        </td>
                        <td style={{ padding:'8px 12px' }}>
                          <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:4,
                            background: l.match_status === 'MATCHED' ? '#F0FFF4' : l.match_status === 'UNMATCHED' ? '#FEF9E9' : '#FEF2F2',
                            color: l.match_status === 'MATCHED' ? '#16A34A' : l.match_status === 'UNMATCHED' ? '#D97706' : '#DC2626',
                            border: `1px solid ${l.match_status === 'MATCHED' ? '#86EFAC' : l.match_status === 'UNMATCHED' ? '#FDE68A' : '#FECACA'}` }}>
                            {l.match_status === 'MATCHED' ? 'Rapproche' : l.match_status === 'NO_INVOICE' ? 'Sans facture' : 'Non rapproche'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {filteredLines.length === 0 && <tr><td colSpan={5} style={{ padding:'24px', textAlign:'center', color:'#8E5915' }}>Aucune transaction</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======== TAB DEPENSES ======== */}
      {tab === 'dépenses' && (
        <div>
          {/* Filtre mois */}
          <div className="flex gap-2 mb-5 flex-wrap items-center">
            <span style={{ fontSize:12, fontWeight:700, color:'#8E5915' }}>Periode :</span>
            <button onClick={() => setDepMonth(0)}
              style={{ padding:'5px 12px', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer', border:'none', background: depMonth === 0 ? '#F4B315' : '#F5E6D3', color: depMonth === 0 ? '#1A141A' : '#8E5915' }}>
              Annee {year}
            </button>
            {MONTHS.map((m, i) => (
              <button key={i} onClick={() => setDepMonth(i + 1)}
                style={{ padding:'5px 10px', borderRadius:6, fontSize:11, fontWeight:700, cursor:'pointer', border:'none', background: depMonth === i+1 ? '#F4B315' : '#F5E6D3', color: depMonth === i+1 ? '#1A141A' : '#8E5915' }}>
                {m}
              </button>
            ))}
          </div>

          {loadingDep ? <p className="text-center py-12 text-honey-caramel">Chargement...</p> : (
            <>
              {/* KPIs */}
              {depStats && (
                <div className="grid grid-cols-3 gap-4 mb-6">
                  {[
                    { label: 'Total dépenses', value: fmt(depStats.total_amount || 0), color: '#EF4444' },
                    { label: 'Approuvees', value: fmt(depStats.approved_amount || 0), color: '#10B981' },
                    { label: 'En attente', value: depStats.pending_count || 0, color: '#F97316' },
                  ].map(k => (
                    <div key={k.label} style={kpiStyle}>
                      <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:'#8E5915', marginBottom:8 }}>{k.label}</p>
                      <p style={{ fontSize:22, fontWeight:800, color:k.color, fontFamily:'monospace', margin:0 }}>{k.value}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-5">
                {/* Par catégorie */}
                <div style={cardStyle}>
                  <h3 style={{ fontSize:13, fontWeight:700, color:'#1A141A', marginBottom:14 }}>Par categorie</h3>
                  {depStats?.by_category?.length > 0 ? (
                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                      {depStats.by_category
                        .sort((a: any, b: any) => b.amount - a.amount)
                        .map((cat: any) => {
                          const pct = depStats.total_amount > 0 ? (cat.amount / depStats.total_amount) * 100 : 0;
                          const color = CATEGORY_COLORS[cat.category] || '#94A3B8';
                          return (
                            <div key={cat.category}>
                              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                                <span style={{ fontSize:11, fontWeight:700, color:'#1A141A' }}>
                                  {CATEGORY_LABELS[cat.category] || cat.category}
                                </span>
                                <span style={{ fontSize:11, fontFamily:'monospace', fontWeight:700, color:'#1A141A' }}>
                                  {fmt(cat.amount)} MAD <span style={{ color:'#8E5915', fontWeight:400 }}>({pct.toFixed(0)}%)</span>
                                </span>
                              </div>
                              <div style={{ height:8, borderRadius:4, background:'#F5E6D3', overflow:'hidden' }}>
                                <div style={{ height:'100%', borderRadius:4, background:color, width:`${pct}%`, transition:'width 0.6s ease' }} />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  ) : <p style={{ fontSize:12, color:'#8E5915', textAlign:'center', padding:'20px 0' }}>Aucune donnee</p>}
                </div>

                {/* Par projet (espèces) */}
                <div style={cardStyle}>
                  <h3 style={{ fontSize:13, fontWeight:700, color:'#1A141A', marginBottom:14 }}>Par chantier</h3>
                  {depByProject.length > 0 ? (
                    <div style={{ maxHeight:400, overflowY:'auto', display:'flex', flexDirection:'column', gap:8 }}>
                      {depByProject.map((proj: any) => (
                        <div key={proj.name} style={{ background:'#FFFDF5', border:'1px solid #F5E6D3', borderRadius:8, padding:'10px 14px' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                            <span style={{ fontSize:12, fontWeight:700, color:'#1A141A' }}>{proj.name}</span>
                            <span style={{ fontSize:12, fontFamily:'monospace', fontWeight:700, color:'#1A141A' }}>{fmt(proj.total)} MAD</span>
                          </div>
                          <div style={{ display:'flex', gap:12 }}>
                            <span style={{ fontSize:10, color:'#8E5915' }}>
                              {proj.items.length} depense{proj.items.length > 1 ? 's' : ''}
                            </span>
                            {proj.especes > 0 && (
                              <span style={{ fontSize:10, fontWeight:700, color:'#DC2626', background:'#FEF2F2', padding:'1px 6px', borderRadius:4, border:'1px solid #FECACA' }}>
                                Especes: {fmt(proj.especes)} MAD
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p style={{ fontSize:12, color:'#8E5915', textAlign:'center', padding:'20px 0' }}>Aucune depense</p>}
                </div>
              </div>
            </>
          )}
        </div>
      )}
      {/* ======== VIEWER PLEIN ECRAN ======== */}
      {viewReleve && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:1000, display:'flex', flexDirection:'column' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 20px', background:'#1A141A', flexShrink:0 }}>
            <span style={{ color:'white', fontWeight:700, fontSize:14 }}>Relevé bancaire</span>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => downloadFile(viewReleve, 'releve')}
                style={{ padding:'7px 16px', borderRadius:7, border:'none', background:'#F4B315', color:'#1A141A', fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
                <Download size={13}/> Télécharger
              </button>
              <button onClick={() => setViewReleve(null)}
                style={{ padding:'7px 16px', borderRadius:7, border:'none', background:'#EF4444', color:'white', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                ✕ Fermer
              </button>
            </div>
          </div>
          <div style={{ flex:1, overflow:'auto', display:'flex', justifyContent:'center', alignItems:'flex-start', padding:20 }}>
            {viewReleve.toLowerCase().match(/\.(jpe?g|png|webp|gif)/) ? (
              <img src={viewReleve} alt="releve" style={{ maxWidth:'100%', maxHeight:'calc(100vh - 100px)', objectFit:'contain', borderRadius:8, boxShadow:'0 4px 32px rgba(0,0,0,0.5)' }} />
            ) : (
              <iframe src={viewReleve} style={{ width:'100%', height:'calc(100vh - 100px)', border:'none', borderRadius:8, background:'white' }} title="Relevé bancaire" />
            )}
          </div>
        </div>
      )}

      {/* ======== TAB ENCAISSEMENTS ======== */}
      {tab === 'encaissements' && (
        <div>
          {loadingEnc ? <p className="text-center py-12 text-honey-caramel">Chargement...</p> : (
            <>
              {/* KPIs rapides */}
              {(() => {
                const total   = encInvoices.reduce((s,i) => s + Number(i.total_ttc||0), 0);
                const encaisse = encInvoices.filter(i=>i.status==='PAID').reduce((s,i) => s + Number(i.total_ttc||0), 0);
                const partiel  = encInvoices.filter(i=>i.status==='PARTIAL').reduce((s,i) => s + Number(i.amount_paid||0), 0);
                const creance  = encInvoices.filter(i=>['SENT','PARTIAL','OVERDUE'].includes(i.status)).reduce((s,i) => s + Number(i.balance||0), 0);
                return (
                  <div className="grid grid-cols-4 gap-3 mb-5">
                    {[
                      { label:'CA facture TTC',     value:fmt(total),    color:'#F4B315' },
                      { label:'Totalement encaisse', value:fmt(encaisse), color:'#10B981' },
                      { label:'Partiellement paye',  value:fmt(partiel),  color:'#F97316' },
                      { label:'Restant a encaisser', value:fmt(creance),  color:'#EF4444' },
                    ].map(k => (
                      <div key={k.label} style={kpiStyle}>
                        <p style={{fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:0.5,color:'#8E5915',marginBottom:6}}>{k.label}</p>
                        <p style={{fontSize:18,fontWeight:800,color:k.color,fontFamily:'monospace',margin:0}}>{k.value} MAD</p>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {!selectedInv ? (
                /* ── Liste groupée par client ── */
                <div>
                  {(() => {
                    // Group by client
                    const byClient: Record<string, any> = {};
                    encInvoices.forEach(inv => {
                      const key = inv.client?.commercial_name || 'Client inconnu';
                      if (!byClient[key]) byClient[key] = { name:key, invoices:[], total:0, paid:0, balance:0 };
                      byClient[key].invoices.push(inv);
                      byClient[key].total   += Number(inv.total_ttc||0);
                      byClient[key].paid    += Number(inv.amount_paid||0);
                      byClient[key].balance += Number(inv.balance||0);
                    });
                    return Object.values(byClient).sort((a:any,b:any) => b.balance - a.balance).map((cl:any) => (
                      <div key={cl.name} style={{ marginBottom:12 }}>
                        {/* Client header */}
                        <div style={{ background:'linear-gradient(135deg,#F4B315,#E59312)', borderRadius:'10px 10px 0 0', padding:'10px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <span style={{fontWeight:800,fontSize:13,color:'#1A141A'}}>{cl.name}</span>
                          <div style={{display:'flex',gap:16,fontSize:11,fontFamily:'monospace'}}>
                            <span style={{color:'#1A141A'}}><strong>{fmt(cl.total)}</strong> MAD facturé</span>
                            <span style={{color:'#145214'}}><strong>{fmt(cl.paid)}</strong> MAD encaissé</span>
                            <span style={{color:cl.balance>0?'#7A0000':'#145214',fontWeight:800}}>{fmt(cl.balance)} MAD restant</span>
                          </div>
                        </div>
                        {/* Invoices */}
                        <div style={{border:'1.5px solid #F5E6D3',borderTop:'none',borderRadius:'0 0 10px 10px',overflow:'hidden'}}>
                          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                            <thead><tr style={{background:'#FDF6E9'}}>
                              {['Facture','Chantier / Objet','Date','Montant TTC','Encaisse','Reste','Statut','Action'].map(h=>(
                                <th key={h} style={{padding:'7px 12px',textAlign:'left',fontSize:9,fontWeight:700,color:'#8E5915',textTransform:'uppercase',borderBottom:'1px solid #F5E6D3'}}>{h}</th>
                              ))}
                            </tr></thead>
                            <tbody>
                              {cl.invoices.map((inv:any,i:number) => {
                                const isPaid    = inv.status==='PAID';
                                const isPartial = inv.status==='PARTIAL';
                                const isOverdue = inv.status==='OVERDUE';
                                const statBg    = isPaid?'#F0FDF4':isPartial?'#FFF7ED':isOverdue?'#FFF5F5':'#FFFBEB';
                                const statColor = isPaid?'#16A34A':isPartial?'#EA580C':isOverdue?'#DC2626':'#D97706';
                                const statLabel = isPaid?'Paye':isPartial?'Partiel':isOverdue?'En retard':'En attente';
                                return (
                                  <tr key={inv.id} style={{borderBottom:'1px solid #F5E6D3',background:i%2===0?'white':'#FFFDF7'}}>
                                    <td style={{padding:'9px 12px',fontFamily:'monospace',fontWeight:700,color:'#1A141A'}}>{inv.number}</td>
                                    <td style={{padding:'9px 12px',color:'#8E5915',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                                      {inv.bl?.number || inv.bc?.number || inv.notes || '-'}
                                    </td>
                                    <td style={{padding:'9px 12px',color:'#8E5915',whiteSpace:'nowrap'}}>{new Date(inv.issue_date).toLocaleDateString('fr-FR')}</td>
                                    <td style={{padding:'9px 12px',fontFamily:'monospace',fontWeight:700,color:'#1A141A'}}>{fmt(Number(inv.total_ttc||0))}</td>
                                    <td style={{padding:'9px 12px',fontFamily:'monospace',color:'#10B981',fontWeight:700}}>{fmt(Number(inv.amount_paid||0))}</td>
                                    <td style={{padding:'9px 12px',fontFamily:'monospace',fontWeight:800,color:Number(inv.balance)>0?'#EF4444':'#10B981'}}>{fmt(Number(inv.balance||0))}</td>
                                    <td style={{padding:'9px 12px'}}>
                                      <span style={{fontSize:9,padding:'2px 8px',borderRadius:20,background:statBg,color:statColor,border:`1px solid ${statColor}40`,fontWeight:700}}>{statLabel}</span>
                                    </td>
                                    <td style={{padding:'9px 12px'}}>
                                      <button onClick={() => openInvoiceDetail(inv)}
                                        style={{padding:'5px 12px',borderRadius:7,border:'1.5px solid #E8D4B0',background:'white',color:'#8E5915',fontSize:11,fontWeight:700,cursor:'pointer'}}>
                                        Historique
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              ) : (
                /* ── Détail facture + paiements ── */
                <div>
                  <button onClick={() => { setSelectedInv(null); setInvDetail(null); setShowPayForm(false); setPaySuccess(''); setPayError(''); }}
                    style={{marginBottom:16,padding:'7px 14px',borderRadius:7,border:'1.5px solid #E8D4B0',background:'white',color:'#8E5915',fontSize:12,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
                    ← Retour aux encaissements
                  </button>

                  {loadingDetail ? <p className="text-center py-8 text-honey-caramel">Chargement...</p> : invDetail && (
                    <>
                      {/* Header facture */}
                      <div style={{background:'linear-gradient(135deg,#F4B315,#E59312)',borderRadius:12,padding:'16px 20px',marginBottom:16,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                        <div>
                          <p style={{margin:0,fontSize:18,fontWeight:900,color:'#1A141A'}}>{invDetail.number}</p>
                          <p style={{margin:'2px 0 0',fontSize:12,color:'#5A3A00'}}>{invDetail.client?.commercial_name}</p>
                        </div>
                        <div style={{textAlign:'right'}}>
                          <p style={{margin:0,fontSize:22,fontWeight:900,fontFamily:'monospace',color:'#1A141A'}}>{fmt(Number(invDetail.total_ttc||0))} MAD</p>
                          <p style={{margin:'2px 0 0',fontSize:11,color:'#5A3A00'}}>
                            Encaisse: <strong>{fmt(Number(invDetail.amount_paid||0))} MAD</strong> &nbsp;|&nbsp; Reste: <strong style={{color:Number(invDetail.balance)>0?'#7A0000':'#145214'}}>{fmt(Number(invDetail.balance||0))} MAD</strong>
                          </p>
                        </div>
                      </div>

                      {/* KPIs facture */}
                      <div className="grid grid-cols-4 gap-3 mb-4">
                        {[
                          { label:'Total TTC',    value:fmt(Number(invDetail.total_ttc||0))+' MAD',    color:'#F4B315' },
                          { label:'Acompte',      value:fmt(Number(invDetail.acompte_amount||0))+' MAD', color:'#8B5CF6' },
                          { label:'Encaisse',     value:fmt(Number(invDetail.amount_paid||0))+' MAD',   color:'#10B981' },
                          { label:'Solde restant',value:fmt(Number(invDetail.balance||0))+' MAD',       color:Number(invDetail.balance)>0?'#EF4444':'#10B981' },
                        ].map(k=>(
                          <div key={k.label} style={kpiStyle}>
                            <p style={{fontSize:9,fontWeight:700,textTransform:'uppercase',color:'#8E5915',marginBottom:6}}>{k.label}</p>
                            <p style={{fontSize:16,fontWeight:800,color:k.color,fontFamily:'monospace',margin:0}}>{k.value}</p>
                          </div>
                        ))}
                      </div>

                      {/* Historique paiements */}
                      <div style={cardStyle}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
                          <h3 style={{fontSize:13,fontWeight:700,color:'#1A141A',margin:0}}>Historique des paiements ({(invDetail.payments||[]).length})</h3>
                          {invDetail.status !== 'PAID' && (
                            <button onClick={() => { setShowPayForm(v=>!v); setPayError(''); setPaySuccess(''); }}
                              style={{padding:'8px 18px',borderRadius:8,border:'none',background:'linear-gradient(135deg,#F4B315,#E59312)',color:'#1A141A',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                              + Enregistrer un paiement
                            </button>
                          )}
                        </div>

                        {paySuccess && (
                          <div style={{padding:'10px 14px',borderRadius:8,background:'#F0FDF4',border:'1px solid #BBF7D0',fontSize:12,color:'#16A34A',fontWeight:600,marginBottom:12}}>✓ {paySuccess}</div>
                        )}

                        {/* Formulaire paiement */}
                        {showPayForm && (
                          <div style={{background:'#FFFDF5',border:'1.5px solid #F4B315',borderRadius:10,padding:16,marginBottom:16}}>
                            <p style={{margin:'0 0 12px',fontSize:12,fontWeight:700,color:'#1A141A'}}>Nouveau paiement — Reste à encaisser : <span style={{color:'#EF4444'}}>{fmt(Number(invDetail.balance||0))} MAD</span></p>
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:12,marginBottom:12}}>
                              <div>
                                <label style={{display:'block',fontSize:10,fontWeight:700,color:'#8E5915',textTransform:'uppercase',marginBottom:4}}>Montant (MAD) *</label>
                                <input type="number" value={payForm.amount} onChange={e=>setPayForm(f=>({...f,amount:e.target.value}))}
                                  placeholder={fmt(Number(invDetail.balance||0))}
                                  style={{width:'100%',padding:'8px 10px',borderRadius:7,border:'1.5px solid #E8D4B0',fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                              </div>
                              <div>
                                <label style={{display:'block',fontSize:10,fontWeight:700,color:'#8E5915',textTransform:'uppercase',marginBottom:4}}>Mode de paiement</label>
                                <select value={payForm.type} onChange={e=>setPayForm(f=>({...f,type:e.target.value}))}
                                  style={{width:'100%',padding:'8px 10px',borderRadius:7,border:'1.5px solid #E8D4B0',fontSize:12,outline:'none',boxSizing:'border-box'}}>
                                  <option value="VIREMENT">Virement</option>
                                  <option value="CHEQUE">Chèque</option>
                                  <option value="ESPECES">Espèces</option>
                                  <option value="EFFET">Effet</option>
                                  <option value="AUTRE">Autre</option>
                                </select>
                              </div>
                              <div>
                                <label style={{display:'block',fontSize:10,fontWeight:700,color:'#8E5915',textTransform:'uppercase',marginBottom:4}}>Date</label>
                                <input type="date" value={payForm.date} onChange={e=>setPayForm(f=>({...f,date:e.target.value}))}
                                  style={{width:'100%',padding:'8px 10px',borderRadius:7,border:'1.5px solid #E8D4B0',fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                              </div>
                              <div>
                                <label style={{display:'block',fontSize:10,fontWeight:700,color:'#8E5915',textTransform:'uppercase',marginBottom:4}}>Référence</label>
                                <input value={payForm.reference} onChange={e=>setPayForm(f=>({...f,reference:e.target.value}))}
                                  placeholder="N° chèque, virement..."
                                  style={{width:'100%',padding:'8px 10px',borderRadius:7,border:'1.5px solid #E8D4B0',fontSize:12,outline:'none',boxSizing:'border-box'}}/>
                              </div>
                            </div>
                            {payError && <p style={{fontSize:11,color:'#DC2626',marginBottom:8}}>{payError}</p>}
                            <div style={{display:'flex',gap:8}}>
                              <button onClick={() => { setShowPayForm(false); setPayError(''); }}
                                style={{padding:'8px 16px',borderRadius:7,border:'1.5px solid #E8D4B0',background:'white',color:'#8E5915',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                                Annuler
                              </button>
                              <button onClick={handlePay} disabled={payLoading || !payForm.amount}
                                style={{padding:'8px 20px',borderRadius:7,border:'none',background:'linear-gradient(135deg,#F4B315,#E59312)',color:'#1A141A',fontSize:12,fontWeight:700,cursor:'pointer',opacity:payLoading?0.7:1}}>
                                {payLoading ? 'Enregistrement...' : 'Confirmer le paiement'}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Liste paiements */}
                        {(invDetail.payments||[]).length === 0 ? (
                          <p style={{textAlign:'center',padding:'24px 0',color:'#8E5915',fontSize:12}}>Aucun paiement enregistré</p>
                        ) : (
                          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                            <thead><tr style={{background:'#FDF6E9'}}>
                              {['Date','Montant','Mode','Référence','Statut'].map(h=>(
                                <th key={h} style={{padding:'7px 12px',textAlign:'left',fontSize:9,fontWeight:700,color:'#8E5915',textTransform:'uppercase',borderBottom:'1px solid #F5E6D3'}}>{h}</th>
                              ))}
                            </tr></thead>
                            <tbody>
                              {[...(invDetail.payments||[])].sort((a:any,b:any)=>new Date(b.date).getTime()-new Date(a.date).getTime()).map((p:any,i:number)=>(
                                <tr key={p.id} style={{borderBottom:'1px solid #F5E6D3',background:i%2===0?'white':'#FFFDF7'}}>
                                  <td style={{padding:'9px 12px',color:'#1A141A'}}>{new Date(p.date).toLocaleDateString('fr-FR')}</td>
                                  <td style={{padding:'9px 12px',fontFamily:'monospace',fontWeight:800,color:'#10B981'}}>{fmt(Number(p.amount||0))} MAD</td>
                                  <td style={{padding:'9px 12px',color:'#1A141A'}}>{p.type||'—'}</td>
                                  <td style={{padding:'9px 12px',color:'#8E5915',fontFamily:'monospace'}}>{p.reference||'—'}</td>
                                  <td style={{padding:'9px 12px'}}>
                                    <span style={{fontSize:9,fontWeight:700,padding:'2px 7px',borderRadius:4,background:'#F0FFF4',color:'#16A34A',border:'1px solid #86EFAC'}}>Reçu</span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
