'use client';

import { useState, useEffect } from 'react';
import { Plus, Search, Star, Eye, Phone, Mail, Pencil, Trash2 } from 'lucide-react';
import { clientsApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n';

const inputStyle = { width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E8D4B0', fontSize:13, outline:'none', boxSizing:'border-box' as const };
const labelStyle = { display:'block' as const, fontSize:11, fontWeight:700 as const, color:'#8E5915', textTransform:'uppercase' as const, letterSpacing:0.5, marginBottom:6 };
const btnSecondary = { padding:'9px 18px', borderRadius:8, border:'1.5px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:13, fontWeight:600 as const, cursor:'pointer' as const };
const btnPrimary = { padding:'9px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#F4B315,#E59312)', color:'#1A141A', fontSize:13, fontWeight:700 as const, cursor:'pointer' as const };
const btnDanger = { padding:'9px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#EF4444,#DC2626)', color:'white', fontSize:13, fontWeight:700 as const, cursor:'pointer' as const };

const emptyForm = { commercial_name: '', legal_name: '', ice: '', rc: '', if: '', contact_person: '', phone: '', email: '', address: '', city: '' };

export default function ClientsPage() {
  const { t, dir } = useLanguage();
  const { user } = useAuth();
  const [clients, setClients] = useState<any[]>([]);
  const [topClients, setTopClients] = useState<any[]>([]);
  const [search, setSearch] = useState('');
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
    Promise.all([clientsApi.list({ search, active: true }), clientsApi.top()])
      .then(([listRes, topRes]) => {
        setClients(listRes.data.data || []);
        setTopClients(topRes.data || []);
      }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [search]);

  const openCreate = () => { setForm(emptyForm); setFormError(''); setEditTarget(null); setShowForm(true); };
  const openEdit = (c: any) => {
    setForm({ commercial_name: c.commercial_name || '', legal_name: c.legal_name || '', ice: c.ice || '', rc: c.rc || '', if: c.if || '', contact_person: c.contact_person || '', phone: c.phone || '', email: c.email || '', address: c.address || '', city: c.city || '' });
    setFormError(''); setEditTarget(c); setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setFormError('');
    try {
      const payload = {
        commercial_name: form.commercial_name,
        legal_name: form.legal_name || undefined,
        ice: form.ice || undefined,
        rc: form.rc || undefined,
        if: form.if || undefined,
        contact_person: form.contact_person || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        address: form.address,
        city: form.city || undefined,
      };
      if (editTarget) {
        await clientsApi.update(editTarget.id, payload);
      } else {
        await clientsApi.create(payload);
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
      await clientsApi.delete(deleteTarget.id);
      fetchData();
      setDeleteTarget(null);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Erreur lors de la suppression');
    } finally { setDeleting(false); }
  };

  const reliabilityColor = (score: number) =>
    score >= 80 ? 'text-green-600' : score >= 50 ? 'text-amber-600' : 'text-red-500';

  return (
    <div>
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-[22px] font-bold text-honey-dark font-display tracking-tight">Clients</h1>
          <p className="text-sm text-honey-caramel mt-0.5">Carnet clients & historique commercial</p>
        </div>
        <button onClick={openCreate} className="btn-primary text-sm"><Plus size={13} /> Nouveau client</button>
      </div>

      {topClients.length > 0 && (
        <div className="card mb-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-honey-caramel mb-3">🏆 Top clients (CA)</p>
          <div className="grid grid-cols-5 gap-3">
            {topClients.slice(0, 5).map((c, i) => (
              <div key={c.id} className="bg-honey-cream rounded-lg p-3 border border-honey-beige-soft text-center">
                <div className="w-8 h-8 rounded-full bg-honey-gradient mx-auto mb-2 flex items-center justify-center text-xs font-bold text-honey-dark">#{i + 1}</div>
                <p className="text-xs font-medium text-honey-dark truncate">{c.name}</p>
                <p className="text-sm font-bold text-honey-orange font-mono mt-1">{((c.total_ca || 0) / 1000).toFixed(0)}K</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-honey-caramel" />
            <input type="text" placeholder="Rechercher un client, ICE..."
              value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-9" />
          </div>
        </div>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-honey-cream">
              {['Client', 'ICE', 'Contact', 'Fiabilité', 'Actions'].map((h) => (
                <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-honey-caramel border-b border-honey-beige-soft">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="py-12 text-center text-honey-caramel">Chargement...</td></tr>
            ) : clients.length === 0 ? (
              <tr><td colSpan={5} className="py-12 text-center text-honey-caramel">Aucun client</td></tr>
            ) : clients.map((c) => (
              <tr key={c.id} className="border-b border-honey-beige-soft hover:bg-honey-cream/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-honey-gold/10 text-honey-orange flex items-center justify-center text-sm font-bold flex-shrink-0">{c.commercial_name[0]}</div>
                    <div>
                      <p className="font-medium text-honey-dark">{c.commercial_name}</p>
                      {c.legal_name && <p className="text-[11px] text-honey-caramel">{c.legal_name}</p>}
                      {c.address && <p className="text-[11px] text-honey-caramel/70">{c.address}</p>}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-[11px] text-honey-caramel">{c.ice || '—'}</td>
                <td className="px-4 py-3">
                  <div className="space-y-0.5">
                    {c.contact_person && <p className="text-xs text-honey-dark">{c.contact_person}</p>}
                    {c.phone && <p className="text-[11px] text-honey-caramel flex items-center gap-1"><Phone size={10} />{c.phone}</p>}
                    {c.email && <p className="text-[11px] text-honey-caramel flex items-center gap-1"><Mail size={10} />{c.email}</p>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex">
                      {[1,2,3,4,5].map((star) => (
                        <Star key={star} size={11} className={star <= Math.round((c.reliability_score || 50) / 20) ? 'text-honey-gold fill-honey-gold' : 'text-honey-beige'} />
                      ))}
                    </div>
                    <span className={cn('text-xs font-bold', reliabilityColor(c.reliability_score || 50))}>{c.reliability_score || 50}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    {canMng && (
                      <button onClick={() => openEdit(c)} title="Modifier"
                        className="w-7 h-7 rounded-md border border-honey-beige-soft flex items-center justify-center text-honey-caramel hover:text-honey-dark hover:border-honey-gold hover:bg-honey-cream transition-all">
                        <Pencil size={12} />
                      </button>
                    )}
                    {canDel && (
                      <button onClick={() => setDeleteTarget(c)} title="Supprimer"
                        className="w-7 h-7 rounded-md border border-red-200 flex items-center justify-center text-red-400 hover:text-red-600 hover:border-red-400 hover:bg-red-50 transition-all">
                        <Trash2 size={12} />
                      </button>
                    )}
                    {!canMng && !canDel && (
                      <button className="w-7 h-7 rounded-md border border-honey-beige-soft flex items-center justify-center text-honey-caramel hover:text-honey-dark hover:border-honey-gold hover:bg-honey-cream transition-all">
                        <Eye size={12} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MODAL Créer / Modifier client */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setShowForm(false)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.5)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:500, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ padding:'18px 24px', borderBottom:'1px solid #F5E6D3', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, background:'white', zIndex:1 }}>
              <h2 style={{ margin:0, fontSize:16, fontWeight:700, color:'#1A141A' }}>
                {editTarget ? '✏️ Modifier le client' : '👥 Nouveau client'}
              </h2>
              <button onClick={() => setShowForm(false)} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#8E5915' }}>×</button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding:24 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={labelStyle}>Nom commercial *</label>
                  <input required value={form.commercial_name} onChange={e => setForm({...form, commercial_name:e.target.value})}
                    placeholder="Ex: BTP Casablanca SARL" style={inputStyle} />
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={labelStyle}>Raison sociale</label>
                  <input value={form.legal_name} onChange={e => setForm({...form, legal_name:e.target.value})}
                    placeholder="Raison sociale légale" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>ICE</label>
                  <input value={form.ice} onChange={e => setForm({...form, ice:e.target.value})}
                    placeholder="000000000000000" style={{...inputStyle, fontFamily:'monospace'}} />
                </div>
                <div>
                  <label style={labelStyle}>RC</label>
                  <input value={form.rc} onChange={e => setForm({...form, rc:e.target.value})}
                    placeholder="N° registre de commerce" style={{...inputStyle, fontFamily:'monospace'}} />
                </div>
                <div>
                  <label style={labelStyle}>IF</label>
                  <input value={form.if} onChange={e => setForm({...form, if:e.target.value})}
                    placeholder="Identifiant fiscal" style={{...inputStyle, fontFamily:'monospace'}} />
                </div>
                <div>
                  <label style={labelStyle}>Contact principal</label>
                  <input value={form.contact_person} onChange={e => setForm({...form, contact_person:e.target.value})}
                    placeholder="Mohamed Alami" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Téléphone</label>
                  <input value={form.phone} onChange={e => setForm({...form, phone:e.target.value})}
                    placeholder="+212 6XX XXX XXX" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input type="email" value={form.email} onChange={e => setForm({...form, email:e.target.value})}
                    placeholder="contact@client.ma" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Ville</label>
                  <input value={form.city} onChange={e => setForm({...form, city:e.target.value})}
                    placeholder="Casablanca" style={inputStyle} />
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={labelStyle}>Adresse du client *</label>
                  <textarea required rows={3} value={form.address} onChange={e => setForm({...form, address:e.target.value})}
                    placeholder="Adresse complète du client" style={{...inputStyle, resize:'vertical' as const}} />
                </div>
              </div>
              {formError && (
                <div style={{ background:'#FFF0F0', border:'1px solid #FFCDD2', borderRadius:8, padding:'8px 12px', marginBottom:16, fontSize:12, color:'#D32F2F' }}>⚠️ {formError}</div>
              )}
              <div style={{ display:'flex', justifyContent:'flex-end', gap:10, paddingTop:16, borderTop:'1px solid #F5E6D3' }}>
                <button type="button" onClick={() => setShowForm(false)} style={btnSecondary}>Annuler</button>
                <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity:saving?0.7:1, cursor:saving?'not-allowed':'pointer' }}>
                  {saving ? 'Enregistrement...' : (editTarget ? '✓ Enregistrer' : '+ Créer le client')}
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
              <h3 style={{ margin:'0 0 8px', fontSize:17, fontWeight:700, color:'#1A141A' }}>Supprimer ce client ?</h3>
              <p style={{ margin:0, fontSize:13, color:'#8E5915' }}>
                <strong>{deleteTarget.commercial_name}</strong> sera archivé et ne sera plus visible.
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
