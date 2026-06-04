'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Check, X, Camera, Pencil, Trash2, FileText, Download, Users, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import { dettesApi } from '@/lib/api';
import { formatDate, formatCurrency, cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n';
import FileViewerModal from '@/components/ui/FileViewerModal';

function CatGrouped({ items, catLabel, renderItem }: {
  items: any[];
  catLabel: Record<string, string>;
  renderItem: (d: any) => React.ReactNode;
}) {
  const byCat: Record<string, any[]> = {};
  items.forEach((d: any) => {
    if (!byCat[d.category]) byCat[d.category] = [];
    byCat[d.category].push(d);
  });
  const sorted = Object.entries(byCat).sort((pa, pb) => {
    const sa = pa[1].reduce((s: number, x: any) => s + Number(x.amount), 0);
    const sb = pb[1].reduce((s: number, x: any) => s + Number(x.amount), 0);
    return sb - sa;
  });
  return (
    <div style={{ borderTop:'1px solid #F5E6D3', padding:'12px 16px' }}>
      {sorted.map(([cat, catItems]) => {
        const catTotal = catItems.reduce((s: number, d: any) => s + Number(d.amount), 0);
        const color = CAT_COLORS[cat] || '#8E5915';
        return (
          <div key={cat} style={{ marginBottom:14 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6, padding:'7px 12px', background:'#F9F6F1', borderRadius:8, borderLeft:`3px solid ${color}` }}>
              <div style={{ width:9, height:9, borderRadius:'50%', background:color, flexShrink:0 }}/>
              <span style={{ fontSize:12, fontWeight:700, color:'#1A141A', flex:1 }}>{catLabel[cat] || cat}</span>
              <span style={{ fontSize:12, fontWeight:800, fontFamily:'monospace', color }}>{formatCurrency(catTotal)}</span>
              <span style={{ fontSize:10, color:'#B8A090', marginLeft:6 }}>{catItems.length} dép.</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:6, paddingLeft:6 }}>
              {catItems.map((d: any) => renderItem(d))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const detteStatutCfg: Record<string, { bg: string; color: string; border: string; label: string }> = {
  EN_COURS: { bg:'#FFFBEB', color:'#D97706', border:'#FDE68A', label:'En cours' },
  PARTIELLE:{ bg:'#FFF7ED', color:'#EA580C', border:'#FDBA74', label:'Partielle' },
  SOLDEE:   { bg:'#F0FDF4', color:'#16A34A', border:'#BBF7D0', label:'Soldee' },
};

const inputStyle = { width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E8D4B0', fontSize:13, outline:'none', boxSizing:'border-box' as const };
const labelStyle = { display:'block' as const, fontSize:11, fontWeight:700 as const, color:'#8E5915', textTransform:'uppercase' as const, letterSpacing:0.5, marginBottom:6 };
const btnSecondary = { padding:'9px 18px', borderRadius:8, border:'1.5px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:13, fontWeight:600 as const, cursor:'pointer' as const };
const btnPrimary = { padding:'9px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#F4B315,#E59312)', color:'#1A141A', fontSize:13, fontWeight:700 as const, cursor:'pointer' as const };
const btnDanger = { padding:'9px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#EF4444,#DC2626)', color:'white', fontSize:13, fontWeight:700 as const, cursor:'pointer' as const };
const card = { background:'white', borderRadius:12, border:'1px solid #F5E6D3', padding:'16px 20px' };

const CAT_COLORS: Record<string, string> = {
  MATERIEL:'#3B82F6', MAIN_OEUVRE:'#8B5CF6', TRANSPORT:'#F59E0B',
  CARBURANT:'#EF4444', OUTILS:'#10B981', SOUS_TRAITANCE:'#EC4899', AUTRE:'#6B7280',
};

function getUser() { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } }
function isManager() { const r = getUser().role; return r === 'ADMIN' || r === 'GERANT'; }
function getPrestations() { try { return JSON.parse(localStorage.getItem('etcc_prestations') || '[]'); } catch { return []; } }

export default function DepensesPage() {
  const { t } = useLanguage();

  const catLabel: Record<string, string> = {
    MATERIEL: t('dep.materiel'), MAIN_OEUVRE: t('dep.main_oeuvre'),
    TRANSPORT: t('dep.transport'), CARBURANT: t('dep.carburant'),
    OUTILS: t('dep.outils'), SOUS_TRAITANCE: t('dep.sous_trait'), AUTRE: t('dep.autre'),
  };
  const statusConfig: Record<string, { cls: string; label: string }> = {
    PENDING:  { cls: 'badge-warning', label: t('dep.pending') },
    APPROVED: { cls: 'badge-success', label: t('dep.approved') },
    REJECTED: { cls: 'badge-danger',  label: t('dep.rejected') },
  };

  const [tab, setTab] = useState<'depenses'|'main_oeuvre'|'dettes'>('depenses');

  /* ══════ DÉPENSES state ══════ */
  const [depenses, setDepenses] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [prestations, setPrestations] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [editTarget, setEditTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [viewScan, setViewScan] = useState<string | null>(null);
  const [showScansModal, setShowScansModal] = useState(false);

  /* form state — avec source_type */
  const emptyForm = { description:'', amount:'', category:'MATERIEL', payment_method:'ESPECES', project_id:'', prestation_id:'', prestation_nom:'', source_type:'chantier' as 'chantier'|'prestation', date:new Date().toISOString().slice(0,10), notes:'', receipt_url:'' };
  const [form, setForm] = useState(emptyForm);
  const [receiptPreview, setReceiptPreview] = useState<string>('');
  const [receiptIsPdf, setReceiptIsPdf] = useState(false);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [canApp, setCanApp] = useState(false);
  const [isMgr, setIsMgr] = useState(false);

  /* ══════ MAIN D'OEUVRE state ══════ */
  const [moList, setMoList] = useState<any[]>([]);
  const [loadingMo, setLoadingMo] = useState(false);

  /* ══════ DETTES state ══════ */
  const [dettes, setDettes] = useState<any[]>([]);
  const [detteStats, setDetteStats] = useState<any>(null);
  const [loadingDettes, setLoadingDettes] = useState(false);
  const [selectedDette, setSelectedDette] = useState<any>(null);
  const [showDetteForm, setShowDetteForm] = useState(false);
  const [editDette, setEditDette] = useState<any>(null);
  const [detteForm, setDetteForm] = useState({ nom:'', description:'', montant:'', date:new Date().toISOString().slice(0,10), project_id:'', prestation_id:'', prestation_nom:'', source_type:'chantier' as 'chantier'|'prestation', notes:'' });
  const [savingDette, setSavingDette] = useState(false);
  const [detteError, setDetteError] = useState('');
  const [showPayDetteForm, setShowPayDetteForm] = useState(false);
  const [payDetteForm, setPayDetteForm] = useState({ montant:'', mode:'ESPECES', date:new Date().toISOString().slice(0,10), notes:'' });
  const [savingPayDette, setSavingPayDette] = useState(false);
  const [payDetteError, setPayDetteError] = useState('');
  const [deleteDetteTarget, setDeleteDetteTarget] = useState<any>(null);

  /* ══════ GROUP / VIEW state ══════ */
  const [kpiPeriod, setKpiPeriod] = useState<'semaine'|'mois'|'trimestre'|'annee'>('mois');
  const [expandedChantier, setExpandedChantier] = useState<string|null>(null);
  const [expandedPrestation, setExpandedPrestation] = useState<string|null>(null);
  const [expandedMoChantier, setExpandedMoChantier] = useState<string|null>(null);
  const [expandedMoPrestation, setExpandedMoPrestation] = useState<string|null>(null);

  useEffect(() => {
    const mgr = isManager();
    setCanApp(mgr); setIsMgr(mgr);
    setPrestations(getPrestations());
    if (!mgr && tab === 'dettes') setTab('depenses');
  }, []);

  useEffect(() => {
    api.get('/projects', { params:{ limit:200 } }).then(r => setProjects(r.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === 'depenses')    load();
    if (tab === 'main_oeuvre') loadMO();
    if (tab === 'dettes')      loadDettes();
  }, [tab, statusFilter, isMgr]);

  /* ══════ LOADERS ══════ */
  const load = () => {
    setLoading(true);
    const endpoint = isMgr ? '/depenses' : '/depenses/my';
    const params: any = { limit: 500 };
    if (statusFilter) params.status = statusFilter;
    const listReq = api.get(endpoint, { params });
    const statsReq = isMgr ? api.get('/depenses/stats').catch(() => ({ data: null })) : Promise.resolve({ data: null });
    Promise.all([listReq, statsReq])
      .then(([listRes, statsRes]) => {
        setDepenses(listRes.data?.data || listRes.data || []);
        if (statsRes.data) setStats(statsRes.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const loadMO = async () => {
    setLoadingMo(true);
    try {
      const endpoint = isMgr ? '/depenses' : '/depenses/my';
      const res = await api.get(endpoint, { params:{ category:'MAIN_OEUVRE', limit:500 } });
      setMoList(res.data?.data || res.data || []);
    } catch(e) { console.error(e); }
    finally { setLoadingMo(false); }
  };

  const loadDettes = async () => {
    setLoadingDettes(true);
    try {
      const [listRes, statsRes] = await Promise.all([dettesApi.list(), dettesApi.stats()]);
      setDettes(listRes.data || []);
      setDetteStats(statsRes.data || null);
    } catch(e) { console.error(e); }
    finally { setLoadingDettes(false); }
  };

  /* ══════ FORM HANDLERS ══════ */
  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingReceipt(true);
    const isPdf = file.type === 'application/pdf';
    setReceiptIsPdf(isPdf);
    if (!isPdf) { const reader = new FileReader(); reader.onload = ev => setReceiptPreview(ev.target?.result as string); reader.readAsDataURL(file); }
    else setReceiptPreview('');
    try {
      const fd = new FormData(); fd.append('file', file);
      const { data } = await api.post('/upload', fd, { headers:{ 'Content-Type':'multipart/form-data' } });
      if (!data?.url && !data?.filename) throw new Error('Reponse invalide');
      setForm(f => ({ ...f, receipt_url: data.url || data.filename || '' }));
    } catch (err: any) {
      setSaveError(err?.response?.data?.message || err?.message || 'Erreur upload');
    } finally { setUploadingReceipt(false); }
  };

  const removeReceipt = () => { setForm(f => ({ ...f, receipt_url:'' })); setReceiptPreview(''); setReceiptIsPdf(false); if (fileInputRef.current) fileInputRef.current.value = ''; };

  const openCreate = () => {
    setEditTarget(null);
    setForm(emptyForm);
    setReceiptPreview(''); setReceiptIsPdf(false); setSaveError(''); setShowForm(true);
  };

  const openEdit = (d: any) => {
    setEditTarget(d);
    const sourceType = d.prestation_id ? 'prestation' : 'chantier';
    setForm({ description:d.description, amount:String(d.amount), category:d.category, payment_method:d.payment_method||'ESPECES', project_id:d.project?.id||'', prestation_id:d.prestation_id||'', prestation_nom:d.prestation_nom||'', source_type:sourceType, date:d.date?d.date.slice(0,10):new Date().toISOString().slice(0,10), notes:d.notes||'', receipt_url:d.receipt_url||'' });
    setReceiptPreview(''); setReceiptIsPdf(false); setSaveError(''); setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setSaveError('');
    if (!form.description.trim()) { setSaveError('Description obligatoire'); return; }
    const parsedAmount = parseFloat(form.amount);
    if (!form.amount || isNaN(parsedAmount) || parsedAmount <= 0) { setSaveError('Montant invalide'); return; }
    setSaving(true);
    const payload: any = {
      description: form.description.trim(), amount: parsedAmount, category: form.category,
      payment_method: form.payment_method||'ESPECES',
      date: form.date ? new Date(form.date) : undefined,
      notes: form.notes||undefined, receipt_url: form.receipt_url||undefined,
    };
    if (form.source_type === 'chantier') {
      payload.project_id = form.project_id || undefined;
      payload.prestation_id = null; payload.prestation_nom = null;
    } else {
      payload.prestation_id = form.prestation_id || undefined;
      payload.prestation_nom = form.prestation_nom || undefined;
      payload.project_id = null;
    }
    try {
      if (editTarget) await api.patch(`/depenses/${editTarget.id}`, payload);
      else            await api.post('/depenses', payload);
      load(); setShowForm(false); setEditTarget(null);
    } catch (e: any) { const msg = e?.response?.data?.message; setSaveError(Array.isArray(msg)?msg.join(', '):(msg||'Erreur')); }
    finally { setSaving(false); }
  };

  const approve = async (id: string) => { await api.patch(`/depenses/${id}/approve`); load(); };
  const handleReject = async () => {
    if (!rejectTarget) return;
    await api.patch(`/depenses/${rejectTarget.id}/reject`, { reason:rejectReason||undefined });
    load(); setRejectTarget(null); setRejectReason('');
  };
  const handleDelete = async () => {
    if (!deleteTarget) return; setDeleting(true);
    try { await api.delete(`/depenses/${deleteTarget.id}`); load(); setDeleteTarget(null); }
    catch (e: any) { alert(e?.response?.data?.message||'Erreur'); }
    finally { setDeleting(false); }
  };

  /* ══════ DETTES HANDLERS ══════ */
  const openDette = (d: any) => { setSelectedDette(d); setShowPayDetteForm(false); setPayDetteError(''); };
  const openCreateDette = () => {
    setEditDette(null);
    setDetteForm({ nom:'', description:'', montant:'', date:new Date().toISOString().slice(0,10), project_id:'', prestation_id:'', prestation_nom:'', source_type:'chantier', notes:'' });
    setDetteError(''); setShowDetteForm(true);
  };
  const openEditDette = (d: any) => {
    setEditDette(d);
    const sourceType = d.prestation_id ? 'prestation' : 'chantier';
    setDetteForm({ nom:d.nom, description:d.description, montant:String(d.montant), date:d.date?d.date.slice(0,10):new Date().toISOString().slice(0,10), project_id:d.project_id||'', prestation_id:d.prestation_id||'', prestation_nom:d.prestation_nom||'', source_type:sourceType, notes:d.notes||'' });
    setDetteError(''); setShowDetteForm(true);
  };
  const handleSaveDette = async (e: React.FormEvent) => {
    e.preventDefault(); setDetteError('');
    if (!detteForm.nom.trim()) { setDetteError('Nom obligatoire'); return; }
    if (!detteForm.montant || isNaN(Number(detteForm.montant))) { setDetteError('Montant invalide'); return; }
    setSavingDette(true);
    const payload: any = { nom:detteForm.nom.trim(), description:detteForm.description||detteForm.nom, montant:Number(detteForm.montant), date:detteForm.date||undefined, notes:detteForm.notes||undefined };
    if (detteForm.source_type === 'chantier') { payload.project_id = detteForm.project_id||undefined; }
    else { payload.prestation_id = detteForm.prestation_id||undefined; payload.prestation_nom = detteForm.prestation_nom||undefined; }
    try {
      if (editDette) { const r = await dettesApi.update(editDette.id, payload); setSelectedDette(r.data); }
      else { await dettesApi.create(payload); }
      await loadDettes(); setShowDetteForm(false); setEditDette(null);
    } catch(e:any) { const msg = e?.response?.data?.message; setDetteError(Array.isArray(msg)?msg.join(', '):(msg||'Erreur')); }
    finally { setSavingDette(false); }
  };
  const handleDeleteDette = async () => {
    if (!deleteDetteTarget) return;
    try { await dettesApi.delete(deleteDetteTarget.id); setDettes(prev => prev.filter(d => d.id !== deleteDetteTarget.id)); if (selectedDette?.id === deleteDetteTarget.id) setSelectedDette(null); setDeleteDetteTarget(null); await dettesApi.stats().then(r => setDetteStats(r.data)); }
    catch(e:any) { alert(e?.response?.data?.message||'Erreur'); }
  };
  const handlePayDette = async (e: React.FormEvent) => {
    e.preventDefault(); if (!selectedDette) return;
    if (!payDetteForm.montant || isNaN(Number(payDetteForm.montant))) { setPayDetteError('Montant invalide'); return; }
    setSavingPayDette(true); setPayDetteError('');
    try {
      const r = await dettesApi.addPaiement(selectedDette.id, { montant:Number(payDetteForm.montant), mode:payDetteForm.mode, date:payDetteForm.date||undefined, notes:payDetteForm.notes||undefined });
      setSelectedDette(r.data); setDettes(prev => prev.map(d => d.id === r.data.id ? r.data : d));
      await dettesApi.stats().then(rs => setDetteStats(rs.data));
      setShowPayDetteForm(false); setPayDetteForm({ montant:'', mode:'ESPECES', date:new Date().toISOString().slice(0,10), notes:'' });
    } catch(e:any) { setPayDetteError(e?.response?.data?.message||'Erreur'); }
    finally { setSavingPayDette(false); }
  };
  const handleDeletePaiementDette = async (pid: string) => {
    if (!selectedDette) return;
    try {
      const r = await dettesApi.deletePaiement(selectedDette.id, pid);
      setSelectedDette(r.data); setDettes(prev => prev.map(d => d.id === r.data.id ? r.data : d));
      await dettesApi.stats().then(rs => setDetteStats(rs.data));
    } catch(e:any) { alert(e?.response?.data?.message||'Erreur'); }
  };

  /* ══════ HELPERS ══════ */
  const filterByPeriod = (items: any[], period: string) => {
    const now = new Date();
    if (period === 'semaine') { const s = new Date(now); s.setDate(now.getDate()-now.getDay()); s.setHours(0,0,0,0); return items.filter(d => new Date(d.date) >= s); }
    if (period === 'mois') { return items.filter(d => new Date(d.date) >= new Date(now.getFullYear(), now.getMonth(), 1)); }
    if (period === 'trimestre') { const q = Math.floor(now.getMonth()/3); return items.filter(d => new Date(d.date) >= new Date(now.getFullYear(), q*3, 1)); }
    if (period === 'annee') { return items.filter(d => new Date(d.date) >= new Date(now.getFullYear(), 0, 1)); }
    return items;
  };

  /* Répartition par catégorie */
  const getRepartition = (items: any[]) => {
    const acc: Record<string,number> = {};
    items.forEach(d => { acc[d.category] = (acc[d.category]||0) + Number(d.amount); });
    const total = Object.values(acc).reduce((s,v)=>s+v,0);
    return Object.entries(acc).map(([cat,amt]) => ({ cat, amt, pct: total>0 ? Math.round(amt/total*100) : 0 })).sort((a,b)=>b.amt-a.amt);
  };

  /* Groupement */
  const groupByChantier = (items: any[]) => {
    const acc: Record<string,any> = {};
    items.filter(d => d.project_id && !d.prestation_id).forEach(d => {
      const key = d.project?.id || d.project_id;
      const name = d.project?.name || 'Chantier inconnu';
      if (!acc[key]) acc[key] = { key, name, items:[], total:0, approved:0 };
      acc[key].items.push(d); acc[key].total += Number(d.amount);
      if (d.status==='APPROVED') acc[key].approved += Number(d.amount);
    });
    return Object.values(acc).sort((a:any,b:any) => b.total-a.total);
  };

  const groupByPrestation = (items: any[]) => {
    const acc: Record<string,any> = {};
    items.filter(d => d.prestation_id).forEach(d => {
      const key = d.prestation_id;
      const name = d.prestation_nom || key;
      if (!acc[key]) acc[key] = { key, name, items:[], total:0, approved:0 };
      acc[key].items.push(d); acc[key].total += Number(d.amount);
      if (d.status==='APPROVED') acc[key].approved += Number(d.amount);
    });
    // Also include items without project_id AND without prestation_id as "Sans affectation"
    const orphans = items.filter(d => !d.project_id && !d.prestation_id);
    if (orphans.length > 0) {
      acc['__none__'] = { key:'__none__', name:'Sans affectation', items:orphans, total:orphans.reduce((s:number,d:any)=>s+Number(d.amount),0), approved:orphans.filter((d:any)=>d.status==='APPROVED').reduce((s:number,d:any)=>s+Number(d.amount),0) };
    }
    return Object.values(acc).sort((a:any,b:any) => b.total-a.total);
  };

  const scansWithReceipts = depenses.filter(d => d.receipt_url);

  /* ══════ RENDER HELPERS ══════ */
  const groupToggleBtn = (active: boolean) => ({
    padding:'5px 13px', borderRadius:6, border:'none', fontSize:11, fontWeight:700 as const, cursor:'pointer' as const,
    background: active ? 'white' : 'transparent', color: active ? '#8E5915' : '#B8A090',
    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition:'all 0.15s',
  });

  /* Répartition bars */
  const RepartitionBars = ({ items }: { items: any[] }) => {
    const reps = getRepartition(items);
    if (!reps.length) return null;
    return (
      <div style={{ marginTop:10, padding:'10px 14px', background:'#FFFDF5', borderRadius:8, border:'1px solid #F5E6D3' }}>
        <p style={{ margin:'0 0 8px', fontSize:9, fontWeight:700, textTransform:'uppercase', color:'#8E5915', letterSpacing:0.5 }}>Répartition par type</p>
        <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
          {reps.map(r => (
            <div key={r.cat} style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:10, color:'#5C3A1E', minWidth:90 }}>{catLabel[r.cat]||r.cat}</span>
              <div style={{ flex:1, height:6, background:'#F5E6D3', borderRadius:3, overflow:'hidden' }}>
                <div style={{ width:`${r.pct}%`, height:'100%', background:CAT_COLORS[r.cat]||'#8E5915', borderRadius:3, transition:'width 0.4s' }}/>
              </div>
              <span style={{ fontSize:10, fontWeight:700, color:'#1A141A', minWidth:70, textAlign:'right', fontFamily:'monospace' }}>{formatCurrency(r.amt)}</span>
              <span style={{ fontSize:9, color:'#B8A090', minWidth:28, textAlign:'right' }}>{r.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  /* Item dépense */
  const renderDepenseItem = (d: any) => (
    <div key={d.id} className={cn('flex items-center gap-4 p-4 rounded-lg border transition-all',
      d.status==='PENDING'?'border-amber-200 bg-amber-50/20':d.status==='APPROVED'?'border-green-200 bg-green-50/20':'border-gray-200 bg-gray-50')}>
      <div className="w-10 h-10 rounded-lg bg-white border border-honey-beige-soft flex items-center justify-center flex-shrink-0 text-[11px] font-bold" style={{ color: CAT_COLORS[d.category]||'#8E5915' }}>
        {catLabel[d.category]?.slice(0,3)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-honey-dark truncate">{d.description}</p>
          {d.receipt_url && (
            <button onClick={() => setViewScan(d.receipt_url)} title="Voir le scan"
              className="flex items-center gap-1 text-[10px] text-green-600 bg-green-50 border border-green-200 rounded px-1.5 py-0.5 hover:bg-green-100 transition-all flex-shrink-0">
              <Camera size={10}/> Scan
            </button>
          )}
        </div>
        <p className="text-xs text-honey-caramel mt-0.5">
          {catLabel[d.category]} &bull; {d.prestation_nom ? `📋 ${d.prestation_nom}` : d.project?.name ? `📍 ${d.project.name}` : 'Sans affectation'} &bull; {formatDate(d.date)}
        </p>
        {isMgr && (d.submitter?.first_name||d.submitter?.last_name) && (
          <p className="text-[11px] text-honey-caramel mt-0.5">👷 <strong className="text-honey-dark">{d.submitter.first_name} {d.submitter.last_name}</strong></p>
        )}
        {d.reject_reason && <p className="text-[11px] text-red-500 mt-0.5">Motif : {d.reject_reason}</p>}
      </div>
      <div className="text-right flex-shrink-0">
        <p className="font-bold text-honey-dark font-mono">{formatCurrency(Number(d.amount))}</p>
      </div>
      <span className={cn('badge border text-[10px] flex-shrink-0', statusConfig[d.status]?.cls)}>{statusConfig[d.status]?.label}</span>
      {canApp && d.status==='PENDING' && (
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => approve(d.id)} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-semibold hover:bg-green-100 transition-all"><Check size={12}/> Approuver</button>
          <button onClick={() => { setRejectTarget(d); setRejectReason(''); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded-lg text-xs font-semibold hover:bg-red-100 transition-all"><X size={12}/> Refuser</button>
        </div>
      )}
      {(d.status==='PENDING'||canApp) && (
        <div className="flex gap-1.5 flex-shrink-0">
          <button onClick={() => openEdit(d)} className="w-7 h-7 rounded-md border border-honey-beige-soft flex items-center justify-center text-honey-caramel hover:text-honey-dark hover:border-honey-gold hover:bg-honey-cream transition-all"><Pencil size={12}/></button>
          {canApp && <button onClick={() => setDeleteTarget(d)} className="w-7 h-7 rounded-md border border-red-200 flex items-center justify-center text-red-400 hover:text-red-600 hover:border-red-400 hover:bg-red-50 transition-all"><Trash2 size={12}/></button>}
        </div>
      )}
    </div>
  );

  /* Accordion group générique */
  const renderGroupSection = (
    title: string, icon: string, groups: any[],
    expanded: string|null, setExpanded: (k:string|null)=>void,
    emptyMsg: string
  ) => (
    <div style={{ marginBottom:20 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
        <span style={{ fontSize:16 }}>{icon}</span>
        <p style={{ margin:0, fontSize:13, fontWeight:800, color:'#1A141A' }}>{title}</p>
        <span style={{ fontSize:11, color:'#8E5915', background:'#F5E6D3', padding:'2px 8px', borderRadius:10 }}>
          {formatCurrency(groups.reduce((s,g)=>s+g.total,0))}
        </span>
      </div>
      {groups.length === 0
        ? <p style={{ fontSize:12, color:'#B8A090', padding:'12px 16px', background:'#FAFAFA', borderRadius:8, border:'1px dashed #E8D4B0' }}>{emptyMsg}</p>
        : <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {groups.map((g:any) => {
              const isOpen = expanded === g.key;
              return (
                <div key={g.key} style={{ background:'white', borderRadius:12, border: isOpen ? '1.5px solid #F4B315' : '1px solid #F5E6D3', overflow:'hidden', transition:'border-color 0.15s' }}>
                  <div onClick={() => setExpanded(isOpen ? null : g.key)}
                    style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 18px', cursor:'pointer', background: isOpen ? '#FFFDF5' : 'white' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      {isOpen ? <ChevronDown size={15} color="#8E5915"/> : <ChevronRight size={15} color="#8E5915"/>}
                      <div>
                        <p style={{ margin:0, fontSize:13, fontWeight:700, color:'#1A141A' }}>{g.name}</p>
                        <p style={{ margin:'2px 0 0', fontSize:11, color:'#8E5915' }}>{g.items.length} dépense{g.items.length>1?'s':''}</p>
                      </div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <p style={{ margin:0, fontSize:15, fontWeight:800, color:'#1A141A', fontFamily:'monospace' }}>{formatCurrency(g.total)}</p>
                      <p style={{ margin:'2px 0 0', fontSize:10, color:'#10B981', fontWeight:600 }}>✓ {formatCurrency(g.approved)}</p>
                    </div>
                  </div>
                  {isOpen && (
                    <CatGrouped items={g.items} catLabel={catLabel} renderItem={renderDepenseItem} />
                  )}
                </div>
              );
            })}
          </div>
      }
    </div>
  );

  /* MO accordion */
  const moByChantier = (() => {
    const acc: Record<string,any> = {};
    moList.filter(d => d.project_id && !d.prestation_id).forEach(d => {
      const key = d.project?.id || d.project_id;
      const name = d.project?.name || 'Chantier inconnu';
      if (!acc[key]) acc[key] = { key, name, items:[], total:0, paye:0, pending:0 };
      acc[key].items.push(d); acc[key].total += Number(d.amount);
      if (d.status==='APPROVED') acc[key].paye += Number(d.amount);
      if (d.status==='PENDING') acc[key].pending += Number(d.amount);
    });
    return Object.values(acc).sort((a:any,b:any)=>b.total-a.total);
  })();

  const moByPrestation = (() => {
    const acc: Record<string,any> = {};
    moList.filter(d => d.prestation_id).forEach(d => {
      const key = d.prestation_id;
      const name = d.prestation_nom || key;
      if (!acc[key]) acc[key] = { key, name, items:[], total:0, paye:0, pending:0 };
      acc[key].items.push(d); acc[key].total += Number(d.amount);
      if (d.status==='APPROVED') acc[key].paye += Number(d.amount);
      if (d.status==='PENDING') acc[key].pending += Number(d.amount);
    });
    const orphans = moList.filter(d => !d.project_id && !d.prestation_id);
    if (orphans.length) acc['__none__'] = { key:'__none__', name:'Sans affectation', items:orphans, total:orphans.reduce((s:number,d:any)=>s+Number(d.amount),0), paye:orphans.filter((d:any)=>d.status==='APPROVED').reduce((s:number,d:any)=>s+Number(d.amount),0), pending:orphans.filter((d:any)=>d.status==='PENDING').reduce((s:number,d:any)=>s+Number(d.amount),0) };
    return Object.values(acc).sort((a:any,b:any)=>b.total-a.total);
  })();

  const renderMoGroup = (groups: any[], expanded: string|null, setExpanded: (k:string|null)=>void) => (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      {groups.map((g:any) => {
        const isOpen = expanded === g.key;
        return (
          <div key={g.key} style={card}>
            <div onClick={() => setExpanded(isOpen ? null : g.key)} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:38, height:38, borderRadius:'50%', background:'linear-gradient(135deg,#F4B315,#E59312)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ fontSize:15, fontWeight:900, color:'#1A141A' }}>{g.name[0]?.toUpperCase()}</span>
                </div>
                <div>
                  <p style={{ margin:0, fontSize:14, fontWeight:700, color:'#1A141A' }}>{g.name}</p>
                  <p style={{ margin:'2px 0 0', fontSize:11, color:'#8E5915' }}>{g.items.length} paiement{g.items.length>1?'s':''}</p>
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ textAlign:'right' }}>
                  <p style={{ margin:0, fontSize:13, fontWeight:800, color:'#1A141A', fontFamily:'monospace' }}>{formatCurrency(g.total)}</p>
                  <div style={{ display:'flex', gap:6, justifyContent:'flex-end', marginTop:2 }}>
                    <span style={{ fontSize:10, color:'#10B981', fontWeight:600 }}>✓ {formatCurrency(g.paye)}</span>
                    {g.pending > 0 && <span style={{ fontSize:10, color:'#F97316', fontWeight:600 }}>⏳ {formatCurrency(g.pending)}</span>}
                  </div>
                </div>
                {isOpen ? <ChevronDown size={15} color="#8E5915"/> : <ChevronRight size={15} color="#8E5915"/>}
              </div>
            </div>
            {isOpen && (
              <div style={{ marginTop:12, borderTop:'1px solid #F5E6D3', paddingTop:12 }}>
                <RepartitionBars items={g.items}/>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, marginTop:12 }}>
                  <thead>
                    <tr style={{ background:'#FDF6E9' }}>
                      {['Date','Description','Montant','Statut'].map(h => (
                        <th key={h} style={{ padding:'6px 10px', textAlign:'left', fontSize:9, fontWeight:700, color:'#8E5915', textTransform:'uppercase', borderBottom:'1px solid #F5E6D3' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...g.items].sort((a:any,b:any)=>new Date(b.date).getTime()-new Date(a.date).getTime()).map((d:any,i:number) => (
                      <tr key={d.id} style={{ borderBottom:'1px solid #F5E6D3', background:i%2===0?'white':'#FFFDF7' }}>
                        <td style={{ padding:'7px 10px', color:'#5C3A1E' }}>{formatDate(d.date)}</td>
                        <td style={{ padding:'7px 10px', color:'#1A141A', fontWeight:600 }}>{d.description}</td>
                        <td style={{ padding:'7px 10px', fontFamily:'monospace', fontWeight:700, color:'#1A141A' }}>{formatCurrency(Number(d.amount))}</td>
                        <td style={{ padding:'7px 10px' }}>
                          <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:4,
                            background:d.status==='APPROVED'?'#F0FFF4':d.status==='PENDING'?'#FFFBEB':'#FFF5F5',
                            color:d.status==='APPROVED'?'#16A34A':d.status==='PENDING'?'#D97706':'#DC2626',
                            border:`1px solid ${d.status==='APPROVED'?'#86EFAC':d.status==='PENDING'?'#FDE68A':'#FECACA'}` }}>
                            {statusConfig[d.status]?.label}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  /* Period selector */
  const PeriodSelector = () => (
    <div style={{ display:'flex', gap:3, background:'white', borderRadius:8, padding:3, border:'1px solid #E8D4B0' }}>
      {(['semaine','mois','trimestre','annee'] as const).map(p => (
        <button key={p} onClick={() => setKpiPeriod(p)}
          style={{ padding:'4px 10px', borderRadius:5, border:'none', fontSize:10, fontWeight:700, cursor:'pointer', transition:'all 0.15s',
            background: kpiPeriod===p ? 'linear-gradient(135deg,#F4B315,#E59312)' : 'transparent',
            color: kpiPeriod===p ? '#1A141A' : '#8E5915' }}>
          {p==='semaine'?'Semaine':p==='mois'?'Mois':p==='trimestre'?'Trimestre':'Année'}
        </button>
      ))}
    </div>
  );

  /* Source toggle (form) */
  const SourceToggle = ({ value, onChange }: { value:'chantier'|'prestation', onChange:(v:'chantier'|'prestation')=>void }) => (
    <div style={{ display:'flex', gap:2, background:'#F9F3EC', borderRadius:8, padding:3 }}>
      {([['chantier','📍 Chantier'],['prestation','📋 Prestation']] as const).map(([v,l]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          style={{ padding:'6px 16px', borderRadius:6, border:'none', fontSize:12, fontWeight:700, cursor:'pointer',
            background: value===v ? 'white' : 'transparent', color: value===v ? '#8E5915' : '#B8A090',
            boxShadow: value===v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
          {l}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-[22px] font-bold text-honey-dark font-display tracking-tight">Depenses</h1>
          <p className="text-sm text-honey-caramel mt-0.5">{isMgr ? "Gestion des dépenses, main d'oeuvre et dettes" : 'Mes dépenses soumises'}</p>
        </div>
        <div className="flex gap-2">
          {tab === 'depenses' && isMgr && scansWithReceipts.length > 0 && (
            <button onClick={() => setShowScansModal(true)}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 16px', borderRadius:8, border:'1.5px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:13, fontWeight:600, cursor:'pointer' }}>
              <Camera size={13}/> Justificatifs ({scansWithReceipts.length})
            </button>
          )}
          {tab === 'depenses' && <button onClick={openCreate} className="btn-primary text-sm"><Plus size={13}/> Soumettre dépense</button>}
          {tab === 'dettes' && <button onClick={openCreateDette} style={btnPrimary}><Plus size={13}/> Nouvelle dette</button>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'2px solid #F5E6D3' }}>
        {([
          { id:'depenses', label:'Dépenses', mgr:false },
          { id:'main_oeuvre', label:"Main d'Œuvre", mgr:false },
          { id:'dettes', label:'Dettes', mgr:true },
        ] as const).filter(t => !t.mgr || isMgr).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding:'9px 20px', borderRadius:'8px 8px 0 0', border:'none', fontSize:13, fontWeight:700, cursor:'pointer', transition:'all 0.15s',
              background: tab===t.id ? 'linear-gradient(135deg,#F4B315,#E59312)' : 'white',
              color: tab===t.id ? '#1A141A' : '#8E5915',
              borderBottom: tab===t.id ? '2px solid #F4B315' : '2px solid transparent',
              marginBottom: tab===t.id ? -2 : 0 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════ TAB DÉPENSES ══════════════════ */}
      {tab === 'depenses' && (
        <>
          {/* KPIs mois */}
          {isMgr && stats && (
            <div className="bg-gradient-to-br from-honey-beige-soft to-honey-cream border border-honey-beige-soft rounded-lg p-4 mb-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-honey-caramel mb-3">Ce mois-ci</p>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label:'Total', value:formatCurrency(stats?.total_amount||0), color:'text-honey-dark' },
                  { label:'En attente', value:stats?.pending_count||0, color:'text-amber-600' },
                  { label:'Approuvées', value:formatCurrency(stats?.approved_amount||0), color:'text-green-600' },
                  { label:'Refusées', value:stats?.rejected_count||0, color:'text-red-500' },
                ].map(kpi => (
                  <div key={kpi.label} className="bg-white rounded-lg p-3 border border-honey-beige-soft">
                    <p className="text-[10px] text-honey-caramel uppercase tracking-wide mb-1">{kpi.label}</p>
                    <p className={cn('text-lg font-bold font-mono', kpi.color)}>{kpi.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* KPIs par période */}
          {isMgr && (
            <div className="bg-gradient-to-br from-honey-beige-soft to-honey-cream border border-honey-beige-soft rounded-lg p-4 mb-4">
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-honey-caramel">Total par période</p>
                <PeriodSelector/>
              </div>
              {/* Chantiers */}
              <p style={{ fontSize:10, fontWeight:700, color:'#8E5915', margin:'0 0 6px', textTransform:'uppercase' }}>📍 Chantiers</p>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
                <div className="bg-white rounded-lg border border-honey-beige-soft" style={{ padding:'8px 14px', minWidth:120 }}>
                  <p style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', color:'#8E5915', marginBottom:3 }}>Total</p>
                  <p style={{ fontSize:16, fontWeight:800, color:'#F4B315', fontFamily:'monospace', margin:0 }}>
                    {formatCurrency(filterByPeriod(depenses,kpiPeriod).filter(d=>d.project_id&&!d.prestation_id).reduce((s,d)=>s+Number(d.amount),0))}
                  </p>
                </div>
                {groupByChantier(filterByPeriod(depenses,kpiPeriod)).map(g => (
                  <div key={g.key} className="bg-white rounded-lg border border-honey-beige-soft" style={{ padding:'8px 14px', minWidth:120, maxWidth:180 }}>
                    <p style={{ fontSize:9, fontWeight:700, color:'#8E5915', marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={g.name}>{g.name}</p>
                    <p style={{ fontSize:15, fontWeight:800, color:'#1A141A', fontFamily:'monospace', margin:0 }}>{formatCurrency(g.total)}</p>
                  </div>
                ))}
              </div>
              {/* Prestations */}
              <p style={{ fontSize:10, fontWeight:700, color:'#8E5915', margin:'0 0 6px', textTransform:'uppercase' }}>📋 Prestations</p>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <div className="bg-white rounded-lg border border-honey-beige-soft" style={{ padding:'8px 14px', minWidth:120 }}>
                  <p style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', color:'#8E5915', marginBottom:3 }}>Total</p>
                  <p style={{ fontSize:16, fontWeight:800, color:'#8B5CF6', fontFamily:'monospace', margin:0 }}>
                    {formatCurrency(filterByPeriod(depenses,kpiPeriod).filter(d=>d.prestation_id).reduce((s,d)=>s+Number(d.amount),0))}
                  </p>
                </div>
                {groupByPrestation(filterByPeriod(depenses,kpiPeriod)).filter(g=>g.key!=='__none__').map(g => (
                  <div key={g.key} className="bg-white rounded-lg border border-honey-beige-soft" style={{ padding:'8px 14px', minWidth:120, maxWidth:180 }}>
                    <p style={{ fontSize:9, fontWeight:700, color:'#8E5915', marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={g.name}>{g.name}</p>
                    <p style={{ fontSize:15, fontWeight:800, color:'#1A141A', fontFamily:'monospace', margin:0 }}>{formatCurrency(g.total)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Filtre statut */}
          <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
            {(['','PENDING','APPROVED','REJECTED'] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                  statusFilter===s ? 'bg-honey-dark text-white border-honey-dark' : 'bg-white text-honey-caramel border-honey-beige-soft hover:border-honey-gold')}>
                {s==='' ? 'Tous statuts' : statusConfig[s]?.label}
              </button>
            ))}
          </div>

          {loading ? <p className="py-12 text-center text-honey-caramel">Chargement...</p> : (
            <>
              {/* Section Chantiers */}
              {renderGroupSection(
                'Dépenses par Chantier', '📍',
                groupByChantier(depenses), expandedChantier, setExpandedChantier,
                'Aucune dépense liée à un chantier'
              )}
              {/* Section Prestations */}
              {renderGroupSection(
                'Dépenses par Prestation', '📋',
                groupByPrestation(depenses), expandedPrestation, setExpandedPrestation,
                'Aucune dépense liée à une prestation'
              )}
            </>
          )}
        </>
      )}

      {/* ══════════════════ TAB MAIN D'OEUVRE ══════════════════ */}
      {tab === 'main_oeuvre' && (
        <div>
          {/* KPIs globaux */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label:"Total Main d'Oeuvre", value:formatCurrency(moList.reduce((s,d)=>s+Number(d.amount),0)), color:'#F4B315' },
              { label:'Payé / Approuvé', value:formatCurrency(moList.filter(d=>d.status==='APPROVED').reduce((s,d)=>s+Number(d.amount),0)), color:'#10B981' },
              { label:'En attente', value:formatCurrency(moList.filter(d=>d.status==='PENDING').reduce((s,d)=>s+Number(d.amount),0)), color:'#F97316' },
            ].map(k => (
              <div key={k.label} style={{ ...card, textAlign:'center' }}>
                <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:'#8E5915', marginBottom:6 }}>{k.label}</p>
                <p style={{ fontSize:20, fontWeight:800, color:k.color, fontFamily:'monospace', margin:0 }}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* KPIs période */}
          {isMgr && (
            <div className="bg-gradient-to-br from-honey-beige-soft to-honey-cream border border-honey-beige-soft rounded-lg p-4 mb-4">
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-honey-caramel">Main d'oeuvre par période</p>
                <PeriodSelector/>
              </div>
              <div style={{ display:'flex', gap:16 }}>
                <div>
                  <p style={{ fontSize:9, fontWeight:700, color:'#8E5915', marginBottom:4, textTransform:'uppercase' }}>📍 Chantiers</p>
                  <p style={{ fontSize:17, fontWeight:800, color:'#F4B315', fontFamily:'monospace', margin:0 }}>
                    {formatCurrency(filterByPeriod(moList,kpiPeriod).filter(d=>d.project_id&&!d.prestation_id).reduce((s,d)=>s+Number(d.amount),0))}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize:9, fontWeight:700, color:'#8E5915', marginBottom:4, textTransform:'uppercase' }}>📋 Prestations</p>
                  <p style={{ fontSize:17, fontWeight:800, color:'#8B5CF6', fontFamily:'monospace', margin:0 }}>
                    {formatCurrency(filterByPeriod(moList,kpiPeriod).filter(d=>d.prestation_id).reduce((s,d)=>s+Number(d.amount),0))}
                  </p>
                </div>
              </div>
            </div>
          )}

          {loadingMo ? <p className="text-center py-12 text-honey-caramel">Chargement...</p> : (
            <>
              {/* Chantiers */}
              <div style={{ marginBottom:20 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                  <span style={{ fontSize:16 }}>📍</span>
                  <p style={{ margin:0, fontSize:13, fontWeight:800, color:'#1A141A' }}>Main d'Oeuvre par Chantier</p>
                  <span style={{ fontSize:11, color:'#8E5915', background:'#F5E6D3', padding:'2px 8px', borderRadius:10 }}>
                    {formatCurrency(moByChantier.reduce((s,g)=>s+g.total,0))}
                  </span>
                </div>
                {moByChantier.length === 0
                  ? <p style={{ fontSize:12, color:'#B8A090', padding:'12px 16px', background:'#FAFAFA', borderRadius:8, border:'1px dashed #E8D4B0' }}>Aucune main d'oeuvre liée à un chantier</p>
                  : renderMoGroup(moByChantier, expandedMoChantier, setExpandedMoChantier)
                }
              </div>
              {/* Prestations */}
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                  <span style={{ fontSize:16 }}>📋</span>
                  <p style={{ margin:0, fontSize:13, fontWeight:800, color:'#1A141A' }}>Main d'Oeuvre par Prestation</p>
                  <span style={{ fontSize:11, color:'#8B5CF6', background:'#EDE9FE', padding:'2px 8px', borderRadius:10 }}>
                    {formatCurrency(moByPrestation.reduce((s,g)=>s+g.total,0))}
                  </span>
                </div>
                {moByPrestation.length === 0
                  ? <p style={{ fontSize:12, color:'#B8A090', padding:'12px 16px', background:'#FAFAFA', borderRadius:8, border:'1px dashed #E8D4B0' }}>Aucune main d'oeuvre liée à une prestation</p>
                  : renderMoGroup(moByPrestation, expandedMoPrestation, setExpandedMoPrestation)
                }
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════ TAB DETTES ══════════════════ */}
      {tab === 'dettes' && (
        <div style={{ display:'grid', gridTemplateColumns: selectedDette ? '1fr 1fr' : '1fr', gap:16 }}>
          <div>
            {detteStats && (
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label:'Total dettes', value:formatCurrency(detteStats.total||0), color:'#F4B315' },
                  { label:'Total payé', value:formatCurrency(detteStats.paye||0), color:'#10B981' },
                  { label:'Reste à payer', value:formatCurrency(detteStats.reste||0), color:'#EF4444' },
                ].map(k => (
                  <div key={k.label} style={{ ...card, textAlign:'center' }}>
                    <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:'#8E5915', marginBottom:4 }}>{k.label}</p>
                    <p style={{ fontSize:18, fontWeight:800, color:k.color, fontFamily:'monospace', margin:0 }}>{k.value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Dettes groupées par chantier puis prestation */}
            {loadingDettes ? <p className="text-center py-12 text-honey-caramel">Chargement...</p>
            : dettes.length === 0 ? (
              <div style={{ ...card, textAlign:'center', padding:'48px 20px' }}>
                <AlertCircle size={40} style={{ margin:'0 auto 12px', color:'#D3AF85' }}/>
                <p style={{ fontSize:14, fontWeight:600, color:'#8E5915' }}>Aucune dette enregistrée</p>
              </div>
            ) : (
              <>
                {/* Par chantier */}
                {(() => {
                  const byChantier: Record<string,any> = {};
                  dettes.filter(d=>d.project_id&&!d.prestation_id).forEach(d => {
                    const key = d.project_id; const name = d.project?.name || 'Chantier';
                    if (!byChantier[key]) byChantier[key] = { name, items:[] };
                    byChantier[key].items.push(d);
                  });
                  const groups = Object.values(byChantier);
                  return groups.length > 0 && (
                    <div style={{ marginBottom:20 }}>
                      <p style={{ fontSize:12, fontWeight:800, color:'#1A141A', marginBottom:8 }}>📍 Dettes par Chantier</p>
                      {groups.map((g:any) => (
                        <div key={g.name} style={{ marginBottom:8 }}>
                          <p style={{ fontSize:11, fontWeight:700, color:'#8E5915', marginBottom:6, paddingLeft:8, borderLeft:'3px solid #F4B315' }}>{g.name}</p>
                          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                            {g.items.map((d:any) => renderDetteCard(d))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {/* Par prestation */}
                {(() => {
                  const byPrest: Record<string,any> = {};
                  dettes.filter(d=>d.prestation_id).forEach(d => {
                    const key = d.prestation_id; const name = d.prestation_nom || key;
                    if (!byPrest[key]) byPrest[key] = { name, items:[] };
                    byPrest[key].items.push(d);
                  });
                  const groups = Object.values(byPrest);
                  return groups.length > 0 && (
                    <div style={{ marginBottom:20 }}>
                      <p style={{ fontSize:12, fontWeight:800, color:'#1A141A', marginBottom:8 }}>📋 Dettes par Prestation</p>
                      {groups.map((g:any) => (
                        <div key={g.name} style={{ marginBottom:8 }}>
                          <p style={{ fontSize:11, fontWeight:700, color:'#8B5CF6', marginBottom:6, paddingLeft:8, borderLeft:'3px solid #8B5CF6' }}>{g.name}</p>
                          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                            {g.items.map((d:any) => renderDetteCard(d))}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {/* Sans affectation */}
                {(() => {
                  const orphans = dettes.filter(d=>!d.project_id&&!d.prestation_id);
                  return orphans.length > 0 && (
                    <div>
                      <p style={{ fontSize:12, fontWeight:800, color:'#1A141A', marginBottom:8 }}>⚪ Sans affectation</p>
                      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                        {orphans.map((d:any) => renderDetteCard(d))}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>

          {selectedDette && (
            <div style={card}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <div>
                  <h3 style={{ margin:0, fontSize:16, fontWeight:700, color:'#1A141A' }}>{selectedDette.nom}</h3>
                  <p style={{ margin:'2px 0 0', fontSize:12, color:'#8E5915' }}>{selectedDette.description}</p>
                </div>
                <button onClick={() => setSelectedDette(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#8E5915' }}>×</button>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { label:'Total', value:formatCurrency(Number(selectedDette.montant)), color:'#F4B315' },
                  { label:'Payé', value:formatCurrency(Number(selectedDette.montant_paye)), color:'#10B981' },
                  { label:'Reste', value:formatCurrency(Number(selectedDette.montant)-Number(selectedDette.montant_paye)), color:'#EF4444' },
                ].map(k => (
                  <div key={k.label} style={{ background:'#FDF6E9', borderRadius:8, padding:'10px 12px', textAlign:'center' }}>
                    <p style={{ margin:0, fontSize:9, fontWeight:700, textTransform:'uppercase', color:'#8E5915' }}>{k.label}</p>
                    <p style={{ margin:'4px 0 0', fontSize:15, fontWeight:800, color:k.color, fontFamily:'monospace' }}>{k.value}</p>
                  </div>
                ))}
              </div>
              {selectedDette.statut !== 'SOLDEE' && !showPayDetteForm && (
                <button onClick={() => { setShowPayDetteForm(true); setPayDetteForm({ montant:String(Number(selectedDette.montant)-Number(selectedDette.montant_paye)), mode:'ESPECES', date:new Date().toISOString().slice(0,10), notes:'' }); }}
                  style={{ ...btnPrimary, width:'100%', marginBottom:16, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                  <Plus size={13}/> Enregistrer un paiement
                </button>
              )}
              {showPayDetteForm && (
                <form onSubmit={handlePayDette} style={{ background:'#FFFDF5', border:'1.5px solid #F4B315', borderRadius:10, padding:14, marginBottom:16 }}>
                  <p style={{ margin:'0 0 10px', fontSize:12, fontWeight:700, color:'#1A141A' }}>Nouveau paiement</p>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                    <div><label style={labelStyle}>Montant (MAD) *</label><input type="number" required value={payDetteForm.montant} onChange={e=>setPayDetteForm(f=>({...f,montant:e.target.value}))} style={inputStyle}/></div>
                    <div><label style={labelStyle}>Mode</label>
                      <select value={payDetteForm.mode} onChange={e=>setPayDetteForm(f=>({...f,mode:e.target.value}))} style={inputStyle}>
                        <option value="ESPECES">Espèces</option><option value="VIREMENT">Virement</option><option value="CHEQUE">Chèque</option><option value="EFFET">Effet</option><option value="AUTRE">Autre</option>
                      </select></div>
                    <div><label style={labelStyle}>Date</label><input type="date" value={payDetteForm.date} onChange={e=>setPayDetteForm(f=>({...f,date:e.target.value}))} style={inputStyle}/></div>
                    <div><label style={labelStyle}>Notes</label><input value={payDetteForm.notes} onChange={e=>setPayDetteForm(f=>({...f,notes:e.target.value}))} placeholder="Optionnel" style={inputStyle}/></div>
                  </div>
                  {payDetteError && <p style={{ fontSize:11, color:'#DC2626', marginBottom:8 }}>{payDetteError}</p>}
                  <div style={{ display:'flex', gap:8 }}>
                    <button type="button" onClick={() => setShowPayDetteForm(false)} style={{ ...btnSecondary, flex:1, padding:'8px 0' }}>Annuler</button>
                    <button type="submit" disabled={savingPayDette} style={{ ...btnPrimary, flex:2, padding:'8px 0', opacity:savingPayDette?0.7:1 }}>{savingPayDette ? 'Enregistrement...' : 'Confirmer'}</button>
                  </div>
                </form>
              )}
              <h4 style={{ fontSize:12, fontWeight:700, color:'#1A141A', marginBottom:10 }}>Historique ({(selectedDette.paiements||[]).length})</h4>
              {(selectedDette.paiements||[]).length===0
                ? <p style={{ textAlign:'center', padding:'20px 0', color:'#8E5915', fontSize:12 }}>Aucun paiement enregistré</p>
                : <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {[...(selectedDette.paiements||[])].sort((a:any,b:any)=>new Date(b.date).getTime()-new Date(a.date).getTime()).map((p:any) => (
                      <div key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', borderRadius:8, background:'#FFFDF7', border:'1px solid #F5E6D3' }}>
                        <div>
                          <p style={{ margin:0, fontSize:12, fontWeight:700, color:'#10B981', fontFamily:'monospace' }}>{formatCurrency(Number(p.montant))}</p>
                          <p style={{ margin:'2px 0 0', fontSize:10, color:'#8E5915' }}>{p.mode} &bull; {new Date(p.date).toLocaleDateString('fr-FR')}</p>
                          {p.notes && <p style={{ margin:'1px 0 0', fontSize:10, color:'#B8A090' }}>{p.notes}</p>}
                        </div>
                        <button onClick={() => handleDeletePaiementDette(p.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#DC2626', padding:4, borderRadius:4 }}><Trash2 size={12}/></button>
                      </div>
                    ))}
                  </div>
              }
            </div>
          )}
        </div>
      )}

      {/* ══════ MODALS ══════ */}
      {showScansModal && (
        <div style={{ position:'fixed', inset:0, zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setShowScansModal(false)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.6)', backdropFilter:'blur(4px)' }}/>
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:560, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.3)', maxHeight:'80vh', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'18px 24px', borderBottom:'1px solid #F5E6D3', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <h2 style={{ margin:0, fontSize:16, fontWeight:700, color:'#1A141A' }}>Justificatifs scannés</h2>
              <button onClick={() => setShowScansModal(false)} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#8E5915' }}>×</button>
            </div>
            <div style={{ overflowY:'auto', padding:16, flex:1 }}>
              {scansWithReceipts.map(d => (
                <div key={d.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', borderRadius:10, border:'1px solid #F5E6D3', marginBottom:8, background:'#FFFDF7' }}>
                  <div style={{ width:44, height:44, borderRadius:8, border:'1px solid #E8D4B0', overflow:'hidden', flexShrink:0, background:'#FFF3E0', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}
                    onClick={() => { setShowScansModal(false); setViewScan(d.receipt_url); }}>
                    {d.receipt_url?.toLowerCase().includes('.pdf') ? <FileText size={22} style={{ color:'#E59312' }}/> : <img src={d.receipt_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ margin:0, fontSize:13, fontWeight:600, color:'#1A141A', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.description}</p>
                    <p style={{ margin:'2px 0 0', fontSize:11, color:'#8E5915' }}>{catLabel[d.category]} &bull; {formatCurrency(Number(d.amount))} &bull; {formatDate(d.date)}</p>
                  </div>
                  <a href={d.receipt_url} target="_blank" rel="noreferrer" download
                    style={{ display:'flex', alignItems:'center', gap:4, padding:'6px 10px', borderRadius:8, border:'1px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:11, fontWeight:600, textDecoration:'none', flexShrink:0 }}>
                    <Download size={11}/> PDF
                  </a>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <FileViewerModal url={viewScan} title="Justificatif" onClose={() => setViewScan(null)}/>

      {/* Form dépense */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => { setShowForm(false); setEditTarget(null); }} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.5)', backdropFilter:'blur(4px)' }}/>
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:500, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ padding:'18px 24px', borderBottom:'1px solid #F5E6D3', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, background:'white', zIndex:1 }}>
              <h2 style={{ margin:0, fontSize:16, fontWeight:700, color:'#1A141A' }}>{editTarget ? 'Modifier la dépense' : 'Soumettre une dépense'}</h2>
              <button onClick={() => { setShowForm(false); setEditTarget(null); }} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#8E5915' }}>×</button>
            </div>
            <form onSubmit={handleSave} style={{ padding:24 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                {/* Source type toggle */}
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={labelStyle}>Type</label>
                  <SourceToggle value={form.source_type} onChange={v => setForm(f => ({ ...f, source_type:v, project_id:'', prestation_id:'', prestation_nom:'' }))}/>
                </div>
                {/* Chantier ou Prestation selector */}
                {form.source_type === 'chantier' ? (
                  <div style={{ gridColumn:'1/-1' }}>
                    <label style={labelStyle}>Chantier</label>
                    <select value={form.project_id} onChange={e=>setForm(f=>({...f,project_id:e.target.value}))} style={inputStyle}>
                      <option value="">-- Sans chantier --</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                    </select>
                  </div>
                ) : (
                  <div style={{ gridColumn:'1/-1' }}>
                    <label style={labelStyle}>Prestation</label>
                    <select value={form.prestation_id} onChange={e => {
                      const prest = prestations.find((p:any) => p.id === e.target.value);
                      setForm(f => ({ ...f, prestation_id: e.target.value, prestation_nom: prest?.nom || '' }));
                    }} style={inputStyle}>
                      <option value="">-- Sélectionner une prestation --</option>
                      {prestations.map((p:any) => <option key={p.id} value={p.id}>{p.nom} — {p.client}</option>)}
                    </select>
                  </div>
                )}
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={labelStyle}>Description *</label>
                  <input required value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="Ex: Achat ciment 50 sacs" style={inputStyle}/>
                </div>
                <div>
                  <label style={labelStyle}>Montant (MAD) *</label>
                  <input required type="number" step="0.01" min="0" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="0.00" style={{...inputStyle,fontFamily:'monospace'}}/>
                </div>
                <div>
                  <label style={labelStyle}>Catégorie *</label>
                  <select required value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} style={inputStyle}>
                    {Object.entries(catLabel).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Mode de paiement</label>
                  <select value={form.payment_method} onChange={e=>setForm(f=>({...f,payment_method:e.target.value}))} style={inputStyle}>
                    <option value="ESPECES">Espèces</option><option value="VIREMENT">Virement</option><option value="CHEQUE">Chèque</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Date *</label>
                  <input required type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={inputStyle}/>
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={labelStyle}>Notes</label>
                  <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2} style={{...inputStyle,resize:'none'}}/>
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={labelStyle}>Scan / Photo du bon</label>
                  {!form.receipt_url && !receiptPreview ? (
                    <div style={{ border:'2px dashed #E8D4B0', borderRadius:10, padding:'18px 12px', textAlign:'center', background:'#FFFDF7', cursor:'pointer' }} onClick={() => fileInputRef.current?.click()}>
                      <Camera size={22} style={{ color:'#E59312', margin:'0 auto 8px' }}/>
                      <p style={{ margin:0, fontSize:13, fontWeight:600, color:'#8E5915' }}>Prendre une photo ou importer</p>
                      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" capture="environment" onChange={handleReceiptUpload} style={{ display:'none' }}/>
                    </div>
                  ) : (
                    <div style={{ border:'1.5px solid #E8D4B0', borderRadius:10, padding:12, background:'#FFFDF7', display:'flex', alignItems:'center', gap:12 }}>
                      {receiptPreview && !receiptIsPdf
                        ? <img src={receiptPreview} alt="scan" style={{ width:60, height:60, objectFit:'cover', borderRadius:6, cursor:'pointer' }} onClick={() => setViewScan(receiptPreview)}/>
                        : <div style={{ width:60, height:60, borderRadius:6, border:'1px solid #E8D4B0', background:'#FFF3E0', display:'flex', alignItems:'center', justifyContent:'center' }}><FileText size={24} style={{ color:'#E59312' }}/></div>}
                      <div style={{ flex:1 }}>
                        <p style={{ margin:0, fontSize:12, fontWeight:600, color:'#1A141A' }}>{uploadingReceipt ? 'Téléchargement...' : receiptIsPdf ? 'PDF joint' : 'Photo jointe'}</p>
                        <p style={{ margin:'2px 0 0', fontSize:11, color:'#8E5915' }}>{form.receipt_url ? 'Scan enregistré' : 'En cours...'}</p>
                      </div>
                      <button type="button" onClick={removeReceipt} style={{ background:'#FFF0F0', border:'1px solid #FFCDD2', borderRadius:6, padding:'4px 10px', fontSize:11, color:'#D32F2F', cursor:'pointer', fontWeight:600 }}>Supprimer</button>
                    </div>
                  )}
                </div>
              </div>
              {saveError && <div style={{ background:'#FFF0F0', border:'1px solid #FFCDD2', borderRadius:8, padding:'8px 12px', marginBottom:16, fontSize:12, color:'#D32F2F' }}>{saveError}</div>}
              <div style={{ display:'flex', justifyContent:'flex-end', gap:10, paddingTop:16, borderTop:'1px solid #F5E6D3' }}>
                <button type="button" onClick={() => { setShowForm(false); setEditTarget(null); }} style={btnSecondary}>Annuler</button>
                <button type="submit" disabled={saving||uploadingReceipt} style={{ ...btnPrimary, opacity:(saving||uploadingReceipt)?0.7:1 }}>
                  {saving ? 'Enregistrement...' : (editTarget ? 'Enregistrer' : 'Soumettre')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Form dette */}
      {showDetteForm && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => { setShowDetteForm(false); setEditDette(null); }} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.5)', backdropFilter:'blur(4px)' }}/>
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:480, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding:'18px 24px', borderBottom:'1px solid #F5E6D3', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <h2 style={{ margin:0, fontSize:16, fontWeight:700, color:'#1A141A' }}>{editDette ? 'Modifier la dette' : 'Nouvelle dette'}</h2>
              <button onClick={() => { setShowDetteForm(false); setEditDette(null); }} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#8E5915' }}>×</button>
            </div>
            <form onSubmit={handleSaveDette} style={{ padding:24 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                {/* Source toggle */}
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={labelStyle}>Type</label>
                  <SourceToggle value={detteForm.source_type} onChange={v => setDetteForm(f => ({ ...f, source_type:v, project_id:'', prestation_id:'', prestation_nom:'' }))}/>
                </div>
                {detteForm.source_type === 'chantier' ? (
                  <div style={{ gridColumn:'1/-1' }}>
                    <label style={labelStyle}>Chantier</label>
                    <select value={detteForm.project_id} onChange={e=>setDetteForm(f=>({...f,project_id:e.target.value}))} style={inputStyle}>
                      <option value="">-- Sans chantier --</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.code} - {p.name}</option>)}
                    </select>
                  </div>
                ) : (
                  <div style={{ gridColumn:'1/-1' }}>
                    <label style={labelStyle}>Prestation</label>
                    <select value={detteForm.prestation_id} onChange={e => {
                      const prest = prestations.find((p:any) => p.id === e.target.value);
                      setDetteForm(f => ({ ...f, prestation_id: e.target.value, prestation_nom: prest?.nom || '' }));
                    }} style={inputStyle}>
                      <option value="">-- Sélectionner une prestation --</option>
                      {prestations.map((p:any) => <option key={p.id} value={p.id}>{p.nom} — {p.client}</option>)}
                    </select>
                  </div>
                )}
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={labelStyle}>Nom de la personne *</label>
                  <input required value={detteForm.nom} onChange={e=>setDetteForm(f=>({...f,nom:e.target.value}))} placeholder="Ex: Ahmed, Fournisseur X..." style={inputStyle}/>
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={labelStyle}>Description</label>
                  <input value={detteForm.description} onChange={e=>setDetteForm(f=>({...f,description:e.target.value}))} placeholder="Ex: Travaux mois de mai..." style={inputStyle}/>
                </div>
                <div>
                  <label style={labelStyle}>Montant total (MAD) *</label>
                  <input required type="number" step="0.01" value={detteForm.montant} onChange={e=>setDetteForm(f=>({...f,montant:e.target.value}))} placeholder="0.00" style={{...inputStyle,fontFamily:'monospace'}}/>
                </div>
                <div>
                  <label style={labelStyle}>Date</label>
                  <input type="date" value={detteForm.date} onChange={e=>setDetteForm(f=>({...f,date:e.target.value}))} style={inputStyle}/>
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={labelStyle}>Notes</label>
                  <textarea value={detteForm.notes} onChange={e=>setDetteForm(f=>({...f,notes:e.target.value}))} rows={2} style={{...inputStyle,resize:'none'}}/>
                </div>
              </div>
              {detteError && <div style={{ background:'#FFF0F0', border:'1px solid #FFCDD2', borderRadius:8, padding:'8px 12px', marginTop:12, fontSize:12, color:'#D32F2F' }}>{detteError}</div>}
              <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:16, paddingTop:16, borderTop:'1px solid #F5E6D3' }}>
                <button type="button" onClick={() => { setShowDetteForm(false); setEditDette(null); }} style={btnSecondary}>Annuler</button>
                <button type="submit" disabled={savingDette} style={{ ...btnPrimary, opacity:savingDette?0.7:1 }}>{savingDette ? 'Enregistrement...' : (editDette ? 'Enregistrer' : 'Créer')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirms */}
      {deleteDetteTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setDeleteDetteTarget(null)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.6)', backdropFilter:'blur(4px)' }}/>
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:400, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.3)', padding:28 }}>
            <h3 style={{ margin:'0 0 8px', fontSize:17, fontWeight:700, color:'#1A141A', textAlign:'center' }}>Supprimer cette dette ?</h3>
            <p style={{ margin:'0 0 20px', fontSize:13, color:'#8E5915', textAlign:'center' }}><strong>{deleteDetteTarget.nom}</strong> — {formatCurrency(Number(deleteDetteTarget.montant))}</p>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setDeleteDetteTarget(null)} style={{ ...btnSecondary, flex:1 }}>Annuler</button>
              <button onClick={handleDeleteDette} style={{ ...btnDanger, flex:1 }}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
      {deleteTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setDeleteTarget(null)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.6)', backdropFilter:'blur(4px)' }}/>
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:420, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.3)', padding:28 }}>
            <h3 style={{ margin:'0 0 8px', fontSize:17, fontWeight:700, color:'#1A141A', textAlign:'center' }}>Supprimer cette dépense ?</h3>
            <p style={{ margin:0, fontSize:13, color:'#8E5915', textAlign:'center' }}><strong>{deleteTarget.description}</strong></p>
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button onClick={() => setDeleteTarget(null)} style={{ ...btnSecondary, flex:1 }}>Retour</button>
              <button onClick={handleDelete} disabled={deleting} style={{ ...btnDanger, flex:1, opacity:deleting?0.7:1 }}>{deleting ? 'Suppression...' : 'Confirmer'}</button>
            </div>
          </div>
        </div>
      )}
      {rejectTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setRejectTarget(null)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.6)', backdropFilter:'blur(4px)' }}/>
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:420, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.3)', padding:28 }}>
            <h3 style={{ margin:'0 0 6px', fontSize:16, fontWeight:700, color:'#1A141A' }}>Refuser la dépense</h3>
            <p style={{ fontSize:13, color:'#8E5915', marginBottom:14 }}>Raison du refus (optionnel) :</p>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Ex: montant incorrect..." rows={3}
              style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E8D4B0', fontSize:13, outline:'none', resize:'none', boxSizing:'border-box', marginBottom:16 }}/>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => { setRejectTarget(null); setRejectReason(''); }} style={{ ...btnSecondary, flex:1 }}>Annuler</button>
              <button onClick={handleReject} style={{ ...btnDanger, flex:1 }}>Refuser</button>
            </div>
          </div>
        </div>
      )}
      {viewScan && <FileViewerModal url={viewScan} title="Justificatif" onClose={() => setViewScan(null)}/>}
    </div>
  );

  /* Dette card render (defined after hooks) */
  function renderDetteCard(d: any) {
    const cfg = detteStatutCfg[d.statut] || detteStatutCfg.EN_COURS;
    const pct = d.montant > 0 ? Math.min(100, (Number(d.montant_paye)/Number(d.montant))*100) : 0;
    return (
      <div key={d.id} onClick={() => openDette(d)}
        style={{ ...card, cursor:'pointer', border: selectedDette?.id===d.id ? '1.5px solid #F4B315' : '1px solid #F5E6D3', transition:'all 0.15s' }}
        onMouseEnter={e => { if(selectedDette?.id!==d.id) e.currentTarget.style.borderColor='#F4B315'; }}
        onMouseLeave={e => { if(selectedDette?.id!==d.id) e.currentTarget.style.borderColor='#F5E6D3'; }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
          <div>
            <p style={{ margin:0, fontSize:13, fontWeight:700, color:'#1A141A' }}>{d.nom}</p>
            <p style={{ margin:'2px 0 0', fontSize:11, color:'#8E5915' }}>{d.description}</p>
          </div>
          <div style={{ textAlign:'right', flexShrink:0 }}>
            <p style={{ margin:0, fontSize:14, fontWeight:800, fontFamily:'monospace', color:'#1A141A' }}>{formatCurrency(Number(d.montant))}</p>
            <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:4, background:cfg.bg, color:cfg.color, border:`1px solid ${cfg.border}` }}>{cfg.label}</span>
          </div>
        </div>
        <div style={{ background:'#F5E6D3', borderRadius:4, height:4, marginBottom:4 }}>
          <div style={{ width:`${pct}%`, background:'linear-gradient(to right,#F4B315,#10B981)', borderRadius:4, height:'100%' }}/>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#8E5915' }}>
          <span>Payé : <strong style={{ color:'#10B981' }}>{formatCurrency(Number(d.montant_paye))}</strong></span>
          <span>Reste : <strong style={{ color:Number(d.montant_paye)<Number(d.montant)?'#EF4444':'#10B981' }}>{formatCurrency(Number(d.montant)-Number(d.montant_paye))}</strong></span>
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:6, marginTop:6 }}>
          <button onClick={e => { e.stopPropagation(); openEditDette(d); }} style={{ padding:'3px 8px', borderRadius:5, border:'1px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:10, cursor:'pointer' }}><Pencil size={9}/></button>
          <button onClick={e => { e.stopPropagation(); setDeleteDetteTarget(d); }} style={{ padding:'3px 8px', borderRadius:5, border:'1px solid #FECACA', background:'#FFF5F5', color:'#DC2626', fontSize:10, cursor:'pointer' }}><Trash2 size={9}/></button>
        </div>
      </div>
    );
  }
}
