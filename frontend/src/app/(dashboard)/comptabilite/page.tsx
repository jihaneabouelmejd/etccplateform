'use client';

import { useState, useEffect, useRef } from 'react';
import { FileText, Download, TrendingUp, TrendingDown, Building2, Camera, ExternalLink, Eye, RefreshCw, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { useLanguage } from '@/lib/i18n';
import { invoicesApi, depensesApi, comptaApi } from '@/lib/api';
import PDFButton from '@/components/ui/PDFButton';
import FileViewerModal from '@/components/ui/FileViewerModal';
import { formatCurrency, formatDate, cn } from '@/lib/utils';

const MONTHS = ['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Aout','Septembre','Octobre','Novembre','Decembre'];

function isCloudinaryUrl(url: string) {
  return url.includes('cloudinary.com');
}

// Proxy backend : évite le 401 Cloudinary en passant par notre API authentifiée
function proxyDownloadUrl(url: string): string {
  return `/api/upload/proxy?url=${encodeURIComponent(url)}&dl=1`;
}

/** Téléchargement forcé via blob — contourne target=_blank + download ignoré par les navigateurs */
async function downloadFile(url: string, filename = 'document') {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    const fetchUrl = isCloudinaryUrl(url) ? proxyDownloadUrl(url) : url;
    const res = await fetch(fetchUrl, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const blob = await res.blob();
    const ext  = url.toLowerCase().endsWith('.pdf') ? '.pdf'
               : url.toLowerCase().match(/\.(jpe?g|png|webp|gif)/) ? ('.' + url.split('.').pop()) : '';
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = filename + ext;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objUrl);
  } catch (e) {
    console.error('Download failed', e);
    // Fallback : ouvrir via le proxy pour éviter le 401 Cloudinary
    window.open(isCloudinaryUrl(url) ? proxyDownloadUrl(url).replace('&dl=1','') : url, '_blank');
  }
}

/** URL avec dl=1 (pour les liens <a> non-JavaScript) */
function dlUrl(url?: string | null): string {
  if (!url) return '#';
  return url.includes('?') ? url + '&dl=1' : url + '?dl=1';
}

