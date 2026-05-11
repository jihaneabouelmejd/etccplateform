'use client';

import { useState, useEffect } from 'react';
import { projectsApi, clientsApi, devisApi } from '@/lib/api';
import { useLanguage } from '@/lib/i18n';

/* --- types --- */
interface Project {
  id: string; code: string; name: string;
  client?: { id: string; commercial_name: string };
  budget_amount: number; progress: number; status: string;
  city?: string; description?: string;
  start_date?: string; end_date?: string; client_id?: string;
}
interface Client { id: string; commercial_name: string; }
interface Prestation {
  id: string; nom: string; client: string; montant: number;
  date_debut: string; date_fin: string; description: string;
  statut: 'EN_COURS' | 'TERMINE' | 'ANNULE';
  devis_id?: string;
}

const PREST_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  EN_COURS: { label: 'En cours',  color: '#1565C0', bg: '#E3F2FD' },
  TERMINE:  { label: 'Terminé',   color: '#2E7D32', bg: '#E8F5E9' },
  ANNULE:   { label: 'Annule',    color: '#B71C1C', bg: '#FFEBEE' },
};

const emptyPrestation: Omit<Prestation, 'id'> = { nom: '', client: '', montant: 0, date_debut: '', date_fin: '', description: '', statut: 'EN_COURS', devis_id: '' };

function loadPrestations(): Prestation[] {
  try { const s = localStorage.getItem('etcc_prestations'); return s ? JSON.parse(s) : []; } catch { return []; }
}
function savePrestations(list: Prestation[]) {
  try { localStorage.setItem('etcc_prestations', JSON.stringify(list)); } catch {}
}

/* --- config --- */
const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  ACTIVE:    { label: 'En cours',  color: '#1565C0', bg: '#E3F2FD' },
  LATE:      { label: 'En retard', color: '#E65100', bg: '#FFF3E0' },
  COMPLETED: { label: 'Terminé',   color: '#2E7D32', bg: '#E8F5E9' },
  ARCHIVED:  { label: 'Archive',   color: '#6D4C41', bg: '#EFEBE9' },
};

