'use client';

import React, { useState, useEffect } from 'react';
import { FileText, Plus, Search, Trash2, ArrowRight, Copy, Pencil, Truck, ChevronDown, ChevronRight } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';
import { cn, formatCurrency } from '@/lib/utils';
import { devisApi, clientsApi, projectsApi, blApi, signaturesApi } from '@/lib/api';
import PDFButton from '@/components/ui/PDFButton';

const blStatusCfg: Record<string, { label: string; cls: string }> = {
  DRAFT:     { label: 'Brouillon',  cls: 'bg-gray-50 text-gray-600 border-gray-200' },
  DELIVERED: { label: 'Livré ✓',   cls: 'bg-green-50 text-green-700 border-green-200' },
  SIGNED:    { label: 'Signé',     cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  INVOICED:  { label: 'Facturé',   cls: 'bg-purple-50 text-purple-700 border-purple-200' },
};

const statusCfg: Record<string, { label: string; cls: string }> = {
  DRAFT:     { label: 'Brouillon',  cls: 'badge bg-honey-cream text-honey-caramel border border-honey-beige-soft' },
  SENT:      { label: 'Envoyé',     cls: 'badge bg-blue-50 text-blue-700 border border-blue-200' },
  VALIDATED: { label: 'Validé ✓',  cls: 'badge bg-green-50 text-green-700 border border-green-200' },
  REJECTED:  { label: 'Refusé',    cls: 'badge bg-red-50 text-red-700 border border-red-200' },
  EXPIRED:   { label: 'Expiré',    cls: 'badge bg-gray-50 text-gray-500 border border-gray-200' },
};

const inputStyle = { width:'100%', padding:'8px 12px', borderRadius:8, border:'1.5px solid #EDDEC1', fontSize:13, outline:'none', boxSizing:'border-box' as const };
const labelStyle = { display:'block' as const, fontSize:11, fontWeight:700 as const, color:'#A33C00', textTransform:'uppercase' as const, letterSpacing:0.5, marginBottom:5 };
const btnSecondary = { padding:'8px 16px', borderRadius:8, border:'1.5px solid #EDDEC1', background:'white', color:'#A33C00', fontSize:13, fontWeight:600 as const, cursor:'pointer' as const };
const btnPrimary = { padding:'8px 18px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#EBB800,#755C00)', color:'#1A141A', fontSize:13, fontWeight:700 as const, cursor:'pointer' as const };
const btnDanger = { padding:'9px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#EF4444,#DC2626)', color:'white', fontSize:13, fontWeight:700 as const, cursor:'pointer' as const };

interface Line { desc: string; qty: number; pu: number; }

function canDelete() {
  try { const u = JSON.parse(localStorage.getItem('user') || '{}'); return u.role === 'ADMIN' || u.role === 'GERANT'; } catch { return false; }
}

export default function DevisPage() {
  const [devisList, setDevisList] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null); // null = create, object = edit
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [statusTarget, setStatusTarget] = useState<any>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [creatingBL, setCreatingBL] = useState<string | null>(null);
  const [blsByDevis, setBlsByDevis] = useState<Record<string, any[]>>({});
  const [expandedDevis, setExpandedDevis] = useState<Set<string>>(new Set());
  const canDel = canDelete();

  // Form state
  const [form, setForm] = useState({ client_id: '', project_id: '', object: '', discount_rate: 0, payment_terms: '', notes: '', signature_id: '' });
  const [lines, setLines] = useState<Line[]>([{ desc: '', qty: 1, pu: 0 }]);
  const [signatures, setSignatures] = useState<any[]>([]);

  const totalHtBrut = lines.reduce((s, l) => s + l.qty * l.pu, 0);
  const discountAmt = totalHtBrut * (form.discount_rate / 100);
  const totalHtNet = totalHtBrut - discountAmt;
  const tvaAmt = totalHtNet * 0.2;
  const totalTtc = totalHtNet + tvaAmt;

  const fetchData = () => {
    setLoading(true);
    // "SENT_GROUP" = tous les devis ayant été envoyés (SENT + VALIDATED + REJECTED)
    const apiParams: any = { search };
    if (statusFilter === 'SENT_GROUP') {
      apiParams.statuses = 'SENT,VALIDATED,REJECTED';
    } else if (statusFilter) {
      apiParams.status = statusFilter;
    }
    Promise.all([
      devisApi.list(apiParams),
      devisApi.stats(),
      blApi.list({ limit: 500 }),
    ]).then(([listRes, statsRes, blRes]) => {
      setDevisList(listRes.data.data || []);
      setStats(statsRes.data);
      // Group BLs by devis_id
      const bls: any[] = blRes.data.data || [];
      const grouped: Record<string, any[]> = {};
      bls.forEach((bl: any) => {
        const did = bl.devis_id || bl.bc?.devis_id;
        if (did) {
          if (!grouped[did]) grouped[did] = [];
          grouped[did].push(bl);
        }
      });
      setBlsByDevis(grouped);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [search, statusFilter]);

  useEffect(() => {
    clientsApi.list({ limit: 200 }).then(r => setClients(r.data.data || []));
    projectsApi.list({ limit: 200 }).then(r => setProjects(r.data.data || []));
    signaturesApi.list().then(r => setSignatures(r.data || [])).catch(() => {});
  }, []);

  const addLine = () => setLines([...lines, { desc: '', qty: 1, pu: 0 }]);
  const removeLine = (i: number) => setLines(lines.filter((_, idx) => idx !== i));
  const updateLine = (i: number, field: keyof Line, value: string | number) => {
    const updated = [...lines];
    updated[i] = { ...updated[i], [field]: value };
    setLines(updated);
  };

  const openCreate = () => {
    setEditTarget(null);
    setForm({ client_id: '', project_id: '', object: '', discount_rate: 0, payment_terms: '', notes: '', signature_id: '' });
    setLines([{ desc: '', qty: 1, pu: 0 }]);
    setSaveError('');
    setShowForm(true);
  };

  const openEdit = async (d: any) => {
    // Load full devis with lines
    const res = await devisApi.get(d.id);
    const full = res.data;
    setEditTarget(full);
    setForm({
      client_id: full.client_id,
      project_id: full.project_id || '',
      object: full.object || '',
      discount_rate: Number(full.discount_rate) || 0,
      payment_terms: full.payment_terms || '',
      notes: full.notes || '',
      signature_id: full.signature_id || '',
    });
    setLines((full.lines || []).map((l: any) => ({ desc: l.description, qty: Number(l.quantity), pu: Number(l.unit_price) })));
    setSaveError('');
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.client_id) { setSaveError('Sélectionner un client'); return; }
    if (lines.every(l => !l.desc)) { setSaveError('Ajoutez au moins une ligne'); return; }
    setSaving(true); setSaveError('');
    const payload = {
      client_id: form.client_id,
      project_id: form.project_id || undefined,
      object: form.object || undefined,
      discount_rate: form.discount_rate || 0,
      payment_terms: form.payment_terms || undefined,
      notes: form.notes || undefined,
      signature_id: form.signature_id || undefined,
      lines: lines.filter(l => l.desc).map(l => ({ description: l.desc, quantity: l.qty, unit_price: l.pu })),
    };
    try {
      if (editTarget) {
        await devisApi.update(editTarget.id, payload);
      } else {
        await devisApi.create(payload);
      }
      fetchData();
      setShowForm(false);
      setEditTarget(null);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setSaveError(Array.isArray(msg) ? msg.join(', ') : (msg || 'Erreur'));
    } finally { setSaving(false); }
  };

  const handleCreateBL = async (devisId: string) => {
    setCreatingBL(devisId);
    try {
      await blApi.createFromDevis(devisId);
      fetchData();
      // Auto-expand the devis row to show new BL
      setExpandedDevis(prev => new Set(Array.from(prev).concat(devisId)));
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Erreur lors de la création du BL');
    } finally { setCreatingBL(null); }
  };

  const handleDeleteBL = async (blId: string) => {
    if (!confirm('Supprimer ce BL ?')) return;
    try {
      await blApi.delete(blId);
      fetchData();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Erreur lors de la suppression');
    }
  };

  const handleMarkDelivered = async (blId: string) => {
    try {
      await blApi.updateStatus(blId, 'DELIVERED');
      fetchData();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Erreur');
    }
  };

  const toggleExpand = (devisId: string) => {
    setExpandedDevis(prev => {
      const next = new Set(prev);
      if (next.has(devisId)) next.delete(devisId);
      else next.add(devisId);
      return next;
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await devisApi.delete(deleteTarget.id);
      fetchData(); setDeleteTarget(null);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Erreur lors de la suppression');
    } finally { setDeleting(false); }
  };

  const handleStatusChange = async (devis: any, newStatus: string) => {
    setUpdatingStatus(true);
    try {
      await devisApi.updateStatus(devis.id, newStatus);
      fetchData(); setStatusTarget(null);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Erreur');
    } finally { setUpdatingStatus(false); }
  };

  const handleDuplicate = async (id: string) => {
    try {
      await devisApi.duplicate(id);
      fetchData();
    } catch (e: any) { alert(e?.response?.data?.message || 'Erreur'); }
  };

  const nextStatuses: Record<string, string[]> = {
    DRAFT: ['SENT'],
    SENT: ['VALIDATED', 'REJECTED'],
    VALIDATED: [],
    REJECTED: [],
    EXPIRED: [],
  };

  return (
    <div>
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-[22px] font-bold text-honey-dark font-display tracking-tight">Devis</h1>
          <p className="text-sm text-honey-caramel mt-0.5">Créez et gérez vos offres commerciales</p>
        </div>
        <button onClick={openCreate} className="btn-primary text-sm"><Plus size={14} /> Nouveau devis</button>
      </div>

      {/* KPI cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Total', val: stats.total, color: 'border-l-honey-gold' },
            { label: 'Validés', val: stats.validated, color: 'border-l-status-success' },
            { label: 'En attente', val: stats.pending, color: 'border-l-status-info' },
            { label: 'Taux conv.', val: `${stats.conversion_rate}%`, color: 'border-l-honey-orange' },
          ].map((k) => (
            <div key={k.label} className={cn('card border-l-[3px]', k.color)}>
              <p className="text-[10px] font-medium text-honey-caramel uppercase tracking-wide mb-1">{k.label}</p>
              <p className="text-xl font-bold text-honey-dark font-mono">{k.val}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="card mb-4 flex gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-honey-caramel" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="N° devis, client..." className="input pl-9 text-sm" />
        </div>
        {([
          { value: '', label: 'Tous' },
          { value: 'DRAFT', label: 'Brouillon' },
          { value: 'SENT_GROUP', label: 'Envoyé' },
          { value: 'VALIDATED', label: 'Validé ✓' },
          { value: 'REJECTED', label: 'Refusé' },
        ]).map((tab) => (
          <button key={tab.value} onClick={() => setStatusFilter(tab.value)}
            className={cn('px-3 py-2 rounded-lg text-xs font-semibold border transition-all',
              statusFilter === tab.value ? 'bg-honey-dark text-white border-honey-dark' : 'bg-white text-honey-caramel border-honey-beige-soft hover:border-honey-gold'
            )}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-honey-beige-soft">
              {['N° Devis', 'Client', 'Objet', 'Montant TTC', 'Date', 'Statut', 'Actions'].map((h) => (
                <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-honey-caramel bg-honey-cream">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="py-12 text-center text-honey-caramel">Chargement...</td></tr>
            ) : devisList.length === 0 ? (
              <tr><td colSpan={7} className="py-12 text-center text-honey-caramel">Aucun devis trouvé</td></tr>
            ) : devisList.map((d) => {
              const linkedBLs = blsByDevis[d.id] || [];
              const isExpanded = expandedDevis.has(d.id);
              return (
                <React.Fragment key={d.id}>
                  <tr className="border-b border-honey-beige-soft hover:bg-honey-cream/50 transition-colors">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        {linkedBLs.length > 0 && (
                          <button onClick={() => toggleExpand(d.id)}
                            className="w-5 h-5 flex items-center justify-center text-honey-caramel hover:text-honey-dark transition-colors flex-shrink-0">
                            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          </button>
                        )}
                        <span className="font-mono text-xs font-semibold text-honey-dark">{d.number}</span>
                        {linkedBLs.length > 0 && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 text-[9px] font-bold">
                            <Truck size={8} /> {linkedBLs.length}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-sm text-honey-dark">{d.client?.commercial_name}</td>
                    <td className="px-3 py-3 text-sm text-honey-caramel max-w-[180px] truncate">{d.object || '—'}</td>
                    <td className="px-3 py-3 font-mono text-sm font-bold text-honey-dark">{formatCurrency(Number(d.total_ttc))} MAD</td>
                    <td className="px-3 py-3 text-xs text-honey-caramel">{new Date(d.created_at).toLocaleDateString('fr-FR')}</td>
                    <td className="px-3 py-3"><span className={statusCfg[d.status]?.cls}>{statusCfg[d.status]?.label}</span></td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Status change buttons */}
                        {canDel && nextStatuses[d.status]?.map((ns) => (
                          <button key={ns} onClick={() => handleStatusChange(d, ns)} disabled={updatingStatus}
                            className={cn('px-2 py-1 rounded text-[10px] font-semibold border transition-all',
                              ns === 'VALIDATED' ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' :
                              ns === 'REJECTED' ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' :
                              'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                            )}>
                            {ns === 'SENT' ? '📤 Envoyer' : ns === 'VALIDATED' ? '✓ Valider' : '✗ Refuser'}
                          </button>
                        ))}
                        {/* Edit (DRAFT only) */}
                        {canDel && d.status === 'DRAFT' && (
                          <button onClick={() => openEdit(d)} title="Modifier"
                            className="w-6 h-6 rounded border border-honey-beige-soft flex items-center justify-center text-honey-caramel hover:text-honey-dark hover:border-honey-gold hover:bg-honey-cream transition-all">
                            <Pencil size={11} />
                          </button>
                        )}
                        {/* Create BL from validated devis */}
                        {d.status === 'VALIDATED' && (
                          <button
                            onClick={() => handleCreateBL(d.id)}
                            disabled={creatingBL === d.id}
                            className="px-2 py-1 bg-honey-gold/10 text-honey-dark border border-honey-gold/30 rounded text-[10px] font-semibold hover:bg-honey-gold/20 transition-all flex items-center gap-1 disabled:opacity-50">
                            <Truck size={10} /> {creatingBL === d.id ? '...' : '+ BL'}
                          </button>
                        )}
                        {/* Duplicate */}
                        <button onClick={() => handleDuplicate(d.id)} title="Dupliquer"
                          className="w-6 h-6 rounded border border-honey-beige-soft flex items-center justify-center text-honey-caramel hover:text-honey-dark hover:border-honey-gold hover:bg-honey-cream transition-all">
                          <Copy size={11} />
                        </button>
                        {/* PDF */}
                        <PDFButton docType="devis" docId={d.id} docNumber={d.number} variant="inline" />
                        {/* Delete (DRAFT only) */}
                        {canDel && d.status === 'DRAFT' && (
                          <button onClick={() => setDeleteTarget(d)} title="Supprimer"
                            className="w-6 h-6 rounded border border-red-200 flex items-center justify-center text-red-400 hover:text-red-600 hover:border-red-400 hover:bg-red-50 transition-all">
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {/* BL sub-rows */}
                  {isExpanded && linkedBLs.map((bl: any) => (
                    <tr key={bl.id} className="bg-blue-50/40 border-b border-blue-100">
                      <td className="pl-10 pr-3 py-2" colSpan={1}>
                        <div className="flex items-center gap-1.5">
                          <Truck size={11} className="text-blue-500 flex-shrink-0" />
                          <span className="font-mono text-[11px] font-semibold text-blue-700">{bl.number}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-[11px] text-blue-600">{bl.client?.commercial_name || '—'}</td>
                      <td className="px-3 py-2 text-[11px] text-blue-500">{new Date(bl.created_at).toLocaleDateString('fr-FR')}</td>
                      <td className="px-3 py-2" colSpan={2}></td>
                      <td className="px-3 py-2">
                        <span className={cn('badge border text-[9px]', blStatusCfg[bl.status]?.cls || 'bg-gray-50 text-gray-600 border-gray-200')}>
                          {blStatusCfg[bl.status]?.label || bl.status}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {/* Voir + Télécharger PDF */}
                          <PDFButton docType="bl" docId={bl.id} docNumber={bl.number} variant="inline" />
                          {/* Livré */}
                          {bl.status !== 'DELIVERED' && bl.status !== 'INVOICED' && (
                            <button onClick={() => handleMarkDelivered(bl.id)}
                              className="px-2 py-1 rounded text-[10px] font-semibold bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-all flex items-center gap-1">
                              ✓ Livré
                            </button>
                          )}
                          {/* Supprimer */}
                          {canDel && bl.status !== 'INVOICED' && (
                            <button onClick={() => handleDeleteBL(bl.id)}
                              className="w-6 h-6 rounded border border-red-200 flex items-center justify-center text-red-400 hover:text-red-600 hover:border-red-400 hover:bg-red-50 transition-all">
                              <Trash2 size={10} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* MODAL Nouveau devis */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 pb-6 overflow-y-auto">
          <div className="absolute inset-0 bg-honey-dark/50 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative z-10 bg-white rounded-xl shadow-2xl w-full max-w-3xl mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-honey-beige-soft bg-honey-cream rounded-t-xl">
              <h2 className="text-base font-bold text-honey-dark flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-honey-gradient flex items-center justify-center"><FileText size={14} className="text-honey-dark" /></span>
                {editTarget ? `✏️ Modifier ${editTarget.number}` : 'Nouveau devis'}
              </h2>
              <button onClick={() => { setShowForm(false); setEditTarget(null); }} className="text-2xl text-honey-caramel hover:text-honey-dark">×</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="p-6 space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label style={labelStyle}>Client *</label>
                    <select required value={form.client_id} onChange={e => setForm({...form, client_id:e.target.value})} style={inputStyle}>
                      <option value="">Sélectionner...</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.commercial_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Chantier</label>
                    <select value={form.project_id} onChange={e => setForm({...form, project_id:e.target.value})} style={inputStyle}>
                      <option value="">— Aucun —</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label style={labelStyle}>Objet</label>
                    <input value={form.object} onChange={e => setForm({...form, object:e.target.value})} placeholder="Objet du devis..." style={inputStyle} />
                  </div>
                  <div className="col-span-2">
                    <label style={labelStyle}>Conditions de paiement</label>
                    <textarea value={form.payment_terms} onChange={e => setForm({...form, payment_terms:e.target.value})}
                      placeholder="Ex : 30% à la commande, 70% à la livraison..." rows={2}
                      style={{ ...inputStyle, resize:'none' as const }} />
                  </div>
                </div>

                {/* Lignes */}
                <div className="border border-honey-beige-soft rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-honey-cream">
                        <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase text-honey-caramel">Description</th>
                        <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase text-honey-caramel w-20">Qté</th>
                        <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase text-honey-caramel w-28">PU HT</th>
                        <th className="text-right px-3 py-2 text-[10px] font-semibold uppercase text-honey-caramel w-28">Total HT</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, i) => (
                        <tr key={i} className="border-t border-honey-beige-soft">
                          <td className="px-2 py-1.5">
                            <input value={line.desc} onChange={(e) => updateLine(i, 'desc', e.target.value)}
                              className="w-full px-2 py-1.5 text-sm outline-none border border-transparent rounded focus:border-honey-gold" placeholder="Description..." />
                          </td>
                          <td className="px-2 py-1.5">
                              <input type="number" value={line.qty} onChange={(e) => updateLine(i, 'qty', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1.5 text-sm text-right font-mono outline-none border border-transparent rounded focus:border-honey-gold" />
                          </td>
                          <td className="px-2 py-1.5">
                            <input type="number" value={line.pu} onChange={(e) => updateLine(i, 'pu', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1.5 text-sm text-right font-mono outline-none border border-transparent rounded focus:border-honey-gold" />
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono text-sm font-semibold text-honey-dark">{formatCurrency(line.qty * line.pu)}</td>
                          <td className="px-1 py-1.5 text-center">
                            {lines.length > 1 && <button type="button" onClick={() => removeLine(i)} className="text-red-400 hover:text-red-600"><Trash2 size={12} /></button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-3 py-2 border-t border-honey-beige-soft bg-honey-cream">
                    <button type="button" onClick={addLine} className="text-xs text-honey-orange font-semibold flex items-center gap-1"><Plus size={12} /> Ajouter ligne</button>
                  </div>
                </div>

                <div className="flex justify-between items-start gap-4">
                  <div>
                    <label style={labelStyle}>Réduction (%)</label>
                    <input type="number" value={form.discount_rate} onChange={e => setForm({...form, discount_rate:parseFloat(e.target.value)||0})}
                      className="input text-sm font-mono w-28" />
                  </div>
                  <div className="bg-honey-cream border border-honey-beige-soft rounded-lg p-3 min-w-[220px]">
                    <div className="flex justify-between text-xs py-1"><span className="text-honey-caramel">HT brut</span><span className="font-mono font-semibold">{formatCurrency(totalHtBrut)}</span></div>
                    {form.discount_rate > 0 && <div className="flex justify-between text-xs py-1"><span className="text-red-500">Réduction</span><span className="font-mono text-red-500">−{formatCurrency(discountAmt)}</span></div>}
                    <div className="flex justify-between text-xs py-1"><span className="text-honey-caramel">TVA 20%</span><span className="font-mono font-semibold">{formatCurrency(tvaAmt)}</span></div>
                    <div className="flex justify-between text-sm py-2 px-3 bg-honey-gradient rounded-md mt-1">
                      <span className="font-bold text-honey-dark">TTC</span>
                      <span className="font-bold text-honey-dark font-mono">{formatCurrency(totalTtc)} MAD</span>
                    </div>
                  </div>
                </div>

                {/* Signature / Cachet */}
                {signatures.length > 0 && (
                  <div>
                    <label style={labelStyle}>Signature / Cachet</label>
                    <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                      <div
                        onClick={() => setForm({...form, signature_id:''})}
                        style={{ border:`2px solid ${!form.signature_id ? '#E59312' : '#E8D4B0'}`, borderRadius:8, padding:'6px 14px', cursor:'pointer', fontSize:12, color: !form.signature_id ? '#A33C00' : '#8E5915', background: !form.signature_id ? '#FFF8EE' : 'white', fontWeight:600 }}>
                        Aucune
                      </div>
                      {signatures.map((sig: any) => (
                        <div key={sig.id}
                          onClick={() => setForm({...form, signature_id: sig.id})}
                          style={{ border:`2px solid ${form.signature_id === sig.id ? '#E59312' : '#E8D4B0'}`, borderRadius:8, padding:6, cursor:'pointer', background: form.signature_id === sig.id ? '#FFF8EE' : 'white', display:'flex', flexDirection:'column', alignItems:'center', gap:4, minWidth:90 }}>
                          <img src={sig.image_url} alt={sig.name} style={{ height:40, maxWidth:120, objectFit:'contain' }} />
                          <span style={{ fontSize:10, fontWeight:600, color: form.signature_id === sig.id ? '#A33C00' : '#8E5915' }}>{sig.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {saveError && (
                  <div style={{ background:'#FFF0F0', border:'1px solid #FFCDD2', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#D32F2F' }}>⚠️ {saveError}</div>
                )}
              </div>
              <div className="flex justify-between items-center px-6 py-4 border-t border-honey-beige-soft bg-honey-cream rounded-b-xl">
                <p className="text-xs text-honey-caramel">TTC : <strong className="text-honey-dark font-mono">{formatCurrency(totalTtc)} MAD</strong></p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setShowForm(false); setEditTarget(null); }} style={btnSecondary}>Annuler</button>
                  <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity:saving?0.7:1 }}>
                    {saving ? (editTarget ? 'Sauvegarde...' : 'Création...') : (editTarget ? '✓ Enregistrer' : 'Créer le devis')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POPUP Confirmation suppression */}
      {deleteTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setDeleteTarget(null)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.6)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:420, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.3)', padding:28 }}>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ width:56, height:56, borderRadius:'50%', background:'#FFF0F0', border:'2px solid #FECACA', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, margin:'0 auto 14px' }}>🗑️</div>
              <h3 style={{ margin:'0 0 8px', fontSize:17, fontWeight:700, color:'#1A141A' }}>Supprimer ce devis ?</h3>
              <p style={{ margin:0, fontSize:13, color:'#A33C00' }}>
                <strong>{deleteTarget.number}</strong> sera définitivement supprimé.
              </p>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setDeleteTarget(null)} style={{ ...btnSecondary, flex:1 }}>Annuler</button>
              <button onClick={handleDelete} disabled={deleting} style={{ ...btnDanger, flex:1, opacity:deleting?0.7:1 }}>
                {deleting ? 'Suppression...' : '🗑️ Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
