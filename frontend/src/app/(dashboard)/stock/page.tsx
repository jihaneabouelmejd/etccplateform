'use client';

import { useState, useEffect } from 'react';
import { Plus, Search, AlertTriangle, ArrowDown, ArrowUp, Pencil, Trash2 } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/lib/i18n';

const stockStatus = (qty: number, min: number) =>
  qty <= 0 ? { label: '✕ Rupture', cls: 'badge-danger' } :
  qty < min ? { label: '⚠ Bas', cls: 'badge-warning' } :
  { label: '✓ OK', cls: 'badge-success' };

const inputStyle = { width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E8D4B0', fontSize:13, outline:'none', boxSizing:'border-box' as const };
const labelStyle = { display:'block' as const, fontSize:11, fontWeight:700 as const, color:'#8E5915', textTransform:'uppercase' as const, letterSpacing:0.5, marginBottom:6 };
const btnSecondary = { padding:'9px 18px', borderRadius:8, border:'1.5px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:13, fontWeight:600 as const, cursor:'pointer' as const };
const btnPrimary = { padding:'9px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#F4B315,#E59312)', color:'#1A141A', fontSize:13, fontWeight:700 as const, cursor:'pointer' as const };
const btnDanger = { padding:'9px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#EF4444,#DC2626)', color:'white', fontSize:13, fontWeight:700 as const, cursor:'pointer' as const };

const emptyForm = { name: '', sku: '', category: '', unit: 'unité', quantity: '0', min_threshold: '0', unit_price: '0' };

export default function StockPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('produits');
  const [products, setProducts] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [rejectTarget, setRejectTarget] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const canMng = user?.role === 'ADMIN' || user?.role === 'GERANT';

  const fetchData = () => {
    api.get('/stock/products/stats').then((r) => setStats(r.data)).catch(() => {});
    api.get('/stock/products', { params: { search } }).then((r) => setProducts(r.data.data || [])).catch(() => {});
    api.get('/stock/movements').then((r) => setMovements(r.data.data || [])).catch(() => {});
    api.get('/stock/requests').then((r) => setRequests(r.data || [])).catch(() => {});
  };

  useEffect(() => { fetchData(); }, [search]);

  const openCreate = () => { setForm(emptyForm); setFormError(''); setEditTarget(null); setShowForm(true); };
  const openEdit = (p: any) => {
    setForm({ name: p.name || '', sku: p.sku || '', category: p.category || '', unit: p.unit || 'unité', quantity: String(p.quantity || 0), min_threshold: String(p.min_threshold || 0), unit_price: String(p.unit_price || 0) });
    setFormError(''); setEditTarget(p); setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setFormError('');
    const payload = {
      name: form.name, sku: form.sku || undefined, category: form.category || undefined,
      unit: form.unit, quantity: parseFloat(form.quantity) || 0,
      min_threshold: parseFloat(form.min_threshold) || 0,
      unit_price: parseFloat(form.unit_price) || 0,
    };
    try {
      if (editTarget) {
        await api.patch(`/stock/products/${editTarget.id}`, payload);
      } else {
        await api.post('/stock/products', payload);
      }
      fetchData(); setShowForm(false);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setFormError(Array.isArray(msg) ? msg.join(', ') : (msg || 'Erreur'));
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/stock/products/${deleteTarget.id}`);
      fetchData(); setDeleteTarget(null);
    } catch (e: any) { alert(e?.response?.data?.message || 'Erreur'); }
    finally { setDeleting(false); }
  };

  const approve = async (id: string) => {
    try { await api.patch(`/stock/requests/${id}/approve`); fetchData(); } catch {}
  };
  const rejectConfirm = async () => {
    if (!rejectTarget) return;
    try {
      await api.patch(`/stock/requests/${rejectTarget.id}/reject`, { reason: rejectReason || undefined });
      fetchData(); setRejectTarget(null); setRejectReason('');
    } catch {}
  };

  const tabs = [
    { id: 'produits', label: 'Produits', count: stats?.total_products },
    { id: 'mouvements', label: 'Mouvements', count: stats?.movements_this_month },
    { id: 'demandes', label: 'Demandes', count: requests.filter((r: any) => r.status === 'PENDING').length },
    { id: 'alertes', label: 'Alertes', count: (stats?.low_stock || 0) + (stats?.ruptures || 0), danger: true },
  ];

  return (
    <div>
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-[22px] font-bold text-honey-dark font-display tracking-tight">Stock</h1>
          <p className="text-sm text-honey-caramel mt-0.5">Inventaire & mouvements de matériaux</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary text-sm"><ArrowDown size={13} /> Entrée stock</button>
          {canMng && <button onClick={openCreate} className="btn-primary text-sm"><Plus size={13} /> Nouveau produit</button>}
        </div>
      </div>

      <div className="bg-gradient-to-br from-amber-50 to-honey-cream border border-amber-100 rounded-lg p-4 mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-honey-caramel mb-3">Mini-dashboard</p>
        <div className="grid grid-cols-5 gap-3">
          {[
            { label: 'Produits actifs', value: stats?.total_products || 0 },
            { label: 'Valeur stock', value: `${((stats?.total_value || 0) / 1000).toFixed(0)}K`, color: 'text-honey-gold' },
            { label: 'En alerte', value: stats?.low_stock || 0, color: 'text-amber-600' },
            { label: 'Ruptures', value: stats?.ruptures || 0, color: 'text-red-500' },
            { label: 'Mouvements', value: stats?.movements_this_month || 0 },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white rounded-lg p-3 border border-honey-beige-soft">
              <p className="text-[10px] text-honey-caramel uppercase tracking-wide mb-1">{kpi.label}</p>
              <p className={cn('text-xl font-bold font-mono', kpi.color || 'text-honey-dark')}>{kpi.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-1 mb-4 border-b border-honey-beige-soft">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn('flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-all',
              tab === t.id ? 'border-honey-gold text-honey-dark' : 'border-transparent text-honey-caramel hover:text-honey-dark'
            )}>
            {t.label}
            {t.count !== undefined && (
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-bold',
                t.danger && t.count > 0 ? 'bg-red-100 text-red-700' : 'bg-honey-cream text-honey-caramel'
              )}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'produits' && (
        <div className="card">
          <div className="flex gap-3 mb-4">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-honey-caramel" />
              <input type="text" placeholder="Rechercher un produit, SKU..."
                value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-9" />
            </div>
          </div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-honey-cream">
                {['Produit', 'Catégorie', 'Stock', 'Seuil', 'P.U.', 'Valeur', 'Statut', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-honey-caramel border-b border-honey-beige-soft">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr><td colSpan={8} className="py-12 text-center text-honey-caramel">Aucun produit en stock</td></tr>
              ) : products.map((p) => {
                const status = stockStatus(p.quantity, p.min_threshold);
                const pct = p.min_threshold > 0 ? Math.min(100, (p.quantity / (p.min_threshold * 2)) * 100) : 100;
                return (
                  <tr key={p.id} className={cn('border-b border-honey-beige-soft hover:bg-honey-cream/50 transition-colors',
                    p.stock_status === 'RUPTURE' && 'bg-red-50/30', p.stock_status === 'LOW' && 'bg-amber-50/30')}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-honey-dark">{p.name}</p>
                      <p className="text-[11px] text-honey-caramel font-mono">{p.sku}</p>
                    </td>
                    <td className="px-4 py-3 text-honey-caramel text-xs">{p.category || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-14 h-1.5 bg-honey-cream rounded-full overflow-hidden">
                          <div className={cn('h-full rounded-full', p.stock_status === 'OK' ? 'bg-green-400' : p.stock_status === 'LOW' ? 'bg-amber-400' : 'bg-red-400')} style={{ width: `${pct}%` }} />
                        </div>
                        <span className={cn('font-mono font-bold text-sm', p.stock_status === 'OK' ? 'text-honey-dark' : p.stock_status === 'LOW' ? 'text-amber-600' : 'text-red-600')}>{p.quantity}</span>
                        <span className="text-[10px] text-honey-caramel">{p.unit}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-honey-caramel">{p.min_threshold}</td>
                    <td className="px-4 py-3 font-mono text-honey-dark">{formatCurrency(p.unit_price)}</td>
                    <td className="px-4 py-3 font-mono font-semibold text-honey-dark">{formatCurrency(p.stock_value)}</td>
                    <td className="px-4 py-3"><span className={cn('badge border text-[10px]', status.cls)}>{status.label}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {canMng && (
                          <button onClick={() => openEdit(p)} title="Modifier"
                            className="w-7 h-7 rounded-md border border-honey-beige-soft flex items-center justify-center text-honey-caramel hover:text-honey-dark hover:border-honey-gold hover:bg-honey-cream transition-all">
                            <Pencil size={12} />
                          </button>
                        )}
                        {canMng && (
                          <button onClick={() => setDeleteTarget(p)} title="Désactiver"
                            className="w-7 h-7 rounded-md border border-red-200 flex items-center justify-center text-red-400 hover:text-red-600 hover:border-red-400 hover:bg-red-50 transition-all">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'mouvements' && (
        <div className="card">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-honey-cream">
                {['Date', 'Produit', 'Type', 'Quantité', 'Source', 'Chantier', 'Par'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-honey-caramel border-b border-honey-beige-soft">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {movements.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-honey-caramel">Aucun mouvement</td></tr>
              ) : movements.map((m: any) => (
                <tr key={m.id} className="border-b border-honey-beige-soft hover:bg-honey-cream/50">
                  <td className="px-4 py-3 text-[11px] text-honey-caramel font-mono">{new Date(m.created_at).toLocaleDateString('fr-FR')}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-honey-dark">{m.product?.name}</p>
                    <p className="text-[11px] text-honey-caramel font-mono">{m.product?.sku}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('flex items-center gap-1 text-xs font-semibold', m.type === 'IN' ? 'text-green-600' : m.type === 'OUT' ? 'text-red-500' : 'text-amber-600')}>
                      {m.type === 'IN' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}{m.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono font-bold">{Number(m.quantity)} {m.product?.unit}</td>
                  <td className="px-4 py-3 text-honey-caramel text-xs">{m.source}</td>
                  <td className="px-4 py-3 text-honey-caramel text-xs">{m.project?.name || '—'}</td>
                  <td className="px-4 py-3 text-honey-caramel text-xs">{m.creator?.first_name} {m.creator?.last_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'demandes' && (
        <div className="card">
          <div className="space-y-3">
            {requests.length === 0 ? (
              <p className="py-12 text-center text-honey-caramel">Aucune demande</p>
            ) : requests.map((r: any) => (
              <div key={r.id} className={cn('flex items-center gap-4 p-4 rounded-lg border',
                r.status === 'PENDING' ? 'border-amber-200 bg-amber-50/30' :
                r.status === 'APPROVED' ? 'border-green-200 bg-green-50/30' : 'border-gray-200 bg-gray-50')}>
                <div className="flex-1">
                  <p className="font-medium text-honey-dark">{r.product?.name}</p>
                  <p className="text-xs text-honey-caramel mt-0.5">Quantité: {r.quantity} {r.product?.unit} · {r.reason || 'Pas de motif'}</p>
                </div>
                {r.status === 'PENDING' && canMng && (
                  <div className="flex gap-2">
                    <button onClick={() => approve(r.id)} className="btn-primary text-xs py-1.5 px-3">✓ Approuver</button>
                    <button onClick={() => { setRejectTarget(r); setRejectReason(''); }} className="btn-secondary text-xs py-1.5 px-3">✕ Rejeter</button>
                  </div>
                )}
                <span className={cn('badge border text-[10px]',
                  r.status === 'PENDING' ? 'badge-warning' : r.status === 'APPROVED' ? 'badge-success' : 'badge-danger')}>
                  {r.status === 'PENDING' ? 'En attente' : r.status === 'APPROVED' ? 'Approuvée' : 'Rejetée'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'alertes' && (
        <div className="space-y-3">
          {products.filter((p) => p.stock_status !== 'OK').map((p) => (
            <div key={p.id} className={cn('flex items-start gap-3 p-4 rounded-lg border',
              p.stock_status === 'RUPTURE' ? 'border-red-200 bg-red-50/30' : 'border-amber-200 bg-amber-50/30')}>
              <AlertTriangle size={18} className={p.stock_status === 'RUPTURE' ? 'text-red-500' : 'text-amber-500'} />
              <div className="flex-1">
                <p className="font-semibold text-honey-dark">{p.name}</p>
                <p className="text-xs text-honey-caramel mt-0.5">{p.quantity} {p.unit} restant{p.quantity > 1 ? 's' : ''} · Seuil minimum: {p.min_threshold}</p>
              </div>
              <button className="btn-primary text-xs py-1.5 px-3">Commander</button>
            </div>
          ))}
          {products.filter((p) => p.stock_status !== 'OK').length === 0 && (
            <div className="card py-12 text-center text-green-600 font-medium">✓ Tous les stocks sont suffisants</div>
          )}
        </div>
      )}

      {/* MODAL Créer / Modifier produit */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setShowForm(false)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.5)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:500, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ padding:'18px 24px', borderBottom:'1px solid #F5E6D3', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, background:'white', zIndex:1 }}>
              <h2 style={{ margin:0, fontSize:16, fontWeight:700, color:'#1A141A' }}>
                {editTarget ? '✏️ Modifier le produit' : '📦 Nouveau produit'}
              </h2>
              <button onClick={() => setShowForm(false)} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#8E5915' }}>×</button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding:24 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={labelStyle}>Nom du produit *</label>
                  <input required value={form.name} onChange={e => setForm({...form, name:e.target.value})}
                    placeholder="Ex: Ciment Portland 50kg" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>SKU / Référence</label>
                  <input value={form.sku} onChange={e => setForm({...form, sku:e.target.value})}
                    placeholder="CIM-50" style={{...inputStyle, fontFamily:'monospace'}} />
                </div>
                <div>
                  <label style={labelStyle}>Catégorie</label>
                  <input value={form.category} onChange={e => setForm({...form, category:e.target.value})}
                    placeholder="Gros œuvre, Finition..." style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Unité *</label>
                  <select value={form.unit} onChange={e => setForm({...form, unit:e.target.value})} style={inputStyle}>
                    <option value="unité">Unité</option>
                    <option value="sac">Sac</option>
                    <option value="kg">Kg</option>
                    <option value="tonne">Tonne</option>
                    <option value="m²">m²</option>
                    <option value="m³">m³</option>
                    <option value="ml">ml</option>
                    <option value="litre">Litre</option>
                    <option value="rouleau">Rouleau</option>
                  </select>
                </div>
                {!editTarget && (
                  <div>
                    <label style={labelStyle}>Quantité initiale</label>
                    <input type="number" min="0" value={form.quantity} onChange={e => setForm({...form, quantity:e.target.value})}
                      style={{...inputStyle, fontFamily:'monospace'}} />
                  </div>
                )}
                <div>
                  <label style={labelStyle}>Seuil minimum</label>
                  <input type="number" min="0" value={form.min_threshold} onChange={e => setForm({...form, min_threshold:e.target.value})}
                    style={{...inputStyle, fontFamily:'monospace'}} />
                </div>
                <div style={{ gridColumn: editTarget ? '1/-1' : undefined }}>
                  <label style={labelStyle}>Prix unitaire (MAD)</label>
                  <input type="number" min="0" step="0.01" value={form.unit_price} onChange={e => setForm({...form, unit_price:e.target.value})}
                    style={{...inputStyle, fontFamily:'monospace'}} />
                </div>
              </div>
              {formError && (
                <div style={{ background:'#FFF0F0', border:'1px solid #FFCDD2', borderRadius:8, padding:'8px 12px', marginBottom:16, fontSize:12, color:'#D32F2F' }}>⚠️ {formError}</div>
              )}
              <div style={{ display:'flex', justifyContent:'flex-end', gap:10, paddingTop:16, borderTop:'1px solid #F5E6D3' }}>
                <button type="button" onClick={() => setShowForm(false)} style={btnSecondary}>Annuler</button>
                <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity:saving?0.7:1 }}>
                  {saving ? 'Enregistrement...' : (editTarget ? '✓ Enregistrer' : '+ Ajouter au stock')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POPUP Confirmation désactivation produit */}
      {deleteTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setDeleteTarget(null)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.6)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:420, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.3)', padding:28 }}>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ width:56, height:56, borderRadius:'50%', background:'#FFF0F0', border:'2px solid #FECACA', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, margin:'0 auto 14px' }}>🗑️</div>
              <h3 style={{ margin:'0 0 8px', fontSize:17, fontWeight:700, color:'#1A141A' }}>Désactiver ce produit ?</h3>
              <p style={{ margin:0, fontSize:13, color:'#8E5915' }}>
                <strong>{deleteTarget.name}</strong> ne sera plus visible dans l'inventaire.
              </p>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setDeleteTarget(null)} style={{ ...btnSecondary, flex:1 }}>Annuler</button>
              <button onClick={handleDelete} disabled={deleting} style={{ ...btnDanger, flex:1, opacity:deleting?0.7:1 }}>
                {deleting ? 'Désactivation...' : '🗑️ Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP Motif de rejet demande */}
      {rejectTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setRejectTarget(null)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.6)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:420, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.3)', padding:28 }}>
            <h3 style={{ margin:'0 0 16px', fontSize:16, fontWeight:700, color:'#1A141A' }}>✕ Rejeter la demande</h3>
            <div style={{ marginBottom:20 }}>
              <label style={labelStyle}>Motif du refus</label>
              <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                placeholder="Expliquer le motif..." rows={3} style={{...inputStyle, resize:'none'}} />
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setRejectTarget(null)} style={{ ...btnSecondary, flex:1 }}>Annuler</button>
              <button onClick={rejectConfirm} style={{ ...btnDanger, flex:1 }}>✕ Rejeter</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
