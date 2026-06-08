'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Search, Trash2, ArrowRight, Camera, Upload, X, Eye } from 'lucide-react';
import FileViewerModal from '@/components/ui/FileViewerModal';
import { blApi, bcApi, devisApi, invoicesApi, uploadApi, signaturesApi, depensesApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { formatDate, cn } from '@/lib/utils';
import PDFButton from '@/components/ui/PDFButton';
import { useLanguage } from '@/lib/i18n';

const statusConfig: Record<string, string> = {
  PREPARING: 'badge-info', DELIVERED: 'badge-success',
  SIGNED:    'bg-purple-50 text-purple-700 border-purple-200',
  INVOICED:  'bg-green-50 text-green-800 border-green-200',
};
// statusLabel and nextStatus are computed inside the component using t()

const inputStyle = { width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E8D4B0', fontSize:13, outline:'none', boxSizing:'border-box' as const };
const labelStyle = { display:'block' as const, fontSize:11, fontWeight:700 as const, color:'#8E5915', textTransform:'uppercase' as const, letterSpacing:0.5, marginBottom:6 };
const btnSecondary = { padding:'9px 18px', borderRadius:8, border:'1.5px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:13, fontWeight:600 as const, cursor:'pointer' as const };
const btnPrimary   = { padding:'9px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#F4B315,#E59312)', color:'#1A141A', fontSize:13, fontWeight:700 as const, cursor:'pointer' as const };
const btnDanger    = { padding:'9px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#EF4444,#DC2626)', color:'white', fontSize:13, fontWeight:700 as const, cursor:'pointer' as const };
const btnGreen     = { padding:'5px 10px', borderRadius:6, border:'none', background:'linear-gradient(135deg,#22C55E,#16A34A)', color:'white', fontSize:11, fontWeight:700 as const, cursor:'pointer' as const, display:'flex' as const, alignItems:'center' as const, gap:4 };

interface BLLine { desc: string; qty: number; }

export default function BLPage() {
  const { t, dir } = useLanguage();
  const { user } = useAuth();

  const statusLabel: Record<string, string> = {
    PREPARING: t('bl.preparing'), DELIVERED: t('bl.delivered'),
    SIGNED: t('bl.signed'), INVOICED: t('bl.invoiced'),
  };
  const nextStatus: Record<string, { status: string; label: string; cls: string }[]> = {
    PREPARING: [{ status: 'DELIVERED', label: t('bl.delivered'), cls: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' }],
    DELIVERED: [{ status: 'SIGNED',    label: t('bl.signed'),    cls: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100' }],
    SIGNED:    [],
    INVOICED:  [],
  };

  const [bls, setBls]             = useState<any[]>([]);
  const [bcs, setBcs]             = useState<any[]>([]);
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading]     = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting]   = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState('');
  const [creatingInvoice, setCreatingInvoice] = useState('');
  const canDel = user?.role === 'ADMIN' || user?.role === 'GERANT';

  // Modal nouveau BL
  const [showForm, setShowForm]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState('');
  const [selectedBc, setSelectedBc] = useState<any>(null);
  const [blForm, setBlForm]       = useState({ bc_id: '', custom_number: '', issue_date: new Date().toISOString().slice(0,10), delivery_date: '', delivered_by: '', delivery_address: '', notes: '', signature_id: '' });
  const [signatures, setSignatures] = useState<any[]>([]);
  const [blLines, setBlLines]     = useState<BLLine[]>([{ desc: '', qty: 1 }]);

  // Source toggle (BC or Devis)
  const [blSource, setBlSource] = useState<'bc' | 'devis'>('bc');
  const [validatedDevis, setValidatedDevis] = useState<any[]>([]);
  const [selectedDevisId, setSelectedDevisId] = useState('');

  // Modal importer BL signe
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanTarget, setScanTarget] = useState<any>(null);
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const [scanUrl, setScanUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [savingScan, setSavingScan] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Edit BL complet ──────────────────────────────────────────────────────
  const [editTarget, setEditTarget]     = useState<any>(null);
  const [editForm, setEditForm]         = useState({ number:'', issue_date:'', delivery_date:'', delivered_by:'', delivery_address:'', notes:'', signature_id:'' });
  const [editLines, setEditLines]       = useState<BLLine[]>([]);
  const [editSaving, setEditSaving]     = useState(false);

  const openEdit = async (bl: any) => {
    const res = await blApi.get(bl.id);
    const full = res.data;
    setEditTarget(full);
    setEditForm({
      number: full.number || '',
      issue_date: full.issue_date ? full.issue_date.split('T')[0] : '',
      delivery_date: full.delivery_date ? full.delivery_date.split('T')[0] : '',
      delivered_by: full.delivered_by || '',
      delivery_address: full.delivery_address || '',
      notes: full.notes || '',
      signature_id: full.signature_id || '',
    });
    setEditLines((full.lines || []).map((l: any) => ({ desc: l.description, qty: Number(l.quantity) })));
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setEditSaving(true);
    try {
      await blApi.update(editTarget.id, {
        ...editForm,
        lines: editLines.filter(l => l.desc).map(l => ({ description: l.desc, quantity: l.qty })),
      });
      fetchData();
      setEditTarget(null);
    } finally { setEditSaving(false); }
  };

  // BL en attente (imports employés)
  const [pendingBls, setPendingBls]     = useState<any[]>([]);
  const [assignTarget, setAssignTarget] = useState<any>(null);
  const [assignBlId, setAssignBlId]     = useState('');
  const [assigning, setAssigning]       = useState(false);
  const [viewPendingUrl, setViewPendingUrl] = useState<string | null>(null);

  const fetchData = () => {
    setLoading(true);
    blApi.list({ search, status: statusFilter || undefined })
      .then((r) => setBls(r.data.data || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [search, statusFilter]);

  useEffect(() => {
    bcApi.list({ limit: 200 } as any)
      .then(r => setBcs((r.data.data || []).filter((b: any) => b.status !== 'CANCELLED')))
      .catch(() => {});
    signaturesApi.list().then(r => setSignatures(r.data || [])).catch(() => {});
    // Charger les BL en attente (imports employés)
    if (canDel) fetchPendingBls();
  }, []);

  const fetchPendingBls = () => {
    depensesApi.list({}).then((r: any) => {
      const all: any[] = r.data?.data || r.data || [];
      setPendingBls(all.filter((d: any) => d.description?.startsWith('[BL-IMPORT]') && d.status === 'PENDING'));
    }).catch(() => {});
  };

  const handleAssign = async () => {
    if (!assignTarget || !assignBlId) return;
    setAssigning(true);
    try {
      await blApi.saveSignedScan(assignBlId, assignTarget.receipt_url);
      // Approuver la dépense via le bon endpoint
      await depensesApi.approve(assignTarget.id);
      setAssignTarget(null); setAssignBlId('');
      fetchPendingBls(); fetchData();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Erreur lors de l\'assignation.');
    } finally { setAssigning(false); }
  };

  const handleRejectBl = async (dep: any) => {
    if (!confirm('Refuser ce BL importé ?')) return;
    try {
      await depensesApi.reject(dep.id);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Erreur lors du refus.');
    }
    fetchPendingBls();
  };

  const handleBcSelect = (bcId: string) => {
    const bc = bcs.find(b => b.id === bcId);
    setSelectedBc(bc || null);
    setBlForm(f => ({ ...f, bc_id: bcId }));
  };

  const handleDevisSelect = async (devisId: string) => {
    setSelectedDevisId(devisId);
    if (!devisId) { setBlLines([{ desc: '', qty: 1 }]); return; }
    try {
      const res = await devisApi.linesForBL(devisId);
      const data = res.data;
      if (data.lines?.length) {
        setBlLines(data.lines.map((l: any) => ({ desc: l.description, qty: Number(l.quantity) })));
      }
    } catch {}
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setSaveError('');
    try {
      if (blSource === 'devis') {
        if (!selectedDevisId) { setSaveError('Sélectionnez un devis validé'); setSaving(false); return; }
        // createFromDevis inherits signature + lines from devis; pass override if selected
        await blApi.createFromDevis(selectedDevisId, blForm.signature_id || undefined);
      } else {
        if (!blForm.bc_id) { setSaveError('Sélectionnez un BC'); setSaving(false); return; }
        if (blLines.every(l => !l.desc)) { setSaveError('Ajoutez au moins une ligne'); setSaving(false); return; }
        await blApi.create({
          bc_id: blForm.bc_id,
          client_id: selectedBc?.client_id,
          project_id: selectedBc?.project_id,
          custom_number: blForm.custom_number || undefined,
          issue_date: blForm.issue_date ? new Date(blForm.issue_date) : undefined,
          delivery_date: blForm.delivery_date ? new Date(blForm.delivery_date) : undefined,
          delivered_by: blForm.delivered_by || undefined,
          delivery_address: blForm.delivery_address || undefined,
          notes: blForm.notes || undefined,
          signature_id: blForm.signature_id || undefined,
          lines: blLines.filter(l => l.desc).map(l => ({ description: l.desc, quantity: l.qty })),
        });
      }
      fetchData();
      setShowForm(false);
      setBlForm({ bc_id: '', custom_number: '', issue_date: new Date().toISOString().slice(0,10), delivery_date: '', delivered_by: '', delivery_address: '', notes: '', signature_id: '' });
      setBlLines([{ desc: '', qty: 1 }]);
      setSelectedBc(null);
      setSelectedDevisId('');
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setSaveError(Array.isArray(msg) ? msg.join(', ') : (msg || 'Erreur'));
    } finally { setSaving(false); }
  };

  const handleStatusChange = async (bl: any, newStatus: string) => {
    setUpdatingStatus(bl.id);
    try { await blApi.updateStatus(bl.id, newStatus); fetchData(); }
    catch (e: any) { alert(e?.response?.data?.message || 'Erreur'); }
    finally { setUpdatingStatus(''); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try { await blApi.delete(deleteTarget.id); fetchData(); setDeleteTarget(null); }
    catch (e: any) { alert(e?.response?.data?.message || 'Erreur'); }
    finally { setDeleting(false); }
  };

  const handleCreateInvoice = async (blId: string) => {
    setCreatingInvoice(blId);
    try { await invoicesApi.createFromBL({ bl_id: blId }); fetchData(); }
    catch (e: any) { alert(e?.response?.data?.message || 'Erreur'); }
    finally { setCreatingInvoice(''); }
  };

  const openScanModal = (bl: any) => {
    setScanTarget(bl);
    setScanPreview(bl.client_signature_url || null);
    setScanUrl(bl.client_signature_url || null);
    setShowScanModal(true);
  };

  const handleScanFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = e => setScanPreview(e.target?.result as string);
    reader.readAsDataURL(file);
    setUploading(true);
    try {
      const res = await uploadApi.upload(file);
      setScanUrl(res.data.url);
    } catch { alert('Erreur upload'); }
    finally { setUploading(false); }
  };

  const handleSaveScan = async () => {
    if (!scanTarget || !scanUrl) return;
    setSavingScan(true);
    try {
      await blApi.saveSignedScan(scanTarget.id, scanUrl);
      fetchData(); setShowScanModal(false);
    } catch (e: any) { alert(e?.response?.data?.message || 'Erreur'); }
    finally { setSavingScan(false); }
  };

  return (
    <div>
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-[22px] font-bold text-honey-dark font-display tracking-tight">Bons de livraison</h1>
          <p className="text-sm text-honey-caramel mt-0.5">Livraisons sans prix - stock décrémente automatiquement</p>
        </div>
        <button onClick={() => { setShowForm(true); setSaveError(''); setBlSource('bc'); setSelectedDevisId(''); setBlLines([{desc:'',qty:1}]); devisApi.list({ status:'VALIDATED', limit:200 }).then(r => setValidatedDevis(r.data.data||[])).catch(()=>{}); }} className="btn-primary text-sm flex items-center gap-1.5">
          <Plus size={13} /> Nouveau BL
        </button>
      </div>

      {/* ══ BL EN ATTENTE DE VALIDATION (employés) ══ */}
      {canDel && pendingBls.length > 0 && (
        <div style={{ background: '#FFFBF0', border: '1.5px solid #F5C842', borderRadius: 14, padding: '16px 20px', marginBottom: 20 }}>
          <p style={{ margin: '0 0 14px', fontSize: 13, fontWeight: 800, color: '#1A141A' }}>
            📥 BL en attente de validation — {pendingBls.length} document{pendingBls.length > 1 ? 's' : ''}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingBls.map((dep: any) => (
              <div key={dep.id} style={{ background: 'white', border: '1px solid #EDDEC1', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#1A141A' }}>{dep.description?.replace('[BL-IMPORT] ', '')}</div>
                  <div style={{ fontSize: 11, color: '#8E5915', marginTop: 2 }}>
                    Par : {dep.submitter?.first_name} {dep.submitter?.last_name} &nbsp;•&nbsp;
                    {new Date(dep.created_at).toLocaleDateString('fr-FR')}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {dep.receipt_url && (
                    <button onClick={() => setViewPendingUrl(dep.receipt_url)}
                      style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid #E8D4B0', background: 'white', color: '#8E5915', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Eye size={11} /> Voir
                    </button>
                  )}
                  <button onClick={() => { setAssignTarget(dep); setAssignBlId(''); }}
                    style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#F5C842,#D4A017)', color: '#1A141A', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    🔗 Assigner à un BL
                  </button>
                  <button onClick={() => handleRejectBl(dep)}
                    style={{ padding: '6px 12px', borderRadius: 8, border: '1.5px solid #FFCDD2', background: '#FFF0F0', color: '#D32F2F', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    ✕ Refuser
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal assigner BL */}
      {assignTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }}>
          <div style={{ background: 'white', borderRadius: 16, padding: 28, width: 480, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 16, fontWeight: 800, color: '#1A141A' }}>Assigner à un BL</h3>
            <p style={{ margin: '0 0 18px', fontSize: 12, color: '#8E5915' }}>{assignTarget.description?.replace('[BL-IMPORT] ', '')}</p>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#8E5915', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>BL existant</label>
            <select value={assignBlId} onChange={e => setAssignBlId(e.target.value)}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #E8D4B0', fontSize: 13, outline: 'none', marginBottom: 20 }}>
              <option value="">— Sélectionner un BL —</option>
              {bls.map((bl: any) => (
                <option key={bl.id} value={bl.id}>{bl.number} — {bl.client?.commercial_name || '—'}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setAssignTarget(null)} style={{ padding: '9px 18px', borderRadius: 8, border: '1.5px solid #E8D4B0', background: 'white', color: '#8E5915', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
              <button onClick={handleAssign} disabled={!assignBlId || assigning}
                style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: (!assignBlId || assigning) ? '#E8D4B0' : 'linear-gradient(135deg,#F5C842,#D4A017)', color: '#1A141A', fontSize: 13, fontWeight: 700, cursor: (!assignBlId || assigning) ? 'default' : 'pointer' }}>
                {assigning ? 'En cours...' : '✅ Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex gap-3 mb-4 flex-wrap">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-honey-caramel" />
            <input type="text" placeholder="Rechercher un BL..."
              value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-9" />
          </div>
          {(['', 'PREPARING', 'DELIVERED', 'SIGNED', 'INVOICED'] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={cn('px-3 py-2 rounded-lg text-xs font-semibold border transition-all',
                statusFilter === s ? 'bg-honey-dark text-white border-honey-dark' : 'bg-white text-honey-caramel border-honey-beige-soft hover:border-honey-gold'
              )}>
              {s === '' ? 'Tous' : statusLabel[s]}
            </button>
          ))}
        </div>

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-honey-cream">
              {['Numero', 'Client', 'BC associe', 'Date', 'Statut', 'Actions', 'PDF'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-honey-caramel border-b border-honey-beige-soft">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-12 text-center text-honey-caramel">Chargement...</td></tr>
            ) : bls.length === 0 ? (
              <tr><td colSpan={7} className="py-12 text-center text-honey-caramel">Aucun BL trouvé</td></tr>
            ) : bls.map((bl) => (
              <tr key={bl.id} className="border-b border-honey-beige-soft hover:bg-honey-cream/50 transition-colors">
                <td className="px-4 py-3">
                  <p className="font-mono font-semibold text-honey-dark">{bl.number}</p>
                  {bl.client_signature_url && (
                    <a
                      href={bl.client_signature_url.startsWith('http') ? bl.client_signature_url : `http://localhost:4000${bl.client_signature_url}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-[10px] text-purple-600 font-semibold flex items-center gap-1 mt-0.5 hover:text-purple-800">
                      📎 BL signé (voir)
                    </a>
                  )}
                </td>
                <td className="px-4 py-3 text-honey-dark">{bl.client?.commercial_name}</td>
                <td className="px-4 py-3 font-mono text-[11px] text-honey-caramel">{bl.bc?.number || '-'}</td>
                <td className="px-4 py-3 text-honey-caramel text-xs">{formatDate(bl.issue_date)}</td>
                <td className="px-4 py-3">
                  <span className={cn('badge border text-[10px]', statusConfig[bl.status])}>
                    {statusLabel[bl.status]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Avancer statut */}
                    {canDel && (nextStatus[bl.status] || []).map(ns => (
                      <button key={ns.status} onClick={() => handleStatusChange(bl, ns.status)} disabled={updatingStatus === bl.id}
                        className={cn('px-2 py-1 rounded text-[10px] font-semibold border transition-all', ns.cls)}>
                        {ns.label}
                      </button>
                    ))}
                    {/* Creer facture */}
                    {canDel && bl.status === 'SIGNED' && (
                      <button onClick={() => handleCreateInvoice(bl.id)} disabled={creatingInvoice === bl.id}
                        style={{ ...btnGreen, opacity: creatingInvoice === bl.id ? 0.6 : 1 }}>
                        <ArrowRight size={10} />
                        {creatingInvoice === bl.id ? '...' : 'Facture'}
                      </button>
                    )}
                    {/* Importer BL signe */}
                    {canDel && (
                      <button onClick={() => openScanModal(bl)}
                        title={bl.client_signature_url ? 'Voir / Remplacer BL signe' : 'Importer BL signé par client'}
                        className={cn(
                          'px-2 py-1 rounded text-[10px] font-semibold border flex items-center gap-1 transition-all',
                          bl.client_signature_url
                            ? 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                            : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                        )}>
                        <Camera size={10} />
                        {bl.client_signature_url ? 'BL signe' : 'Importer signe'}
                      </button>
                    )}
                    {canDel && (
                      <button onClick={() => openEdit(bl)} title="Modifier numéro/date"
                        className="w-7 h-7 rounded-md border border-honey-beige-soft flex items-center justify-center text-honey-caramel hover:text-honey-dark hover:border-honey-gold hover:bg-honey-cream transition-all text-[11px] font-bold">
                        ✏️
                      </button>
                    )}
                    {/* Supprimer (tout sauf INVOICED) */}
                    {canDel && (
                      <button onClick={() => setDeleteTarget(bl)} title="Supprimer définitivement"
                        className="w-7 h-7 rounded-md border border-red-200 flex items-center justify-center text-red-400 hover:text-red-600 hover:border-red-400 hover:bg-red-50 transition-all">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <PDFButton variant="inline" docType="bl" docId={bl.id} docNumber={bl.number} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ===== MODAL Nouveau BL ===== */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:40, paddingBottom:24, overflowY:'auto' }}>
          <div onClick={() => setShowForm(false)} style={{ position:'fixed', inset:0, background:'rgba(26,20,26,0.5)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:620, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding:'18px 24px', borderBottom:'1px solid #F5E6D3', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, background:'white', zIndex:1, borderRadius:'16px 16px 0 0' }}>
              <h2 style={{ margin:0, fontSize:16, fontWeight:700, color:'#1A141A' }}>Nouveau bon de livraison</h2>
              <button onClick={() => setShowForm(false)} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#8E5915' }}>x</button>
            </div>
            <form onSubmit={handleCreate} style={{ padding:24 }}>
              {/* Source toggle */}
              <div style={{ display:'flex', gap:8, marginBottom:20, background:'#FBF6EE', padding:4, borderRadius:10 }}>
                <button type="button" onClick={() => setBlSource('bc')}
                  style={{ flex:1, padding:'8px 0', borderRadius:8, border:'none', background: blSource==='bc' ? 'white' : 'transparent', color: blSource==='bc' ? '#1A141A' : '#8E5915', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow: blSource==='bc' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
                  📋 Depuis un BC
                </button>
                <button type="button" onClick={() => { setBlSource('devis'); setBlLines([{desc:'',qty:1}]); }}
                  style={{ flex:1, padding:'8px 0', borderRadius:8, border:'none', background: blSource==='devis' ? 'white' : 'transparent', color: blSource==='devis' ? '#1A141A' : '#8E5915', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow: blSource==='devis' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
                  📄 Depuis un Devis
                </button>
              </div>

              {/* Numéro et date manuels */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                <div>
                  <label style={labelStyle}>Numéro BL <span style={{ fontWeight:400, color:'#B8A090', textTransform:'none' }}>(laisser vide = auto)</span></label>
                  <input value={blForm.custom_number} onChange={e => setBlForm({...blForm, custom_number:e.target.value})}
                    placeholder="Ex: BL-2026-0042" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Date du BL *</label>
                  <input type="date" value={blForm.issue_date} onChange={e => setBlForm({...blForm, issue_date:e.target.value})} style={inputStyle} required />
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                {blSource === 'bc' ? (
                  <div style={{ gridColumn:'1/-1' }}>
                    <label style={labelStyle}>Bon de commande associé *</label>
                    <select value={blForm.bc_id} onChange={e => handleBcSelect(e.target.value)} style={inputStyle}>
                      <option value="">Sélectionner un BC...</option>
                      {bcs.map(bc => (
                        <option key={bc.id} value={bc.id}>{bc.number} – {bc.client?.commercial_name || '-'}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div style={{ gridColumn:'1/-1' }}>
                    <label style={labelStyle}>Devis validé *</label>
                    <select value={selectedDevisId} onChange={e => handleDevisSelect(e.target.value)} style={inputStyle}>
                      <option value="">Sélectionner un devis...</option>
                      {validatedDevis.map(d => (
                        <option key={d.id} value={d.id}>{d.number} – {d.client?.commercial_name} – {Number(d.total_ttc).toFixed(0)} MAD TTC</option>
                      ))}
                    </select>
                    {validatedDevis.length === 0 && <p style={{ fontSize:11, color:'#A33C00', marginTop:6 }}>Aucun devis validé disponible.</p>}
                    {selectedDevisId && <p style={{ fontSize:11, color:'#16A34A', marginTop:6 }}>✓ Lignes chargées automatiquement depuis le devis (avec signature)</p>}
                  </div>
                )}
                {blSource === 'bc' && (<>
                <div>
                  <label style={labelStyle}>Date de livraison</label>
                  <input type="date" value={blForm.delivery_date} onChange={e => setBlForm({...blForm, delivery_date:e.target.value})} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Livreur / Transporteur</label>
                  <input value={blForm.delivered_by} onChange={e => setBlForm({...blForm, delivered_by:e.target.value})}
                    placeholder="Nom du livreur" style={inputStyle} />
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={labelStyle}>Adresse de livraison</label>
                  <input value={blForm.delivery_address} onChange={e => setBlForm({...blForm, delivery_address:e.target.value})}
                    placeholder="Adresse complete de livraison" style={inputStyle} />
                </div>
                </>)}
              </div>

              {blSource === 'bc' && <div style={{ border:'1.5px solid #E8D4B0', borderRadius:10, overflow:'hidden', marginBottom:16 }}>
                <div style={{ background:'#FFF8EE', padding:'8px 14px', borderBottom:'1px solid #F5E6D3', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:11, fontWeight:700, color:'#8E5915', textTransform:'uppercase', letterSpacing:0.5 }}>Lignes de livraison</span>
                </div>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr style={{ background:'#FFF8EE' }}>
                      <th style={{ textAlign:'left', padding:'8px 12px', fontSize:10, fontWeight:700, color:'#8E5915', textTransform:'uppercase', letterSpacing:0.5 }}>Description</th>
                      <th style={{ textAlign:'right', padding:'8px 12px', fontSize:10, fontWeight:700, color:'#8E5915', textTransform:'uppercase', letterSpacing:0.5, width:80 }}>Qte</th>
                      <th style={{ width:32 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {blLines.map((line, i) => (
                      <tr key={i} style={{ borderTop:'1px solid #F5E6D3' }}>
                        <td style={{ padding:'6px 8px' }}>
                          <input value={line.desc} onChange={e => { const nl=[...blLines]; nl[i]={...nl[i],desc:e.target.value}; setBlLines(nl); }}
                            placeholder="Description de l'article..." style={{ ...inputStyle, padding:'6px 10px' }} />
                        </td>
                        <td style={{ padding:'6px 8px' }}>
                          <input type="number" min={1} value={line.qty} onChange={e => { const nl=[...blLines]; nl[i]={...nl[i],qty:Number(e.target.value)||1}; setBlLines(nl); }}
                            style={{ ...inputStyle, padding:'6px 10px', textAlign:'right', fontFamily:'monospace' }} />
                        </td>
                        <td style={{ padding:'6px 4px', textAlign:'center' }}>
                          {blLines.length > 1 && (
                            <button type="button" onClick={() => setBlLines(blLines.filter((_,idx)=>idx!==i))}
                              style={{ background:'none', border:'none', cursor:'pointer', color:'#EF4444', padding:4 }}>
                              <Trash2 size={12} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding:'8px 12px', borderTop:'1px solid #F5E6D3' }}>
                  <button type="button" onClick={() => setBlLines([...blLines, { desc:'', qty:1 }])}
                    style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, color:'#E59312', fontWeight:600, display:'flex', alignItems:'center', gap:4 }}>
                    <Plus size={12} /> Ajouter ligne
                  </button>
                </div>
              </div>}

              {signatures.length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <label style={labelStyle}>Signature / Cachet</label>
                  {blSource === 'devis' && <p style={{ fontSize:11, color:'#8E5915', marginBottom:8 }}>Si non sélectionnée, la signature du devis sera utilisée.</p>}
                  <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                    <div onClick={() => setBlForm({...blForm, signature_id:''})}
                      style={{ border:`2px solid ${!blForm.signature_id ? '#E59312' : '#E8D4B0'}`, borderRadius:8, padding:'6px 14px', cursor:'pointer', fontSize:12, color: !blForm.signature_id ? '#A33C00' : '#8E5915', background: !blForm.signature_id ? '#FFF8EE' : 'white', fontWeight:600 }}>
                      {blSource === 'devis' ? 'Auto (devis)' : 'Aucune'}
                    </div>
                    {signatures.map((sig: any) => (
                      <div key={sig.id} onClick={() => setBlForm({...blForm, signature_id: sig.id})}
                        style={{ border:`2px solid ${blForm.signature_id === sig.id ? '#E59312' : '#E8D4B0'}`, borderRadius:8, padding:6, cursor:'pointer', background: blForm.signature_id === sig.id ? '#FFF8EE' : 'white', display:'flex', flexDirection:'column', alignItems:'center', gap:4, minWidth:90 }}>
                        <img src={sig.image_url} alt={sig.name} style={{ height:40, maxWidth:120, objectFit:'contain' }} />
                        <span style={{ fontSize:10, fontWeight:600, color: blForm.signature_id === sig.id ? '#A33C00' : '#8E5915' }}>{sig.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ marginBottom:16 }}>
                <label style={labelStyle}>Notes</label>
                <textarea value={blForm.notes} onChange={e => setBlForm({...blForm, notes:e.target.value})}
                  placeholder="Remarques de livraison..." rows={2} style={{...inputStyle, resize:'none'}} />
              </div>

              {saveError && (
                <div style={{ background:'#FFF0F0', border:'1px solid #FFCDD2', borderRadius:8, padding:'8px 12px', marginBottom:16, fontSize:12, color:'#D32F2F' }}>
                  {saveError}
                </div>
              )}
              <div style={{ display:'flex', justifyContent:'flex-end', gap:10, paddingTop:16, borderTop:'1px solid #F5E6D3' }}>
                <button type="button" onClick={() => setShowForm(false)} style={btnSecondary}>Annuler</button>
                <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity:saving?0.7:1 }}>
                  {saving ? 'Création...' : 'Créer le BL'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== MODAL Importer BL signe ===== */}
      {showScanModal && scanTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setShowScanModal(false)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.5)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:520, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', overflow:'hidden' }}>

            {/* Header */}
            <div style={{ padding:'16px 22px', borderBottom:'1px solid #F5E6D3', display:'flex', justifyContent:'space-between', alignItems:'center', background:'white' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:34, height:34, borderRadius:9, background:'linear-gradient(135deg,#7C3AED,#6D28D9)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Camera size={16} color="white" />
                </div>
                <div>
                  <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:'#1A141A' }}>BL signe par le client</h3>
                  <p style={{ margin:0, fontSize:11, color:'#8E5915' }}>{scanTarget.number} - {scanTarget.client?.commercial_name}</p>
                </div>
              </div>
              <button onClick={() => setShowScanModal(false)}
                style={{ width:30, height:30, borderRadius:7, border:'1.5px solid #E8D4B0', background:'white', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <X size={14} color="#8E5915" />
                            </button>
            </div>

            {/* Body */}
            <div style={{ padding:'20px 22px' }}>
              {/* Zone upload */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleScanFile(f); }}
                style={{ border:'2px dashed #E8D4B0', borderRadius:12, padding:'24px 16px', textAlign:'center', cursor:'pointer', background:'#FFFBF5', marginBottom:16, transition:'border-color 0.2s' }}
              >
                {scanPreview ? (
                  <img src={scanPreview} alt="preview" style={{ maxHeight:220, maxWidth:'100%', borderRadius:8, objectFit:'contain' }} />
                ) : (
                  <>
                    <Upload size={32} color="#C9922A" style={{ marginBottom:8 }} />
                    <p style={{ margin:0, fontSize:13, color:'#8E5915', fontWeight:600 }}>Cliquez ou glissez le BL signé ici</p>
                    <p style={{ margin:'4px 0 0', fontSize:11, color:'#B8976A' }}>JPG, PNG, PDF acceptés</p>
                  </>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf"
                style={{ display:'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleScanFile(f); }}
              />

              {uploading && (
                <p style={{ textAlign:'center', fontSize:12, color:'#8E5915', margin:'0 0 12px' }}>⏳ Upload en cours...</p>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding:'14px 22px', borderTop:'1px solid #F5E6D3', display:'flex', justifyContent:'flex-end', gap:10 }}>
              <button onClick={() => setShowScanModal(false)} style={btnSecondary}>Annuler</button>
              <button
                onClick={handleSaveScan}
                disabled={!scanUrl || savingScan || uploading}
                style={{ ...btnPrimary, opacity: (!scanUrl || savingScan || uploading) ? 0.6 : 1 }}
              >
                {savingScan ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== POPUP : Edit BL complet ===== */}
      {editTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:2000, display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:40, paddingBottom:24, overflowY:'auto' }}>
          <div onClick={() => setEditTarget(null)} style={{ position:'fixed', inset:0, background:'rgba(26,20,26,0.6)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:620, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ padding:'18px 24px', borderBottom:'1px solid #F5E6D3', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#FFF8EE', borderRadius:'16px 16px 0 0' }}>
              <h2 style={{ margin:0, fontSize:16, fontWeight:700, color:'#1A141A' }}>✏️ Modifier {editTarget.number}</h2>
              <button onClick={() => setEditTarget(null)} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#8E5915' }}>×</button>
            </div>
            <form onSubmit={handleEditSave} style={{ padding:24 }}>
              {/* Numéro + Date émission */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                <div>
                  <label style={labelStyle}>Numéro BL</label>
                  <input value={editForm.number} onChange={e => setEditForm({...editForm, number:e.target.value})} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Date du BL</label>
                  <input type="date" value={editForm.issue_date} onChange={e => setEditForm({...editForm, issue_date:e.target.value})} style={inputStyle} />
                </div>
              </div>

              {/* Date livraison + Livreur */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                <div>
                  <label style={labelStyle}>Date de livraison</label>
                  <input type="date" value={editForm.delivery_date} onChange={e => setEditForm({...editForm, delivery_date:e.target.value})} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Livreur / Transporteur</label>
                  <input value={editForm.delivered_by} onChange={e => setEditForm({...editForm, delivered_by:e.target.value})} placeholder="Nom du livreur" style={inputStyle} />
                </div>
              </div>

              {/* Adresse */}
              <div style={{ marginBottom:16 }}>
                <label style={labelStyle}>Adresse de livraison</label>
                <input value={editForm.delivery_address} onChange={e => setEditForm({...editForm, delivery_address:e.target.value})} placeholder="Adresse complète" style={inputStyle} />
              </div>

              {/* Lignes */}
              <div style={{ border:'1.5px solid #E8D4B0', borderRadius:10, overflow:'hidden', marginBottom:16 }}>
                <div style={{ background:'#FFF8EE', padding:'8px 14px', borderBottom:'1px solid #F5E6D3', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:11, fontWeight:700, color:'#8E5915', textTransform:'uppercase', letterSpacing:0.5 }}>Lignes de livraison</span>
                </div>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr style={{ background:'#FFF8EE' }}>
                      <th style={{ textAlign:'left', padding:'8px 12px', fontSize:10, fontWeight:700, color:'#8E5915', textTransform:'uppercase' }}>Description</th>
                      <th style={{ textAlign:'right', padding:'8px 12px', fontSize:10, fontWeight:700, color:'#8E5915', textTransform:'uppercase', width:80 }}>Qté</th>
                      <th style={{ width:32 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {editLines.map((line, i) => (
                      <tr key={i} style={{ borderTop:'1px solid #F5E6D3' }}>
                        <td style={{ padding:'6px 8px' }}>
                          <input value={line.desc} onChange={e => { const nl=[...editLines]; nl[i]={...nl[i],desc:e.target.value}; setEditLines(nl); }}
                            placeholder="Description..." style={{ ...inputStyle, padding:'6px 10px' }} />
                        </td>
                        <td style={{ padding:'6px 8px' }}>
                          <input type="number" min={1} value={line.qty} onChange={e => { const nl=[...editLines]; nl[i]={...nl[i],qty:Number(e.target.value)||1}; setEditLines(nl); }}
                            style={{ ...inputStyle, padding:'6px 10px', textAlign:'right' as const, fontFamily:'monospace' }} />
                        </td>
                        <td style={{ padding:'6px 4px', textAlign:'center' as const }}>
                          {editLines.length > 1 && (
                            <button type="button" onClick={() => setEditLines(editLines.filter((_,idx)=>idx!==i))}
                              style={{ background:'none', border:'none', cursor:'pointer', color:'#EF4444', padding:4 }}>
                              <Trash2 size={12} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding:'8px 12px', borderTop:'1px solid #F5E6D3' }}>
                  <button type="button" onClick={() => setEditLines([...editLines, { desc:'', qty:1 }])}
                    style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, color:'#E59312', fontWeight:600, display:'flex', alignItems:'center', gap:4 }}>
                    <Plus size={12} /> Ajouter ligne
                  </button>
                </div>
              </div>

              {/* Signature */}
              {signatures.length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <label style={labelStyle}>Signature / Cachet</label>
                  <div style={{ display:'flex', gap:10, flexWrap:'wrap' as const }}>
                    <div onClick={() => setEditForm({...editForm, signature_id:''})}
                      style={{ border:`2px solid ${!editForm.signature_id ? '#E59312' : '#E8D4B0'}`, borderRadius:8, padding:'6px 14px', cursor:'pointer', fontSize:12, color: !editForm.signature_id ? '#A33C00' : '#8E5915', background: !editForm.signature_id ? '#FFF8EE' : 'white', fontWeight:600 }}>
                      Aucune
                    </div>
                    {signatures.map((sig: any) => (
                      <div key={sig.id} onClick={() => setEditForm({...editForm, signature_id: sig.id})}
                        style={{ border:`2px solid ${editForm.signature_id === sig.id ? '#E59312' : '#E8D4B0'}`, borderRadius:8, padding:6, cursor:'pointer', background: editForm.signature_id === sig.id ? '#FFF8EE' : 'white', display:'flex', flexDirection:'column' as const, alignItems:'center', gap:4, minWidth:90 }}>
                        <img src={sig.image_url} alt={sig.name} style={{ height:40, maxWidth:120, objectFit:'contain' as const }} />
                        <span style={{ fontSize:10, fontWeight:600, color: editForm.signature_id === sig.id ? '#A33C00' : '#8E5915' }}>{sig.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div style={{ marginBottom:16 }}>
                <label style={labelStyle}>Notes</label>
                <textarea value={editForm.notes} onChange={e => setEditForm({...editForm, notes:e.target.value})}
                  placeholder="Remarques de livraison..." rows={2} style={{...inputStyle, resize:'none' as const}} />
              </div>

              <div style={{ display:'flex', justifyContent:'flex-end', gap:10, paddingTop:16, borderTop:'1px solid #F5E6D3' }}>
                <button type="button" onClick={() => setEditTarget(null)} style={btnSecondary}>Annuler</button>
                <button type="submit" disabled={editSaving} style={{ ...btnPrimary, opacity:editSaving?0.7:1 }}>
                  {editSaving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== POPUP : Confirmation suppression BL ===== */}
      {deleteTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setDeleteTarget(null)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.6)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:420, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.3)', padding:28 }}>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ width:56, height:56, borderRadius:'50%', background:'#FFF0F0', border:'2px solid #FECACA', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, margin:'0 auto 14px' }}>🗑️</div>
              <h3 style={{ margin:'0 0 8px', fontSize:17, fontWeight:700, color:'#1A141A' }}>Supprimer ce BL ?</h3>
              <p style={{ margin:0, fontSize:13, color:'#DC2626' }}>
                <strong>{deleteTarget.number}</strong> sera supprimé définitivement. Cette action est irréversible.
              </p>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setDeleteTarget(null)} style={{ ...btnSecondary, flex:1 }}>Annuler</button>
              <button onClick={handleDelete} disabled={deleting}
                style={{ ...btnDanger, flex:1, opacity:deleting ? 0.7 : 1 }}>
                {deleting ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FileViewer pour BL en attente */}
      <FileViewerModal
        url={viewPendingUrl}
        title="Document BL"
        onClose={() => setViewPendingUrl(null)}
      />
    </div>
  );
}
