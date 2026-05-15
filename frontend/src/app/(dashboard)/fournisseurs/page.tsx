'use client';

import { useState, useEffect } from 'react';
import { Plus, Search, CreditCard, Pencil, Trash2 } from 'lucide-react';
import { fournisseursApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/lib/i18n';

const inputStyle = { width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E8D4B0', fontSize:13, outline:'none', boxSizing:'border-box' as const };
const labelStyle = { display:'block' as const, fontSize:11, fontWeight:700 as const, color:'#8E5915', textTransform:'uppercase' as const, letterSpacing:0.5, marginBottom:6 };
const btnSecondary = { padding:'9px 18px', borderRadius:8, border:'1.5px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:13, fontWeight:600 as const, cursor:'pointer' as const };
const btnPrimary = { padding:'9px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#F4B315,#E59312)', color:'#1A141A', fontSize:13, fontWeight:700 as const, cursor:'pointer' as const };
const btnDanger = { padding:'9px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#EF4444,#DC2626)', color:'white', fontSize:13, fontWeight:700 as const, cursor:'pointer' as const };

const emptyForm = { name: '', category: '', ice: '', rib: '', contact_person: '', phone: '', email: '', city: '' };

export default function FournisseursPage() {
  const { user } = useAuth();
  const [fournisseurs, setFournisseurs] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const canDel = user?.role === 'ADMIN' || user?.role === 'GERANT';
  const canMng = user?.role === 'ADMIN' || user?.role === 'GERANT';

  const fetchData = () => {
    setLoading(true);
    Promise.all([
      fournisseursApi.list({ search, category: catFilter || undefined }),
      fournisseursApi.categories(),
    ]).then(([listRes, catRes]) => {
      setFournisseurs(listRes.data.data || []);
      setCategories(catRes.data || []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [search, catFilter]);

  const openCreate = () => { setForm(emptyForm); setFormError(''); setEditTarget(null); setShowForm(true); };
  const openEdit = (f: any) => {
    setForm({ name: f.name || '', category: f.category || '', ice: f.ice || '', rib: f.rib || '', contact_person: f.contact_person || '', phone: f.phone || '', email: f.email || '', city: f.city || '' });
    setFormError(''); setEditTarget(f); setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setFormError('');
    try {
      const payload = {
        name: form.name,
        category: form.category || undefined,
        ice: form.ice || undefined,
        rib: form.rib || undefined,
        contact_person: form.contact_person || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        city: form.city || undefined,
      };
      if (editTarget) {
        await fournisseursApi.update(editTarget.id, payload);
      } else {
        await fournisseursApi.create(payload);
      }
      fetchData();
      setShowForm(false);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setFormError(Array.isArray(msg) ? msg.join(', ') : (msg || 'Erreur'));
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fournisseursApi.delete(deleteTarget.id);
      fetchData();
      setDeleteTarget(null);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Erreur lors de la suppression');
    } finally { setDeleting(false); }
  };

  return (
    <div>
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-[22px] font-bold text-honey-dark font-display tracking-tight">Fournisseurs</h1>
          <p className="text-sm text-honey-caramel mt-0.5">Carnet fournisseurs + RIB pour rapprochement auto</p>
        </div>
        <button onClick={openCreate} className="btn-primary text-sm"><Plus size={13} /> Nouveau fournisseur</button>
      </div>

      <div className="card">
        <div className="flex gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-honey-caramel" />
            <input type="text" placeholder="Nom, ICE, RIB..."
              value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-9" />
          </div>
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="input w-auto">
            <option value="">Toutes catégories</option>
            {categories.map((c: any) => (
              <option key={c.category} value={c.category}>{c.category} ({c.count})</option>
            ))}
          </select>
        </div>

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-honey-cream">
              {['Fournisseur', 'Catégorie', 'ICE', 'Contact', 'RIB ⭐', 'Actions'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-honey-caramel border-b border-honey-beige-soft">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="py-12 text-center text-honey-caramel">Chargement...</td></tr>
            ) : fournisseurs.length === 0 ? (
              <tr><td colSpan={6} className="py-12 text-center text-honey-caramel">Aucun fournisseur</td></tr>
            ) : fournisseurs.map((f) => (
              <tr key={f.id} className="border-b border-honey-beige-soft hover:bg-honey-cream/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-honey-orange/10 text-honey-orange flex items-center justify-center text-sm font-bold flex-shrink-0">{f.name[0]}</div>
                    <div>
                      <p className="font-medium text-honey-dark">{f.name}</p>
                      {f.city && <p className="text-[11px] text-honey-caramel">{f.city}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {f.category && (
                    <span className="bg-honey-cream text-honey-caramel border border-honey-beige-soft text-[10px] font-medium px-2 py-0.5 rounded-full">{f.category}</span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-[11px] text-honey-caramel">{f.ice || '—'}</td>
                <td className="px-4 py-3">
                  <p className="text-xs text-honey-dark">{f.contact_person || '—'}</p>
                  {f.phone && <p className="text-[11px] text-honey-caramel">{f.phone}</p>}
                </td>
                <td className="px-4 py-3">
                  {f.rib ? (
                    <div className="flex items-center gap-1.5 bg-honey-cream px-2 py-1 rounded border border-honey-beige-soft">
                      <CreditCard size={11} className="text-honey-gold flex-shrink-0" />
                      <span className="font-mono text-[10px] text-honey-dark truncate max-w-[130px]">{f.rib}</span>
                    </div>
                  ) : (
                    <span className="text-[11px] text-red-400">⚠ Manquant</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {canMng && (
                      <button onClick={() => openEdit(f)} title="Modifier"
                        className="w-7 h-7 rounded-md border border-honey-beige-soft flex items-center justify-center text-honey-caramel hover:text-honey-dark hover:border-honey-gold hover:bg-honey-cream transition-all">
                        <Pencil size={12} />
                      </button>
                    )}
                    {canDel && (
                      <button onClick={() => setDeleteTarget(f)} title="Supprimer"
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

      {/* MODAL Créer / Modifier fournisseur */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setShowForm(false)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.5)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:520, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ padding:'18px 24px', borderBottom:'1px solid #F5E6D3', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, background:'white', zIndex:1 }}>
              <h2 style={{ margin:0, fontSize:16, fontWeight:700, color:'#1A141A' }}>
                {editTarget ? '✏️ Modifier le fournisseur' : '🏭 Nouveau fournisseur'}
              </h2>
              <button onClick={() => setShowForm(false)} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#8E5915' }}>×</button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding:24 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={labelStyle}>Nom du fournisseur *</label>
                  <input required value={form.name} onChange={e => setForm({...form, name:e.target.value})}
                    placeholder="Ex: Matériaux Maghreb SARL" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Catégorie</label>
                  <input value={form.category} onChange={e => setForm({...form, category:e.target.value})}
                    placeholder="Matériaux, Électricité..." style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Ville</label>
                  <input value={form.city} onChange={e => setForm({...form, city:e.target.value})}
                    placeholder="Casablanca" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>ICE</label>
                  <input value={form.ice} onChange={e => setForm({...form, ice:e.target.value})}
                    placeholder="000000000000000" style={{...inputStyle, fontFamily:'monospace'}} />
                </div>
                <div>
                  <label style={labelStyle}>Contact principal</label>
                  <input value={form.contact_person} onChange={e => setForm({...form, contact_person:e.target.value})}
                    placeholder="Nom du contact" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Téléphone</label>
                  <input value={form.phone} onChange={e => setForm({...form, phone:e.target.value})}
                    placeholder="+212 6XX XXX XXX" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input type="email" value={form.email} onChange={e => setForm({...form, email:e.target.value})}
                    placeholder="contact@fournisseur.ma" style={inputStyle} />
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={labelStyle}>RIB / IBAN</label>
                  <input value={form.rib} onChange={e => setForm({...form, rib:e.target.value})}
                    placeholder="MA64 0000 0000 0000 0000 0000 00" style={{...inputStyle, fontFamily:'monospace'}} />
                </div>
              </div>
              {formError && (
                <div style={{ background:'#FFF0F0', border:'1px solid #FFCDD2', borderRadius:8, padding:'8px 12px', marginBottom:16, fontSize:12, color:'#D32F2F' }}>⚠️ {formError}</div>
              )}
              <div style={{ display:'flex', justifyContent:'flex-end', gap:10, paddingTop:16, borderTop:'1px solid #F5E6D3' }}>
                <button type="button" onClick={() => setShowForm(false)} style={btnSecondary}>Annuler</button>
                <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity:saving?0.7:1, cursor:saving?'not-allowed':'pointer' }}>
                  {saving ? 'Enregistrement...' : (editTarget ? '✓ Enregistrer' : '+ Créer le fournisseur')}
                </button>
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
              <h3 style={{ margin:'0 0 8px', fontSize:17, fontWeight:700, color:'#1A141A' }}>Supprimer ce fournisseur ?</h3>
              <p style={{ margin:0, fontSize:13, color:'#8E5915' }}>
                <strong>{deleteTarget.name}</strong> sera désactivé et n'apparaîtra plus dans la liste.
              </p>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setDeleteTarget(null)} style={{ ...btnSecondary, flex:1 }}>Annuler</button>
              <button onClick={handleDelete} disabled={deleting} style={{ ...btnDanger, flex:1, opacity:deleting?0.7:1, cursor:deleting?'not-allowed':'pointer' }}>
                {deleting ? 'Suppression...' : '🗑️ Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
