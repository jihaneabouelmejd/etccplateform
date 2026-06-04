'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Search, Check, AlertCircle, Trash2, Banknote, Camera, X, Upload, Eye, ImageOff, Sparkles, FileText, ChevronDown } from 'lucide-react';
import { invoicesApi, blApi, fournisseursApi, uploadApi, signaturesApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/lib/i18n';
import FileViewerModal from '@/components/ui/FileViewerModal';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import PDFButton from '@/components/ui/PDFButton';

const statusConfig: Record<string, string> = {
  DRAFT: 'badge-info', SENT: 'bg-blue-50 text-blue-700 border-blue-200',
  PARTIAL: 'bg-amber-50 text-amber-700 border-amber-200',
  PAID: 'badge-success', OVERDUE: 'badge-danger', CANCELLED: 'bg-gray-50 text-gray-400 border-gray-200',
};
// statusLabel is now computed inside component using t()
const iStyle = { width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E8D4B0', fontSize:13, outline:'none', boxSizing:'border-box' as const };
const lStyle = { display:'block' as const, fontSize:11, fontWeight:700 as const, color:'#8E5915', textTransform:'uppercase' as const, letterSpacing:0.5, marginBottom:6 };
const btnSec = { padding:'9px 18px', borderRadius:8, border:'1.5px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:13, fontWeight:600 as const, cursor:'pointer' as const };
const btnPri = { padding:'9px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#F4B315,#E59312)', color:'#1A141A', fontSize:13, fontWeight:700 as const, cursor:'pointer' as const };
const btnDng = { padding:'9px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#EF4444,#DC2626)', color:'white', fontSize:13, fontWeight:700 as const, cursor:'pointer' as const };
const TVA_RATE = 0.20;

export default function FacturesPage() {
  const { t, dir } = useLanguage();
  const { user } = useAuth();
  const statusLabel: Record<string, string> = {
    DRAFT: t('status.draft'), SENT: t('status.sent'), PARTIAL: t('status.partial'),
    PAID: t('status.paid'), OVERDUE: t('status.overdue'), CANCELLED: t('status.cancelled'),
  };
  const [tab, setTab] = useState<'ISSUED' | 'RECEIVED'>('ISSUED');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [cancelling, setCancelling] = useState(false);
  const [payTarget, setPayTarget] = useState<any>(null);
  const [payForm, setPayForm] = useState({ amount: '', type: 'VIREMENT', reference: '' });
  const [paying, setPaying] = useState(false);
  const canDel = user?.role === 'ADMIN' || user?.role === 'GERANT';
  const now = new Date();

  const [showEmiseModal, setShowEmiseModal] = useState(false);
  const [signedBls, setSignedBls] = useState<any[]>([]);
  const [selectedBlId, setSelectedBlId] = useState('');
  const [emiseSignatureId, setEmiseSignatureId] = useState('');
  const [creatingEmise, setCreatingEmise] = useState(false);
  const [emiseError, setEmiseError] = useState('');
  const [signatures, setSignatures] = useState<any[]>([]);

  const [showAchatModal, setShowAchatModal] = useState(false);
  const [fournisseurs, setFournisseurs] = useState<any[]>([]);
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const [scanUrl, setScanUrl] = useState<string | null>(null);
  const [scanFilename, setScanFilename] = useState<string | null>(null);
  const [isPDF, setIsPDF] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractMsg, setExtractMsg] = useState<string | null>(null);
  const [detectedFournisseur, setDetectedFournisseur] = useState<string | null>(null);
  const [achatForm, setAchatForm] = useState({
    fournisseur_id: '', fournisseur_libre: '', ref_fournisseur: '',
    total_ht_brut: '', tva_amount: '', total_ttc: '',
    issue_date: new Date().toISOString().slice(0,10), due_date: '', notes: '',
  });
  const [creatingAchat, setCreatingAchat] = useState(false);
  const [achatError, setAchatError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [viewScanTarget, setViewScanTarget] = useState<any>(null);
  const [statusDropdown, setStatusDropdown] = useState<string | null>(null); // invoice id
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [deletingScan, setDeletingScan] = useState(false);

  // Factures d'achat en attente (uploads employés)
  const [pendingFacs, setPendingFacs]       = useState<any[]>([]);
  const [rejectingFac, setRejectingFac]     = useState('');
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      invoicesApi.list({ direction: tab, status: statusFilter || undefined, search: search || undefined }),
      invoicesApi.stats(now.getMonth() + 1, now.getFullYear()),
    ]).then(([listRes, statsRes]) => {
      setInvoices(listRes.data.data || []);
      setStats(statsRes.data);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [tab, search, statusFilter]);

  useEffect(() => {
    if (!canDel) return;
    import('@/lib/api').then(({ depensesApi }) => {
      depensesApi.list({}).then((r: any) => {
        const all: any[] = r.data?.data || r.data || [];
        setPendingFacs(all.filter((d: any) => d.description?.startsWith('[FAC-ACHAT]') && d.status === 'PENDING'));
      }).catch(() => {});
    });
  }, [canDel]);

  const handleApproveFac = async (dep: any) => {
    const { depensesApi } = await import('@/lib/api');
    await depensesApi.update(dep.id, { status: 'APPROVED' }).catch(() => {});
    setPendingFacs(prev => prev.filter(f => f.id !== dep.id));
  };

  const handleRejectFac = async (dep: any) => {
    if (!confirm('Refuser cette facture ?')) return;
    setRejectingFac(dep.id);
    const { depensesApi } = await import('@/lib/api');
    await depensesApi.update(dep.id, { status: 'REJECTED' }).catch(() => {});
    setPendingFacs(prev => prev.filter(f => f.id !== dep.id));
    setRejectingFac('');
  };

  const handleCancel = async () => {
    if (!cancelTarget) return; setCancelling(true);
    try { await invoicesApi.cancel(cancelTarget.id); fetchData(); setCancelTarget(null); }
    catch (e: any) { alert(e?.response?.data?.message || 'Erreur'); }
    finally { setCancelling(false); }
  };

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault(); if (!payTarget) return; setPaying(true);
    try {
      await invoicesApi.pay(payTarget.id, { amount: parseFloat(payForm.amount), type: payForm.type, reference: payForm.reference || undefined, date: new Date().toISOString() });
      fetchData(); setPayTarget(null); setPayForm({ amount: '', type: 'VIREMENT', reference: '' });
    } catch (e: any) { alert(e?.response?.data?.message || 'Erreur'); }
    finally { setPaying(false); }
  };

  const openEmiseModal = () => {
    setSelectedBlId(''); setEmiseSignatureId(''); setEmiseError('');
    blApi.list({ status: 'SIGNED', limit: 200 } as any).then(r => setSignedBls(r.data.data || [])).catch(() => {});
    signaturesApi.list().then(r => {
      const sigs = r.data || [];
      setSignatures(sigs);
      // Pré-sélectionner la signature par défaut
      const defaultSig = sigs.find((s: any) => s.is_default);
      if (defaultSig) setEmiseSignatureId(defaultSig.id);
    }).catch(() => {});
    setShowEmiseModal(true);
  };

  const handleCreateEmise = async () => {
    if (!selectedBlId) { setEmiseError('Sélectionnez un BL'); return; }
    setCreatingEmise(true); setEmiseError('');
    try { await invoicesApi.createFromBL({ bl_id: selectedBlId, signature_id: emiseSignatureId || undefined }); fetchData(); setShowEmiseModal(false); }
    catch (e: any) { const msg = e?.response?.data?.message; setEmiseError(Array.isArray(msg) ? msg.join(', ') : (msg || 'Erreur')); }
    finally { setCreatingEmise(false); }
  };

  const openAchatModal = () => {
    setAchatForm({ fournisseur_id: '', fournisseur_libre: '', ref_fournisseur: '', total_ht_brut: '', tva_amount: '', total_ttc: '', issue_date: new Date().toISOString().slice(0,10), due_date: '', notes: '' });
    setScanPreview(null); setScanUrl(null); setScanFilename(null); setAchatError(''); setExtractMsg(null); setDetectedFournisseur(null);
    setAchatForm(f => ({ ...f, fournisseur_id: '', fournisseur_libre: '' }));
    fournisseursApi.list({ limit: 200 }).then(r => setFournisseurs(r.data.data || [])).catch(() => {});
    setShowAchatModal(true);
  };

  const handleScanFile = async (file: File) => {
    const fileIsPDF = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    setIsPDF(fileIsPDF);
    if (fileIsPDF) {
      setScanPreview('__PDF__');
    } else {
      const reader = new FileReader();
      reader.onload = e => setScanPreview(e.target?.result as string);
      reader.readAsDataURL(file);
    }
    setUploading(true); setExtractMsg(null);
    try {
      const res = await uploadApi.upload(file);
      const { url, filename } = res.data;
      setScanUrl(url);
      setScanFilename(filename);
      // Auto-extract for PDF AND images (backend handles both via OCR)
      setExtracting(true);
      try {
        const extRes = await uploadApi.extract(filename);
        const { success, data, message } = extRes.data;
        if (success && data) {
          // Fuzzy-match fournisseur name against loaded list
          let matchedFournisseurId = '';
          if (data.fournisseur_name) {
            setDetectedFournisseur(data.fournisseur_name);
            const extracted = data.fournisseur_name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
            // 1. Exact match
            let match = fournisseurs.find(f => f.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') === extracted);
            // 2. One contains the other
            if (!match) match = fournisseurs.find(f => {
              const fn = f.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
              return fn.includes(extracted) || extracted.includes(fn);
            });
            // 3. Any significant word (>3 chars) matches
            if (!match) {
              const words = extracted.split(/\s+/).filter((w: string) => w.length > 3);
              match = fournisseurs.find(f => {
                const fn = f.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
                return words.some((w: string) => fn.includes(w));
              });
            }
            if (match) matchedFournisseurId = match.id;
          }
          setAchatForm(f => ({
            ...f,
            fournisseur_id: matchedFournisseurId || f.fournisseur_id,
            // Si nom détecté mais pas matché → pré-remplir le champ libre
            fournisseur_libre: (!matchedFournisseurId && data.fournisseur_name) ? data.fournisseur_name : f.fournisseur_libre,
            total_ht_brut: data.total_ht_brut ? String(data.total_ht_brut) : f.total_ht_brut,
            tva_amount:    data.tva_amount    ? String(data.tva_amount)    : f.tva_amount,
            total_ttc:     data.total_ttc     ? String(data.total_ttc)     : f.total_ttc,
            issue_date:    data.issue_date    ?? f.issue_date,
            ref_fournisseur: data.ref_fournisseur ?? f.ref_fournisseur,
          }));
          const fournisseurMsg = matchedFournisseurId
            ? `✓ Fournisseur détecté : ${data.fournisseur_name}`
            : data.fournisseur_name
              ? `⚠ Fournisseur lu : "${data.fournisseur_name}" — non trouvé dans la liste, sélectionnez manuellement`
              : '';
          setExtractMsg([fournisseurMsg, message || 'Informations extraites automatiquement'].filter(Boolean).join(' | '));
        } else {
          setExtractMsg(message || 'Extraction non disponible — veuillez saisir manuellement');
        }
      } catch { setExtractMsg('Extraction auto echouee — veuillez saisir manuellement'); }
      finally { setExtracting(false); }
    } catch { setAchatError('Erreur upload'); }
    finally { setUploading(false); }
  };

  const handleHtChange = (val: string) => {
    const ht = parseFloat(val) || 0;
    const tva = Math.round(ht * TVA_RATE * 100) / 100;
    const ttc = Math.round((ht + tva) * 100) / 100;
    setAchatForm(f => ({ ...f, total_ht_brut: val, tva_amount: tva > 0 ? String(tva) : '', total_ttc: ttc > 0 ? String(ttc) : '' }));
  };

  const handleTvaChange = (val: string) => {
    const ht = parseFloat(achatForm.total_ht_brut) || 0;
    const tva = parseFloat(val) || 0;
    setAchatForm(f => ({ ...f, tva_amount: val, total_ttc: String(Math.round((ht + tva) * 100) / 100) }));
  };

  const handleCreateAchat = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingAchat(true); setAchatError('');
    try {
      const notesParts = [
        achatForm.notes,
        achatForm.ref_fournisseur ? `Ref: ${achatForm.ref_fournisseur}` : '',
        (!achatForm.fournisseur_id && achatForm.fournisseur_libre) ? `Fournisseur: ${achatForm.fournisseur_libre}` : '',
      ].filter(Boolean);
      await invoicesApi.createPurchase({
        fournisseur_id: achatForm.fournisseur_id || undefined,
        total_ht_brut: parseFloat(achatForm.total_ht_brut) || 0,
        tva_amount: parseFloat(achatForm.tva_amount) || 0,
        total_ttc: parseFloat(achatForm.total_ttc) || 0,
        issue_date: achatForm.issue_date ? new Date(achatForm.issue_date) : undefined,
        due_date: achatForm.due_date ? new Date(achatForm.due_date) : undefined,
        notes: notesParts.join(' | ') || undefined,
        scanned_file_url: scanUrl || undefined,
      });
      fetchData(); setShowAchatModal(false);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setAchatError(Array.isArray(msg) ? msg.join(', ') : (msg || 'Erreur'));
    } finally { setCreatingAchat(false); }
  };

  const handleDeleteScan = async () => {
    if (!viewScanTarget) return; setDeletingScan(true);
    try { await invoicesApi.updateScan(viewScanTarget.id, null); fetchData(); setViewScanTarget(null); }
    catch (e: any) { alert(e?.response?.data?.message || 'Erreur'); }
    finally { setDeletingScan(false); }
  };

  const handleUpdateStatus = async (inv: any, newStatus: string) => {
    setUpdatingStatus(true);
    setStatusDropdown(null);
    try {
      await invoicesApi.updateStatus(inv.id, newStatus);
      fetchData();
    } catch (e: any) { alert(e?.response?.data?.message || 'Erreur'); }
    finally { setUpdatingStatus(false); }
  };

  // Close dropdown on outside click
  const closeDropdown = () => setStatusDropdown(null);

  // Group received invoices by month
  const groupByMonth = (list: any[]) => {
    const groups: Record<string, any[]> = {};
    list.forEach(inv => {
      const d = new Date(inv.issue_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(inv);
    });
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  };

  const monthLabel = (key: string) => {
    const [y, m] = key.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  };

  return (
    <div>

      {/* ══ FACTURES D'ACHAT EN ATTENTE (uploads employés) ══ */}
      {canDel && pendingFacs.length > 0 && (
        <div style={{ background: '#FFFBF0', border: '1.5px solid #F5C842', borderRadius: 14, padding: '16px 20px', marginBottom: 20 }}>
          <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 800, color: '#1A141A' }}>
            📥 Factures d'achat en attente — {pendingFacs.length} document{pendingFacs.length > 1 ? 's' : ''}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingFacs.map((dep: any) => (
              <div key={dep.id} style={{ background: 'white', border: '1px solid #EDDEC1', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#1A141A' }}>{dep.description?.replace('[FAC-ACHAT] ', '')}</div>
                  <div style={{ fontSize: 11, color: '#8E5915', marginTop: 2 }}>
                    Par : {dep.submitter?.first_name} {dep.submitter?.last_name} &nbsp;•&nbsp;
                    {new Date(dep.created_at).toLocaleDateString('fr-FR')}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {dep.receipt_url && (
                    <button onClick={() => setPendingPreviewUrl(dep.receipt_url)}
                      style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid #E8D4B0', background: 'white', color: '#8E5915', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                      👁 Voir
                    </button>
                  )}
                  <button onClick={() => handleApproveFac(dep)}
                    style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#22C55E,#16A34A)', color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    ✅ Valider
                  </button>
                  <button onClick={() => handleRejectFac(dep)} disabled={rejectingFac === dep.id}
                    style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid #FFCDD2', background: '#FFF0F0', color: '#D32F2F', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    ✕ Refuser
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-[22px] font-bold text-honey-dark font-display tracking-tight">{t('fac.title')}</h1>
          <p className="text-sm text-honey-caramel mt-0.5">{t('fac.issued')} & {t('fac.received').toLowerCase()}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={openAchatModal} className="btn-secondary text-sm flex items-center gap-1.5">
            <Camera size={13} /> {t('fac.import_purchase')}
          </button>
          <button onClick={openEmiseModal} className="btn-primary text-sm flex items-center gap-1.5">
            <Plus size={13} /> {t('fac.new_issued')}
          </button>
        </div>
      </div>

      <div className="bg-gradient-to-br from-honey-beige-soft to-green-50 border border-honey-beige-soft rounded-lg p-4 mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-honey-caramel mb-3">
          {now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
        </p>
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'CA du mois', value: `${((stats?.ca_month || 0) / 1000).toFixed(0)}K`, color: 'text-honey-gold' },
            { label: 'Payées', value: stats?.paid_count || 0, color: 'text-green-600' },
            { label: 'Impayees', value: stats?.unpaid_count || 0, color: 'text-amber-600' },
            { label: 'En retard', value: stats?.overdue_count || 0, color: 'text-red-500' },
            { label: 'TVA collectee', value: `${((stats?.tva_collected || 0) / 1000).toFixed(0)}K`, color: 'text-honey-caramel' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white rounded-lg p-3 border border-honey-beige-soft">
              <p className="text-[10px] text-honey-caramel uppercase tracking-wide mb-1">{kpi.label}</p>
              <p className={cn('text-xl font-bold font-mono', kpi.color)}>{kpi.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-1 mb-4 border-b border-honey-beige-soft">
        {([['ISSUED', t('fac.issued')], ['RECEIVED', t('fac.received')]] as const).map(([value, label]) => (
          <button key={value} onClick={() => setTab(value)}
            className={cn('px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-all',
              tab === value ? 'border-honey-gold text-honey-dark' : 'border-transparent text-honey-caramel hover:text-honey-dark')}>
            {label}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="flex gap-3 mb-4 flex-wrap">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-honey-caramel" />
            <input type="text" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} className="input pl-9" />
          </div>
          {(['', 'SENT', 'PAID', 'PARTIAL', 'OVERDUE'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={cn('px-3 py-2 rounded-lg text-xs font-semibold border transition-all',
                statusFilter === s ? 'bg-honey-dark text-white border-honey-dark' : 'bg-white text-honey-caramel border-honey-beige-soft hover:border-honey-gold')}>
              {s === '' ? 'Toutes' : statusLabel[s]}
            </button>
          ))}
        </div>

        {/* RECEIVED tab: monthly grouped view */}
        {tab === 'RECEIVED' ? (
          loading ? (
            <p className="py-12 text-center text-honey-caramel">Chargement...</p>
          ) : invoices.length === 0 ? (
            <p className="py-12 text-center text-honey-caramel">Aucune facture d'achat</p>
          ) : (
            <div className="flex flex-col gap-6">
              {groupByMonth(invoices).map(([monthKey, monthInvs]) => {
                const monthTotal = monthInvs.reduce((s, inv) => s + Number(inv.total_ttc), 0);
                return (
                  <div key={monthKey}>
                    {/* Month header */}
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10, padding:'8px 14px', borderRadius:10, background:'linear-gradient(135deg,#FFF8EE,#FFF3DC)', border:'1px solid #E8D4B0' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:16 }}>📅</span>
                        <span style={{ fontSize:14, fontWeight:800, color:'#1A141A', textTransform:'capitalize' }}>{monthLabel(monthKey)}</span>
                        <span style={{ fontSize:11, color:'#8E5915', fontWeight:600, background:'rgba(142,89,21,0.1)', borderRadius:5, padding:'2px 8px' }}>{monthInvs.length} facture{monthInvs.length > 1 ? 's' : ''}</span>
                      </div>
                      <span style={{ fontFamily:'monospace', fontSize:14, fontWeight:800, color:'#A33C00' }}>{formatCurrency(monthTotal)}</span>
                    </div>
                    {/* Month rows */}
                    <div className="flex flex-col gap-2">
                      {monthInvs.map(inv => (
                        <div key={inv.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:10, border:'1.5px solid #F5E6D3', background:'white', transition:'all 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor='#E8D4B0')}
                          onMouseLeave={e => (e.currentTarget.style.borderColor='#F5E6D3')}>
                          {/* Icon */}
                          <div style={{ width:36, height:36, borderRadius:9, background: inv.scanned_file_url ? 'linear-gradient(135deg,#F4B315,#E59312)' : '#F5E6D3', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            {inv.scanned_file_url ? <Camera size={16} color="#1A141A" /> : <FileText size={16} color="#8E5915" />}
                          </div>
                          {/* Info */}
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                              <span style={{ fontFamily:'monospace', fontSize:12, fontWeight:700, color:'#1A141A' }}>{inv.number}</span>
                              <span style={{ fontSize:12, color:'#8E5915' }}>{inv.fournisseur?.name || '—'}</span>
                              {inv.notes && inv.notes.includes('Ref:') && (
                                <span style={{ fontSize:10, color:'#B8A090', fontFamily:'monospace' }}>
                                  {inv.notes.match(/Ref: ([^\s|]+)/)?.[1]}
                                </span>
                              )}
                            </div>
                            <p style={{ margin:'2px 0 0', fontSize:11, color:'#A0897A' }}>{formatDate(inv.issue_date)}{inv.due_date ? ` · Echéance ${formatDate(inv.due_date)}` : ''}</p>
                          </div>
                          {/* Amount */}
                          <div style={{ textAlign:'right', flexShrink:0 }}>
                            <p style={{ fontFamily:'monospace', fontSize:14, fontWeight:800, color:'#1A141A', margin:0 }}>{formatCurrency(Number(inv.total_ttc))}</p>
                            {Number(inv.tva_amount) > 0 && (
                              <p style={{ fontSize:10, color:'#8E5915', margin:'1px 0 0', fontFamily:'monospace' }}>TVA {formatCurrency(Number(inv.tva_amount))}</p>
                            )}
                          </div>
                          {/* Status */}
                          <span className={cn('badge border text-[10px]', statusConfig[inv.status])} style={{ flexShrink:0 }}>{statusLabel[inv.status]}</span>
                          {/* Actions */}
                          <div style={{ display:'flex', gap:6, flexShrink:0, alignItems:'center' }}>
                            {inv.scanned_file_url && (
                              <button onClick={() => setViewScanTarget(inv)}
                                style={{ padding:'5px 10px', borderRadius:7, border:'1.5px solid #BFDBFE', background:'#EFF6FF', color:'#2563EB', fontSize:10, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
                                <Eye size={10} /> Voir
                              </button>
                            )}
                            {/* Bouton changement de statut */}
                            {inv.status !== 'CANCELLED' && (
                              <div style={{ position:'relative' }}>
                                <button
                                  onClick={() => setStatusDropdown(statusDropdown === inv.id ? null : inv.id)}
                                  style={{ padding:'5px 10px', borderRadius:7, border:'1.5px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:10, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
                                  Statut <ChevronDown size={10} />
                                </button>
                                {statusDropdown === inv.id && (
                                  <>
                                    <div onClick={closeDropdown} style={{ position:'fixed', inset:0, zIndex:40 }} />
                                    <div style={{ position:'absolute', top:'calc(100% + 4px)', right:0, zIndex:50, background:'white', borderRadius:8, boxShadow:'0 8px 24px rgba(0,0,0,0.15)', border:'1px solid #F5E6D3', minWidth:170, overflow:'hidden' }}>
                                      {[
                                        { value:'DRAFT',   label:'Brouillon',        color:'#64748B', bg:'#F1F5F9' },
                                        { value:'SENT',    label:'Envoyée',           color:'#3B82F6', bg:'#EFF6FF' },
                                        { value:'PAID',    label:'Payée',             color:'#16A34A', bg:'#F0FFF4' },
                                        { value:'PARTIAL', label:'Paiement partiel',  color:'#D97706', bg:'#FFFBEB' },
                                        { value:'OVERDUE', label:'En retard',         color:'#DC2626', bg:'#FEF2F2' },
                                      ].map(s => (
                                        <button key={s.value}
                                          onClick={() => handleUpdateStatus(inv, s.value)}
                                          disabled={inv.status === s.value || updatingStatus}
                                          style={{ width:'100%', padding:'8px 14px', textAlign:'left', fontSize:11, fontWeight:600, cursor: inv.status === s.value ? 'default' : 'pointer', border:'none',
                                            background: inv.status === s.value ? s.bg : 'white', color: inv.status === s.value ? s.color : '#1A141A',
                                            opacity: inv.status === s.value ? 1 : updatingStatus ? 0.5 : 1,
                                            display:'flex', alignItems:'center', gap:8 }}>
                                          <span style={{ width:8, height:8, borderRadius:'50%', background:s.color, display:'inline-block', flexShrink:0 }} />
                                          {s.label}
                                          {inv.status === s.value && <span style={{ marginLeft:'auto', fontSize:10 }}>✓</span>}
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                            {/* Bouton paiement */}
                            {['SENT','PARTIAL','OVERDUE'].includes(inv.status) && (
                              <button onClick={() => { setPayTarget(inv); setPayForm({ amount: String(Number(inv.balance || inv.total_ttc)), type: 'VIREMENT', reference: '' }); }}
                                style={{ padding:'5px 10px', borderRadius:7, border:'1.5px solid #BBF7D0', background:'#F0FFF4', color:'#16A34A', fontSize:10, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
                                <Banknote size={10} /> Payer
                              </button>
                            )}
                            {canDel && inv.status !== 'PAID' && inv.status !== 'CANCELLED' && (
                              <button onClick={() => setCancelTarget(inv)}
                                style={{ width:28, height:28, borderRadius:7, border:'1.5px solid #FECACA', background:'#FFF5F5', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                <Trash2 size={11} color="#DC2626" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* ISSUED tab: standard table */
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-honey-cream">
                {['Numero', 'Client', 'Montant TTC', 'Balance', 'Statut', 'Rappr.', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-honey-caramel border-b border-honey-beige-soft">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-12 text-center text-honey-caramel">Chargement...</td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-honey-caramel">Aucune facture</td></tr>
              ) : invoices.map(inv => (
                <tr key={inv.id} className={cn('border-b border-honey-beige-soft hover:bg-honey-cream/50 transition-colors', inv.status === 'OVERDUE' && 'bg-red-50/30')}>
                  <td className="px-4 py-3">
                    <p className="font-mono font-semibold text-honey-dark">{inv.number}</p>
                    <p className="text-[11px] text-honey-caramel">{formatDate(inv.issue_date)}</p>
                  </td>
                  <td className="px-4 py-3 text-honey-dark">{inv.client?.commercial_name}</td>
                  <td className="px-4 py-3 font-mono font-bold text-honey-dark">{formatCurrency(Number(inv.total_ttc))}</td>
                  <td className="px-4 py-3">
                    <span className={cn('font-mono font-semibold text-sm', Number(inv.balance) > 0 ? 'text-amber-600' : 'text-green-600')}>
                      {Number(inv.balance) > 0 ? formatCurrency(Number(inv.balance)) : 'Soldee'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('badge border text-[10px]', statusConfig[inv.status])}>{statusLabel[inv.status]}</span>
                  </td>
                  <td className="px-4 py-3">
                    {inv.reconciled ? <Check size={14} className="text-green-500" /> : <AlertCircle size={14} className="text-amber-500" />}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {inv.status !== 'CANCELLED' && (
                        <div style={{ position:'relative' }}>
                          <button
                            onClick={() => setStatusDropdown(statusDropdown === inv.id ? null : inv.id)}
                            style={{ padding:'4px 10px', borderRadius:6, border:'1.5px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:10, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
                            Statut <ChevronDown size={10} />
                          </button>
                          {statusDropdown === inv.id && (
                            <>
                              <div onClick={closeDropdown} style={{ position:'fixed', inset:0, zIndex:40 }} />
                              <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:50, background:'white', borderRadius:8, boxShadow:'0 8px 24px rgba(0,0,0,0.15)', border:'1px solid #F5E6D3', minWidth:160, overflow:'hidden' }}>
                                {[
                                  { value:'SENT', label:'Envoyée', color:'#3B82F6', bg:'#EFF6FF' },
                                  { value:'PAID', label:'Payée', color:'#16A34A', bg:'#F0FFF4' },
                                  { value:'PARTIAL', label:'Paiement partiel', color:'#D97706', bg:'#FFFBEB' },
                                  { value:'OVERDUE', label:'En retard', color:'#DC2626', bg:'#FEF2F2' },
                                ].map(s => (
                                  <button key={s.value}
                                    onClick={() => handleUpdateStatus(inv, s.value)}
                                    disabled={inv.status === s.value || updatingStatus}
                                    style={{ width:'100%', padding:'9px 14px', textAlign:'left', fontSize:12, fontWeight:600, cursor: inv.status === s.value ? 'default' : 'pointer', border:'none',
                                      background: inv.status === s.value ? s.bg : 'white', color: inv.status === s.value ? s.color : '#1A141A',
                                      opacity: inv.status === s.value ? 1 : updatingStatus ? 0.5 : 1,
                                      display:'flex', alignItems:'center', gap:8 }}>
                                    <span style={{ width:8, height:8, borderRadius:'50%', background:s.color, display:'inline-block', flexShrink:0 }} />
                                    {s.label}
                                    {inv.status === s.value && <span style={{ marginLeft:'auto', fontSize:10 }}>✓</span>}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                      {canDel && ['SENT','PARTIAL','OVERDUE'].includes(inv.status) && (
                        <button onClick={() => { setPayTarget(inv); setPayForm({ amount: String(Number(inv.balance || inv.total_ttc)), type: 'VIREMENT', reference: '' }); }}
                          className="px-2 py-1 rounded text-[10px] font-semibold border bg-green-50 text-green-700 border-green-200 hover:bg-green-100 transition-all flex items-center gap-1">
                          <Banknote size={10} /> Payer
                        </button>
                      )}
                      <PDFButton variant="inline" docType="invoice" docId={inv.id} docNumber={inv.number} />
                      {canDel && inv.status !== 'PAID' && inv.status !== 'CANCELLED' && (
                        <button onClick={() => setCancelTarget(inv)} title="Annuler"
                          className="w-7 h-7 rounded-md border border-red-200 flex items-center justify-center text-red-400 hover:text-red-600 hover:border-red-400 hover:bg-red-50 transition-all">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* MODAL Paiement */}
      {payTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setPayTarget(null)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.5)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:440, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', padding:28 }}>
            <h2 style={{ margin:'0 0 4px', fontSize:16, fontWeight:700, color:'#1A141A' }}>Enregistrer un paiement</h2>
            <p style={{ fontSize:13, color:'#8E5915', marginBottom:20 }}>Facture : <strong>{payTarget.number}</strong></p>
            <form onSubmit={handlePay}>
              <div style={{ display:'grid', gap:14, marginBottom:20 }}>
                <div><label style={lStyle}>Montant (MAD) *</label>
                  <input required type="number" step="0.01" value={payForm.amount} onChange={e => setPayForm({...payForm, amount:e.target.value})} placeholder="0.00" style={{...iStyle, fontFamily:'monospace'}} /></div>
                <div><label style={lStyle}>Mode *</label>
                  <select required value={payForm.type} onChange={e => setPayForm({...payForm, type:e.target.value})} style={iStyle}>
                    <option value="VIREMENT">Virement</option><option value="CHEQUE">Cheque</option>
                    <option value="ESPECES">Especes</option><option value="EFFET">Effet</option><option value="AUTRE">Autre</option>
                  </select></div>
                <div><label style={lStyle}>Reference</label>
                  <input value={payForm.reference} onChange={e => setPayForm({...payForm, reference:e.target.value})} placeholder="N cheque..." style={iStyle} /></div>
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button type="button" onClick={() => setPayTarget(null)} style={{ ...btnSec, flex:1 }}>Annuler</button>
                <button type="submit" disabled={paying || !payForm.amount} style={{ ...btnPri, flex:1, opacity:(paying||!payForm.amount)?0.7:1 }}>
                  {paying ? 'Enregistrement...' : 'Confirmer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POPUP Annulation */}
      {cancelTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setCancelTarget(null)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.6)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:420, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.3)', padding:28 }}>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <h3 style={{ margin:'0 0 8px', fontSize:17, fontWeight:700 }}>Annuler cette facture ?</h3>
              <p style={{ margin:0, fontSize:13, color:'#8E5915' }}>Facture <strong>{cancelTarget.number}</strong> sera marquee comme annulee.</p>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setCancelTarget(null)} style={{ ...btnSec, flex:1 }}>Retour</button>
              <button onClick={handleCancel} disabled={cancelling} style={{ ...btnDng, flex:1, opacity:cancelling?0.7:1 }}>
                {cancelling ? 'Annulation...' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL Facture emise */}
      {showEmiseModal && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setShowEmiseModal(false)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.5)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:460, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', padding:28 }}>
            <h3 style={{ margin:'0 0 6px', fontSize:16, fontWeight:700 }}>Nouvelle facture emise</h3>
            <p style={{ fontSize:13, color:'#8E5915', marginBottom:20 }}>Sélectionnez un BL signé pour générer la facture.</p>
            <div style={{ marginBottom:16 }}>
              <label style={lStyle}>Bon de livraison signe *</label>
              <select value={selectedBlId} onChange={e => setSelectedBlId(e.target.value)} style={iStyle}>
                <option value="">Choisir un BL signe...</option>
                {signedBls.map(bl => <option key={bl.id} value={bl.id}>{bl.number} - {bl.client?.commercial_name || '-'}</option>)}
              </select>
            </div>
            {signatures.length > 0 && (
              <div style={{ marginBottom:20 }}>
                <label style={lStyle}>Signature / Cachet</label>
                <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                  <div onClick={() => setEmiseSignatureId('')}
                    style={{ border:`2px solid ${!emiseSignatureId ? '#E59312' : '#E8D4B0'}`, borderRadius:8, padding:'6px 14px', cursor:'pointer', fontSize:12, color: !emiseSignatureId ? '#A33C00' : '#8E5915', background: !emiseSignatureId ? '#FFF8EE' : 'white', fontWeight:600 }}>
                    Aucune
                  </div>
                  {signatures.map((sig: any) => (
                    <div key={sig.id} onClick={() => setEmiseSignatureId(sig.id)}
                      style={{ border:`2px solid ${emiseSignatureId === sig.id ? '#E59312' : '#E8D4B0'}`, borderRadius:8, padding:6, cursor:'pointer', background: emiseSignatureId === sig.id ? '#FFF8EE' : 'white', display:'flex', flexDirection:'column', alignItems:'center', gap:4, minWidth:90 }}>
                      <img src={sig.image_url} alt={sig.name} style={{ height:40, maxWidth:120, objectFit:'contain' }} />
                      <span style={{ fontSize:10, fontWeight:600, color: emiseSignatureId === sig.id ? '#A33C00' : '#8E5915' }}>{sig.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {emiseError && <div style={{ background:'#FFF0F0', border:'1px solid #FFCDD2', borderRadius:8, padding:'8px 12px', marginBottom:16, fontSize:12, color:'#D32F2F' }}>{emiseError}</div>}
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setShowEmiseModal(false)} style={{ ...btnSec, flex:1 }}>Annuler</button>
              <button onClick={handleCreateEmise} disabled={!selectedBlId || creatingEmise} style={{ ...btnPri, flex:1, opacity:(!selectedBlId||creatingEmise)?0.5:1 }}>
                {creatingEmise ? 'Creation...' : 'Generer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL Voir Scan — PDF preview dans iframe, image dans modal */}
      {viewScanTarget && (
        <>
          <FileViewerModal
            url={viewScanTarget.scanned_file_url}
            title={`Scan — ${viewScanTarget.number}`}
            onClose={() => setViewScanTarget(null)}
          />
          {/* Bouton supprimer scan (hors modal pour éviter z-index conflit) */}
          <div style={{ position:'fixed', bottom:32, left:'50%', transform:'translateX(-50%)', zIndex:3100 }}>
            <button onClick={handleDeleteScan} disabled={deletingScan}
              style={{ padding:'9px 18px', borderRadius:8, border:'1.5px solid #FCA5A5', background:'white', color:'#DC2626', fontSize:12, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6, boxShadow:'0 4px 16px rgba(0,0,0,0.2)', opacity:deletingScan?0.6:1 }}>
              <ImageOff size={13} /> {deletingScan ? 'Suppression...' : 'Supprimer le scan'}
            </button>
          </div>
        </>
      )}

      {/* MODAL Importer Facture Achat */}
      {showAchatModal && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setShowAchatModal(false)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.5)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:760, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', maxHeight:'92vh', overflowY:'auto' }}>
            <div style={{ padding:'18px 24px', borderBottom:'1px solid #F5E6D3', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, background:'white', zIndex:2 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,#F4B315,#E59312)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Camera size={17} color="#1A141A" />
                </div>
                <div>
                  <h2 style={{ margin:0, fontSize:16, fontWeight:700 }}>Importer facture fournisseur</h2>
                  <p style={{ margin:0, fontSize:11, color:'#8E5915' }}>PDF ou photo — les champs se remplissent automatiquement</p>
                </div>
              </div>
              <button onClick={() => setShowAchatModal(false)} style={{ width:32, height:32, borderRadius:8, border:'1.5px solid #E8D4B0', background:'white', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <X size={15} color="#8E5915" />
              </button>
            </div>

            <div style={{ display:'grid', gridTemplateColumns: scanPreview ? '1fr 1fr' : '1fr', gap:0 }}>
              {/* Zone import */}
              <div style={{ padding:24, borderRight: scanPreview ? '1px solid #F5E6D3' : 'none' }}>
                {!scanPreview ? (
                  <div onClick={() => fileInputRef.current?.click()}
                    style={{ border:'2px dashed #D3AF85', borderRadius:12, padding:'44px 20px', textAlign:'center', cursor:'pointer', background:'#FFFDF5' }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleScanFile(f); }}>
                    <div style={{ width:60, height:60, borderRadius:15, background:'linear-gradient(135deg,#F4B315,#E59312)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
                      <Upload size={28} color="#1A141A" />
                    </div>
                    <p style={{ margin:'0 0 6px', fontSize:15, fontWeight:700, color:'#1A141A' }}>Glisser ou cliquer pour importer</p>
                    <p style={{ margin:'0 0 6px', fontSize:12, color:'#8E5915' }}>PDF recommande pour extraction automatique</p>
                    <p style={{ margin:'0 0 16px', fontSize:11, color:'#B8A090' }}>JPG, PNG, PDF — max 10 MB</p>
                    <div style={{ display:'flex', gap:8, justifyContent:'center' }}>
                      <div style={{ padding:'7px 14px', borderRadius:8, background:'linear-gradient(135deg,#F4B315,#E59312)', color:'#1A141A', fontSize:12, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}>
                        <Camera size={13} /> Photo (mobile)
                      </div>
                      <div style={{ padding:'7px 14px', borderRadius:8, border:'1.5px solid #E8D4B0', color:'#8E5915', fontSize:12, fontWeight:600, display:'flex', alignItems:'center', gap:6 }}>
                        <Upload size={13} /> Choisir PDF
                      </div>
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*,application/pdf" capture="environment" style={{ display:'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleScanFile(f); }} />
                  </div>
                ) : (
                  <div style={{ position:'relative' }}>
                    {isPDF ? (
                      <div style={{ width:'100%', borderRadius:10, border:'1px solid #F5E6D3', minHeight:200, background:'#FFFDF5', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10, padding:24 }}>
                        <div style={{ width:56, height:56, borderRadius:14, background:'linear-gradient(135deg,#F4B315,#E59312)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                          <FileText size={26} color="#1A141A" />
                        </div>
                        <p style={{ fontSize:13, fontWeight:700, color:'#1A141A', margin:0 }}>Fichier PDF importé</p>
                        {scanUrl && <a href={scanUrl} target="_blank" rel="noreferrer" style={{ fontSize:11, color:'#8E5915', textDecoration:'underline' }}>Ouvrir le PDF</a>}
                      </div>
                    ) : (
                      <img src={scanPreview!} alt="Facture" style={{ width:'100%', borderRadius:10, border:'1px solid #F5E6D3', maxHeight:380, objectFit:'contain', background:'#FFFDF5' }} />
                    )}
                    <button onClick={() => { setScanPreview(null); setScanUrl(null); setScanFilename(null); setExtractMsg(null); setIsPDF(false); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                      style={{ position:'absolute', top:8, right:8, width:28, height:28, borderRadius:6, border:'none', background:'rgba(26,20,26,0.7)', color:'white', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <X size={13} />
                    </button>
                    {(uploading || extracting) && (
                      <div style={{ position:'absolute', inset:0, background:'rgba(255,255,255,0.85)', borderRadius:10, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8 }}>
                        <div style={{ width:36, height:36, border:'3px solid #F4B315', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
                        <p style={{ fontSize:13, color:'#8E5915', fontWeight:600 }}>
                          {uploading ? 'Importation...' : 'Extraction des donnees...'}
                        </p>
                      </div>
                    )}
                    {extractMsg && !uploading && !extracting && (
                      <div style={{ marginTop:10, padding:'8px 12px', borderRadius:8,
                        background: extractMsg.includes('extraites') ? '#F0FFF4' : '#FFFDF5',
                        border: extractMsg.includes('extraites') ? '1px solid #86EFAC' : '1px solid #F5E6D3',
                        fontSize:11, color: extractMsg.includes('extraites') ? '#15803D' : '#8E5915',
                        display:'flex', alignItems:'center', gap:6, fontWeight:600 }}>
                        {extractMsg.includes('extraites') ? <Sparkles size={12} /> : <AlertCircle size={12} />}
                        {extractMsg}
                      </div>
                    )}
                    <div style={{ marginTop:10, display:'flex', justifyContent:'center' }}>
                      <button onClick={() => fileInputRef.current?.click()}
                        style={{ padding:'6px 14px', borderRadius:7, border:'1.5px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:11, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
                        <Camera size={12} /> Changer
                      </button>
                    </div>
                    <input ref={fileInputRef} type="file" accept="image/*,application/pdf" capture="environment" style={{ display:'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleScanFile(f); }} />
                  </div>
                )}
              </div>

              {/* Formulaire */}
              <form onSubmit={handleCreateAchat} style={{ padding:24 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:16 }}>
                  <div style={{ gridColumn:'1/-1' }}>
                    <label style={lStyle}>Fournisseur <span style={{ fontWeight:400, color:'#B8A090' }}>(optionnel)</span></label>
                    <select value={achatForm.fournisseur_id}
                      onChange={e => setAchatForm({...achatForm, fournisseur_id: e.target.value, fournisseur_libre: e.target.value ? '' : achatForm.fournisseur_libre})}
                      style={{ ...iStyle, border: achatForm.fournisseur_id ? '1.5px solid #86EFAC' : '1.5px solid #E8D4B0', background: achatForm.fournisseur_id ? '#F0FFF4' : 'white' }}>
                      <option value="">Sélectionner dans la liste...</option>
                      {fournisseurs.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                    {/* Champ libre si pas dans la liste */}
                    {!achatForm.fournisseur_id && (
                      <div style={{ marginTop:6 }}>
                        <input
                          value={achatForm.fournisseur_libre}
                          onChange={e => setAchatForm({...achatForm, fournisseur_libre: e.target.value})}
                          placeholder="Ou saisir le nom manuellement..."
                          style={{ ...iStyle, border: achatForm.fournisseur_libre ? '1.5px solid #FDE68A' : '1.5px solid #E8D4B0', background: achatForm.fournisseur_libre ? '#FFFDF5' : 'white' }}
                        />
                      </div>
                    )}
                    {achatForm.fournisseur_id && detectedFournisseur && (
                      <div style={{ marginTop:5, padding:'5px 10px', borderRadius:6, background:'#F0FFF4', border:'1px solid #86EFAC', fontSize:10, color:'#15803D', fontWeight:600 }}>
                        ✓ Détecté automatiquement depuis la facture
                      </div>
                    )}
                  </div>
                  <div style={{ gridColumn:'1/-1' }}>
                    <label style={lStyle}>Référence fournisseur</label>
                    <input
                      value={achatForm.ref_fournisseur}
                      onChange={e => setAchatForm({...achatForm, ref_fournisseur: e.target.value})}
                      placeholder="N° de facture fournisseur..."
                      style={iStyle}
                    />
                  </div>
                  <div>
                    <label style={lStyle}>Montant HT <span style={{ color:'#D32F2F' }}>*</span></label>
                    <input
                      type="number" step="0.01"
                      value={achatForm.total_ht_brut}
                      onChange={e => handleHtChange(e.target.value)}
                      placeholder="0.00"
                      style={{ ...iStyle, fontFamily:'monospace' }}
                      required
                    />
                  </div>
                  <div>
                    <label style={lStyle}>TVA (20%)</label>
                    <input
                      type="number" step="0.01"
                      value={achatForm.tva_amount}
                      onChange={e => handleTvaChange(e.target.value)}
                      placeholder="0.00"
                      style={{ ...iStyle, fontFamily:'monospace' }}
                    />
                  </div>
                  <div style={{ gridColumn:'1/-1' }}>
                    <label style={lStyle}>Total TTC <span style={{ color:'#D32F2F' }}>*</span></label>
                    <input
                      type="number" step="0.01"
                      value={achatForm.total_ttc}
                      onChange={e => setAchatForm({...achatForm, total_ttc: e.target.value})}
                      placeholder="0.00"
                      style={{ ...iStyle, fontFamily:'monospace', fontWeight:700 }}
                      required
                    />
                  </div>
                  <div>
                    <label style={lStyle}>Date facture</label>
                    <input
                      type="date"
                      value={achatForm.issue_date}
                      onChange={e => setAchatForm({...achatForm, issue_date: e.target.value})}
                      style={iStyle}
                    />
                  </div>
                  <div>
                    <label style={lStyle}>Date échéance</label>
                    <input
                      type="date"
                      value={achatForm.due_date}
                      onChange={e => setAchatForm({...achatForm, due_date: e.target.value})}
                      style={iStyle}
                    />
                  </div>
                  <div style={{ gridColumn:'1/-1' }}>
                    <label style={lStyle}>Notes</label>
                    <textarea
                      value={achatForm.notes}
                      onChange={e => setAchatForm({...achatForm, notes: e.target.value})}
                      placeholder="Observations..."
                      rows={2}
                      style={{ ...iStyle, resize:'vertical' as const }}
                    />
                  </div>
                </div>
                {achatError && (
                  <div style={{ padding:'8px 12px', borderRadius:8, background:'#FFF0F0', border:'1px solid #FCA5A5', fontSize:12, color:'#DC2626', marginBottom:14 }}>
                    {achatError}
                  </div>
                )}
                <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                  <button type="button" onClick={() => setShowAchatModal(false)} style={btnSec}>Annuler</button>
                  <button type="submit" disabled={creatingAchat} style={{ ...btnPri, opacity: creatingAchat ? 0.6 : 1, display:'flex', alignItems:'center', gap:6 }}>
                    {creatingAchat ? 'Création...' : '✓ Créer la facture'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* FileViewer pour factures employés en attente */}
      {pendingPreviewUrl && (
        <FileViewerModal
          url={pendingPreviewUrl}
          title="Facture d'achat"
          onClose={() => setPendingPreviewUrl(null)}
        />
      )}

    </div>
  );
}