const inputStyle = { width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E8D4B0', fontSize:13, outline:'none', boxSizing:'border-box' as const };
const labelStyle = { display:'block' as const, fontSize:11, fontWeight:700 as const, color:'#8E5915', textTransform:'uppercase' as const, letterSpacing:0.5, marginBottom:6 };

const emptyForm = { name:'', city:'', budget:'', client_id:'', start_date:'', end_date:'', description:'', status:'ACTIVE', progress:'0' };

/* --- helpers --- */
function canDelete() {
  try { const u = JSON.parse(localStorage.getItem('user') || '{}'); return u.role === 'ADMIN' || u.role === 'GERANT'; }
  catch { return false; }
}

/* ============================================================ */
export default function ChantiersPage() {
  const [activeTab, setActiveTab] = useState<'chantiers' | 'prestations'>('chantiers');

  /* chantiers state */
  const [projects, setProjects]   = useState<Project[]>([]);
  const [clients, setClients]     = useState<Client[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  /* modals */
  const [showCreate, setShowCreate]   = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  /* form */
  const [form, setForm]         = useState({ ...emptyForm });
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState('');

  const canDel = canDelete();

  /* prestations state */
  const [prestations, setPrestations] = useState<Prestation[]>([]);
  const [showPrestForm, setShowPrestForm] = useState(false);
  const [editPrest, setEditPrest] = useState<Prestation | null>(null);
  const [deletePrest, setDeletePrest] = useState<Prestation | null>(null);
  const [prestForm, setPrestForm] = useState({ ...emptyPrestation });
  const [prestSearch, setPrestSearch] = useState('');

  /* prestation form extras */
  const [prestSource, setPrestSource] = useState<'devis' | 'manuel'>('manuel');
  const [devisList, setDevisList] = useState<any[]>([]);
  const [clientMode, setClientMode] = useState<'list' | 'autre'>('list');
  const [clientCustom, setClientCustom] = useState('');

  useEffect(() => { setPrestations(loadPrestations()); }, []);

  useEffect(() => {
    devisApi.list({ status: 'VALIDATED', limit: 200 }).then(r => {
      const list = Array.isArray(r.data) ? r.data : (r.data?.data || []);
      setDevisList(list);
    }).catch(() => {});
  }, []);

  const savePrest = (e: React.FormEvent) => {
    e.preventDefault();
    let updated: Prestation[];
    if (editPrest) {
      updated = prestations.map(p => p.id === editPrest.id ? { ...editPrest, ...prestForm } : p);
    } else {
      updated = [...prestations, { ...prestForm, id: Date.now().toString() }];
    }
    savePrestations(updated); setPrestations(updated);
    setShowPrestForm(false); setEditPrest(null); setPrestForm({ ...emptyPrestation });
    setPrestSource('manuel'); setClientMode('list'); setClientCustom('');
  };

  const confirmDeletePrest = () => {
    if (!deletePrest) return;
    const updated = prestations.filter(p => p.id !== deletePrest.id);
    savePrestations(updated); setPrestations(updated); setDeletePrest(null);
  };

  const openEditPrest = (p: Prestation) => {
    setEditPrest(p);
    setPrestForm({ nom: p.nom, client: p.client, montant: p.montant, date_debut: p.date_debut, date_fin: p.date_fin, description: p.description, statut: p.statut, devis_id: p.devis_id || '' });
    if (p.devis_id) { setPrestSource('devis'); } else { setPrestSource('manuel'); }
    setClientMode('list');
    setClientCustom('');
    setShowPrestForm(true);
  };

  const filteredPrest = prestations.filter(p => p.nom.toLowerCase().includes(prestSearch.toLowerCase()) || p.client.toLowerCase().includes(prestSearch.toLowerCase()));

  /* -- fetch -- */
  const fetchAll = async () => {
    setLoading(true);
    try {
      const [pRes, cRes] = await Promise.all([projectsApi.list({ search, status: statusFilter || undefined }), clientsApi.list()]);
      const pList = Array.isArray(pRes.data) ? pRes.data : (pRes.data?.data || []);
      const cList = Array.isArray(cRes.data) ? cRes.data : (cRes.data?.data || []);
      setProjects(pList); setClients(cList);
    } catch {} finally { setLoading(false); }
  };
  useEffect(() => { fetchAll(); }, [search, statusFilter]);

  /* -- stats -- */
  const stats = {
    actifs:   projects.filter(p => p.status === 'ACTIVE').length,
    retard:   projects.filter(p => p.status === 'LATE').length,
    budget:   projects.reduce((s,p) => s + (Number(p.budget_amount)||0), 0),
    termines: projects.filter(p => p.status === 'COMPLETED').length,
  };

  /* -- CREATE -- */
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setFormError('');
    try {
      await projectsApi.create({
        name: form.name, city: form.city || undefined,
        budget_amount: parseFloat(form.budget) || 0,
        client_id: form.client_id || undefined,
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
        description: form.description || undefined,
      });
      await fetchAll(); setShowCreate(false); setForm({ ...emptyForm });
    } catch (e: any) {
      const m = e?.response?.data?.message;
      setFormError(Array.isArray(m) ? m.join(', ') : (m || 'Erreur lors de la creation'));
    } finally { setSaving(false); }
  };

  /* -- EDIT -- */
  const openEdit = (p: Project) => {
    setForm({
      name: p.name, city: p.city || '', budget: String(p.budget_amount || ''),
      client_id: p.client?.id || '', start_date: p.start_date?.slice(0,10) || '',
      end_date: p.end_date?.slice(0,10) || '', description: p.description || '',
      status: p.status, progress: String(p.progress ?? 0),
    });
    setEditProject(p); setFormError('');
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!editProject) return;
    setSaving(true); setFormError('');
    try {
      await projectsApi.update(editProject.id, {
        name: form.name, city: form.city || undefined,
        budget_amount: parseFloat(form.budget) || 0,
        client_id: form.client_id || undefined,
        start_date: form.start_date || undefined,
        end_date: form.end_date || undefined,
        description: form.description || undefined,
        status: form.status,
        progress: Math.min(100, Math.max(0, parseInt(form.progress) || 0)),
      });
      await fetchAll(); setEditProject(null);
    } catch (e: any) {
      const m = e?.response?.data?.message;
      setFormError(Array.isArray(m) ? m.join(', ') : (m || 'Erreur lors de la modification'));
    } finally { setSaving(false); }
  };

  /* -- DELETE -- */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await projectsApi.delete(deleteTarget.id);
      await fetchAll(); setDeleteTarget(null);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Erreur lors de la suppression');
    } finally { setDeleting(false); }
  };

  /* -- filtered -- */
  const filtered = projects.filter(p =>
    (!statusFilter || p.status === statusFilter) &&
    (p.name?.toLowerCase().includes(search.toLowerCase()) ||
     p.code?.toLowerCase().includes(search.toLowerCase()) ||
     p.client?.commercial_name?.toLowerCase().includes(search.toLowerCase()))
  );

  /* ------------------- RENDER ------------------- */
  return (
    <div>
      {/* En-tete */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
        <div>
          <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:'#1A141A' }}>
            {activeTab === 'chantiers' ? 'Chantiers' : 'Prestations'}
          </h1>
          <p style={{ margin:'4px 0 0', fontSize:13, color:'#8E5915' }}>
            {activeTab === 'chantiers' ? 'Gestion et suivi des projets de construction' : 'Gestion des prestations de service'}
          </p>
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          {/* Tab toggle */}
          <div style={{ display:'flex', background:'#FDF6E9', borderRadius:10, padding:3, border:'1px solid #E8D4B0' }}>
            {(['chantiers','prestations'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                style={{ padding:'7px 16px', borderRadius:8, border:'none', background: activeTab===tab ? 'linear-gradient(135deg,#F4B315,#E59312)' : 'transparent', color: activeTab===tab ? '#1A141A' : '#8E5915', fontWeight:700, fontSize:12, cursor:'pointer', textTransform:'capitalize' as const }}>
                {tab === 'chantiers' ? 'Chantiers' : 'Prestations'}
              </button>
            ))}
          </div>
          {activeTab === 'chantiers' ? (
            <button onClick={() => { setForm({...emptyForm}); setFormError(''); setShowCreate(true); }}
              style={{ padding:'10px 18px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#F4B315,#E59312)', color:'#1A141A', fontWeight:700, fontSize:13, cursor:'pointer' }}>
              + Nouveau chantier
            </button>
          ) : (
            <button onClick={() => { setPrestForm({...emptyPrestation}); setEditPrest(null); setPrestSource('manuel'); setClientMode('list'); setClientCustom(''); setShowPrestForm(true); }}
              style={{ padding:'10px 18px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#F4B315,#E59312)', color:'#1A141A', fontWeight:700, fontSize:13, cursor:'pointer' }}>
              + Nouvelle prestation
            </button>
          )}
        </div>
      </div>

      {activeTab === 'chantiers' && <>
      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'Actifs',       val: stats.actifs,   color:'#F4B315' },
          { label:'En retard',    val: stats.retard,   color:'#E65100' },
          { label:'Budget total', val: stats.budget > 0 ? `${(stats.budget/1000).toFixed(0)}K MAD` : '0K', color:'#1565C0' },
          { label:'Terminés',     val: stats.termines, color:'#2E7D32' },
        ].map(k => (
          <div key={k.label} style={{ background:'white', borderRadius:10, padding:'14px 16px', borderLeft:`3px solid ${k.color}`, boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
            <p style={{ margin:'0 0 6px', fontSize:10, fontWeight:700, color:'#8E5915', textTransform:'uppercase' }}>{k.label}</p>
            <p style={{ margin:0, fontSize:20, fontWeight:800, color:'#1A141A', fontFamily:'monospace' }}>{k.val}</p>
          </div>
        ))}
      </div>

      {/* Filtres */}
      <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un chantier, code..."
          style={{ flex:1, minWidth:200, padding:'8px 12px', borderRadius:8, border:'1.5px solid #E8D4B0', fontSize:13, outline:'none', boxSizing:'border-box' as const, background:'white' }} />
        <div style={{ display:'flex', gap:6 }}>
          {['','ACTIVE','LATE','COMPLETED','ARCHIVED'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              style={{ padding:'7px 14px', borderRadius:8, border:`1.5px solid ${statusFilter===s ? '#F4B315' : '#E8D4B0'}`, background: statusFilter===s ? 'rgba(244,179,21,0.12)' : 'white', color: statusFilter===s ? '#1A141A' : '#8E5915', fontSize:11, fontWeight:600, cursor:'pointer' }}>
              {s === '' ? 'Tous' : STATUS_CFG[s]?.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tableau */}
      <div style={{ background:'white', borderRadius:10, boxShadow:'0 1px 4px rgba(0,0,0,0.06)', overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
          <thead>
            <tr style={{ background:'#FDF6E9' }}>
              {['Code','Chantier','Client','Budget','Avancement','Statut','Actions'].map(h => (
                <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:700, color:'#8E5915', textTransform:'uppercase', borderBottom:'1px solid #F5E6D3' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding:40, textAlign:'center', color:'#8E5915' }}>Chargement...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding:40, textAlign:'center', color:'#8E5915' }}>Aucun chantier trouve</td></tr>
            ) : filtered.map(p => {
              const st = STATUS_CFG[p.status] || STATUS_CFG.ACTIVE;
              return (
                <tr key={p.id} style={{ borderBottom:'1px solid #F5E6D3' }}>
                  <td style={{ padding:'12px 14px', fontFamily:'monospace', fontSize:11, color:'#8E5915', fontWeight:600 }}>{p.code}</td>
                  <td style={{ padding:'12px 14px', fontWeight:600, color:'#1A141A' }}>
                    {p.name}
                    {p.city && <span style={{ display:'block', fontSize:11, color:'#8E5915', fontWeight:400 }}>{p.city}</span>}
                  </td>
                  <td style={{ padding:'12px 14px', color:'#423738' }}>{p.client?.commercial_name || '—'}</td>
                  <td style={{ padding:'12px 14px', fontFamily:'monospace', fontWeight:700, color:'#1A141A' }}>
                    {Number(p.budget_amount||0).toLocaleString('fr-FR')} MAD
                  </td>
                  <td style={{ padding:'12px 14px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ flex:1, height:6, background:'#F5E6D3', borderRadius:3, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${p.progress||0}%`, background:'linear-gradient(90deg,#F4B315,#E59312)', borderRadius:3 }} />
                      </div>
                      <span style={{ fontSize:11, fontWeight:700, fontFamily:'monospace', minWidth:30 }}>{p.progress||0}%</span>
                    </div>
                  </td>
                  <td style={{ padding:'12px 14px' }}>
                    <span style={{ padding:'4px 10px', borderRadius:20, fontSize:11, fontWeight:600, color:st.color, background:st.bg }}>{st.label}</span>
                  </td>
                  <td style={{ padding:'12px 14px' }}>
                    <div style={{ display:'flex', gap:6 }}>
                      <button onClick={() => openEdit(p)}
                        title="Modifier"
                        style={{ padding:'5px 10px', borderRadius:7, border:'1.5px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                        Modifier
                      </button>
                      {canDel && (
                        <button onClick={() => setDeleteTarget(p)}
                          title="Supprimer"
                          style={{ padding:'5px 10px', borderRadius:7, border:'1.5px solid #FFCDD2', background:'#FFF0F0', color:'#D32F2F', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                          Supprimer
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

      </>}

      {/* ======= ONGLET PRESTATIONS ======= */}
      {activeTab === 'prestations' && (
        <div>
          <div style={{ display:'flex', gap:10, marginBottom:14 }}>
            <input value={prestSearch} onChange={e => setPrestSearch(e.target.value)} placeholder="Rechercher une prestation..."
              style={{ flex:1, padding:'8px 12px', borderRadius:8, border:'1.5px solid #E8D4B0', fontSize:13, outline:'none', background:'white' }} />
          </div>

          <div style={{ background:'white', borderRadius:10, boxShadow:'0 1px 4px rgba(0,0,0,0.06)', overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#FDF6E9' }}>
                  {['Nom de la prestation','Client','Montant','Periode','Statut','Actions'].map(h => (
                    <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:700, color:'#8E5915', textTransform:'uppercase', borderBottom:'1px solid #F5E6D3' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredPrest.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding:40, textAlign:'center', color:'#8E5915' }}>
                    Aucune prestation. Cliquez sur &quot;+ Nouvelle prestation&quot; pour commencer.
                  </td></tr>
                ) : filteredPrest.map(p => {
                  const st = PREST_STATUS[p.statut];
                  return (
                    <tr key={p.id} style={{ borderBottom:'1px solid #F5E6D3' }}>
                      <td style={{ padding:'12px 14px', fontWeight:600, color:'#1A141A' }}>
                        {p.nom}
                        {p.devis_id && <span style={{ display:'block', fontSize:10, color:'#8E5915', fontWeight:400 }}>Lie a un devis</span>}
                      </td>
                      <td style={{ padding:'12px 14px', color:'#423738' }}>{p.client || '—'}</td>
                      <td style={{ padding:'12px 14px', fontFamily:'monospace', fontWeight:700, color:'#1A141A' }}>
                        {Number(p.montant||0).toLocaleString('fr-FR')} MAD
                      </td>
                      <td style={{ padding:'12px 14px', fontSize:12, color:'#8E5915' }}>
                        {p.date_debut || '—'}{p.date_fin ? ` -> ${p.date_fin}` : ''}
                      </td>
                      <td style={{ padding:'12px 14px' }}>
                        <span style={{ padding:'4px 10px', borderRadius:20, fontSize:11, fontWeight:600, color:st?.color, background:st?.bg }}>{st?.label}</span>
                      </td>
                      <td style={{ padding:'12px 14px' }}>
                        <div style={{ display:'flex', gap:6 }}>
                          <button onClick={() => openEditPrest(p)}
                            style={{ padding:'5px 10px', borderRadius:7, border:'1.5px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                            Modifier
                          </button>
                          {canDel && (
                            <button onClick={() => setDeletePrest(p)}
                              style={{ padding:'5px 10px', borderRadius:7, border:'1.5px solid #FFCDD2', background:'#FFF0F0', color:'#D32F2F', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                              Supprimer
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
        </div>
      )}

      {/* ======= MODAL PRESTATION ======= */}
      {showPrestForm && (
        <Modal title={editPrest ? 'Modifier la prestation' : 'Nouvelle prestation'} onClose={() => { setShowPrestForm(false); setEditPrest(null); setPrestSource('manuel'); setClientMode('list'); setClientCustom(''); }}>
          <form onSubmit={savePrest} style={{ padding:24 }}>

            {/* SOURCE TOGGLE (seulement en creation) */}
            {!editPrest && (
              <div style={{ marginBottom:20 }}>
                <label style={labelS}>Source</label>
                <div style={{ display:'flex', gap:8 }}>
                  {(['devis','manuel'] as const).map(src => (
                    <button key={src} type="button"
                      onClick={() => {
                        setPrestSource(src);
                        if (src === 'manuel') { setPrestForm({...emptyPrestation}); setClientMode('list'); setClientCustom(''); }
                        else { setPrestForm({...emptyPrestation}); }
                      }}
                      style={{ flex:1, padding:'9px 12px', borderRadius:8,
                        border:`1.5px solid ${prestSource===src ? '#F4B315' : '#E8D4B0'}`,
                        background: prestSource===src ? 'rgba(244,179,21,0.13)' : 'white',
                        color: prestSource===src ? '#1A141A' : '#8E5915',
                        fontSize:12, fontWeight:700, cursor:'pointer' }}>
                      {src === 'devis' ? "A partir d'un devis valide" : 'Sans devis (saisie libre)'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>

              {/* SI SOURCE = DEVIS */}
              {prestSource === 'devis' && !editPrest && (
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={labelS}>Choisir le devis *</label>
                  <select required value={prestForm.devis_id || ''}
                    onChange={e => {
                      const chosen = devisList.find(d => d.id === e.target.value);
                      if (chosen) {
                        setPrestForm({
                          ...prestForm,
                          devis_id: chosen.id,
                          nom: chosen.object || chosen.reference || '',
                          client: chosen.client?.commercial_name || '',
                          montant: Number(chosen.total_ttc) || 0,
                        });
                        const found = clients.find(c => c.commercial_name === (chosen.client?.commercial_name || ''));
                        if (found) { setClientMode('list'); } else { setClientMode('autre'); setClientCustom(chosen.client?.commercial_name || ''); }
                      } else {
                        setPrestForm({...prestForm, devis_id:'', nom:'', client:'', montant:0});
                      }
                    }}
                    style={inputS}>
                    <option value="">-- Selectionner un devis --</option>
                    {devisList.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.reference} — {d.client?.commercial_name || '?'} — {Number(d.total_ttc||0).toLocaleString('fr-FR')} MAD{d.object ? ` (${d.object})` : ''}
                      </option>
                    ))}
                    {devisList.length === 0 && <option disabled value="">Aucun devis valide disponible</option>}
                  </select>
                  {prestForm.devis_id && (
                    <div style={{ marginTop:8, padding:'8px 12px', borderRadius:8, background:'rgba(244,179,21,0.1)', border:'1px solid #F4B315', fontSize:12, color:'#8E5915' }}>
                      Nom : <strong style={{ color:'#1A141A' }}>{prestForm.nom || '—'}</strong> | Montant : <strong style={{ color:'#1A141A', fontFamily:'monospace' }}>{Number(prestForm.montant||0).toLocaleString('fr-FR')} MAD</strong>
                    </div>
                  )}
                </div>
              )}

              {/* NOM */}
              <div style={{ gridColumn:'1/-1' }}>
                <label style={labelS}>Nom de la prestation *</label>
                <input required value={prestForm.nom} onChange={e => setPrestForm({...prestForm, nom:e.target.value})}
                  placeholder="Ex: Installation electrique villa" style={inputS} />
              </div>

              {/* CLIENT dropdown + autre */}
              <div style={{ gridColumn:'1/-1' }}>
                <label style={labelS}>Client</label>
                <select value={clientMode === 'autre' ? '__autre__' : (prestForm.client || '')}
                  onChange={e => {
                    if (e.target.value === '__autre__') {
                      setClientMode('autre'); setPrestForm({...prestForm, client: clientCustom});
                    } else {
                      setClientMode('list'); setClientCustom(''); setPrestForm({...prestForm, client: e.target.value});
                    }
                  }}
                  style={inputS}>
                  <option value="">-- Sans client --</option>
                  {clients.map(c => <option key={c.id} value={c.commercial_name}>{c.commercial_name}</option>)}
                  <option value="__autre__">Autre (saisie libre)...</option>
                </select>
                {clientMode === 'autre' && (
                  <input value={clientCustom}
                    onChange={e => { setClientCustom(e.target.value); setPrestForm({...prestForm, client: e.target.value}); }}
                    placeholder="Nom du client..."
                    style={{...inputS, marginTop:8}} />
                )}
              </div>

              {/* MONTANT */}
              <div>
                <label style={labelS}>Montant (MAD) *</label>
                <input required type="number" value={prestForm.montant || ''} onChange={e => setPrestForm({...prestForm, montant:parseFloat(e.target.value)||0})}
                  placeholder="0.00" style={{...inputS, fontFamily:'monospace'}} />
              </div>

              {/* STATUT */}
              <div>
                <label style={labelS}>Statut</label>
                <select value={prestForm.statut} onChange={e => setPrestForm({...prestForm, statut: e.target.value as any})} style={inputS}>
                  {Object.entries(PREST_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>

              {/* DATES */}
              <div>
                <label style={labelS}>Date debut</label>
                <input type="date" value={prestForm.date_debut} onChange={e => setPrestForm({...prestForm, date_debut:e.target.value})} style={inputS} />
              </div>
              <div>
                <label style={labelS}>Date fin</label>
                <input type="date" value={prestForm.date_fin} onChange={e => setPrestForm({...prestForm, date_fin:e.target.value})} style={inputS} />
              </div>

              {/* DESCRIPTION */}
              <div style={{ gridColumn:'1/-1' }}>
                <label style={labelS}>Description</label>
                <textarea value={prestForm.description} onChange={e => setPrestForm({...prestForm, description:e.target.value})}
                  placeholder="Details de la prestation..." rows={2} style={{...inputS, resize:'none'}} />
              </div>
            </div>

            <div style={{ display:'flex', justifyContent:'flex-end', gap:10, paddingTop:16, borderTop:'1px solid #F5E6D3' }}>
              <button type="button" onClick={() => { setShowPrestForm(false); setEditPrest(null); setPrestSource('manuel'); setClientMode('list'); setClientCustom(''); }}
                style={{ padding:'9px 18px', borderRadius:8, border:'1.5px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                Annuler
              </button>
              <button type="submit"
                style={{ padding:'9px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#F4B315,#E59312)', color:'#1A141A', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                {editPrest ? 'Enregistrer' : '+ Créer'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ======= POPUP SUPPRESSION PRESTATION ======= */}
      {deletePrest && (
        <div style={{ position:'fixed', inset:0, zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setDeletePrest(null)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.6)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:420, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.3)', padding:28 }}>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <h3 style={{ margin:'0 0 8px', fontSize:17, fontWeight:800, color:'#1A141A' }}>Supprimer cette prestation ?</h3>
              <p style={{ margin:0, fontSize:13, color:'#8E5915' }}>
                <strong style={{ color:'#1A141A' }}>{deletePrest.nom}</strong> sera definitivement supprimee.
              </p>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setDeletePrest(null)}
                style={{ flex:1, padding:'10px', borderRadius:8, border:'1.5px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                Annuler
              </button>
              <button onClick={confirmDeletePrest}
                style={{ flex:1, padding:'10px', borderRadius:8, border:'none', background:'#D32F2F', color:'white', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                Confirmer la suppression
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======= MODAL CREER CHANTIER ======= */}
      {showCreate && (
        <Modal title="Nouveau chantier" onClose={() => setShowCreate(false)}>
          <ChantierForm form={form} setForm={setForm} clients={clients} onSubmit={handleCreate}
            onCancel={() => setShowCreate(false)} saving={saving} error={formError} mode="create" />
        </Modal>
      )}

      {/* ======= MODAL MODIFIER CHANTIER ======= */}
      {editProject && (
        <Modal title={`Modifier — ${editProject.name}`} onClose={() => setEditProject(null)}>
          <ChantierForm form={form} setForm={setForm} clients={clients} onSubmit={handleEdit}
            onCancel={() => setEditProject(null)} saving={saving} error={formError} mode="edit" />
        </Modal>
      )}

      {/* ======= POPUP SUPPRESSION CHANTIER ======= */}
      {deleteTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setDeleteTarget(null)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.6)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:420, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.3)', padding:28 }}>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <h3 style={{ margin:'0 0 8px', fontSize:17, fontWeight:800, color:'#1A141A' }}>Supprimer ce chantier ?</h3>
              <p style={{ margin:0, fontSize:13, color:'#8E5915' }}>
                <strong style={{ color:'#1A141A' }}>{deleteTarget.name}</strong> sera definitivement supprime.
                Cette action est irreversible.
              </p>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setDeleteTarget(null)}
                style={{ flex:1, padding:'10px', borderRadius:8, border:'1.5px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                Annuler
              </button>
              <button onClick={handleDelete} disabled={deleting}
                style={{ flex:1, padding:'10px', borderRadius:8, border:'none', background:'#D32F2F', color:'white', fontSize:13, fontWeight:700, cursor:deleting?'not-allowed':'pointer', opacity:deleting?0.7:1 }}>
                {deleting ? 'Suppression...' : 'Confirmer la suppression'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ======= sous-composants ======= */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.5)', backdropFilter:'blur(4px)' }} />
      <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:540, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.3)', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ padding:'18px 24px', borderBottom:'1px solid #F5E6D3', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, background:'white', zIndex:1 }}>
          <h2 style={{ margin:0, fontSize:16, fontWeight:700, color:'#1A141A' }}>{title}</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#8E5915' }}>x</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputS = { width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E8D4B0', fontSize:13, outline:'none', boxSizing:'border-box' as const };
const labelS = { display:'block' as const, fontSize:11, fontWeight:700 as const, color:'#8E5915', textTransform:'uppercase' as const, letterSpacing:0.5, marginBottom:6 };

function ChantierForm({ form, setForm, clients, onSubmit, onCancel, saving, error, mode }: any) {
  return (
    <form onSubmit={onSubmit} style={{ padding:24 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
        <div style={{ gridColumn:'1/-1' }}>
          <label style={labelS}>Nom du chantier *</label>
          <input required value={form.name} onChange={e => setForm({...form, name:e.target.value})}
            placeholder="Ex: Villa Anfa — R+2" style={inputS} />
        </div>
        <div style={{ gridColumn:'1/-1' }}>
          <label style={labelS}>Client</label>
          <select value={form.client_id} onChange={e => setForm({...form, client_id:e.target.value})} style={inputS}>
            <option value="">— Sans client —</option>
            {clients.map((c: Client) => <option key={c.id} value={c.id}>{c.commercial_name}</option>)}
          </select>
        </div>
        <div>
          <label style={labelS}>Budget (MAD) *</label>
          <input required type="number" value={form.budget} onChange={e => setForm({...form, budget:e.target.value})}
            placeholder="850000" style={{...inputS, fontFamily:'monospace'}} />
        </div>
        <div>
          <label style={labelS}>Ville</label>
          <input value={form.city} onChange={e => setForm({...form, city:e.target.value})} placeholder="Casablanca" style={inputS} />
        </div>
        <div>
          <label style={labelS}>Date debut</label>
          <input type="date" value={form.start_date} onChange={e => setForm({...form, start_date:e.target.value})} style={inputS} />
        </div>
        <div>
          <label style={labelS}>Date fin prevue</label>
          <input type="date" value={form.end_date} onChange={e => setForm({...form, end_date:e.target.value})} style={inputS} />
        </div>
        {mode === 'edit' && (
          <div>
            <label style={labelS}>Statut</label>
            <select value={form.status} onChange={e => setForm({...form, status:e.target.value})} style={inputS}>
              {['ACTIVE','LATE','COMPLETED','ARCHIVED'].map(s => (
                <option key={s} value={s}>{STATUS_CFG[s]?.label}</option>
              ))}
            </select>
          </div>
        )}
        {mode === 'edit' && (
          <div>
            <label style={labelS}>État d'avancement (%)</label>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <input
                type="range" min={0} max={100} step={1}
                value={form.progress}
                onChange={e => setForm({...form, progress:e.target.value})}
                style={{ flex:1, accentColor:'#F4B315' }}
              />
              <span style={{ fontFamily:'monospace', fontWeight:700, fontSize:14, color:'#8E5915', minWidth:38, textAlign:'right' }}>
                {form.progress}%
              </span>
            </div>
            <div style={{ marginTop:6, height:6, borderRadius:4, background:'#F5E6D3', overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${form.progress}%`, background:'linear-gradient(90deg,#F4B315,#E59312)', borderRadius:4, transition:'width 0.2s' }} />
            </div>
          </div>
        )}
        <div style={{ gridColumn:'1/-1' }}>
          <label style={labelS}>Description</label>
          <textarea value={form.description} onChange={e => setForm({...form, description:e.target.value})}
            placeholder="Description du chantier..." rows={2} style={{...inputS, resize:'none'}} />
        </div>
      </div>
      {error && <div style={{ background:'#FFF0F0', border:'1px solid #FFCDD2', borderRadius:8, padding:'8px 12px', marginBottom:16, fontSize:12, color:'#D32F2F' }}>Erreur : {error}</div>}
      <div style={{ display:'flex', justifyContent:'flex-end', gap:10, paddingTop:16, borderTop:'1px solid #F5E6D3' }}>
        <button type="button" onClick={onCancel}
          style={{ padding:'9px 18px', borderRadius:8, border:'1.5px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:13, fontWeight:600, cursor:'pointer' }}>
          Annuler
        </button>
        <button type="submit" disabled={saving}
          style={{ padding:'9px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#F4B315,#E59312)', color:'#1A141A', fontSize:13, fontWeight:700, cursor:saving?'not-allowed':'pointer', opacity:saving?0.7:1 }}>
          {saving ? '...' : mode === 'create' ? '+ Créer le chantier' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}