function fmt(n: number) {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

const DEP_LABELS: Record<string,string> = {
  MATERIEL:'Materiaux', MAIN_OEUVRE:"Main d'oeuvre", TRANSPORT:'Transport',
  CARBURANT:'Carburant', OUTILS:'Outillage', SOUS_TRAITANCE:'Sous-traitance', AUTRE:'Autre',
};
const DEP_COLORS: Record<string,string> = {
  MATERIEL:'#F4B315', MAIN_OEUVRE:'#3B82F6', TRANSPORT:'#10B981',
  CARBURANT:'#EF4444', OUTILS:'#8B5CF6', SOUS_TRAITANCE:'#F97316', AUTRE:'#94A3B8',
};

const statusLabel: Record<string, { label: string; bg: string; color: string; border: string }> = {
  DRAFT:    { label:'Brouillon', bg:'#F1F5F9', color:'#64748B', border:'#CBD5E1' },
  SENT:     { label:'Envoyee',   bg:'#FFFBEB', color:'#D97706', border:'#FDE68A' },
  PAID:     { label:'Payee',     bg:'#F0FDF4', color:'#16A34A', border:'#BBF7D0' },
  PARTIAL:  { label:'Partielle', bg:'#FFF7ED', color:'#EA580C', border:'#FDBA74' },
  OVERDUE:  { label:'En retard', bg:'#FFF5F5', color:'#DC2626', border:'#FECACA' },
  CANCELLED:{ label:'Annulee',   bg:'#F1F5F9', color:'#94A3B8', border:'#E2E8F0' },
};

export default function ComptabilitePage() {
  const [tab, setTab] = useState<'factures'|'releves'|'tva'>('factures');
  const year = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [issuedList, setIssuedList]   = useState<any[]>([]);
  const [purchaseList, setPurchaseList] = useState<any[]>([]);
  const [dépenses, setDépenses]       = useState<any[]>([]);
  const [depStats, setDepStats]       = useState<any>(null);
  const [loadingFact, setLoadingFact] = useState(false);
  const [factDir, setFactDir]         = useState<'all'|'ISSUED'|'RECEIVED'>('all');
  const [factSearch, setFactSearch]   = useState('');
  const [showScansModal, setShowScansModal] = useState(false);
  const [scansSource, setScansSource] = useState<'issued'|'purchase'>('issued');

  const [statements, setStatements]   = useState<any[]>([]);
  const [loadingStmt, setLoadingStmt] = useState(false);
  const [viewReleve, setViewReleve]   = useState<string|null>(null);
  const [importingPDF, setImportingPDF] = useState(false);
  const [importStep, setImportStep]   = useState('');
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState('');
  const [csvForm, setCsvForm]         = useState({ bank_name:'', period_from:`${year}-01-01`, period_to:`${year}-12-31` });
  const fileRef = useRef<HTMLInputElement>(null);

  const [tvaData, setTvaData]         = useState<any[]>([]);
  const [loadingTva, setLoadingTva]   = useState(false);

  useEffect(() => {
    if (tab === 'factures') loadAll();
    // silent si données déjà là, avec spinner si liste vide
    if (tab === 'releves') loadReleves(statements.length > 0);
    if (tab === 'tva') loadTVA();
  }, [tab]);

  // Auto-reload relevés si importé depuis comptabilité-interne
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'releves_updated') loadReleves(true);
    };
    window.addEventListener('storage', handleStorage);
    // Vérifier au montage si un import a eu lieu
    const lastUpdate = localStorage.getItem('releves_updated');
    if (lastUpdate) loadReleves(true);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  /* ── suppression facture ────────────────────────── */
  const handleDeleteInvoice = async (inv: any) => {
    const isCancelled = inv.status === 'CANCELLED';
    const msg = isCancelled
      ? `Supprimer définitivement la facture ${inv.number} ? Cette action est irréversible.`
      : `Supprimer la facture ${inv.number} ? Elle sera déplacée dans la corbeille (annulée).`;
    if (!confirm(msg)) return;
    try {
      if (isCancelled) await invoicesApi.hardDelete(inv.id);
      else await invoicesApi.cancel(inv.id);
      await loadAll();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Erreur lors de la suppression');
    }
  };

  /* ── loaders ─────────────────────────────────── */
  const loadAll = async () => {
    setLoadingFact(true);
    try {
      const [is, pu, dep, depSt] = await Promise.all([
        invoicesApi.list({ direction:'ISSUED',   page:1 }),
        invoicesApi.list({ direction:'RECEIVED', page:1 }),
        depensesApi.list({ year, limit:500 }),
        depensesApi.stats({ year }),
      ]);
      setIssuedList(is.data.data   || []);
      setPurchaseList(pu.data.data || []);
      setDépenses(dep.data.data || dep.data || []);
      setDepStats(depSt.data || null);
    } catch(e){ console.error(e); }
    finally { setLoadingFact(false); }
  };

  const CACHE_KEY = 'releves_list_cache';
  const saveCache = (list: any[]) => { try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(list)); } catch {} };
  const loadCache = (): any[] => { try { const c = sessionStorage.getItem(CACHE_KEY); return c ? JSON.parse(c) : []; } catch { return []; } };

  const loadReleves = async (silent = false) => {
    // Afficher le cache immédiatement si on n'a pas de données
    if (statements.length === 0) {
      const cached = loadCache();
      if (cached.length > 0) setStatements(cached);
    }
    if (!silent) setLoadingStmt(true);
    try {
      const r = await comptaApi.rapprochementStatements();
      const list = Array.isArray(r.data) ? r.data : (r.data?.data || []);
      if (list.length > 0 || !silent) {
        setStatements(list);
        saveCache(list);
      }
    } catch(e){
      console.error('[loadReleves]', e);
      if (statements.length === 0) {
        const cached = loadCache();
        if (cached.length > 0) setStatements(cached);
      }
    }
    finally { setLoadingStmt(false); }
  };

  const loadTVA = async () => {
    setLoadingTva(true);
    try {
      const results = await Promise.all(
        Array.from({ length:12 }, (_,i) => i+1).map(m =>
          invoicesApi.stats(m, year).then(r => ({ month:m, ...r.data })).catch(() => ({ month:m }))
        )
      );
      setTvaData(results);
    } finally { setLoadingTva(false); }
  };

  /* ── import PDF relevé ─────────────────────────── */
  const handleRelevePDF = async (file: File) => {
    setImportError(''); setImportSuccess('');
    try {
      // Step 1: upload file
      setImportStep('Upload du fichier...');
      const fd = new FormData();
      fd.append('file', file);
      let upRes: any;
      try {
        upRes = await api.post('/upload', fd);  // laisser Axios gérer le Content-Type multipart
      } catch(e: any) {
        const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || 'erreur réseau';
        const status = e?.response?.status ? ` (HTTP ${e.response.status})` : '';
        throw new Error(`Upload échoué${status} : ${msg}`);
      }

      const d = upRes.data;
      const fileUrl = d?.url || (d?.filename ? `/api/upload/files/${d.filename}` : null);
      if (!fileUrl) throw new Error('Serveur n\'a pas retourné l\'URL du fichier');

      // Step 2: create statement record
      setImportStep('Enregistrement du relevé...');
      let newStmt: any;
      try {
        const stmtRes = await api.post('/rapprochement/import-scan', {
          file_url:    fileUrl,
          bank_name:   csvForm.bank_name  || 'Relevé',
          period_from: csvForm.period_from || new Date().toISOString().slice(0, 10),
          period_to:   csvForm.period_to   || new Date().toISOString().slice(0, 10),
        });
        newStmt = stmtRes.data;
      } catch(e: any) {
        const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || 'erreur serveur';
        const status = e?.response?.status ? ` (HTTP ${e.response.status})` : '';
        throw new Error(`Enregistrement échoué${status} : ${msg}`);
      }

      // Step 3: optimistic update + cache, puis reload silencieux
      if (newStmt) {
        setStatements(prev => {
          const updated = [newStmt, ...prev];
          saveCache(updated);
          return updated;
        });
      }
      localStorage.setItem('releves_updated', Date.now().toString());
      setImportSuccess(`Relevé "${csvForm.bank_name || 'Relevé'}" importé avec succès !`);
      setTimeout(() => setImportSuccess(''), 6000);
      // reload silencieux — met à jour le cache avec données serveur
      await loadReleves(true);
    } catch(e: any) {
      console.error('[Import relevé]', e);
      setImportError(e?.message || 'Erreur inconnue');
    } finally { setImportingPDF(false); setImportStep(''); }
  };

  /* ── derived ───────────────────────────────────── */
  const caTotal    = issuedList.reduce((s,i) => s + Number(i.total_ttc||0), 0);
  const caEncaisse = issuedList.filter(i => i.status==='PAID').reduce((s,i) => s + Number(i.total_ttc||0), 0);
  const creance    = issuedList.filter(i => ['SENT','PARTIAL','OVERDUE'].includes(i.status)).reduce((s,i) => s + Number(i.balance||0), 0);
  const achatTotal = purchaseList.reduce((s,i) => s + Number(i.total_ttc||0), 0);
  const depTotal   = depStats?.total_amount || 0;
  const margeHT    = (caTotal/1.2) - (achatTotal/1.2);
  const resultat   = margeHT - depTotal;
  const tauxRecouvrement = caTotal > 0 ? (caEncaisse/caTotal)*100 : 0;
  const tauxMarge  = (caTotal/1.2) > 0 ? (margeHT/(caTotal/1.2))*100 : 0;

  const allInvoices = [
    ...issuedList.map(i  => ({ ...i, _dir:'ISSUED'   })),
    ...purchaseList.map(i => ({ ...i, _dir:'RECEIVED' })),
  ];
  const filteredInvoices = allInvoices.filter(inv => {
    if (factDir !== 'all' && inv._dir !== factDir) return false;
    if (factSearch) {
      const q = factSearch.toLowerCase();
      return (inv.number||'').toLowerCase().includes(q)
          || (inv.client?.commercial_name||inv.fournisseur?.name||'').toLowerCase().includes(q);
    }
    return true;
  });
  const scansToShow = (scansSource==='issued' ? issuedList : purchaseList).filter(i => i.scanned_file_url);

  const totalTvaCollectee = tvaData.reduce((s,m) => s+(m.tva_collected||0), 0);
  const totalTvaDeductible = tvaData.reduce((s,m) => s+(m.tva_deductible||0), 0);
  const totalTvaDue = tvaData.reduce((s,m) => s+Math.max(0,(m.tva_collected||0)-(m.tva_deductible||0)), 0);

  const card = { background:'white', border:'1.5px solid #F5E6D3', borderRadius:12, padding:'14px 18px' } as const;

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[22px] font-bold text-honey-dark font-display tracking-tight">Comptabilite</h1>
        <p className="text-sm text-honey-caramel mt-0.5">Factures, dépenses, releves bancaires et TVA</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-white border border-honey-beige-soft rounded-xl p-1">
        {([
          ['factures','Factures', FileText],
          ['releves','Relevés bancaires', Building2],
          ['tva','TVA mensuelle', TrendingUp],
        ] as const).map(([id,label,Icon]) => (
          <button key={id} onClick={() => setTab(id as any)}
            className={cn('flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2',
              tab===id ? 'bg-honey-dark text-white shadow-sm' : 'text-honey-caramel hover:text-honey-dark')}>
            <Icon size={12}/> {label}
          </button>
        ))}
      </div>

      {/* ===== FACTURES ===== */}
      {tab==='factures' && (
        <div>
          {/* KPI row 1 */}
          <div className="grid grid-cols-4 gap-3 mb-3">
            {[
              { label:'CA emis TTC',      value:fmt(caTotal)+' MAD',    sub:`Encaisse: ${fmt(caEncaisse)} MAD`,  color:'#F4B315' },
              { label:'Creances clients', value:fmt(creance)+' MAD',    sub:`${issuedList.filter(i=>['SENT','PARTIAL','OVERDUE'].includes(i.status)).length} fact. en attente`, color:'#F97316' },
              { label:'Total achats TTC', value:fmt(achatTotal)+' MAD', sub:`${purchaseList.length} facture(s) fournisseur`, color:'#EF4444' },
              { label:'Dépenses',         value:fmt(depTotal)+' MAD',   sub:`${dépenses.length} operation(s)`, color:'#8B5CF6' },
            ].map(k => (
              <div key={k.label} style={card}>
                <p style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:0.5, color:'#8E5915', marginBottom:6 }}>{k.label}</p>
                <p style={{ fontSize:16, fontWeight:800, color:k.color, fontFamily:'monospace', margin:'0 0 2px' }}>{k.value}</p>
                <p style={{ fontSize:10, color:'#B8A090' }}>{k.sub}</p>
              </div>
            ))}
          </div>
          {/* KPI row 2 — analyse */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label:'Marge brute HT',     value:fmt(margeHT)+' MAD',  sub:`Taux: ${tauxMarge.toFixed(1)}%`, color: margeHT>=0?'#10B981':'#EF4444', bg: margeHT>=0?'#F0FDF4':'#FFF5F5' },
              { label:'Resultat net estime', value:fmt(resultat)+' MAD', sub:'Marge HT - Dépenses',           color: resultat>=0?'#10B981':'#EF4444', bg: resultat>=0?'#F0FDF4':'#FFF5F5' },
              { label:'Taux recouvrement',  value:tauxRecouvrement.toFixed(1)+'%', sub:`${fmt(caEncaisse)} / ${fmt(caTotal)} MAD`, color:'#3B82F6', bg:'#EFF6FF' },
            ].map(k => (
              <div key={k.label} style={{ ...card, background:k.bg }}>
                <p style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:0.5, color:'#8E5915', marginBottom:6 }}>{k.label}</p>
                <p style={{ fontSize:18, fontWeight:800, color:k.color, fontFamily:'monospace', margin:'0 0 2px' }}>{k.value}</p>
                <p style={{ fontSize:10, color:'#B8A090' }}>{k.sub}</p>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
            <div style={{ display:'flex', gap:6 }}>
              {([['all','Toutes'],['ISSUED','Emises'],['RECEIVED','Achats']] as const).map(([v,l]) => (
                <button key={v} onClick={() => setFactDir(v)}
                  style={{ padding:'6px 14px', borderRadius:8, border:`1.5px solid ${factDir===v?'#E59312':'#E8D4B0'}`, background:factDir===v?'#FFF8E7':'white', color:factDir===v?'#8E5915':'#B8977A', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                  {l}
                </button>
              ))}
            </div>
            <input value={factSearch} onChange={e => setFactSearch(e.target.value)}
              placeholder="Rechercher par numero ou client..."
              style={{ flex:1, padding:'7px 12px', borderRadius:8, border:'1.5px solid #E8D4B0', fontSize:12, outline:'none', minWidth:160 }} />
            <button onClick={() => { setScansSource('issued'); setShowScansModal(true); }}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8, border:'1.5px solid #E8D4B0', background:'white', color:'#3B82F6', fontSize:11, fontWeight:600, cursor:'pointer' }}>
              <Download size={12}/> Scans emises ({issuedList.filter(i=>i.scanned_file_url).length})
            </button>
            <button onClick={() => { setScansSource('purchase'); setShowScansModal(true); }}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8, border:'1.5px solid #E8D4B0', background:'white', color:'#EF4444', fontSize:11, fontWeight:600, cursor:'pointer' }}>
              <Download size={12}/> Scans achats ({purchaseList.filter(i=>i.scanned_file_url).length})
            </button>
          </div>

          {/* Table */}
          <div style={{ ...card, padding:0, overflow:'hidden' }}>
            {loadingFact ? <p className="text-center py-12 text-honey-caramel">Chargement...</p> : (
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ background:'#FDF6E9' }}>
                      {['Type','Reference','Client / Fournisseur','Date','HT','TVA','TTC','Statut','Actions'].map(h => (
                        <th key={h} style={{ padding:'9px 12px', textAlign:'left', color:'#8E5915', fontWeight:700, fontSize:10, textTransform:'uppercase', whiteSpace:'nowrap', borderBottom:'1px solid #F5E6D3' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInvoices.length===0 ? (
                      <tr><td colSpan={9} style={{ padding:'32px', textAlign:'center', color:'#8E5915' }}>Aucune facture trouvee</td></tr>
                    ) : filteredInvoices.map((inv,i) => {
                      const s = statusLabel[inv.status] || statusLabel.DRAFT;
                      return (
                        <tr key={inv.id} style={{ borderBottom:'1px solid #F5E6D3', background:i%2===0?'white':'#FFFDF7' }}>
                          <td style={{ padding:'8px 12px' }}>
                            <span style={{ fontSize:9, padding:'2px 7px', borderRadius:20, border:'1px solid', background:inv._dir==='ISSUED'?'#F0FDF4':'#EFF6FF', color:inv._dir==='ISSUED'?'#16A34A':'#2563EB', borderColor:inv._dir==='ISSUED'?'#BBF7D0':'#BFDBFE' }}>
                              {inv._dir==='ISSUED'?'Emise':'Achat'}
                            </span>
                          </td>
                          <td style={{ padding:'8px 12px', fontFamily:'monospace', fontWeight:700, color:'#1A141A', whiteSpace:'nowrap' }}>{inv.number}</td>
                          <td style={{ padding:'8px 12px', color:'#1A141A', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {inv.client?.commercial_name || inv.fournisseur?.name || '-'}
                          </td>
                          <td style={{ padding:'8px 12px', color:'#8E5915', whiteSpace:'nowrap' }}>{formatDate(inv.issue_date)}</td>
                          <td style={{ padding:'8px 12px', fontFamily:'monospace', color:'#1A141A', whiteSpace:'nowrap' }}>{fmt(Number(inv.total_ht_brut||0))}</td>
                          <td style={{ padding:'8px 12px', fontFamily:'monospace', color:'#3B82F6', whiteSpace:'nowrap' }}>{fmt(Number(inv.tva_amount||0))}</td>
                          <td style={{ padding:'8px 12px', fontFamily:'monospace', fontWeight:700, color:'#1A141A', whiteSpace:'nowrap' }}>{fmt(Number(inv.total_ttc||0))}</td>
                          <td style={{ padding:'8px 12px' }}>
                            <span style={{ fontSize:9, padding:'2px 7px', borderRadius:20, border:'1px solid', background:s.bg, color:s.color, borderColor:s.border }}>{s.label}</span>
                          </td>
                          <td style={{ padding:'8px 12px' }}>
                            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                              {/* Boutons PDF générés (Voir + Télécharger FR/AR) */}
                              <PDFButton
                                docType="invoice"
                                docId={inv.id}
                                docNumber={inv.number}
                                variant="inline"
                              />
                              {/* Boutons scan (si une photo/PDF a été uploadée) */}
                              {inv.scanned_file_url && (
                                <div style={{ display:'inline-flex', gap:4 }}>
                                  <button onClick={() => setViewReleve(inv.scanned_file_url)}
                                    style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'3px 8px', borderRadius:5, border:'1px solid #E8D4B0', background:'#FFF8E7', color:'#D97706', fontSize:9, fontWeight:600, cursor:'pointer' }}>
                                    <Eye size={9}/> Scan
                                  </button>
                                  <button onClick={() => downloadFile(inv.scanned_file_url, inv.number || 'scan')}
                                    style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'3px 8px', borderRadius:5, border:'1px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:9, fontWeight:600, cursor:'pointer' }}>
                                    <Download size={9}/>
                                  </button>
                                </div>
                              )}
                              <button onClick={() => handleDeleteInvoice(inv)}
                                style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'3px 8px', borderRadius:5, border:'1px solid #FECACA', background:'white', color:'#DC2626', fontSize:9, fontWeight:600, cursor:'pointer', alignSelf:'flex-start' }}
                                title="Supprimer">
                                <Trash2 size={9}/> Supprimer
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== RELEVES ===== */}
      {tab==='releves' && (
        <div>
          {/* Import form */}
          <div style={{ ...card, marginBottom:20 }}>
            <p style={{ margin:'0 0 14px', fontSize:13, fontWeight:700, color:'#1A141A' }}>Importer un relevé bancaire (PDF ou photo)</p>
            <div style={{ display:'flex', gap:12, alignItems:'flex-end', flexWrap:'wrap' }}>
              <div>
                <label style={{ display:'block', fontSize:10, fontWeight:700, color:'#8E5915', textTransform:'uppercase', marginBottom:4 }}>Banque</label>
                <input value={csvForm.bank_name} onChange={e => setCsvForm(f=>({...f,bank_name:e.target.value}))}
                  placeholder="CIH, Attijariwafa..." style={{ padding:'7px 10px', borderRadius:8, border:'1.5px solid #E8D4B0', fontSize:12, outline:'none', width:160 }}/>
              </div>
              <div>
                <label style={{ display:'block', fontSize:10, fontWeight:700, color:'#8E5915', textTransform:'uppercase', marginBottom:4 }}>Du</label>
                <input type="date" value={csvForm.period_from} onChange={e => setCsvForm(f=>({...f,period_from:e.target.value}))}
                  style={{ padding:'7px 10px', borderRadius:8, border:'1.5px solid #E8D4B0', fontSize:12, outline:'none' }}/>
              </div>
              <div>
                <label style={{ display:'block', fontSize:10, fontWeight:700, color:'#8E5915', textTransform:'uppercase', marginBottom:4 }}>Au</label>
                <input type="date" value={csvForm.period_to} onChange={e => setCsvForm(f=>({...f,period_to:e.target.value}))}
                  style={{ padding:'7px 10px', borderRadius:8, border:'1.5px solid #E8D4B0', fontSize:12, outline:'none' }}/>
              </div>
              <button onClick={() => fileRef.current?.click()} disabled={importingPDF}
                style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#F4B315,#E59312)', color:'#1A141A', fontSize:12, fontWeight:700, cursor:importingPDF?'default':'pointer', opacity:importingPDF?0.7:1 }}>
                <Camera size={13}/> {importingPDF ? importStep||'Import...' : 'Importer PDF ou photo'}
              </button>
              <input ref={fileRef} type="file" accept="image/*,.pdf,application/pdf,application/octet-stream" style={{ display:'none' }}
                onChange={e => { const f=e.target.files?.[0]; if(f){ setImportError(''); setImportingPDF(true); setImportStep('Lecture du fichier...'); handleRelevePDF(f); } e.target.value=''; }}/>
            </div>
            {importSuccess && (
              <div style={{ marginTop:10, padding:'10px 14px', borderRadius:8, background:'#F0FDF4', border:'1px solid #BBF7D0', fontSize:12, color:'#16A34A', fontWeight:600 }}>✓ {importSuccess}</div>
            )}
            {importError && (
              <div style={{ marginTop:10, padding:'10px 14px', borderRadius:8, background:'#FFF0F0', border:'1px solid #FFCDD2', fontSize:12, color:'#D32F2F' }}><strong>Erreur :</strong> {importError}</div>
            )}
          </div>

          {loadingStmt ? <p className="text-center py-12 text-honey-caramel">Chargement...</p> :
            statements.length===0 ? (
              <div style={{ ...card, textAlign:'center', padding:'48px 20px' }}>
                <Building2 size={40} style={{ color:'#E59312', margin:'0 auto 12px' }}/>
                <p style={{ fontSize:14, fontWeight:600, color:'#8E5915' }}>Aucun relevé importé</p>
                <p style={{ fontSize:12, color:'#B8A090', marginTop:4 }}>Importez un PDF ou une photo de votre releve bancaire</p>
                <button onClick={() => loadReleves()} style={{ marginTop:16, display:'inline-flex', alignItems:'center', gap:6, padding:'7px 16px', borderRadius:8, border:'1.5px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                  <RefreshCw size={12}/> Rafraîchir
                </button>
              </div>
            ) : (
              <>
                <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:10 }}>
                  <button onClick={() => loadReleves()} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 14px', borderRadius:8, border:'1.5px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                    <RefreshCw size={12}/> Rafraîchir
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {statements.map((stmt:any) => {
                    const isPdf = stmt.file_url?.toLowerCase().includes('.pdf');
                    return (
                      <div key={stmt.id} style={{ ...card, display:'flex', flexDirection:'column', gap:8 }}>
                        {stmt.file_url && !isPdf ? (
                          <div style={{ width:'100%', height:100, borderRadius:8, overflow:'hidden', border:'1px solid #F5E6D3', cursor:'pointer' }} onClick={() => setViewReleve(stmt.file_url)}>
                            <img src={stmt.file_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                          </div>
                        ) : (
                          <div style={{ width:'100%', height:80, borderRadius:8, background:'#FFF3E0', border:'1px solid #F5E6D3', display:'flex', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer' }}
                            onClick={() => stmt.file_url && window.open(stmt.file_url,'_blank')}>
                            <FileText size={28} style={{ color:'#E59312' }}/>
                            <span style={{ fontSize:12, fontWeight:600, color:'#8E5915' }}>PDF</span>
                          </div>
                        )}
                        <p style={{ margin:0, fontSize:13, fontWeight:700, color:'#1A141A' }}>{stmt.bank_name||'Relevé'}</p>
                        <p style={{ margin:0, fontSize:11, color:'#8E5915' }}>{formatDate(stmt.period_from)} — {formatDate(stmt.period_to)}</p>
                        <div style={{ display:'flex', gap:6, marginTop:4 }}>
                          <button onClick={() => setViewReleve(stmt.file_url)} style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:4, padding:'6px', borderRadius:7, border:'1px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                            <Eye size={11}/> Voir
                          </button>
                          <button onClick={() => stmt.file_url && downloadFile(stmt.file_url, stmt.bank_name || 'releve')}
                            style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:4, padding:'6px', borderRadius:7, border:'none', background:'linear-gradient(135deg,#F4B315,#E59312)', color:'#1A141A', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                            <Download size={11}/> Télécharger
                          </button>
                          <button onClick={async () => {
                            if (!confirm('Supprimer ce relevé ?')) return;
                            try { await api.delete(`/rapprochement/statements/${stmt.id}`); loadReleves(false); }
                            catch { alert('Erreur suppression'); }
                          }} style={{ display:'flex', alignItems:'center', justifyContent:'center', padding:'6px 8px', borderRadius:7, border:'1px solid #FECACA', background:'white', color:'#DC2626', fontSize:13, cursor:'pointer' }} title="Supprimer">
                            🗑
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )
          }
        </div>
      )}


      {/* Viewer plein écran */}
      <FileViewerModal url={viewReleve} title="Document" onClose={() => setViewReleve(null)} />
    </div>
  );
}
