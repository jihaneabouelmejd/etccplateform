'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, LayoutGrid, List, Pencil, Trash2, RefreshCw, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { projectsApi, tasksApi, assignableUsersApi } from '@/lib/api';
import { useLanguage } from '@/lib/i18n';

const priorityConfig: Record<string, string> = {
  HIGH: 'bg-red-50 text-red-600 border-red-200',
  MED:  'bg-amber-50 text-amber-600 border-amber-200',
  LOW:  'bg-green-50 text-green-600 border-green-200',
};

const roleLabel: Record<string, string> = {
  ADMIN: 'Admin',
  GERANT: 'Gérant',
  EMPLOYE: 'Employé',
  COMPTABLE: 'Comptable',
};

const inputStyle = { width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #EDDEC1', fontSize:13, outline:'none', boxSizing:'border-box' as const, background:'white' };
const labelStyle = { display:'block' as const, fontSize:11, fontWeight:700 as const, color:'#A33C00', textTransform:'uppercase' as const, letterSpacing:0.5, marginBottom:6 };
const btnSecondary = { padding:'9px 18px', borderRadius:8, border:'1.5px solid #EDDEC1', background:'white', color:'#A33C00', fontSize:13, fontWeight:600 as const, cursor:'pointer' as const };
const btnPrimary   = { padding:'9px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#EBB800,#755C00)', color:'#1A141A', fontSize:13, fontWeight:700 as const, cursor:'pointer' as const };
const btnDanger    = { padding:'9px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#EF4444,#DC2626)', color:'white', fontSize:13, fontWeight:700 as const, cursor:'pointer' as const };

function getStoredUser() { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } }
function isAdminRole(role: string) { return role === 'ADMIN' || role === 'GERANT'; }
function canDelete(role: string) { return isAdminRole(role); }

const emptyForm = {
  title: '', project_id: '', assignee_ids: [] as string[],
  priority: 1, due_date: '', status: 'TODO',
  description: '', blocker: '', progress: 0,
};

// Map task from API to a display object
function mapTask(t: any) {
  return {
    id: t.id,
    title: t.title,
    project: t.project?.name || '',
    project_id: t.project_id || '',
    assignees: t.assignments?.map((a: any) => a.user) || [],
    priority: t.priority >= 2 ? 'HIGH' : t.priority === 1 ? 'MED' : 'LOW',
    priorityNum: t.priority || 1,
    due: t.due_date ? t.due_date.slice(0, 10) : '',
    status: t.status,
    description: t.description || '',
    progress: t.progress || 0,
  };
}

