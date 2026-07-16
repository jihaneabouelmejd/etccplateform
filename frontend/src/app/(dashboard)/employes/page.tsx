'use client';

import { useState, useEffect } from 'react';
import { Plus, Search, Pencil, Trash2, KeyRound, Mail, ShieldCheck, RefreshCw, XCircle } from 'lucide-react';
import { usersApi, mailApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useLanguage } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const roleConfig: Record<string, { label: string; cls: string }> = {
  ADMIN:     { label: '👑 Admin', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  GERANT:    { label: '⭐ Gérant', cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  COMPTABLE: { label: '📊 Comptable', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  EMPLOYE:   { label: '👷 Employé', cls: 'bg-honey-cream text-honey-caramel border-honey-beige-soft' },
};

const inputStyle = { width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E8D4B0', fontSize:13, outline:'none', boxSizing:'border-box' as const };
const labelStyle = { display:'block' as const, fontSize:11, fontWeight:700 as const, color:'#8E5915', textTransform:'uppercase' as const, letterSpacing:0.5, marginBottom:6 };
const btnSecondary = { padding:'9px 18px', borderRadius:8, border:'1.5px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:13, fontWeight:600 as const, cursor:'pointer' as const };
const btnPrimary = { padding:'9px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#F4B315,#E59312)', color:'#1A141A', fontSize:13, fontWeight:700 as const, cursor:'pointer' as const };
const btnDanger = { padding:'9px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#EF4444,#DC2626)', color:'white', fontSize:13, fontWeight:700 as const, cursor:'pointer' as const };

const emptyCreateForm = { first_name: '', last_name: '', username: '', password: '', role: 'EMPLOYE', phone: '', email: '' };

export default function EmployesPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('EMPLOYE');
  const [loading, setLoading] = useState(true);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [genLoading, setGenLoading] = useState(false);

  // Edit modal
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editForm, setEditForm] = useState({ first_name: '', last_name: '', role: '', phone: '', email: '' });
  const [editError, setEditError] = useState('');
  const [editing, setEditing] = useState(false);

  // Compte email professionnel (Hostinger) — associé à l'employé en cours d'édition
  const emptyMailForm = { email_address: '', password: '', imap_host: '', imap_port: 993, smtp_host: '', smtp_port: 465 };
  const [mailForm, setMailForm] = useState(emptyMailForm);
  const [mailConfigured, setMailConfigured] = useState(false);
  const [mailLoading, setMailLoading] = useState(false);
  const [mailSaving, setMailSaving] = useState(false);
  const [mailRemoving, setMailRemoving] = useState(false);
  const [mailTesting, setMailTesting] = useState(false);
  const [mailError, setMailError] = useState('');
  const [mailTestResult, setMailTestResult] = useState<{ success: boolean; message?: string } | null>(null);

  // Reset password
  const [resetTarget, setResetTarget] = useState<any>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  const canDel = user?.role === 'ADMIN'; // Seul Admin peut supprimer un employé
  const canMng = user?.role === 'ADMIN' || user?.role === 'GERANT';

  const fetchUsers = () => {
    setLoading(true);
    usersApi.list({ search, role: roleFilter || undefined, active: 'true' })
      .then((r) => setUsers(r.data.data || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchUsers(); }, [search, roleFilter]);

  const generatePassword = async (target: 'create' | 'reset') => {
    setGenLoading(true);
    try {
      const res = await usersApi.generatePassword();
      const pwd = res.data.password || res.data;
      if (target === 'create') setCreateForm(f => ({ ...f, password: pwd }));
      else setNewPassword(pwd);
    } catch {} finally { setGenLoading(false); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true); setCreateError('');
    try {
      await usersApi.create({
        first_name: createForm.first_name,
        last_name: createForm.last_name,
        username: createForm.username,
        password: createForm.password,
        role: createForm.role,
        phone: createForm.phone || undefined,
        email: createForm.email || undefined,
      });
      fetchUsers();
      setShowCreate(false);
      setCreateForm(emptyCreateForm);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setCreateError(Array.isArray(msg) ? msg.join(', ') : (msg || 'Erreur'));
    } finally { setCreating(false); }
  };

  const openEdit = (u: any) => {
    setEditForm({ first_name: u.first_name || '', last_name: u.last_name || '', role: u.role || 'EMPLOYE', phone: u.phone || '', email: u.email || '' });
    setEditError(''); setEditTarget(u);

    // Charger le compte email professionnel Hostinger de l'employé
    setMailForm(emptyMailForm); setMailConfigured(false); setMailTestResult(null); setMailError('');
    setMailLoading(true);
    mailApi.adminGetAccount(u.id)
      .then(({ data }) => {
        if (data?.configured) {
          setMailConfigured(true);
          setMailForm({
            email_address: data.email_address || '',
            password: '',
            imap_host: data.imap_host || '',
            imap_port: data.imap_port || 993,
            smtp_host: data.smtp_host || '',
            smtp_port: data.smtp_port || 465,
          });
        } else {
          setMailConfigured(false);
        }
      })
      .catch(() => setMailConfigured(false))
      .finally(() => setMailLoading(false));
  };

  const handleSaveMailAccount = async () => {
    if (!editTarget) return;
    setMailError(''); setMailTestResult(null);
    if (!mailForm.email_address.trim() || !mailForm.imap_host.trim() || !mailForm.smtp_host.trim()) {
      setMailError('Adresse email, hôte IMAP et hôte SMTP sont requis'); return;
    }
    if (!mailConfigured && !mailForm.password.trim()) {
      setMailError('Le mot de passe de la boîte mail est requis'); return;
    }
    setMailSaving(true);
    try {
      const payload: any = {
        email_address: mailForm.email_address,
        imap_host: mailForm.imap_host,
        imap_port: Number(mailForm.imap_port) || 993,
        smtp_host: mailForm.smtp_host,
        smtp_port: Number(mailForm.smtp_port) || 465,
      };
      if (mailForm.password.trim()) payload.password = mailForm.password;
      await mailApi.adminSetAccount(editTarget.id, payload);
      setMailConfigured(true);
      setMailForm(f => ({ ...f, password: '' }));
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setMailError(Array.isArray(msg) ? msg.join(', ') : (msg || 'Erreur lors de l\'enregistrement'));
    } finally { setMailSaving(false); }
  };

  const handleRemoveMailAccount = async () => {
    if (!editTarget) return;
    if (!confirm('Retirer le compte email professionnel de cet employé ?')) return;
    setMailRemoving(true); setMailError(''); setMailTestResult(null);
    try {
      await mailApi.adminRemoveAccount(editTarget.id);
      setMailConfigured(false);
      setMailForm(emptyMailForm);
    } catch (e: any) {
      setMailError(e?.response?.data?.message || 'Erreur lors de la suppression');
    } finally { setMailRemoving(false); }
  };

  const handleTestMailAccount = async () => {
    if (!editTarget) return;
    setMailTesting(true); setMailTestResult(null);
    try {
      const { data } = await mailApi.adminTestAccount(editTarget.id);
      setMailTestResult(data);
    } catch (e: any) {
      setMailTestResult({ success: false, message: e?.response?.data?.message || 'Erreur' });
    } finally { setMailTesting(false); }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditing(true); setEditError('');
    try {
      await usersApi.update(editTarget.id, {
        first_name: editForm.first_name,
        last_name: editForm.last_name,
        role: editForm.role,
        phone: editForm.phone || undefined,
        email: editForm.email || undefined,
      });
      fetchUsers();
      setEditTarget(null);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      setEditError(Array.isArray(msg) ? msg.join(', ') : (msg || 'Erreur'));
    } finally { setEditing(false); }
  };

  const handleResetPassword = async () => {
    if (!newPassword.trim()) return;
    setResetting(true);
    try {
      await usersApi.resetPassword(resetTarget.id, newPassword);
      setResetTarget(null);
      setNewPassword('');
      alert('Mot de passe réinitialisé avec succès');
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Erreur');
    } finally { setResetting(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await usersApi.update(deleteTarget.id, { is_active: false });
      fetchUsers();
      setDeleteTarget(null);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Erreur lors de la désactivation');
    } finally { setDeleting(false); }
  };

  return (
    <div>
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-[22px] font-bold text-honey-dark font-display tracking-tight">Employés</h1>
          <p className="text-sm text-honey-caramel mt-0.5">Équipe & performance · {users.length} actifs</p>
        </div>
        <button onClick={() => { setCreateForm(emptyCreateForm); setCreateError(''); setShowCreate(true); }} className="btn-primary text-sm"><Plus size={13} /> Nouvel employé</button>
      </div>

      <div className="card">
        <div className="flex gap-3 mb-4 flex-wrap">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-honey-caramel" />
            <input type="text" placeholder="Rechercher..."
              value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-9" />
          </div>
          {(['', 'EMPLOYE', 'GERANT', 'COMPTABLE', 'ADMIN'] as const).map((r) => (
            <button key={r} onClick={() => setRoleFilter(r)}
              className={cn('px-3 py-2 rounded-lg text-xs font-semibold border transition-all',
                roleFilter === r ? 'bg-honey-dark text-white border-honey-dark' : 'bg-white text-honey-caramel border-honey-beige-soft hover:border-honey-gold'
              )}>
              {r === '' ? 'Tous' : roleConfig[r]?.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3">
          {loading ? (
            <p className="py-12 text-center text-honey-caramel">Chargement...</p>
          ) : users.length === 0 ? (
            <p className="py-12 text-center text-honey-caramel">Aucun employé trouvé</p>
          ) : users.map((u) => (
            <div key={u.id} className="flex items-center gap-4 p-4 border border-honey-beige-soft rounded-lg hover:bg-honey-cream/50 transition-all">
              <div className="w-11 h-11 rounded-full bg-honey-gradient flex items-center justify-center text-sm font-bold text-honey-dark flex-shrink-0">
                {u.first_name?.[0]}{u.last_name?.[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-honey-dark">{u.first_name} {u.last_name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-[11px] text-honey-caramel font-mono">@{u.username}</p>
                  {u.phone && <p className="text-[11px] text-honey-caramel">· {u.phone}</p>}
                </div>
              </div>
              <span className={cn('badge border text-[10px]', roleConfig[u.role]?.cls)}>{roleConfig[u.role]?.label}</span>
              <div className="text-right">
                <p className="text-[11px] text-honey-caramel">
                  {u.last_login_at ? `Vu: ${new Date(u.last_login_at).toLocaleDateString('fr-FR')}` : 'Jamais connecté'}
                </p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {canMng && (
                  <button onClick={() => openEdit(u)} title="Modifier"
                    className="w-7 h-7 rounded-md border border-honey-beige-soft flex items-center justify-center text-honey-caramel hover:text-honey-dark hover:border-honey-gold hover:bg-honey-cream transition-all">
                    <Pencil size={12} />
                  </button>
                )}
                {canMng && (
                  <button onClick={() => { setResetTarget(u); setNewPassword(''); }} title="Réinitialiser MDP"
                    className="w-7 h-7 rounded-md border border-honey-beige-soft flex items-center justify-center text-honey-caramel hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-all">
                    <KeyRound size={12} />
                  </button>
                )}
                {canDel && (
                  <button onClick={() => setDeleteTarget(u)} title="Désactiver"
                    className="w-7 h-7 rounded-md border border-red-200 flex items-center justify-center text-red-400 hover:text-red-600 hover:border-red-400 hover:bg-red-50 transition-all">
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MODAL Nouvel employé */}
      {showCreate && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setShowCreate(false)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.5)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:520, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ padding:'18px 24px', borderBottom:'1px solid #F5E6D3', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, background:'white', zIndex:1 }}>
              <h2 style={{ margin:0, fontSize:16, fontWeight:700, color:'#1A141A' }}>👷 Nouvel employé</h2>
              <button onClick={() => setShowCreate(false)} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#8E5915' }}>×</button>
            </div>
            <form onSubmit={handleCreate} style={{ padding:24 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                <div>
                  <label style={labelStyle}>Prénom *</label>
                  <input required value={createForm.first_name} onChange={e => setCreateForm({...createForm, first_name:e.target.value})} placeholder="Karim" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Nom *</label>
                  <input required value={createForm.last_name} onChange={e => setCreateForm({...createForm, last_name:e.target.value})} placeholder="Alami" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Nom d'utilisateur *</label>
                  <input required value={createForm.username} onChange={e => setCreateForm({...createForm, username:e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, '')})} placeholder="kalami" style={{...inputStyle, fontFamily:'monospace'}} />
                </div>
                <div>
                  <label style={labelStyle}>Rôle *</label>
                  <select required value={createForm.role} onChange={e => setCreateForm({...createForm, role:e.target.value})} style={inputStyle}>
                    <option value="EMPLOYE">👷 Employé</option>
                    <option value="COMPTABLE">📊 Comptable</option>
                    <option value="GERANT">⭐ Gérant</option>
                    <option value="ADMIN">👑 Admin</option>
                  </select>
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={labelStyle}>Mot de passe *</label>
                  <div style={{ display:'flex', gap:8 }}>
                    <input required value={createForm.password} onChange={e => setCreateForm({...createForm, password:e.target.value})} placeholder="Mot de passe" style={{...inputStyle, fontFamily:'monospace', flex:1}} />
                    <button type="button" onClick={() => generatePassword('create')} disabled={genLoading}
                      style={{ padding:'9px 14px', borderRadius:8, border:'1.5px solid #E8D4B0', background:'#FDF6E9', color:'#8E5915', fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
                      {genLoading ? '...' : '🎲 Générer'}
                    </button>
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Téléphone</label>
                  <input value={createForm.phone} onChange={e => setCreateForm({...createForm, phone:e.target.value})} placeholder="+212 6XX XXX XXX" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input type="email" value={createForm.email} onChange={e => setCreateForm({...createForm, email:e.target.value})} placeholder="karim@etcc.ma" style={inputStyle} />
                </div>
              </div>
              {createError && (
                <div style={{ background:'#FFF0F0', border:'1px solid #FFCDD2', borderRadius:8, padding:'8px 12px', marginBottom:16, fontSize:12, color:'#D32F2F' }}>⚠️ {createError}</div>
              )}
              <div style={{ display:'flex', justifyContent:'flex-end', gap:10, paddingTop:16, borderTop:'1px solid #F5E6D3' }}>
                <button type="button" onClick={() => setShowCreate(false)} style={btnSecondary}>Annuler</button>
                <button type="submit" disabled={creating} style={{ ...btnPrimary, opacity:creating?0.7:1, cursor:creating?'not-allowed':'pointer' }}>
                  {creating ? 'Création...' : '+ Créer l\'employé'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL Modifier employé */}
      {editTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setEditTarget(null)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.5)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:500, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ padding:'18px 24px', borderBottom:'1px solid #F5E6D3', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, background:'white', zIndex:1 }}>
              <h2 style={{ margin:0, fontSize:16, fontWeight:700, color:'#1A141A' }}>✏️ Modifier — {editTarget.first_name} {editTarget.last_name}</h2>
              <button onClick={() => setEditTarget(null)} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#8E5915' }}>×</button>
            </div>
            <form onSubmit={handleEdit} style={{ padding:24 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                <div>
                  <label style={labelStyle}>Prénom *</label>
                  <input required value={editForm.first_name} onChange={e => setEditForm({...editForm, first_name:e.target.value})} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Nom *</label>
                  <input required value={editForm.last_name} onChange={e => setEditForm({...editForm, last_name:e.target.value})} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Rôle *</label>
                  <select required value={editForm.role} onChange={e => setEditForm({...editForm, role:e.target.value})} style={inputStyle}>
                    <option value="EMPLOYE">👷 Employé</option>
                    <option value="COMPTABLE">📊 Comptable</option>
                    <option value="GERANT">⭐ Gérant</option>
                    <option value="ADMIN">👑 Admin</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Téléphone</label>
                  <input value={editForm.phone} onChange={e => setEditForm({...editForm, phone:e.target.value})} placeholder="+212 6XX XXX XXX" style={inputStyle} />
                </div>
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={labelStyle}>Email</label>
                  <input type="email" value={editForm.email} onChange={e => setEditForm({...editForm, email:e.target.value})} style={inputStyle} />
                </div>
              </div>
              {editError && (
                <div style={{ background:'#FFF0F0', border:'1px solid #FFCDD2', borderRadius:8, padding:'8px 12px', marginBottom:16, fontSize:12, color:'#D32F2F' }}>⚠️ {editError}</div>
              )}
              <div style={{ display:'flex', justifyContent:'flex-end', gap:10, paddingTop:16, borderTop:'1px solid #F5E6D3' }}>
                <button type="button" onClick={() => setEditTarget(null)} style={btnSecondary}>Annuler</button>
                <button type="submit" disabled={editing} style={{ ...btnPrimary, opacity:editing?0.7:1, cursor:editing?'not-allowed':'pointer' }}>
                  {editing ? 'Enregistrement...' : '✓ Enregistrer'}
                </button>
              </div>
            </form>

            {/* Compte email professionnel Hostinger */}
            {canMng && (
              <div style={{ margin:'0 24px 24px', padding:18, borderRadius:12, border:'1px solid #F5E6D3', background:'#FFFDF5' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                  <Mail size={15} color="#8E5915" />
                  <h3 style={{ margin:0, fontSize:13.5, fontWeight:800, color:'#1A141A' }}>Compte email professionnel (Hostinger)</h3>
                  {mailConfigured && (
                    <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:10.5, fontWeight:700, color:'#16A34A', background:'#F0FFF4', border:'1px solid #BBF7D0', borderRadius:6, padding:'2px 8px', marginLeft:'auto' }}>
                      <ShieldCheck size={11} /> Configuré
                    </span>
                  )}
                </div>

                {mailLoading ? (
                  <p style={{ fontSize:12.5, color:'#B8A090' }}>Chargement...</p>
                ) : (
                  <>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
                      <div style={{ gridColumn:'1/-1' }}>
                        <label style={labelStyle}>Adresse email Hostinger *</label>
                        <input type="email" value={mailForm.email_address} onChange={e => setMailForm({...mailForm, email_address:e.target.value})} placeholder="karim@etcc.ma" style={inputStyle} />
                      </div>
                      <div style={{ gridColumn:'1/-1' }}>
                        <label style={labelStyle}>{mailConfigured ? 'Nouveau mot de passe (laisser vide pour conserver)' : 'Mot de passe *'}</label>
                        <input type="password" value={mailForm.password} onChange={e => setMailForm({...mailForm, password:e.target.value})} placeholder="••••••••" style={{...inputStyle, fontFamily:'monospace'}} />
                      </div>
                      <div>
                        <label style={labelStyle}>Hôte IMAP *</label>
                        <input value={mailForm.imap_host} onChange={e => setMailForm({...mailForm, imap_host:e.target.value})} placeholder="imap.hostinger.com" style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Port IMAP</label>
                        <input type="number" value={mailForm.imap_port} onChange={e => setMailForm({...mailForm, imap_port: Number(e.target.value)})} style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Hôte SMTP *</label>
                        <input value={mailForm.smtp_host} onChange={e => setMailForm({...mailForm, smtp_host:e.target.value})} placeholder="smtp.hostinger.com" style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Port SMTP</label>
                        <input type="number" value={mailForm.smtp_port} onChange={e => setMailForm({...mailForm, smtp_port: Number(e.target.value)})} style={inputStyle} />
                      </div>
                    </div>

                    {mailError && (
                      <div style={{ background:'#FFF0F0', border:'1px solid #FFCDD2', borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:12, color:'#D32F2F' }}>⚠️ {mailError}</div>
                    )}
                    {mailTestResult && (
                      <div style={{ marginBottom:12, padding:'8px 12px', borderRadius:8, fontSize:12, fontWeight:600, background: mailTestResult.success ? '#F0FFF4' : '#FFF5F5', border:`1px solid ${mailTestResult.success ? '#BBF7D0' : '#FECACA'}`, color: mailTestResult.success ? '#16A34A' : '#DC2626' }}>
                        {mailTestResult.success ? '✓ Connexion réussie' : `✗ ${mailTestResult.message || 'Échec de connexion'}`}
                      </div>
                    )}

                    <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                      <button type="button" onClick={handleSaveMailAccount} disabled={mailSaving}
                        style={{ ...btnPrimary, display:'inline-flex', alignItems:'center', gap:6, opacity:mailSaving?0.7:1 }}>
                        {mailSaving ? '...' : '✓ Enregistrer la boîte mail'}
                      </button>
                      {mailConfigured && (
                        <>
                          <button type="button" onClick={handleTestMailAccount} disabled={mailTesting}
                            style={{ ...btnSecondary, display:'inline-flex', alignItems:'center', gap:6, opacity:mailTesting?0.7:1 }}>
                            <RefreshCw size={12} /> {mailTesting ? '...' : 'Tester la connexion'}
                          </button>
                          <button type="button" onClick={handleRemoveMailAccount} disabled={mailRemoving}
                            style={{ padding:'9px 18px', borderRadius:8, border:'1.5px solid #FECACA', background:'#FFF5F5', color:'#DC2626', fontSize:13, fontWeight:600, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6, opacity:mailRemoving?0.7:1 }}>
                            <XCircle size={12} /> {mailRemoving ? '...' : 'Retirer'}
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL Réinitialiser MDP */}
      {resetTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setResetTarget(null)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.5)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:420, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', padding:28 }}>
            <h2 style={{ margin:'0 0 18px', fontSize:16, fontWeight:700, color:'#1A141A' }}>🔑 Réinitialiser le mot de passe</h2>
            <p style={{ fontSize:13, color:'#8E5915', marginBottom:18 }}>Compte : <strong>@{resetTarget.username}</strong></p>
            <div style={{ marginBottom:16 }}>
              <label style={labelStyle}>Nouveau mot de passe *</label>
              <div style={{ display:'flex', gap:8 }}>
                <input value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Nouveau mot de passe" style={{...inputStyle, fontFamily:'monospace', flex:1}} />
                <button type="button" onClick={() => generatePassword('reset')} disabled={genLoading}
                  style={{ padding:'9px 14px', borderRadius:8, border:'1.5px solid #E8D4B0', background:'#FDF6E9', color:'#8E5915', fontSize:12, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}>
                  {genLoading ? '...' : '🎲 Générer'}
                </button>
              </div>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setResetTarget(null)} style={{ ...btnSecondary, flex:1 }}>Annuler</button>
              <button onClick={handleResetPassword} disabled={resetting || !newPassword.trim()}
                style={{ ...btnPrimary, flex:1, opacity:(resetting || !newPassword.trim())?0.6:1, cursor:(resetting || !newPassword.trim())?'not-allowed':'pointer' }}>
                {resetting ? 'Réinitialisation...' : '✓ Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP Désactiver employé */}
      {deleteTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setDeleteTarget(null)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.6)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:420, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.3)', padding:28 }}>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ width:56, height:56, borderRadius:'50%', background:'#FFF0F0', border:'2px solid #FECACA', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, margin:'0 auto 14px' }}>🔒</div>
              <h3 style={{ margin:'0 0 8px', fontSize:17, fontWeight:700, color:'#1A141A' }}>Désactiver cet employé ?</h3>
              <p style={{ margin:0, fontSize:13, color:'#8E5915' }}>
                <strong>{deleteTarget.first_name} {deleteTarget.last_name}</strong> ne pourra plus se connecter à la plateforme.
              </p>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setDeleteTarget(null)} style={{ ...btnSecondary, flex:1 }}>Annuler</button>
              <button onClick={handleDelete} disabled={deleting} style={{ ...btnDanger, flex:1, opacity:deleting?0.7:1, cursor:deleting?'not-allowed':'pointer' }}>
                {deleting ? 'Désactivation...' : '🔒 Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
