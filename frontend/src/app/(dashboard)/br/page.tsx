'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Trash2, Upload, X, FileImage, File, Eye, Download, Link2 } from 'lucide-react';
import FileViewerModal from '@/components/ui/FileViewerModal';
import PDFButton from '@/components/ui/PDFButton';
import { brApi, bcApi, projectsApi } from '@/lib/api';
import { formatDate, cn } from '@/lib/utils';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

const statusLabel: Record<string, string> = { ACTIF: 'Actif', ANNULE: 'Annulé' };
const statusCls: Record<string, string> = { ACTIF: 'badge-success', ANNULE: 'bg-gray-50 text-gray-400 border-gray-200' };

const btnSecondary = { padding:'9px 18px', borderRadius:8, border:'1.5px solid #EDDEC1', background:'white', color:'#A33C00', fontSize:13, fontWeight:600 as const, cursor:'pointer' as const };
const btnPrimary   = { padding:'9px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#EBB800,#755C00)', color:'#1A141A', fontSize:13, fontWeight:700 as const, cursor:'pointer' as const };
const btnDanger    = { padding:'9px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#EF4444,#DC2626)', color:'white', fontSize:13, fontWeight:700 as const, cursor:'pointer' as const };
const inputStyle   = { width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #EDDEC1', fontSize:13, outline:'none', boxSizing:'border-box' as const, background:'white' };
const labelStyle   = { display:'block' as const, fontSize:11, fontWeight:700 as const, color:'#A33C00', textTransform:'uppercase' as const, letterSpacing:0.5, marginBottom:6 };

const today = () => new Date().toISOString().split('T')[0];

export default function BRPage() {
  const { user } = useAuth();
  const canDel = user?.role === 'ADMIN' || user?.role === 'GERANT';

  const [brs, setBrs]                     = useState<any[]>([]);
  const [bcs, setBcs]                     = useState<any[]>([]);
  const [projects, setProjects]           = useState<any[]>([]);
  const [search, setSearch]               = useState('');
  const [statusFilter, setStatusFilter]   = useState('');
  const [loading, setLoading]             = useState(true);
  const [fetchError, setFetchError]       = useState('');

  // ── Modal "Importer BR" ──────────────────────────────────────────────────
  const [showImportModal, setShowImportModal] = useState(false);
  const [importBcId, setImportBcId]           = useState('');
  const [importProjectId, setImportProjectId] = useState('');
  const [importReceptionDate, setImportReceptionDate] = useState(today());
  const [importNotes, setImportNotes]         = useState('');
  const [importing, setImporting]             = useState(false);
  const [importError, setImportError]         = useState('');
  // File upload
  const [importFile, setImportFile]           = useState<File | null>(null);
  const [importFileUrl, setImportFileUrl]     = useState('');
  const [uploadingFile, setUploadingFile]     = useState(false);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);

  // ── Edit numéro/date/projet/notes ────────────────────────────────────────
  const [editTarget, setEditTarget]           = useState<any>(null);
  const [editNumber, setEditNumber]           = useState('');
  const [editReceptionDate, setEditReceptionDate] = useState('');
  const [editProjectId, setEditProjectId]     = useState('');
  const [editNotes, setEditNotes]             = useState('');
  const [editSaving, setEditSaving]           = useState(false);

  const openEdit = (br: any) => {
    setEditTarget(br);
    setEditNumber(br.number || '');
    setEditReceptionDate(br.reception_date ? br.reception_date.split('T')[0] : '');
    setEditProjectId(br.project_id || '');
    setEditNotes(br.notes || '');
  };
  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setEditSaving(true);
    try {
      await brApi.update(editTarget.id, {
        number: editNumber,
        reception_date: editReceptionDate,
        project_id: editProjectId || null,
        notes: editNotes || null,
      });
      fetchData();
      setEditTarget(null);
    } finally { setEditSaving(false); }
  };

  // ── Actions tableau ──────────────────────────────────────────────────────
  const [cancelTarget, setCancelTarget]   = useState<any>(null);
  const [cancelling, setCancelling]       = useState(false);
  const [deleteTarget, setDeleteTarget]   = useState<any>(null);
  const [deleting, setDeleting]           = useState(false);

  // ── Vue détail ───────────────────────────────────────────────────────────
  const [viewTarget, setViewTarget]       = useState<any>(null);
  const [viewLoading, setViewLoading]     = useState(false);
  const [previewFileUrl, setPreviewFileUrl] = useState<string | null>(null);
  const viewRequestRef = useRef(0);

  // ── Fetch ────────────────────────────────────────────────────────────────
  const fetchData = useCallback(() => {
    setLoading(true);
    setFetchError('');
    brApi.list({ search, status: statusFilter || undefined, limit: 500 })
      .then((r) => setBrs(r.data.data || []))
      .catch((e: any) => {
        setBrs([]);
        setFetchError(e?.response?.data?.message || 'Erreur lors du chargement des BR. Réessayez.');
      })
      .finally(() => setLoading(false));
  }, [search, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    bcApi.list({ limit: 500 }).then(r => setBcs((r.data.data || []).filter((b: any) => b.status !== 'CANCELLED'))).catch(() => {});
    projectsApi.list({ limit: 500 }).then(r => setProjects(r.data.data || [])).catch(() => {});
  }, []);

  // ── Ouverture modal "Importer BR" ────────────────────────────────────────
  const openImportModal = () => {
    if (uploadAbortRef.current) { uploadAbortRef.current.abort(); uploadAbortRef.current = null; }
    setImportBcId('');
    setImportProjectId('');
    setImportReceptionDate(today());
    setImportNotes('');
    setImportError('');
    setImportFile(null);
    setImportFileUrl('');
    setUploadingFile(false);
    setShowImportModal(true);
  };

  // Quand un BC est sélectionné, pré-remplir le projet lié
  const handleImportBcChange = (bcId: string) => {
    setImportBcId(bcId);
    if (bcId) {
      const bc = bcs.find(b => b.id === bcId);
      if (bc?.project_id) setImportProjectId(bc.project_id);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (uploadAbortRef.current) uploadAbortRef.current.abort();
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    setImportFile(file);
    setImportFileUrl('');
    setUploadingFile(true);
    setImportError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/upload', fd, { signal: controller.signal });
      if (!controller.signal.aborted) setImportFileUrl(res.data.url || '');
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'AbortError') return;
      const msg = err?.response?.data?.message || err?.message || 'Erreur upload';
      setImportError(Array.isArray(msg) ? msg.join(', ') : String(msg));
    } finally {
      if (!controller.signal.aborted) setUploadingFile(false);
    }
  };

  const handleImport = async () => {
    if (!importBcId) { setImportError('Sélectionnez le BC lié'); return; }
    if (!importFileUrl) { setImportError('Veuillez téléverser le fichier du BR (PDF ou image)'); return; }

    setImporting(true); setImportError('');
    try {
      await brApi.import({
        bc_id:              importBcId,
        project_id:         importProjectId || undefined,
        imported_file_url:  importFileUrl,
        reception_date:     importReceptionDate || undefined,
        notes:              importNotes.trim() || undefined,
      });
      fetchData(); setShowImportModal(false);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setImportError(Array.isArray(msg) ? msg.join(', ') : (msg || "Erreur lors de l'import"));
    } finally { setImporting(false); }
  };

  // ── Vue détail ───────────────────────────────────────────────────────────
  const openView = async (br: any) => {
    const requestId = ++viewRequestRef.current;
    setViewLoading(true);
    setViewTarget(br);
    try {
      const res = await brApi.get(br.id);
      if (requestId === viewRequestRef.current) setViewTarget(res.data);
    } catch { /* keep list data */ }
    finally { if (requestId === viewRequestRef.current) setViewLoading(false); }
  };

  const closeView = () => { viewRequestRef.current++; setViewTarget(null); setViewLoading(false); };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try { await brApi.cancel(cancelTarget.id); fetchData(); setCancelTarget(null); }
    catch (e: any) { alert(e?.response?.data?.message || 'Erreur'); }
    finally { setCancelling(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try { await brApi.delete(deleteTarget.id); fetchData(); setDeleteTarget(null); }
    catch (e: any) { alert(e?.response?.data?.message || 'Erreur'); }
    finally { setDeleting(false); }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-[22px] font-bold text-honey-dark font-display tracking-tight">Bons de réception</h1>
          <p className="text-sm text-honey-caramel mt-0.5">BR importés — liés à un BC déjà présent dans la plateforme</p>
        </div>
        <div className="flex gap-2">
          <button onClick={openImportModal} className="btn-primary text-sm flex items-center gap-1.5">
            <Upload size={13} /> Importer un BR
          </button>
        </div>
      </div>

      {fetchError && (
        <div style={{ background:'#FEF2F2', border:'1.5px solid #FECACA', color:'#B91C1C', borderRadius:10, padding:'10px 16px', fontSize:13, fontWeight:600, marginBottom:14, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <span>⚠️ {fetchError}</span>
          <button onClick={fetchData} style={{ background:'none', border:'none', color:'#B91C1C', fontWeight:700, textDecoration:'underline', cursor:'pointer', fontSize:12 }}>
            Réessayer
          </button>
        </div>
      )}

      <div className="card">
        <div className="flex gap-3 mb-4 flex-wrap">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-honey-caramel" />
            <input type="text" placeholder="Rechercher un BR..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="input pl-9 max-w-xs" />
          </div>
          {(['', 'ACTIF', 'ANNULE'] as const).map((s) => (
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
              {['Numéro','BC lié','Client','Chantier','Date réception','Statut','Actions'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-honey-caramel border-b border-honey-beige-soft">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-12 text-center text-honey-caramel">Chargement...</td></tr>
            ) : brs.length === 0 ? (
              <tr><td colSpan={7} className="py-12 text-center text-honey-caramel">Aucun BR trouvé</td></tr>
            ) : brs.map((br) => (
              <tr key={br.id} className="border-b border-honey-beige-soft hover:bg-honey-cream/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-mono font-semibold text-honey-dark">{br.number}</div>
                </td>
                <td className="px-4 py-3 font-mono text-[11px] text-honey-caramel">{br.bc?.number || '—'}</td>
                <td className="px-4 py-3 text-honey-dark">{br.client?.commercial_name}</td>
                <td className="px-4 py-3 text-honey-dark">{br.project?.name || '—'}</td>
                <td className="px-4 py-3 text-xs text-honey-caramel">{formatDate(br.reception_date)}</td>
                <td className="px-4 py-3">
                  <span className={cn('badge border text-[10px]', statusCls[br.status])}>
                    {statusLabel[br.status]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => openView(br)} title="Voir les détails"
                      className="w-7 h-7 rounded-md border border-honey-beige-soft flex items-center justify-center text-honey-caramel hover:text-honey-dark hover:border-honey-gold hover:bg-honey-cream transition-all">
                      <Eye size={12} />
                    </button>
                    {br.imported_file_url && (
                      <button onClick={() => setPreviewFileUrl(br.imported_file_url)} title="Voir le fichier importé"
                        style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:6, border:'1.5px solid #BFDBFE', background:'#EFF6FF', color:'#1D4ED8', fontSize:10, fontWeight:700, cursor:'pointer' }}>
                        <File size={10} /> Fichier
                      </button>
                    )}
                    <PDFButton docType="br" docId={br.id} docNumber={br.number} variant="inline" />
                    {canDel && (
                      <button onClick={() => openEdit(br)} title="Modifier"
                        className="w-7 h-7 rounded-md border border-honey-beige-soft flex items-center justify-center text-honey-caramel hover:text-honey-dark hover:border-honey-gold hover:bg-honey-cream transition-all text-[11px] font-bold">
                        ✏️
                      </button>
                    )}
                    {canDel && br.status !== 'ANNULE' && (
                      <button onClick={() => setCancelTarget(br)} title="Annuler"
                        className="px-2 py-1 rounded text-[10px] font-semibold border border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100 transition-all">
                        Annuler
                      </button>
                    )}
                    {canDel && (
                      <button onClick={() => setDeleteTarget(br)} title="Supprimer"
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

      {/* ════════════════════════════════════════════════════════════════════
          MODAL : Importer BR
      ════════════════════════════════════════════════════════════════════ */}
      {showImportModal && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setShowImportModal(false)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.5)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:600, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', padding:28, maxHeight:'92vh', overflowY:'auto' }}>

            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <div>
                <h3 style={{ margin:0, fontSize:16, fontWeight:700, color:'#1A141A' }}>📥 Importer un bon de réception</h3>
                <p style={{ margin:'4px 0 0', fontSize:12, color:'#A33C00' }}>Téléversez le BR signé/scanné et liez-le au BC correspondant</p>
              </div>
              <button onClick={() => setShowImportModal(false)}
                style={{ width:32, height:32, borderRadius:8, border:'1.5px solid #EDDEC1', background:'white', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#A33C00' }}>
                <X size={15} />
              </button>
            </div>

            {/* ── Lier au BC (obligatoire) ──────────────────────────────── */}
            <div style={{ marginBottom:18, padding:'14px 16px', background:'#EFF6FF', borderRadius:10, border:'1px solid #BFDBFE' }}>
              <label style={{ ...labelStyle, color:'#1D4ED8', marginBottom:8 }}>
                <Link2 size={11} style={{ display:'inline', marginRight:4 }} />
                BC lié *
              </label>
              <select value={importBcId} onChange={e => handleImportBcChange(e.target.value)}
                style={{ ...inputStyle, border:'1.5px solid #BFDBFE', background:'white' }}>
                <option value="">Choisir un BC déjà importé...</option>
                {bcs.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.number} — {b.client?.commercial_name || '...'}
                  </option>
                ))}
              </select>
              {importBcId && (
                <p style={{ fontSize:11, color:'#2563EB', marginTop:6 }}>
                  ✓ Le client et le chantier seront repris du BC sélectionné
                </p>
              )}
            </div>

            {/* Chantier / projet */}
            <div style={{ marginBottom:18 }}>
              <label style={labelStyle}>Chantier / projet lié *</label>
              <select value={importProjectId} onChange={e => setImportProjectId(e.target.value)} style={inputStyle}>
                <option value="">Choisir un chantier...</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Date de réception */}
            <div style={{ marginBottom:18 }}>
              <label style={labelStyle}>Date de réception *</label>
              <input type="date" value={importReceptionDate} onChange={e => setImportReceptionDate(e.target.value)} style={inputStyle} />
            </div>

            {/* Fichier */}
            <div style={{ marginBottom:18 }}>
              <label style={labelStyle}>Fichier PDF ou Image *</label>
              <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
                onChange={handleFileSelect} style={{ display:'none' }} />
              {!importFile ? (
                <div onClick={() => fileInputRef.current?.click()}
                  style={{ border:'2px dashed #EDDEC1', borderRadius:10, padding:'28px 20px', textAlign:'center', cursor:'pointer', background:'#FBF6EE' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor='#EBB800')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor='#EDDEC1')}>
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
                      {uploadingFile ? '⏳ Téléversement...' : importFileUrl ? '✅ Fichier prêt' : '❌ Erreur upload'}
                    </p>
                  </div>
                  <button type="button" onClick={() => {
                    if (uploadAbortRef.current) { uploadAbortRef.current.abort(); uploadAbortRef.current = null; }
                    setImportFile(null); setImportFileUrl(''); setUploadingFile(false);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }} style={{ width:28, height:28, borderRadius:6, border:'1px solid #FECACA', background:'#FFF5F5', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#EF4444', flexShrink:0 }}>
                    <X size={13} />
                  </button>
                </div>
              )}

              {/* Aperçu + téléchargement si fichier prêt */}
              {importFileUrl && (
                <div style={{ marginTop:10, display:'flex', gap:8 }}>
                  <button type="button" onClick={() => setPreviewFileUrl(importFileUrl)}
                    style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8, border:'1.5px solid #3B82F6', background:'white', color:'#1D4ED8', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                    <Eye size={13} /> Aperçu
                  </button>
                  <a href={importFileUrl.includes('/upload/') ? importFileUrl.replace('/upload/', '/upload/fl_attachment/') : importFileUrl}
                    target="_blank" rel="noreferrer"
                    style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#3B82F6,#1D4ED8)', color:'white', fontSize:12, fontWeight:700, textDecoration:'none' }}>
                    <Download size={13} /> Télécharger
                  </a>
                </div>
              )}
            </div>

            {/* Notes */}
            <div style={{ marginBottom:18 }}>
              <label style={labelStyle}>Notes<span style={{ marginLeft:6, fontSize:10, fontWeight:500, color:'#8E5915', textTransform:'none', letterSpacing:0 }}>(optionnel)</span></label>
              <textarea value={importNotes} onChange={e => setImportNotes(e.target.value)} rows={3}
                style={{ ...inputStyle, resize:'vertical' as const }} placeholder="Remarques éventuelles..." />
            </div>

            {importError && (
              <div style={{ background:'#FFF0F0', border:'1px solid #FFCDD2', borderRadius:8, padding:'8px 12px', marginBottom:16, fontSize:12, color:'#D32F2F' }}>
                ⚠️ {importError}
              </div>
            )}

            <div style={{ display:'flex', gap:10, paddingTop:4 }}>
              <button onClick={() => setShowImportModal(false)} style={{ ...btnSecondary, flex:1 }}>Annuler</button>
              <button onClick={handleImport} disabled={importing || uploadingFile}
                style={{ ...btnPrimary, flex:2, opacity:(importing || uploadingFile) ? 0.6 : 1, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                {uploadingFile ? '⏳ Upload en cours...' : importing ? '⏳ Import...' : '📥 Importer le BR'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          MODAL : Voir détail BR
      ════════════════════════════════════════════════════════════════════ */}
      {viewTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={closeView} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.5)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:600, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', maxHeight:'92vh', overflowY:'auto' }}>
            {/* Header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'20px 24px', borderBottom:'1px solid #EDDEC1', background:'#FBF6EE', borderRadius:'16px 16px 0 0' }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontSize:18 }}>📥</span>
                  <h3 style={{ margin:0, fontSize:16, fontWeight:700, color:'#1A141A' }}>{viewTarget.number}</h3>
                  <span style={{ padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700,
                    background: viewTarget.status==='ACTIF' ? '#DCFCE7' : '#F3F4F6',
                    color: viewTarget.status==='ACTIF' ? '#15803D' : '#6B7280' }}>
                    {statusLabel[viewTarget.status] || viewTarget.status}
                  </span>
                </div>
                <p style={{ margin:'4px 0 0', fontSize:12, color:'#A33C00' }}>Reçu le {formatDate(viewTarget.reception_date)}</p>
              </div>
              <button onClick={closeView} style={{ width:32, height:32, borderRadius:8, border:'1.5px solid #EDDEC1', background:'white', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'#A33C00' }}>
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
                      <p style={{ margin:'0 0 4px', fontSize:10, fontWeight:700, color:'#A33C00', textTransform:'uppercase' }}>Client</p>
                      <p style={{ margin:0, fontSize:14, fontWeight:600, color:'#1A141A' }}>{viewTarget.client?.commercial_name || '—'}</p>
                      {viewTarget.client?.ice && <p style={{ margin:'2px 0 0', fontSize:11, color:'#A33C00' }}>ICE: {viewTarget.client.ice}</p>}
                    </div>
                    <div style={{ background:'#FBF6EE', borderRadius:10, padding:'12px 16px' }}>
                      <p style={{ margin:'0 0 4px', fontSize:10, fontWeight:700, color:'#A33C00', textTransform:'uppercase' }}>BC lié</p>
                      <p style={{ margin:0, fontSize:14, fontWeight:600, color:'#1A141A' }}>{viewTarget.bc?.number || '—'}</p>
                    </div>
                  </div>

                  {viewTarget.project?.name && (
                    <div style={{ marginBottom:20, background:'#FFF8EE', border:'1px solid #EDDEC1', borderRadius:10, padding:'12px 16px' }}>
                      <p style={{ margin:'0 0 4px', fontSize:10, fontWeight:700, color:'#A33C00', textTransform:'uppercase' }}>Chantier / projet</p>
                      <p style={{ margin:0, fontSize:14, fontWeight:600, color:'#1A141A' }}>{viewTarget.project.name}</p>
                    </div>
                  )}

                  {/* Fichier importé */}
                  {viewTarget.imported_file_url && (
                    <div style={{ marginBottom:20, padding:'14px 16px', background:'#EFF6FF', borderRadius:10, border:'1px solid #BFDBFE', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <span style={{ fontSize:22 }}>📄</span>
                        <div>
                          <p style={{ margin:0, fontSize:13, fontWeight:600, color:'#1E40AF' }}>Fichier BR importé</p>
                        </div>
                      </div>
                      <div style={{ display:'flex', gap:8 }}>
                        <button onClick={() => setPreviewFileUrl(viewTarget.imported_file_url)}
                          style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:8, border:'1.5px solid #3B82F6', background:'white', color:'#1D4ED8', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                          <Eye size={13} /> Aperçu
                        </button>
                        <a href={viewTarget.imported_file_url.includes('/upload/') ? viewTarget.imported_file_url.replace('/upload/', '/upload/fl_attachment/') : viewTarget.imported_file_url}
                          target="_blank" rel="noreferrer"
                          style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#3B82F6,#1D4ED8)', color:'white', fontSize:12, fontWeight:700, textDecoration:'none' }}>
                          <Download size={13} /> Télécharger
                        </a>
                      </div>
                    </div>
                  )}

                  {viewTarget.notes && (
                    <div style={{ marginTop:16, padding:'12px 16px', background:'#FFFBEB', borderRadius:10, border:'1px solid #FDE68A' }}>
                      <p style={{ margin:'0 0 4px', fontSize:10, fontWeight:700, color:'#92400E', textTransform:'uppercase' }}>Notes</p>
                      <p style={{ margin:0, fontSize:13, color:'#1A141A' }}>{viewTarget.notes}</p>
                    </div>
                  )}
                </>
              )}
            </div>

            <div style={{ padding:'16px 24px', borderTop:'1px solid #EDDEC1', display:'flex', justifyContent:'flex-end' }}>
              <button onClick={closeView} style={{ ...btnSecondary }}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          POPUP : Edit
      ════════════════════════════════════════════════════════════════════ */}
      {editTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setEditTarget(null)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.6)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:14, width:380, padding:28, boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin:'0 0 20px', fontSize:15, fontWeight:700, color:'#1A141A' }}>✏️ Modifier {editTarget.number}</h3>
            <form onSubmit={handleEditSave}>
              <div style={{ marginBottom:14 }}>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#8E5915', textTransform:'uppercase', letterSpacing:0.5, marginBottom:6 }}>Numéro</label>
                <input value={editNumber} onChange={e => setEditNumber(e.target.value)}
                  style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E8D4B0', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'monospace' }} />
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#8E5915', textTransform:'uppercase', letterSpacing:0.5, marginBottom:6 }}>Date de réception</label>
                <input type="date" value={editReceptionDate} onChange={e => setEditReceptionDate(e.target.value)}
                  style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E8D4B0', fontSize:13, outline:'none', boxSizing:'border-box' }} />
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#8E5915', textTransform:'uppercase', letterSpacing:0.5, marginBottom:6 }}>Chantier / projet</label>
                <select value={editProjectId} onChange={e => setEditProjectId(e.target.value)}
                  style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E8D4B0', fontSize:13, outline:'none', boxSizing:'border-box', background:'white' }}>
                  <option value="">— Aucun —</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#8E5915', textTransform:'uppercase', letterSpacing:0.5, marginBottom:6 }}>Notes</label>
                <textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={3}
                  style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E8D4B0', fontSize:13, outline:'none', boxSizing:'border-box', resize:'vertical' as const }} />
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button type="button" onClick={() => setEditTarget(null)} style={{ flex:1, padding:'9px', borderRadius:8, border:'1.5px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:13, fontWeight:600, cursor:'pointer' }}>Annuler</button>
                <button type="submit" disabled={editSaving} style={{ flex:2, padding:'9px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#F4B315,#E59312)', color:'white', fontSize:13, fontWeight:700, cursor:'pointer', opacity:editSaving?0.7:1 }}>
                  {editSaving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          POPUP : Annulation
      ════════════════════════════════════════════════════════════════════ */}
      {cancelTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setCancelTarget(null)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.6)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:420, margin:'0 16px', padding:28, boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin:'0 0 8px', fontSize:17, fontWeight:700, color:'#1A141A' }}>Annuler ce BR ?</h3>
            <p style={{ fontSize:13, color:'#A33C00', marginBottom:20 }}>
              Le bon de réception <strong>{cancelTarget.number}</strong> sera marqué comme annulé.
            </p>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setCancelTarget(null)} style={{ ...btnSecondary, flex:1 }}>Retour</button>
              <button onClick={handleCancel} disabled={cancelling} style={{ ...btnDanger, flex:1, opacity:cancelling?0.7:1 }}>
                {cancelling ? 'Annulation...' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          POPUP : Suppression
      ════════════════════════════════════════════════════════════════════ */}
      {deleteTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setDeleteTarget(null)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.6)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:420, margin:'0 16px', padding:28, boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin:'0 0 8px', fontSize:17, fontWeight:700, color:'#1A141A' }}>🗑 Supprimer définitivement ?</h3>
            <p style={{ fontSize:13, color:'#DC2626', marginBottom:20 }}>
              <strong>{deleteTarget.number}</strong> sera supprimé de la base de données. Action irréversible.
            </p>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setDeleteTarget(null)} style={{ ...btnSecondary, flex:1 }}>Annuler</button>
              <button onClick={handleDelete} disabled={deleting} style={{ ...btnDanger, flex:1, opacity:deleting?0.7:1 }}>
                {deleting ? 'Suppression...' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FileViewer */}
      <FileViewerModal url={previewFileUrl} title="Fichier BR" onClose={() => setPreviewFileUrl(null)} />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
