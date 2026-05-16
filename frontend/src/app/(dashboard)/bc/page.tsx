'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Search, ArrowRight, Trash2, Upload, PlusCircle, X, FileImage, File, Eye, Download } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';
import FileViewerModal from '@/components/ui/FileViewerModal';
import { useRouter } from 'next/navigation';
import PDFButton from '@/components/ui/PDFButton';
import { bcApi, devisApi, clientsApi, signaturesApi } from '@/lib/api';
import { formatDate, cn, formatCurrency } from '@/lib/utils';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

const statusLabel: Record<string, string> = {
  OPEN: 'Ouvert', PARTIALLY_DELIVERED: 'Partiel',
  DELIVERED: 'Livré', CANCELLED: 'Annulé',
};
const statusCls: Record<string, string> = {
  OPEN: 'badge-info', PARTIALLY_DELIVERED: 'badge-warning',
  DELIVERED: 'badge-success', CANCELLED: 'bg-gray-50 text-gray-400 border-gray-200',
};
const sourceLabel: Record<string, string> = {
  INTERNAL: 'Interne', IMPORTED_OCR: 'OCR', IMPORTED_MANUAL: 'Manuel',
};

const btnSecondary = { padding:'9px 18px', borderRadius:8, border:'1.5px solid #EDDEC1', background:'white', color:'#A33C00', fontSize:13, fontWeight:600 as const, cursor:'pointer' as const };
const btnPrimary   = { padding:'9px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#EBB800,#755C00)', color:'#1A141A', fontSize:13, fontWeight:700 as const, cursor:'pointer' as const };
const btnDanger    = { padding:'9px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#EF4444,#DC2626)', color:'white', fontSize:13, fontWeight:700 as const, cursor:'pointer' as const };
const inputStyle   = { width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #EDDEC1', fontSize:13, outline:'none', boxSizing:'border-box' as const };
const labelStyle   = { display:'block' as const, fontSize:11, fontWeight:700 as const, color:'#A33C00', textTransform:'uppercase' as const, letterSpacing:0.5, marginBottom:6 };

interface ImportLine {
  description: string;
  quantity: string;
  unit_price: string;
}

const emptyLine = (): ImportLine => ({ description: '', quantity: '1', unit_price: '' });

export default function BCPage() {
  const router = useRouter();
  const { user } = useAuth();
  const canDel = user?.role === 'ADMIN' || user?.role === 'GERANT';

  const [bcs, setBcs] = useState<any[]>([]);
  const [validatedDevis, setValidatedDevis] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Signatures
  const [signatures, setSignatures] = useState<any[]>([]);
  const [bcSignatureId, setBcSignatureId] = useState('');

  // Modal "Depuis devis"
  const [showDevisModal, setShowDevisModal] = useState(false);
  const [selectedDevisId, setSelectedDevisId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Modal "Importer BC"
  const [showImportModal, setShowImportModal] = useState(false);
  const [importMode, setImportMode] = useState<'manual' | 'file'>('manual');
  const [importClientId, setImportClientId] = useState('');
  const [importLines, setImportLines] = useState<ImportLine[]>([emptyLine()]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  // File upload state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importFileUrl, setImportFileUrl] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [cancelling, setCancelling] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  // View modal
  const [viewTarget, setViewTarget] = useState<any>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [previewFileUrl, setPreviewFileUrl] = useState<string | null>(null);

  const fetchData = () => {
    setLoading(true);
    bcApi.list({ search, status: statusFilter || undefined })
      .then((r) => setBcs(r.data.data || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [search, statusFilter]);

  // Charger les clients et signatures au demarrage
  useEffect(() => {
    clientsApi.list({ limit: 500 }).then(r => setClients(r.data.data || [])).catch(() => {});
    signaturesApi.list().then(r => setSignatures(r.data || [])).catch(() => {});
  }, []);

  const openDevisModal = () => {
    setSelectedDevisId(''); setCreateError(''); setBcSignatureId('');
    devisApi.list({ status: 'VALIDATED', limit: 200 })
      .then(r => setValidatedDevis(r.data.data || []))
      .catch(() => {});
    setShowDevisModal(true);
  };

  const handleCreateFromDevis = async () => {
    if (!selectedDevisId) { setCreateError('Sélectionnez un devis'); return; }
    setCreating(true); setCreateError('');
    try {
      await bcApi.createFromDevis(selectedDevisId, bcSignatureId || undefined);
      fetchData(); setShowDevisModal(false);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setCreateError(Array.isArray(msg) ? msg.join(', ') : (msg || 'Erreur'));
    } finally { setCreating(false); }
  };

  const openImportModal = () => {
    setImportClientId('');
    setImportLines([emptyLine()]);
    setImportError('');
    setImportFile(null);
    setImportFileUrl('');
    setImportMode('manual');
    setBcSignatureId('');
    setShowImportModal(true);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setUploadingFile(true);
    setImportError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/upload', fd);
      setImportFileUrl(res.data.url || res.data.filename || '');
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Erreur lors du téléversement du fichier';
      setImportError(Array.isArray(msg) ? msg.join(', ') : String(msg));
    } finally {
      setUploadingFile(false);
    }
  };

  const updateLine = (idx: number, field: keyof ImportLine, val: string) => {
    setImportLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: val } : l));
  };

  const addLine = () => setImportLines(prev => [...prev, emptyLine()]);

  const removeLine = (idx: number) => {
    if (importLines.length === 1) return;
    setImportLines(prev => prev.filter((_, i) => i !== idx));
  };

  const handleImport = async () => {
    if (!importClientId) { setImportError('Sélectionnez un client'); return; }

    if (importMode === 'file') {
      if (!importFileUrl) { setImportError('Veuillez téléverser un fichier PDF ou image'); return; }
      setImporting(true); setImportError('');
      try {
        await bcApi.import({
          client_id: importClientId,
          source: 'IMPORTED_OCR',
          imported_file_url: importFileUrl,
          signature_id: bcSignatureId || undefined,
          lines: [{ description: importFile?.name || 'Document importé', quantity: 1 }],
        });
        fetchData(); setShowImportModal(false);
      } catch (e: any) {
        const msg = e?.response?.data?.message;
        setImportError(Array.isArray(msg) ? msg.join(', ') : (msg || 'Erreur lors de l\'import'));
      } finally { setImporting(false); }
      return;
    }

    const validLines = importLines.filter(l => l.description.trim());
    if (validLines.length === 0) { setImportError('Ajoutez au moins une ligne avec une description'); return; }

    setImporting(true); setImportError('');
    try {
      await bcApi.import({
        client_id: importClientId,
        source: 'IMPORTED_MANUAL',
        signature_id: bcSignatureId || undefined,
        lines: validLines.map(l => ({
          description: l.description.trim(),
          quantity: parseFloat(l.quantity) || 1,
          unit_price: l.unit_price ? parseFloat(l.unit_price) : undefined,
        })),
      });
      fetchData(); setShowImportModal(false);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setImportError(Array.isArray(msg) ? msg.join(', ') : (msg || 'Erreur lors de l\'import'));
    } finally { setImporting(false); }
  };

  const openView = async (bc: any) => {
    setViewLoading(true);
    setViewTarget(bc);
    try {
      const res = await bcApi.get(bc.id);
      setViewTarget(res.data);
    } catch { /* keep whatever we have */ }
    finally { setViewLoading(false); }
  };

  const handleStatusChange = async (bc: any, newStatus: string) => {
    setUpdatingStatus(true);
    try {
      await bcApi.updateStatus(bc.id, newStatus);
      fetchData();
    } catch (e: any) { alert(e?.response?.data?.message || 'Erreur'); }
    finally { setUpdatingStatus(false); }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await bcApi.cancel(cancelTarget.id);
      fetchData(); setCancelTarget(null);
    } catch (e: any) { alert(e?.response?.data?.message || 'Erreur'); }
    finally { setCancelling(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await bcApi.delete(deleteTarget.id);
      fetchData(); setDeleteTarget(null);
    } catch (e: any) { alert(e?.response?.data?.message || 'Erreur lors de la suppression'); }
    finally { setDeleting(false); }
  };

  return (
    <div>
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-[22px] font-bold text-honey-dark font-display tracking-tight">Bons de commande</h1>
          <p className="text-sm text-honey-caramel mt-0.5">BC internes (depuis devis) + BC clients importes</p>
        </div>
        <div className="flex gap-2">
          <button onClick={openImportModal} className="btn-secondary text-sm flex items-center gap-1.5">
            <Upload size={13} /> Importer BC
          </button>
          <button onClick={openDevisModal} className="btn-primary text-sm flex items-center gap-1.5">
            <Plus size={13} /> Depuis devis
          </button>
        </div>
      </div>

      <div className="card">
        <div className="flex gap-3 mb-4 flex-wrap">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-honey-caramel" />
            <input type="text" placeholder="Rechercher un BC..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="input pl-9 max-w-xs" />
          </div>
          {(['', 'OPEN', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED'] as const).map((s) => (
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
              {['Numero', 'Client', 'Source', 'Devis lie', 'Date', 'Statut', 'Actions'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-honey-caramel border-b border-honey-beige-soft">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-12 text-center text-honey-caramel">Chargement...</td></tr>
            ) : bcs.length === 0 ? (
              <tr><td colSpan={7} className="py-12 text-center text-honey-caramel">Aucun BC trouve</td></tr>
            ) : bcs.map((bc) => (
              <tr key={bc.id} className="border-b border-honey-beige-soft hover:bg-honey-cream/50 transition-colors">
                <td className="px-4 py-3 font-mono font-semibold text-honey-dark">{bc.number}</td>
                <td className="px-4 py-3 text-honey-dark">{bc.client?.commercial_name}</td>
                <td className="px-4 py-3 text-xs text-honey-caramel">{sourceLabel[bc.source] || bc.source}</td>
                <td className="px-4 py-3 font-mono text-[11px] text-honey-caramel">{bc.devis?.number || '-'}</td>
                <td className="px-4 py-3 text-xs text-honey-caramel">{formatDate(bc.issue_date)}</td>
                <td className="px-4 py-3">
                  <span className={cn('badge border text-[10px]', statusCls[bc.status])}>
                    {statusLabel[bc.status]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {/* Voir les détails */}
                    <button onClick={() => openView(bc)} title="Voir les détails"
                      className="w-7 h-7 rounded-md border border-honey-beige-soft flex items-center justify-center text-honey-caramel hover:text-honey-dark hover:border-honey-gold hover:bg-honey-cream transition-all">
                      <Eye size={12} />
                    </button>
                    {/* Fichier original pour les BCs importés */}
                    {bc.imported_file_url && (
                      <button
                        onClick={() => setPreviewFileUrl(bc.imported_file_url)}
                        title="Voir le fichier importé"
                        style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:6, border:'1.5px solid #BFDBFE', background:'#EFF6FF', color:'#1D4ED8', fontSize:10, fontWeight:700, cursor:'pointer' }}>
                        <File size={10} /> Fichier
                      </button>
                    )}
                    {/* PDF */}
                    <PDFButton docType="bc" docId={bc.id} docNumber={bc.number} variant="inline" />
                    {canDel && (bc.status === 'OPEN' || bc.status === 'PARTIALLY_DELIVERED') && (
                      <button onClick={() => handleStatusChange(bc, 'DELIVERED')} disabled={updatingStatus}
                        className="px-2 py-1 rounded text-[10px] font-semibold border bg-green-50 text-green-700 border-green-200 hover:bg-green-100 transition-all">
                        Livre
                      </button>
                    )}
                    {bc.status === 'OPEN' && (
                      <button
                        onClick={() => router.push('/bl')}
                        title="Créer un BL pour ce BC"
                        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold border bg-green-50 text-green-700 border-green-200 hover:bg-green-100 transition-all">
                        <ArrowRight size={10} /> BL
                      </button>
                    )}
                    {canDel && bc.status !== 'CANCELLED' && bc.status !== 'DELIVERED' && (
                      <button onClick={() => setCancelTarget(bc)} title="Annuler le BC"
                        className="px-2 py-1 rounded text-[10px] font-semibold border border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100 transition-all">
                        Annuler
                      </button>
                    )}
                    {canDel && (
                      <button onClick={() => setDeleteTarget(bc)} title="Supprimer définitivement"
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
      </div>

      {/* ===== MODAL : Depuis devis ===== */}
      {showDevisModal && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setShowDevisModal(false)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.5)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:460, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', padding:28 }}>
            <h3 style={{ margin:'0 0 6px', fontSize:16, fontWeight:700, color:'#1A141A' }}>Creer BC depuis un devis</h3>
            <p style={{ fontSize:13, color:'#A33C00', marginBottom:20 }}>Sélectionnez un devis validé pour en générer le bon de commande.</p>
            <div style={{ marginBottom:20 }}>
              <label style={labelStyle}>Devis valide *</label>
              <select value={selectedDevisId} onChange={e => setSelectedDevisId(e.target.value)} style={inputStyle}>
                <option value="">Choisir un devis...</option>
                {validatedDevis.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.number} - {d.client?.commercial_name} - {Number(d.total_ttc).toFixed(0)} MAD TTC
                  </option>
                ))}
              </select>
              {validatedDevis.length === 0 && (
                <p style={{ fontSize:12, color:'#A33C00', marginTop:8 }}>Aucun devis valide disponible.</p>
              )}
            </div>

            {/* Signature */}
            {signatures.length > 0 && (
              <div style={{ marginBottom:20 }}>
                <label style={labelStyle}>Signature ETCC</label>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:6 }}>
                  <div onClick={() => setBcSignatureId('')}
                    style={{ border:`2px solid ${!bcSignatureId ? '#EBB800' : '#EDDEC1'}`, borderRadius:8, padding:'6px 14px', cursor:'pointer', fontSize:12, color: !bcSignatureId ? '#A33C00' : '#A33C00', background: !bcSignatureId ? '#FFF8EE' : 'white', fontWeight:600 }}>
                    Aucune
                  </div>
                  {signatures.map((sig: any) => (
                    <div key={sig.id} onClick={() => setBcSignatureId(sig.id)}
                      style={{ border:`2px solid ${bcSignatureId === sig.id ? '#EBB800' : '#EDDEC1'}`, borderRadius:8, padding:6, cursor:'pointer', background: bcSignatureId === sig.id ? '#FFF8EE' : 'white', display:'flex', flexDirection:'column', alignItems:'center', gap:4, minWidth:90 }}>
                      <img src={sig.image_url} alt={sig.name} style={{ height:40, maxWidth:120, objectFit:'contain' }} />
                      <span style={{ fontSize:10, fontWeight:600, color: bcSignatureId === sig.id ? '#A33C00' : '#A33C00' }}>{sig.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {createError && (
              <div style={{ background:'#FFF0F0', border:'1px solid #FFCDD2', borderRadius:8, padding:'8px 12px', marginBottom:16, fontSize:12, color:'#D32F2F' }}>
                {createError}
              </div>
            )}
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setShowDevisModal(false)} style={{ ...btnSecondary, flex:1 }}>Annuler</button>
              <button onClick={handleCreateFromDevis} disabled={!selectedDevisId || creating}
                style={{ ...btnPrimary, flex:1, opacity:(!selectedDevisId || creating)?0.5:1 }}>
                {creating ? 'Creation...' : 'Generer le BC'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL : Import BC ===== */}
      {showImportModal && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setShowImportModal(false)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.5)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:580, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', padding:28, maxHeight:'90vh', overflowY:'auto' }}>

            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <div>
                <h3 style={{ margin:0, fontSize:16, fontWeight:700, color:'#1A141A' }}>Importer un BC client</h3>
                <p style={{ margin:'4px 0 0', fontSize:12, color:'#A33C00' }}>Saisie manuelle ou import d'un fichier PDF / image</p>
              </div>
              <button onClick={() => setShowImportModal(false)}
                style={{ width:32, height:32, borderRadius:8, border:'1.5px solid #EDDEC1', background:'white', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#A33C00' }}>
                <X size={15} />
              </button>
            </div>

            {/* Mode toggle */}
            <div style={{ display:'flex', gap:8, marginBottom:20, background:'#FBF6EE', padding:4, borderRadius:10 }}>
              <button type="button"
                onClick={() => { setImportMode('manual'); setImportError(''); }}
                style={{ flex:1, padding:'8px 0', borderRadius:8, border:'none', background: importMode==='manual' ? 'white' : 'transparent', color: importMode==='manual' ? '#1A141A' : '#A33C00', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow: importMode==='manual' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
                ✍️ Saisie manuelle
              </button>
              <button type="button"
                onClick={() => { setImportMode('file'); setImportError(''); }}
                style={{ flex:1, padding:'8px 0', borderRadius:8, border:'none', background: importMode==='file' ? 'white' : 'transparent', color: importMode==='file' ? '#1A141A' : '#A33C00', fontSize:13, fontWeight:700, cursor:'pointer', boxShadow: importMode==='file' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
                📄 PDF / Image
              </button>
            </div>

            {/* Client */}
            <div style={{ marginBottom:18 }}>
              <label style={labelStyle}>Client *</label>
              <select value={importClientId} onChange={e => setImportClientId(e.target.value)} style={inputStyle}>
                <option value="">Choisir un client...</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.commercial_name}</option>
                ))}
              </select>
            </div>

            {/* ── Mode fichier ────────────────────────────────── */}
            {importMode === 'file' && (
              <div style={{ marginBottom:18 }}>
                <label style={labelStyle}>Fichier PDF ou Image *</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
                  onChange={handleFileSelect}
                  style={{ display:'none' }}
                />
                {!importFile ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{ border:'2px dashed #EDDEC1', borderRadius:10, padding:'28px 20px', textAlign:'center', cursor:'pointer', background:'#FBF6EE', transition:'border-color 0.2s' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor='#EBB800')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor='#EDDEC1')}
                  >
                    <div style={{ fontSize:32, marginBottom:8 }}>📄</div>
                    <p style={{ margin:0, fontSize:14, fontWeight:600, color:'#1A141A' }}>Cliquer pour sélectionner</p>
                    <p style={{ margin:'4px 0 0', fontSize:12, color:'#A33C00' }}>PDF, JPG, PNG, WEBP acceptés</p>
                  </div>
                ) : (
                  <div style={{ border:'1.5px solid #EDDEC1', borderRadius:10, padding:'14px 16px', background:'#FBF6EE', display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ width:40, height:40, borderRadius:8, background:'linear-gradient(135deg,#EBB800,#755C00)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      {importFile.type === 'application/pdf' ? <File size={20} color="white" /> : <FileImage size={20} color="white" />}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ margin:0, fontSize:13, fontWeight:600, color:'#1A141A', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{importFile.name}</p>
                      <p style={{ margin:'2px 0 0', fontSize:11, color:'#A33C00' }}>
                        {uploadingFile ? '⏳ Téléversement en cours...' : importFileUrl ? '✅ Fichier prêt' : '❌ Erreur de téléversement'}
                      </p>
                    </div>
                    <button type="button" onClick={() => { setImportFile(null); setImportFileUrl(''); }}
                      style={{ width:28, height:28, borderRadius:6, border:'1px solid #FECACA', background:'#FFF5F5', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#EF4444', flexShrink:0 }}>
                      <X size={13} />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Mode manuel : Lignes ─────────────────────── */}
            {importMode === 'manual' && (
            <div style={{ marginBottom:18 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <label style={{ ...labelStyle, marginBottom:0 }}>Lignes du BC *</label>
                <button onClick={addLine}
                  style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:6, border:'1.5px solid #EDDEC1', background:'white', color:'#A33C00', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                  <PlusCircle size={13} /> Ajouter ligne
                </button>
              </div>

              <div style={{ border:'1px solid #EDDEC1', borderRadius:10, overflow:'hidden' }}>
                {/* Header */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 100px 36px', gap:0, background:'#FBF6EE', padding:'8px 12px', borderBottom:'1px solid #EDDEC1' }}>
                  <span style={{ fontSize:10, fontWeight:700, color:'#A33C00', textTransform:'uppercase', letterSpacing:0.5 }}>Description</span>
                  <span style={{ fontSize:10, fontWeight:700, color:'#A33C00', textTransform:'uppercase', letterSpacing:0.5 }}>Qte</span>
                  <span style={{ fontSize:10, fontWeight:700, color:'#A33C00', textTransform:'uppercase', letterSpacing:0.5 }}>P.U. HT</span>
                  <span></span>
                </div>
                {importLines.map((line, idx) => (
                  <div key={idx} style={{ display:'grid', gridTemplateColumns:'1fr 80px 100px 36px', gap:0, padding:'8px 12px', borderBottom: idx < importLines.length-1 ? '1px solid #EDDEC1' : 'none', alignItems:'center' }}>
                    <input
                      placeholder="Description..."
                      value={line.description}
                      onChange={e => updateLine(idx, 'description', e.target.value)}
                      style={{ ...inputStyle, marginRight:6, padding:'6px 10px', fontSize:12 }}
                    />
                    <input
                      type="number" min="0.01" step="0.01"
                      placeholder="1"
                      value={line.quantity}
                      onChange={e => updateLine(idx, 'quantity', e.target.value)}
                      style={{ ...inputStyle, marginRight:6, padding:'6px 10px', fontSize:12 }}
                    />
                    <input
                      type="number" min="0" step="0.01"
                      placeholder="Prix HT"
                      value={line.unit_price}
                      onChange={e => updateLine(idx, 'unit_price', e.target.value)}
                      style={{ ...inputStyle, marginRight:6, padding:'6px 10px', fontSize:12 }}
                    />
                    <button onClick={() => removeLine(idx)} disabled={importLines.length === 1}
                      style={{ width:28, height:28, borderRadius:6, border:'1px solid #FECACA', background:'#FFF5F5', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#EF4444', opacity: importLines.length===1 ? 0.3 : 1 }}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            )}

            {/* Signature */}
            {signatures.length > 0 && (
              <div style={{ marginBottom:18 }}>
                <label style={labelStyle}>Signature ETCC</label>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:6 }}>
                  <div onClick={() => setBcSignatureId('')}
                    style={{ border:`2px solid ${!bcSignatureId ? '#EBB800' : '#EDDEC1'}`, borderRadius:8, padding:'6px 14px', cursor:'pointer', fontSize:12, color:'#A33C00', background: !bcSignatureId ? '#FFF8EE' : 'white', fontWeight:600 }}>
                    Aucune
                  </div>
                  {signatures.map((sig: any) => (
                    <div key={sig.id} onClick={() => setBcSignatureId(sig.id)}
                      style={{ border:`2px solid ${bcSignatureId === sig.id ? '#EBB800' : '#EDDEC1'}`, borderRadius:8, padding:6, cursor:'pointer', background: bcSignatureId === sig.id ? '#FFF8EE' : 'white', display:'flex', flexDirection:'column', alignItems:'center', gap:4, minWidth:90 }}>
                      <img src={sig.image_url} alt={sig.name} style={{ height:40, maxWidth:120, objectFit:'contain' }} />
                      <span style={{ fontSize:10, fontWeight:600, color:'#A33C00' }}>{sig.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {importError && (
              <div style={{ background:'#FFF0F0', border:'1px solid #FFCDD2', borderRadius:8, padding:'8px 12px', marginBottom:16, fontSize:12, color:'#D32F2F' }}>
                {importError}
              </div>
            )}

            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setShowImportModal(false)} style={{ ...btnSecondary, flex:1 }}>Annuler</button>
              <button onClick={handleImport} disabled={importing}
                style={{ ...btnPrimary, flex:2, opacity:importing?0.6:1 }}>
                {importing ? 'Import en cours...' : 'Importer le BC'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL : Voir BC ===== */}
      {viewTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setViewTarget(null)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.5)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:620, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', maxHeight:'90vh', overflowY:'auto' }}>
            {/* Header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'20px 24px', borderBottom:'1px solid #EDDEC1', background:'#FBF6EE', borderRadius:'16px 16px 0 0' }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontSize:18 }}>📋</span>
                  <h3 style={{ margin:0, fontSize:16, fontWeight:700, color:'#1A141A' }}>{viewTarget.number}</h3>
                  <span style={{ padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700,
                    background: viewTarget.status==='OPEN' ? '#DBEAFE' : viewTarget.status==='DELIVERED' ? '#DCFCE7' : '#FEF9C3',
                    color: viewTarget.status==='OPEN' ? '#1D4ED8' : viewTarget.status==='DELIVERED' ? '#15803D' : '#92400E',
                    border:'1px solid currentColor' }}>
                    {statusLabel[viewTarget.status] || viewTarget.status}
                  </span>
                </div>
                <p style={{ margin:'4px 0 0', fontSize:12, color:'#A33C00' }}>
                  {sourceLabel[viewTarget.source] || viewTarget.source} · {formatDate(viewTarget.issue_date)}
                </p>
              </div>
              <button onClick={() => setViewTarget(null)} style={{ width:32, height:32, borderRadius:8, border:'1.5px solid #EDDEC1', background:'white', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#A33C00' }}>
                <X size={15} />
              </button>
            </div>

            <div style={{ padding:24 }}>
              {viewLoading ? (
                <p style={{ textAlign:'center', color:'#A33C00', padding:'32px 0' }}>Chargement...</p>
              ) : (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
                    <div style={{ background:'#FBF6EE', borderRadius:10, padding:'12px 16px' }}>
                      <p style={{ margin:'0 0 4px', fontSize:10, fontWeight:700, color:'#A33C00', textTransform:'uppercase', letterSpacing:0.5 }}>Client</p>
                      <p style={{ margin:0, fontSize:14, fontWeight:600, color:'#1A141A' }}>{viewTarget.client?.commercial_name || '—'}</p>
                      {viewTarget.client?.ice && <p style={{ margin:'2px 0 0', fontSize:11, color:'#A33C00' }}>ICE: {viewTarget.client.ice}</p>}
                    </div>
                    <div style={{ background:'#FBF6EE', borderRadius:10, padding:'12px 16px' }}>
                      <p style={{ margin:'0 0 4px', fontSize:10, fontWeight:700, color:'#A33C00', textTransform:'uppercase', letterSpacing:0.5 }}>Devis lié</p>
                      <p style={{ margin:0, fontSize:14, fontWeight:600, color:'#1A141A' }}>{viewTarget.devis?.number || '—'}</p>
                      {viewTarget.devis?.object && <p style={{ margin:'2px 0 0', fontSize:11, color:'#A33C00' }}>{viewTarget.devis.object}</p>}
                    </div>
                  </div>

                  {viewTarget.lines && viewTarget.lines.length > 0 && (
                    <div style={{ marginBottom:20 }}>
                      <p style={{ margin:'0 0 10px', fontSize:11, fontWeight:700, color:'#A33C00', textTransform:'uppercase', letterSpacing:0.5 }}>Lignes du BC</p>
                      <div style={{ border:'1px solid #EDDEC1', borderRadius:10, overflow:'hidden' }}>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 110px 110px', background:'#FBF6EE', padding:'8px 14px', borderBottom:'1px solid #EDDEC1' }}>
                          {['Description','Qté','P.U. HT','Total HT'].map(h => (
                            <span key={h} style={{ fontSize:10, fontWeight:700, color:'#A33C00', textTransform:'uppercase', letterSpacing:0.5 }}>{h}</span>
                          ))}
                        </div>
                        {viewTarget.lines.map((line: any, i: number) => (
                          <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 80px 110px 110px', padding:'10px 14px', borderBottom: i < viewTarget.lines.length-1 ? '1px solid #EDDEC1' : 'none', alignItems:'center' }}>
                            <span style={{ fontSize:13, color:'#1A141A' }}>{line.description}</span>
                            <span style={{ fontSize:13, fontFamily:'monospace' }}>{Number(line.quantity)}</span>
                            <span style={{ fontSize:13, fontFamily:'monospace' }}>{line.unit_price != null ? formatCurrency(Number(line.unit_price)) + ' MAD' : '—'}</span>
                            <span style={{ fontSize:13, fontFamily:'monospace', fontWeight:600 }}>{line.total_ht != null ? formatCurrency(Number(line.total_ht)) + ' MAD' : '—'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {viewTarget.imported_file_url && (
                    <div style={{ marginBottom:20, padding:'14px 16px', background:'#EFF6FF', borderRadius:10, border:'1px solid #BFDBFE', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <span style={{ fontSize:22 }}>📄</span>
                        <div>
                          <p style={{ margin:0, fontSize:13, fontWeight:600, color:'#1E40AF' }}>Fichier BC importé</p>
                          <p style={{ margin:'2px 0 0', fontSize:11, color:'#3B82F6' }}>{sourceLabel[viewTarget.source] || viewTarget.source}</p>
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:8 }}>
                        <button
                          onClick={() => setPreviewFileUrl(viewTarget.imported_file_url)}
                          style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:8, border:'1.5px solid #3B82F6', background:'white', color:'#1D4ED8', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                          <Eye size={13} /> Voir
                        </button>
                        <a
                          href={viewTarget.imported_file_url.includes('cloudinary.com')
                            ? viewTarget.imported_file_url.includes('/raw/upload/')
                              ? viewTarget.imported_file_url.replace('/raw/upload/', '/raw/upload/fl_attachment/')
                              : viewTarget.imported_file_url.replace('/upload/', '/upload/fl_attachment/')
                            : viewTarget.imported_file_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#3B82F6,#1D4ED8)', color:'white', fontSize:12, fontWeight:700, cursor:'pointer', textDecoration:'none' }}>
                          <Download size={13} /> Télécharger
                        </a>
                      </div>
                    </div>
                  )}

                  {viewTarget.notes && (
                    <div style={{ padding:'12px 16px', background:'#FFFBEB', borderRadius:10, border:'1px solid #FDE68A' }}>
                      <p style={{ margin:'0 0 4px', fontSize:10, fontWeight:700, color:'#92400E', textTransform:'uppercase', letterSpacing:0.5 }}>Notes</p>
                      <p style={{ margin:0, fontSize:13, color:'#1A141A' }}>{viewTarget.notes}</p>
                    </div>
                  )}
                </>
              )}
            </div>

            <div style={{ padding:'16px 24px', borderTop:'1px solid #EDDEC1', display:'flex', justifyContent:'flex-end' }}>
              <button onClick={() => setViewTarget(null)} style={{ ...btnSecondary }}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== POPUP : Confirmation annulation ===== */}
      {cancelTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setCancelTarget(null)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.6)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:420, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.3)', padding:28 }}>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ width:56, height:56, borderRadius:'50%', background:'#FFF0F0', border:'2px solid #FECACA', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, margin:'0 auto 14px' }}>X</div>
              <h3 style={{ margin:'0 0 8px', fontSize:17, fontWeight:700, color:'#1A141A' }}>Annuler ce BC ?</h3>
              <p style={{ margin:0, fontSize:13, color:'#A33C00' }}>
                Le bon de commande <strong>{cancelTarget.number}</strong> sera marque comme annule.
              </p>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setCancelTarget(null)} style={{ ...btnSecondary, flex:1 }}>Retour</button>
              <button onClick={handleCancel} disabled={cancelling} style={{ ...btnDanger, flex:1, opacity:cancelling ? 0.7 : 1 }}>
                {cancelling ? 'Annulation...' : 'Confirmer annulation'}

              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== POPUP : Suppression définitive ===== */}
      {deleteTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setDeleteTarget(null)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.6)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:420, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.3)', padding:28 }}>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ width:56, height:56, borderRadius:'50%', background:'#FFF0F0', border:'2px solid #FECACA', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, margin:'0 auto 14px' }}>🗑️</div>
              <h3 style={{ margin:'0 0 8px', fontSize:17, fontWeight:700, color:'#1A141A' }}>Supprimer définitivement ?</h3>
              <p style={{ margin:0, fontSize:13, color:'#DC2626' }}>
                <strong>{deleteTarget.number}</strong> sera supprimé de la base de données. Cette action est irréversible.
              </p>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setDeleteTarget(null)} style={{ ...btnSecondary, flex:1 }}>Annuler</button>
              <button onClick={handleDelete} disabled={deleting} style={{ ...btnDanger, flex:1, opacity:deleting ? 0.7 : 1 }}>
                {deleting ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FileViewer — PDF preview dans iframe, image dans modal */}
      <FileViewerModal
        url={previewFileUrl}
        title="Fichier BC importé"
        onClose={() => setPreviewFileUrl(null)}
      />
    </div>
  );
}
