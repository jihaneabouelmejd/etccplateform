'use client';

import { useState, useEffect, useRef } from 'react';
import { Settings, Building2, Pen, Users, Bell, Hash, Pencil, Trash2, KeyRound, Plus, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n';
import api, { companyApi, usersApi, signaturesApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

const tabs = [
  { id: 'societe',       label: 'Société',       icon: Building2 },
  { id: 'signatures',    label: 'Signatures',    icon: Pen },
  { id: 'utilisateurs',  label: 'Utilisateurs',  icon: Users },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'numerotation',  label: 'Numérotation',  icon: Hash },
];

const inputStyle = { width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E8D4B0', fontSize:13, outline:'none', boxSizing:'border-box' as const };
const labelStyle = { display:'block' as const, fontSize:11, fontWeight:700 as const, color:'#8E5915', textTransform:'uppercase' as const, letterSpacing:0.5, marginBottom:6 };
const btnSecondary = { padding:'9px 18px', borderRadius:8, border:'1.5px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:13, fontWeight:600 as const, cursor:'pointer' as const };
const btnPrimary   = { padding:'9px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#F4B315,#E59312)', color:'#1A141A', fontSize:13, fontWeight:700 as const, cursor:'pointer' as const };
const btnDanger    = { padding:'9px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#EF4444,#DC2626)', color:'white', fontSize:13, fontWeight:700 as const, cursor:'pointer' as const };

const roleLabel: Record<string, string> = {
  ADMIN: '👑 Admin', GERANT: '⭐ Gérant', COMPTABLE: '📊 Comptable', EMPLOYE: '👷 Employé',
};

const defaultNotifRules = [
  { key: 'overdue_invoice',    label: "Facture impayée à l'échéance",       enabled: true },
  { key: 'low_stock',          label: 'Stock bas (< seuil minimum)',         enabled: true },
  { key: 'no_invoice_payment', label: 'Virement sans facture détecté',       enabled: true },
  { key: 'expense_submitted',  label: 'Dépense soumise (en attente)',        enabled: true },
  { key: 'expired_devis',      label: 'Devis expiré',                        enabled: false },
  { key: 'tva_monthly',        label: 'TVA à déclarer (fin de mois)',        enabled: true },
];

const emptyUserForm = { first_name: '', last_name: '', username: '', email: '', password: '', role: 'EMPLOYE' };

// ⚠️ Defined OUTSIDE ParametresPage so React never recreates it on each render.
// If defined inside, every keystroke unmounts+remounts the input → focus lost.
const Field = ({ label, value, onChange, type = 'text', placeholder = '' }: {
  label: string; value: any; onChange: (v: string) => void; type?: string; placeholder?: string;
}) => (
  <div>
    <label className="block text-xs font-semibold text-honey-caramel uppercase tracking-wide mb-1.5">{label}</label>
    <input type={type} value={value || ''} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} className="input text-sm" />
  </div>
);

export default function ParametresPage() {
  const [activeTab, setActiveTab]   = useState('societe');
  const [company, setCompany]       = useState<any>({});
  const [users, setUsers]           = useState<any[]>([]);
  const [signatures, setSignatures] = useState<any[]>([]);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [notifRules, setNotifRules] = useState(defaultNotifRules);
  const { user } = useAuth();

  // Create user modal
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [userForm, setUserForm]             = useState({ ...emptyUserForm });
  const [userSaving, setUserSaving]         = useState(false);
  const [userError, setUserError]           = useState('');

  // Reset password modal
  const [resetTarget, setResetTarget]   = useState<any>(null);
  const [newPassword, setNewPassword]   = useState('');
  const [resetSaving, setResetSaving]   = useState(false);
  const [resetError, setResetError]     = useState('');

  // Logo upload
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError]         = useState('');
  const logoFileRef = useRef<HTMLInputElement>(null);

  // Signature upload
  const [showSigModal, setShowSigModal] = useState(false);
  const [sigName, setSigName]           = useState('');
  const [sigPreview, setSigPreview]     = useState('');
  const [sigFile, setSigFile]           = useState<File | null>(null);
  const [sigSaving, setSigSaving]       = useState(false);
  const [sigError, setSigError]         = useState('');
  const sigFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    companyApi.get().then((r) => setCompany(r.data)).catch(() => {});
    usersApi.list().then((r) => setUsers(r.data.data || [])).catch(() => {});
    signaturesApi.list().then((r) => setSignatures(r.data || [])).catch(() => {});
  }, []);

  const saveCompany = async () => {
    setSaving(true);
    try {
      await companyApi.update(company);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    setLogoError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const { data } = await (await import('@/lib/api')).default.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = data.url || `/api/upload/files/${data.filename}`;
      const updated = { ...company, logo_url: url };
      setCompany(updated);
      await companyApi.update(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setLogoError('Erreur lors du telechargement du logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const removeLogo = async () => {
    const updated = { ...company, logo_url: null };
    setCompany(updated);
    try { await companyApi.update(updated); } catch {}
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserSaving(true); setUserError('');
    try {
      await usersApi.create(userForm);
      const r = await usersApi.list();
      setUsers(r.data.data || []);
      setShowCreateUser(false);
      setUserForm({ ...emptyUserForm });
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setUserError(Array.isArray(msg) ? msg.join(', ') : (msg || 'Erreur'));
    } finally {
      setUserSaving(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget || !newPassword) return;
    setResetSaving(true); setResetError('');
    try {
      await usersApi.resetPassword(resetTarget.id, newPassword);
      setResetTarget(null);
      setNewPassword('');
    } catch (err: any) {
      const msg = err?.response?.data?.message;
      setResetError(Array.isArray(msg) ? msg.join(', ') : (msg || 'Erreur'));
    } finally {
      setResetSaving(false);
    }
  };

  const handleSigFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSigFile(file);
    const reader = new FileReader();
    reader.onload = ev => setSigPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleSigUpload = async () => {
    if (!sigFile || !sigName) return;
    setSigSaving(true);
    setSigError('');
    try {
      // Step 1: upload the image file → get a proper URL (avoids base64 body-size limit)
      const fd = new FormData();
      fd.append('file', sigFile);
      const uploadRes = await api.post('/upload', fd);
      const imageUrl = uploadRes.data?.url || `/api/upload/files/${uploadRes.data?.filename}`;
      if (!imageUrl) throw new Error('URL de signature non retournée par le serveur');

      // Step 2: save signature record with the URL
      await signaturesApi.create({ name: sigName, image_url: imageUrl, type: 'UPLOADED' });
      const r = await signaturesApi.list();
      setSignatures(r.data || []);
      setShowSigModal(false);
      setSigName(''); setSigPreview(''); setSigFile(null); setSigError('');
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || 'Erreur lors de l\'ajout de la signature';
      setSigError(Array.isArray(msg) ? msg.join(', ') : String(msg));
    } finally {
      setSigSaving(false);
    }
  };

  const toggleNotif = (key: string) => {
    setNotifRules(prev => prev.map(r => r.key === key ? { ...r, enabled: !r.enabled } : r));
  };

  return (
    <div>
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-[22px] font-bold text-honey-dark font-display tracking-tight">Paramètres</h1>
          <p className="text-sm text-honey-caramel mt-0.5">Configuration de la plateforme ETCC</p>
        </div>
      </div>

      <div className="grid grid-cols-[200px_1fr] gap-5">
        {/* Sidebar tabs */}
        <div className="card h-fit">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={cn('w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all mb-1',
                activeTab === t.id
                  ? 'bg-honey-gradient-soft text-honey-dark border border-honey-gold/30'
                  : 'text-honey-caramel hover:bg-honey-cream hover:text-honey-dark'
              )}>
              <t.icon size={15} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div>

          {/* ── SOCIÉTÉ ─────────────────────────────────────────────────────── */}
          {activeTab === 'societe' && (
            <div className="card">

              {/* Logo */}
              <h3 className="text-sm font-semibold text-honey-dark mb-4 pb-3 border-b border-honey-beige-soft">
                Logo de la societe
              </h3>
              <div style={{ display:'flex', alignItems:'center', gap:24, marginBottom:28, padding:20, background:'#FFFDF7', border:'1px solid #F5E6D3', borderRadius:12 }}>
                {/* Preview zone */}
                <div style={{ width:120, height:80, borderRadius:10, border:'2px dashed #E8D4B0', background:'white', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', flexShrink:0 }}>
                  {company.logo_url ? (
                    <img src={company.logo_url} alt="Logo ETCC" style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain' }} />
                  ) : (
                    <div style={{ textAlign:'center' }}>
                      <p style={{ fontSize:26, margin:'0 0 4px' }}>🏗️</p>
                      <p style={{ fontSize:10, color:'#B8977A', margin:0 }}>Aucun logo</p>
                    </div>
                  )}
                </div>
                {/* Actions */}
                <div style={{ flex:1 }}>
                  <p style={{ margin:'0 0 4px', fontSize:13, fontWeight:700, color:'#1A141A' }}>Logo ETCC</p>
                  <p style={{ margin:'0 0 14px', fontSize:12, color:'#8E5915' }}>
                    Utilise sur les factures, devis, bons de commande. Formats acceptes : PNG, JPG, SVG.
                  </p>
                  <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                    <button
                      type="button"
                      disabled={uploadingLogo}
                      onClick={() => logoFileRef.current?.click()}
                      style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 16px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#F4B315,#E59312)', color:'#1A141A', fontSize:13, fontWeight:700, cursor:'pointer', opacity:uploadingLogo?0.6:1 }}>
                      <Upload size={14} />
                      {uploadingLogo ? 'Telechargement...' : (company.logo_url ? 'Changer le logo' : 'Importer le logo')}
                    </button>
                    {company.logo_url && (
                      <button
                        type="button"
                        onClick={removeLogo}
                        style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:8, border:'1px solid #FFCDD2', background:'#FFF0F0', color:'#D32F2F', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                        <X size={13} /> Supprimer
                      </button>
                    )}
                    <input ref={logoFileRef} type="file" accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp"
                      onChange={handleLogoUpload} style={{ display:'none' }} />
                  </div>
                  {logoError && (
                    <p style={{ margin:'8px 0 0', fontSize:12, color:'#D32F2F' }}>⚠️ {logoError}</p>
                  )}
                </div>
              </div>

              <h3 className="text-sm font-semibold text-honey-dark mb-4 pb-3 border-b border-honey-beige-soft">
                Informations légales de la société
              </h3>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <Field label="Nom commercial *" value={company.commercial_name}
                  onChange={(v: string) => setCompany({ ...company, commercial_name: v })} />
                <Field label="Raison sociale" value={company.legal_name}
                  onChange={(v: string) => setCompany({ ...company, legal_name: v })} />
                <Field label="ICE *" value={company.ice} placeholder="002345678900045"
                  onChange={(v: string) => setCompany({ ...company, ice: v })} />
                <Field label="RC" value={company.rc}
                  onChange={(v: string) => setCompany({ ...company, rc: v })} />
                <Field label="IF (Identifiant fiscal)" value={company.if}
                  onChange={(v: string) => setCompany({ ...company, if: v })} />
                <Field label="CNSS" value={company.cnss}
                  onChange={(v: string) => setCompany({ ...company, cnss: v })} />
                <Field label="Adresse *" value={company.address_line}
                  onChange={(v: string) => setCompany({ ...company, address_line: v })} />
                <Field label="Ville" value={company.city}
                  onChange={(v: string) => setCompany({ ...company, city: v })} />
                <Field label="Téléphone" value={company.phone}
                  onChange={(v: string) => setCompany({ ...company, phone: v })} />
                <Field label="Email" type="email" value={company.email}
                  onChange={(v: string) => setCompany({ ...company, email: v })} />
              </div>

              <h3 className="text-sm font-semibold text-honey-dark mb-4 pb-3 border-b border-honey-beige-soft mt-6">
                Coordonnées bancaires (affichées sur les factures)
              </h3>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <Field label="Banque" value={company.bank_name}
                  onChange={(v: string) => setCompany({ ...company, bank_name: v })} />
                <Field label="RIB" value={company.rib} placeholder="007 780 000..."
                  onChange={(v: string) => setCompany({ ...company, rib: v })} />
                <Field label="IBAN" value={company.iban}
                  onChange={(v: string) => setCompany({ ...company, iban: v })} />
                <Field label="SWIFT/BIC" value={company.swift}
                  onChange={(v: string) => setCompany({ ...company, swift: v })} />
              </div>

              <div className="flex justify-end">
                <button onClick={saveCompany} disabled={saving} className="btn-primary">
                  {saved ? '✓ Sauvegardé!' : saving ? 'Sauvegarde...' : 'Sauvegarder'}
                </button>
              </div>
            </div>
          )}

          {/* ── SIGNATURES ──────────────────────────────────────────────────── */}
          {activeTab === 'signatures' && (
            <div className="card">
              <div className="flex justify-between items-center mb-4 pb-3 border-b border-honey-beige-soft">
                <h3 className="text-sm font-semibold text-honey-dark">Bibliothèque de signatures</h3>
                <button onClick={() => { setShowSigModal(true); setSigName(''); setSigPreview(''); setSigFile(null); setSigError(''); }}
                  className="btn-primary text-xs">
                  <Plus size={12} /> Ajouter
                </button>
              </div>
              {signatures.length === 0 ? (
                <div className="py-12 text-center text-honey-caramel">
                  <Pen size={32} className="mx-auto mb-3 opacity-30" />
                  <p>Aucune signature enregistrée</p>
                  <p className="text-xs mt-1">Ajoutez une signature PNG, dessinée ou photo de cachet</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4 mb-4">
                  {signatures.map((sig: any) => (
                    <div key={sig.id} className={cn('border rounded-lg p-4 text-center relative',
                      sig.is_default ? 'border-honey-gold bg-honey-cream/50' : 'border-honey-beige-soft'
                    )}>
                      {/* Bouton supprimer — coin haut gauche */}
                      <button
                        onClick={async () => {
                          if (!confirm(`Supprimer la signature "${sig.name}" ?`)) return;
                          try {
                            await signaturesApi.delete(sig.id);
                            const r = await signaturesApi.list();
                            setSignatures(r.data || []);
                          } catch (e: any) {
                            alert(e?.response?.data?.message || 'Erreur lors de la suppression');
                          }
                        }}
                        className="absolute top-2 left-2 w-6 h-6 flex items-center justify-center rounded-full bg-red-50 border border-red-200 text-red-400 hover:bg-red-100 hover:text-red-600 transition-all"
                        title="Supprimer cette signature"
                      >
                        <Trash2 size={11} />
                      </button>

                      {sig.is_default && (
                        <span className="absolute top-2 right-2 text-[10px] bg-honey-gold text-honey-dark px-2 py-0.5 rounded-full font-semibold">
                          Défaut
                        </span>
                      )}
                      <div className="h-16 bg-white rounded border border-honey-beige-soft flex items-center justify-center mb-3">
                        <img src={sig.image_url} alt={sig.name} className="max-h-12 max-w-full object-contain" />
                      </div>
                      <p className="text-xs font-medium text-honey-dark">{sig.name}</p>
                      <p className="text-[11px] text-honey-caramel mt-0.5">{sig.type}</p>
                      {!sig.is_default && (
                        <button
                          onClick={() => signaturesApi.setDefault(sig.id).then(() => signaturesApi.list().then(r => setSignatures(r.data || [])))}
                          className="text-[11px] text-honey-orange hover:underline mt-2"
                        >
                          Définir par défaut
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-honey-beige-soft">
                {[
                  { icon: '📤', label: 'Importer image', sub: 'PNG, JPG', onClick: () => { setShowSigModal(true); setSigName(''); setSigPreview(''); setSigFile(null); setSigError(''); } },
                  { icon: '✍️', label: 'Dessiner', sub: 'Souris / Tablette', onClick: () => {} },
                  { icon: '📷', label: 'Photo cachet', sub: 'Depuis caméra', onClick: () => {} },
                ].map((opt) => (
                  <button key={opt.label} onClick={opt.onClick}
                    className="border-2 border-dashed border-honey-beige rounded-lg p-4 text-center hover:border-honey-gold hover:bg-honey-cream/50 transition-all">
                    <p className="text-2xl mb-2">{opt.icon}</p>
                    <p className="text-sm font-medium text-honey-dark">{opt.label}</p>
                    <p className="text-xs text-honey-caramel">{opt.sub}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── UTILISATEURS ────────────────────────────────────────────────── */}
          {activeTab === 'utilisateurs' && (
            <div className="card">
              <div className="flex justify-between items-center mb-4 pb-3 border-b border-honey-beige-soft">
                <h3 className="text-sm font-semibold text-honey-dark">Gestion des utilisateurs</h3>
                {user?.role === 'ADMIN' && (
                  <button onClick={() => { setShowCreateUser(true); setUserForm({ ...emptyUserForm }); setUserError(''); }}
                    className="btn-primary text-xs">
                    <Plus size={12} /> Nouveau utilisateur
                  </button>
                )}
              </div>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-honey-cream">
                    {['Utilisateur', 'Rôle', 'Statut', 'Dernière connexion', 'Actions'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-honey-caramel border-b border-honey-beige-soft">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u: any) => (
                    <tr key={u.id} className="border-b border-honey-beige-soft hover:bg-honey-cream/50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-honey-gradient flex items-center justify-center text-[11px] font-bold text-honey-dark flex-shrink-0">
                            {u.first_name?.[0]}{u.last_name?.[0]}
                          </div>
                          <div>
                            <p className="font-medium text-honey-dark">{u.first_name} {u.last_name}</p>
                            <p className="text-[11px] text-honey-caramel font-mono">@{u.username}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs">{roleLabel[u.role]}</td>
                      <td className="px-4 py-3">
                        <span className={cn('badge border text-[10px]', u.is_active ? 'badge-success' : 'bg-gray-50 text-gray-400 border-gray-200')}>
                          {u.is_active ? 'Actif' : 'Inactif'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-honey-caramel">
                        {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString('fr-FR') : 'Jamais'}
                      </td>
                      <td className="px-4 py-3">
                        {user?.role === 'ADMIN' && (
                          <button
                            onClick={() => { setResetTarget(u); setNewPassword(''); setResetError(''); }}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-honey-cream border border-honey-beige-soft text-honey-caramel hover:text-honey-dark hover:border-honey-gold text-xs font-medium transition-all">
                            <KeyRound size={12} /> Réinitialiser mdp
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── NUMÉROTATION ────────────────────────────────────────────────── */}
          {activeTab === 'numerotation' && (
            <div className="card">
              <h3 className="text-sm font-semibold text-honey-dark mb-4 pb-3 border-b border-honey-beige-soft">
                Format de numérotation des documents
              </h3>
              <div className="space-y-4">
                {[
                  { label: 'Devis',           prefix: 'DEV',   example: 'DEV-2026-0089' },
                  { label: 'Bons de commande',prefix: 'BC',    example: 'BC-2026-0067' },
                  { label: 'Bons de livraison',prefix: 'BL',   example: 'BL-2026-0055' },
                  { label: 'Factures émises', prefix: 'FAC',   example: 'FAC-2026-0043' },
                  { label: 'Factures achat',  prefix: 'FAC-A', example: 'FAC-A-2026-0012' },
                ].map((doc) => (
                  <div key={doc.prefix} className="flex items-center gap-4 p-4 bg-honey-cream rounded-lg border border-honey-beige-soft">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-honey-dark">{doc.label}</p>
                      <p className="text-xs text-honey-caramel font-mono mt-0.5">Format: {'{PREFIX}'}-{'{YYYY}'}-{'{0000}'}</p>
                    </div>
                    <div className="font-mono text-sm font-bold text-honey-orange bg-white px-3 py-1.5 rounded border border-honey-beige-soft">
                      {doc.example}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-4 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700">
                ℹ Les numéros sont générés automatiquement et remis à zéro chaque 1er janvier.
              </div>
            </div>
          )}

          {/* ── NOTIFICATIONS ───────────────────────────────────────────────── */}
          {activeTab === 'notifications' && (
            <div className="card">
              <h3 className="text-sm font-semibold text-honey-dark mb-4 pb-3 border-b border-honey-beige-soft">
                Règles de notifications
              </h3>
              <div className="space-y-3">
                {notifRules.map((rule) => (
                  <div key={rule.key} className="flex items-center justify-between p-3.5 border border-honey-beige-soft rounded-lg hover:bg-honey-cream/40 transition-colors">
                    <span className="text-sm text-honey-dark">{rule.label}</span>
                    <button
                      onClick={() => toggleNotif(rule.key)}
                      className={cn('relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                        rule.enabled ? 'bg-honey-gold' : 'bg-gray-200'
                      )}
                    >
                      <span className={cn('inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
                        rule.enabled ? 'translate-x-4' : 'translate-x-1'
                      )} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex justify-end mt-5 pt-4 border-t border-honey-beige-soft">
                <button className="btn-primary text-sm">Sauvegarder les préférences</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MODAL Créer un utilisateur ──────────────────────────────────────── */}
      {showCreateUser && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setShowCreateUser(false)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.5)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:500, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ padding:'18px 24px', borderBottom:'1px solid #F5E6D3', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, background:'white', zIndex:1 }}>
              <h2 style={{ margin:0, fontSize:16, fontWeight:700, color:'#1A141A' }}>👤 Nouvel utilisateur</h2>
              <button onClick={() => setShowCreateUser(false)} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#8E5915' }}>×</button>
            </div>
            <form onSubmit={handleCreateUser} style={{ padding:24 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
                <div>
                  <label style={labelStyle}>Prénom *</label>
                  <input required value={userForm.first_name} onChange={e => setUserForm({...userForm, first_name:e.target.value})}
                    placeholder="Karim" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Nom *</label>
                  <input required value={userForm.last_name} onChange={e => setUserForm({...userForm, last_name:e.target.value})}
                    placeholder="Alami" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Nom d'utilisateur *</label>
                  <input required value={userForm.username} onChange={e => setUserForm({...userForm, username:e.target.value})}
                    placeholder="kalami" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input type="email" value={userForm.email} onChange={e => setUserForm({...userForm, email:e.target.value})}
                    placeholder="k.alami@etcc.ma" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Rôle *</label>
                  <select required value={userForm.role} onChange={e => setUserForm({...userForm, role:e.target.value})} style={inputStyle}>
                    <option value="EMPLOYE">👷 Employé</option>
                    <option value="COMPTABLE">📊 Comptable</option>
                    <option value="GERANT">⭐ Gérant</option>
                    <option value="ADMIN">👑 Admin</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Mot de passe *</label>
                  <input required type="password" value={userForm.password} onChange={e => setUserForm({...userForm, password:e.target.value})}
                    placeholder="••••••••" style={inputStyle} />
                </div>
              </div>
              {userError && (
                <div style={{ background:'#FFF0F0', border:'1px solid #FFCDD2', borderRadius:8, padding:'8px 12px', marginBottom:16, fontSize:12, color:'#D32F2F' }}>
                  ⚠️ {userError}
                </div>
              )}
              <div style={{ display:'flex', justifyContent:'flex-end', gap:10, paddingTop:16, borderTop:'1px solid #F5E6D3' }}>
                <button type="button" onClick={() => setShowCreateUser(false)} style={btnSecondary}>Annuler</button>
                <button type="submit" disabled={userSaving} style={{ ...btnPrimary, opacity:userSaving?0.7:1 }}>
                  {userSaving ? 'Création...' : '+ Créer l\'utilisateur'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL Réinitialiser mot de passe ────────────────────────────────── */}
      {resetTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setResetTarget(null)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.5)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:420, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', padding:28 }}>
            <h3 style={{ margin:'0 0 6px', fontSize:16, fontWeight:700, color:'#1A141A' }}>🔑 Réinitialiser le mot de passe</h3>
            <p style={{ fontSize:13, color:'#8E5915', marginBottom:20 }}>
              Compte : <strong>{resetTarget.first_name} {resetTarget.last_name}</strong> (@{resetTarget.username})
            </p>
            <div style={{ marginBottom:20 }}>
              <label style={labelStyle}>Nouveau mot de passe *</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                placeholder="Minimum 8 caractères" style={inputStyle} />
            </div>
            {resetError && (
              <div style={{ background:'#FFF0F0', border:'1px solid #FFCDD2', borderRadius:8, padding:'8px 12px', marginBottom:16, fontSize:12, color:'#D32F2F' }}>
                ⚠️ {resetError}
              </div>
            )}
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setResetTarget(null)} style={{ ...btnSecondary, flex:1 }}>Annuler</button>
              <button onClick={handleResetPassword} disabled={!newPassword || resetSaving}
                style={{ ...btnPrimary, flex:1, opacity:(!newPassword || resetSaving)?0.5:1 }}>
                {resetSaving ? 'Mise à jour...' : '🔑 Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL Upload signature ───────────────────────────────────────────── */}
      {showSigModal && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setShowSigModal(false)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.5)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:440, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', padding:28 }}>
            <h3 style={{ margin:'0 0 20px', fontSize:16, fontWeight:700, color:'#1A141A' }}>✍️ Ajouter une signature</h3>
            <div style={{ marginBottom:16 }}>
              <label style={labelStyle}>Nom de la signature *</label>
              <input value={sigName} onChange={e => setSigName(e.target.value)}
                placeholder="Ex: Cachet société" style={inputStyle} />
            </div>
            <div
              onClick={() => sigFileRef.current?.click()}
              style={{ border:'2px dashed #E8D4B0', borderRadius:10, padding:24, textAlign:'center', cursor:'pointer', marginBottom:16, transition:'all 0.2s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#F4B315')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#E8D4B0')}
            >
              {sigPreview ? (
                <img src={sigPreview} alt="preview" style={{ maxHeight:80, maxWidth:'100%', objectFit:'contain', margin:'0 auto' }} />
              ) : (
                <>
                  <p style={{ fontSize:28, margin:'0 0 8px' }}>📤</p>
                  <p style={{ fontSize:13, fontWeight:600, color:'#1A141A', margin:0 }}>Cliquez pour choisir un fichier</p>
                  <p sty