export default function TachesPage() {
  const { t, dir } = useLanguage();

  const columns = [
    { id: 'TODO',        label: t('task.todo'),        color: 'border-t-gray-300' },
    { id: 'IN_PROGRESS', label: t('task.in_progress'), color: 'border-t-blue-400' },
    { id: 'BLOCKED',     label: t('task.blocked'),     color: 'border-t-red-400' },
    { id: 'DONE',        label: t('task.done'),        color: 'border-t-green-400' },
  ];

  const storedUser = getStoredUser();
  const currentRole: string = storedUser.role || '';
  const admin = isAdminRole(currentRole);

  const [view, setView]           = useState<'kanban' | 'list'>('kanban');
  const [kanban, setKanban]       = useState<Record<string, any[]>>({ TODO:[], IN_PROGRESS:[], BLOCKED:[], DONE:[] });
  const [allTasks, setAllTasks]   = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [myTasks, setMyTasks]     = useState(false);
  const [filterUserId, setFilterUserId] = useState(''); // admin: filtrer par utilisateur

  const [showForm, setShowForm]           = useState(false);
  const [editTarget, setEditTarget]       = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget]   = useState<any | null>(null);
  const [form, setForm]                   = useState({ ...emptyForm });
  const [saving, setSaving]               = useState(false);

  const [projects, setProjects]       = useState<any[]>([]);
  const [users, setUsers]             = useState<any[]>([]);
  const canDel                        = canDelete(currentRole);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      // Admin : contrôle via toggles ; Non-admin : le backend force le filtre de toute façon
      if (admin) {
        if (myTasks) params.my_tasks = 'true';
        else if (filterUserId) params.filter_user_id = filterUserId;
      }
      const res = await tasksApi.list(params);
      const { data, kanban: kb } = res.data;
      setAllTasks((data || []).map(mapTask));
      setKanban({
        TODO:        (kb?.TODO        || []).map(mapTask),
        IN_PROGRESS: (kb?.IN_PROGRESS || []).map(mapTask),
        BLOCKED:     (kb?.BLOCKED     || []).map(mapTask),
        DONE:        (kb?.DONE        || []).map(mapTask),
      });
    } catch { /* silently fail */ }
    setLoading(false);
  }, [myTasks, filterUserId, admin]);

  useEffect(() => {
    load();
    projectsApi.list({ limit: 200 }).then(r => {
      const list = Array.isArray(r.data) ? r.data : (r.data?.data || []);
      setProjects(list);
    }).catch(() => {});
    assignableUsersApi.list().then(r => {
      setUsers(Array.isArray(r.data) ? r.data : []);
    }).catch(() => {});
  }, [load]);

  const openCreate = (status = 'TODO') => {
    setEditTarget(null);
    setForm({ ...emptyForm, status });
    setShowForm(true);
  };

  const openEdit = (task: any) => {
    setEditTarget(task);
    setForm({
      title:        task.title || '',
      project_id:   task.project_id || '',
      assignee_ids: task.assignees?.map((u: any) => u.id) || [],
      priority:     task.priorityNum ?? 1,
      due_date:     task.due || '',
      status:       task.status,
      description:  task.description || '',
      blocker:      task.blocker || '',
      progress:     task.progress ?? 0,
    });
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        title:       form.title,
        project_id:  form.project_id || undefined,
        assignee_ids: form.assignee_ids,
        priority:    Number(form.priority),
        due_date:    form.due_date || undefined,
        status:      form.status,
        description: form.description || undefined,
        progress:    Number(form.progress),
      };
      if (editTarget) {
        await tasksApi.update(editTarget.id, payload);
      } else {
        await tasksApi.create(payload);
      }
      setShowForm(false);
      setEditTarget(null);
      setForm({ ...emptyForm });
      await load();
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await tasksApi.delete(deleteTarget.id);
      await load();
    } catch {}
    setDeleteTarget(null);
  };

  // Toggle assignee in multi-select
  const toggleAssignee = (uid: string) => {
    setForm(f => ({
      ...f,
      assignee_ids: f.assignee_ids.includes(uid)
        ? f.assignee_ids.filter(id => id !== uid)
        : [...f.assignee_ids, uid],
    }));
  };

  const getUserInitials = (user: any) =>
    `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`.toUpperCase();

  const renderAssignees = (assignees: any[]) => {
    if (!assignees?.length) return (
      <div className="w-6 h-6 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center">
        <User size={10} className="text-gray-400" />
      </div>
    );
    return (
      <div className="flex -space-x-1">
        {assignees.slice(0, 3).map((u, i) => (
          <div key={u.id || i} className="w-6 h-6 rounded-full bg-honey-gradient flex items-center justify-center text-[9px] font-bold text-honey-dark border border-white"
            title={`${u.first_name} ${u.last_name}`}>
            {getUserInitials(u)}
          </div>
        ))}
        {assignees.length > 3 && (
          <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[9px] font-bold text-gray-600 border border-white">
            +{assignees.length - 3}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-[22px] font-bold text-honey-dark font-display tracking-tight">{t('task.title')}</h1>
          <p className="text-sm text-honey-caramel mt-0.5">{t('task.kanban')} & {t('task.progress').toLowerCase()}</p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {/* Admin : filtre par utilisateur */}
          {admin && (
            <select
              value={filterUserId}
              onChange={e => { setFilterUserId(e.target.value); setMyTasks(false); }}
              style={{ padding:'6px 10px', borderRadius:8, border:'1.5px solid #EDDEC1', fontSize:12, color:'#A33C00', background:'white', cursor:'pointer' }}>
              <option value="">👥 Tous les utilisateurs</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.role})</option>
              ))}
            </select>
          )}
          {/* Mes tâches toggle — admin seulement */}
          {admin && (
            <button
              onClick={() => { setMyTasks(v => !v); setFilterUserId(''); }}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                myTasks ? 'bg-honey-gold border-honey-gold text-honey-dark' : 'bg-white border-honey-beige-soft text-honey-caramel hover:border-honey-gold'
              )}>
              👤 {t('dash.my_tasks')}
            </button>
          )}
          {/* Non-admin : badge informatif */}
          {!admin && (
            <span className="px-3 py-1.5 rounded-lg text-xs font-semibold border bg-honey-gold border-honey-gold text-honey-dark">
              👤 Mes tâches
            </span>
          )}
          <button onClick={load} className="p-1.5 rounded-lg border border-honey-beige-soft text-honey-caramel hover:text-honey-dark hover:border-honey-gold transition-all">
            <RefreshCw size={14} />
          </button>
          <div className="inline-flex bg-honey-cream rounded-lg p-0.5 border border-honey-beige-soft">
            <button onClick={() => setView('kanban')}
              className={cn('px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5',
                view === 'kanban' ? 'bg-honey-gold text-honey-dark' : 'text-honey-caramel')}>
              <LayoutGrid size={12} /> {t('task.kanban')}
            </button>
            <button onClick={() => setView('list')}
              className={cn('px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5',
                view === 'list' ? 'bg-honey-gold text-honey-dark' : 'text-honey-caramel')}>
              <List size={12} /> {t('task.list')}
            </button>
          </div>
          <button onClick={() => openCreate()} className="btn-primary text-sm"><Plus size={13} /> {t('task.new')}</button>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center items-center h-40 text-honey-caramel text-sm">{t('loading')}</div>
      )}

      {/* ── KANBAN ─────────────────────────────────────────────────────────── */}
      {!loading && view === 'kanban' && (
        <div className="grid grid-cols-4 gap-4">
          {columns.map((col) => (
            <div key={col.id} className={cn('bg-white border border-honey-beige-soft rounded-lg border-t-2 overflow-hidden', col.color)}>
              <div className="px-4 py-3 border-b border-honey-beige-soft flex justify-between items-center">
                <h3 className="text-sm font-semibold text-honey-dark">{col.label}</h3>
                <span className="text-[11px] bg-honey-cream text-honey-caramel px-2 py-0.5 rounded-full font-bold">
                  {(kanban[col.id] || []).length}
                </span>
              </div>
              <div className="p-3 space-y-2 min-h-[200px]">
                {(kanban[col.id] || []).map((task) => (
                  <div key={task.id}
                    className="bg-honey-cream border border-honey-beige-soft rounded-lg p-3 hover:shadow-honey-sm hover:border-honey-gold transition-all group">
                    <div className="flex items-start justify-between gap-1 mb-1.5">
                      <p className="text-xs font-semibold text-honey-dark cursor-pointer hover:text-honey-orange flex-1"
                        onClick={() => openEdit(task)}>
                        {task.title}
                      </p>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button onClick={() => openEdit(task)}
                          className="p-1 rounded hover:bg-honey-beige-soft text-honey-caramel hover:text-honey-dark transition-colors">
                          <Pencil size={10} />
                        </button>
                        {canDel && (
                          <button onClick={() => setDeleteTarget(task)}
                            className="p-1 rounded hover:bg-red-50 text-honey-caramel hover:text-red-500 transition-colors">
                            <Trash2 size={10} />
                          </button>
                        )}
                      </div>
                    </div>
                    {task.project && (
                      <p className="text-[10px] text-honey-caramel mb-2">🏗 {task.project}</p>
                    )}
                    {task.progress > 0 && (
                      <div className="flex items-center gap-2 mb-2">
                        <div className="flex-1 h-1 bg-white rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-honey-gold to-honey-orange rounded-full" style={{ width: `${task.progress}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-honey-dark">{task.progress}%</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center">
                      <span className={cn('badge border text-[9px]', priorityConfig[task.priority])}>{task.priority}</span>
                      <div className="flex items-center gap-1.5">
                        {task.due && <span className="text-[10px] text-honey-caramel">📅 {task.due}</span>}
                        {renderAssignees(task.assignees)}
                      </div>
                    </div>
                  </div>
                ))}
                <button onClick={() => openCreate(col.id)}
                  className="w-full py-2 text-[11px] text-honey-caramel hover:text-honey-dark border border-dashed border-honey-beige rounded-lg hover:border-honey-gold transition-all flex items-center justify-center gap-1">
                  <Plus size={11} /> Ajouter
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── LIST VIEW ──────────────────────────────────────────────────────── */}
      {!loading && view === 'list' && (
        <div className="card">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-honey-cream">
                {['Tâche', 'Chantier', 'Assigné(s)', 'Priorité', 'Avancement', 'Échéance', 'Statut', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-honey-caramel border-b border-honey-beige-soft">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allTasks.map((task) => (
                <tr key={task.id} className="border-b border-honey-beige-soft hover:bg-honey-cream/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-honey-dark">{task.title}</td>
                  <td className="px-4 py-3 text-honey-caramel text-xs">{task.project || '—'}</td>
                  <td className="px-4 py-3">{renderAssignees(task.assignees)}</td>
                  <td className="px-4 py-3">
                    <span className={cn('badge border text-[10px]', priorityConfig[task.priority])}>{task.priority}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 min-w-[80px]">
                      <div className="flex-1 h-1.5 bg-honey-cream rounded-full overflow-hidden">
                        <div className="h-full bg-honey-gold rounded-full" style={{ width: `${task.progress || 0}%` }} />
                      </div>
                      <span className="text-[11px] font-mono text-honey-dark">{task.progress || 0}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-honey-caramel">{task.due || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={cn('badge border text-[10px]',
                      task.status === 'DONE'        ? 'bg-green-50 text-green-600 border-green-200' :
                      task.status === 'BLOCKED'     ? 'bg-red-50 text-red-600 border-red-200' :
                      task.status === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                      'bg-gray-50 text-gray-600 border-gray-200'
                    )}>
                      {task.status === 'DONE' ? 'Terminé' : task.status === 'BLOCKED' ? 'Bloqué' : task.status === 'IN_PROGRESS' ? 'En cours' : 'À faire'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(task)}
                        className="p-1.5 rounded-lg bg-honey-cream border border-honey-beige-soft text-honey-caramel hover:text-honey-dark hover:border-honey-gold transition-all">
                        <Pencil size={12} />
                      </button>
                      {canDel && (
                        <button onClick={() => setDeleteTarget(task)}
                          className="p-1.5 rounded-lg bg-red-50 border border-red-200 text-red-400 hover:text-red-600 hover:bg-red-100 transition-all">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {allTasks.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-honey-caramel text-sm">Aucune tâche</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── MODAL Créer / Éditer tâche ─────────────────────────────────────── */}
      {showForm && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => { setShowForm(false); setEditTarget(null); }} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.5)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:540, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ padding:'18px 24px', borderBottom:'1px solid #EDDEC1', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, background:'white', zIndex:1 }}>
              <h2 style={{ margin:0, fontSize:16, fontWeight:700, color:'#1A141A' }}>
                {editTarget ? '✏️ Modifier la tâche' : '✅ Nouvelle tâche'}
              </h2>
              <button onClick={() => { setShowForm(false); setEditTarget(null); }} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#A33C00' }}>×</button>
            </div>
            <form onSubmit={handleSave} style={{ padding:24 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>

                {/* Titre */}
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={labelStyle}>Titre de la tâche *</label>
                  <input required value={form.title} onChange={e => setForm({...form, title:e.target.value})}
                    placeholder="Ex: Coffrage dalle R+1" style={inputStyle} />
                </div>

                {/* Chantier */}
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={labelStyle}>Chantier</label>
                  <select value={form.project_id} onChange={e => setForm({...form, project_id:e.target.value})} style={inputStyle}>
                    <option value="">-- Choisir un chantier --</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}{p.city ? ` (${p.city})` : ''}</option>)}
                  </select>
                </div>

                {/* Assigné à — multi-select (admin seulement) */}
                {admin && <div style={{ gridColumn:'1/-1' }}>
                  <label style={labelStyle}>Assigné à</label>
                  <div style={{ border:'1.5px solid #EDDEC1', borderRadius:8, padding:'8px 10px', background:'white', maxHeight:180, overflowY:'auto' }}>
                    {users.length === 0 && (
                      <p style={{ fontSize:12, color:'#A33C00', margin:0 }}>Chargement des utilisateurs...</p>
                    )}
                    {/* Group by role */}
                    {['ADMIN','GERANT','EMPLOYE','COMPTABLE'].map(role => {
                      const group = users.filter(u => u.role === role);
                      if (!group.length) return null;
                      return (
                        <div key={role} style={{ marginBottom:6 }}>
                          <p style={{ fontSize:10, fontWeight:700, color:'#755C00', textTransform:'uppercase', letterSpacing:0.5, margin:'0 0 4px' }}>
                            {roleLabel[role]}
                          </p>
                          {group.map(u => (
                            <label key={u.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 6px', borderRadius:6, cursor:'pointer', background: form.assignee_ids.includes(u.id) ? 'rgba(235,184,0,0.12)' : 'transparent' }}>
                              <input
                                type="checkbox"
                                checked={form.assignee_ids.includes(u.id)}
                                onChange={() => toggleAssignee(u.id)}
                                style={{ accentColor:'#EBB800', width:14, height:14, flexShrink:0 }}
                              />
                              <div style={{ width:26, height:26, borderRadius:'50%', background:'linear-gradient(135deg,#EBB800,#755C00)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#1A141A', flexShrink:0 }}>
                                {u.first_name?.[0]}{u.last_name?.[0]}
                              </div>
                              <span style={{ fontSize:13, color:'#1A141A', fontWeight:500 }}>{u.first_name} {u.last_name}</span>
                            </label>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                  {form.assignee_ids.length > 0 && (
                    <p style={{ fontSize:11, color:'#755C00', marginTop:4 }}>
                      {form.assignee_ids.length} personne(s) assignée(s)
                    </p>
                  )}
                </div>}

                {/* Priorité */}
                <div>
                  <label style={labelStyle}>Priorité</label>
                  <select value={form.priority} onChange={e => setForm({...form, priority:Number(e.target.value)})} style={inputStyle}>
                    <option value={2}>🔴 Haute</option>
                    <option value={1}>🟡 Moyenne</option>
                    <option value={0}>🟢 Basse</option>
                  </select>
                </div>

                {/* Statut */}
                <div>
                  <label style={labelStyle}>Statut</label>
                  <select value={form.status} onChange={e => setForm({...form, status:e.target.value})} style={inputStyle}>
                    <option value="TODO">À faire</option>
                    <option value="IN_PROGRESS">En cours</option>
                    <option value="BLOCKED">Bloqué</option>
                    <option value="DONE">Terminé</option>
                  </select>
                </div>

                {/* Date d'échéance */}
                <div>
                  <label style={labelStyle}>Date d'échéance</label>
                  <input type="date" value={form.due_date} onChange={e => setForm({...form, due_date:e.target.value})} style={inputStyle} />
                </div>

                {/* Avancement */}
                <div>
                  <label style={labelStyle}>Avancement (%)</label>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <input type="range" min={0} max={100} value={form.progress}
                      onChange={e => setForm({...form, progress: Number(e.target.value)})}
                      style={{ flex:1, accentColor:'#EBB800' }} />
                    <span style={{ fontSize:13, fontWeight:700, fontFamily:'monospace', color:'#1A141A', minWidth:32 }}>{form.progress}%</span>
                  </div>
                </div>

                {/* Description */}
                <div style={{ gridColumn:'1/-1' }}>
                  <label style={labelStyle}>Description</label>
                  <textarea value={form.description} onChange={e => setForm({...form, description:e.target.value})}
                    placeholder="Détails de la tâche..." rows={2} style={{...inputStyle, resize:'none'}} />
                </div>
              </div>

              <div style={{ display:'flex', justifyContent:'flex-end', gap:10, paddingTop:16, borderTop:'1px solid #EDDEC1' }}>
                <button type="button" onClick={() => { setShowForm(false); setEditTarget(null); }} style={btnSecondary}>Annuler</button>
                <button type="submit" style={btnPrimary} disabled={saving}>
                  {saving ? 'Enregistrement...' : editTarget ? '✓ Enregistrer' : '+ Créer la tâche'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── POPUP Confirmation suppression ─────────────────────────────────── */}
      {deleteTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setDeleteTarget(null)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.6)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:400, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.3)', padding:28 }}>
            <h3 style={{ margin:'0 0 8px', fontSize:17, fontWeight:700, color:'#1A141A' }}>🗑 Supprimer la tâche</h3>
            <p style={{ fontSize:13, color:'#A33C00', marginBottom:6 }}>Vous êtes sur le point de supprimer :</p>
            <p style={{ fontSize:14, fontWeight:600, color:'#1A141A', marginBottom:20, background:'#FBF6EE', padding:'10px 14px', borderRadius:8, border:'1px solid #EDDEC1' }}>
              {deleteTarget.title}
            </p>
            <p style={{ fontSize:12, color:'#999', marginBottom:20 }}>Cette action est irréversible.</p>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setDeleteTarget(null)} style={{ ...btnSecondary, flex:1 }}>Annuler</button>
              <button onClick={confirmDelete} style={{ ...btnDanger, flex:1 }}>🗑 Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
