'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ChevronLeft, ChevronRight, CalendarDays, Target, Plus, Trash2,
  CheckCircle2, Circle, RefreshCw, Link2, Link2Off, AlertCircle,
  Pencil, X, Check, Users, Clock,
} from 'lucide-react';
import { agendaApi, projectsApi, assignableUsersApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

// ─── helpers ──────────────────────────────────────────────────────────────────

const MONTHS = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre',
];
const DAYS = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

const STATUS_COLOR: Record<string,string> = {
  TODO: '#9CA3AF',
  IN_PROGRESS: '#3B82F6',
  BLOCKED: '#EF4444',
  DONE: '#10B981',
};
const STATUS_LABEL: Record<string,string> = {
  TODO: 'À faire', IN_PROGRESS: 'En cours', BLOCKED: 'Bloqué', DONE: 'Terminé',
};

// Palette de couleurs pour les utilisateurs
const USER_COLORS = [
  '#EBB800','#3B82F6','#10B981','#8B5CF6','#F59E0B',
  '#EC4899','#06B6D4','#84CC16','#F97316','#6366F1',
];

function getUserColor(userId: string, allUsers: any[]) {
  const idx = allUsers.findIndex(u => u.id === userId);
  return USER_COLORS[idx % USER_COLORS.length] || '#9CA3AF';
}

function isoDate(d: Date) {
  return d.toISOString().split('T')[0];
}

function formatTime(t: string) {
  return t ? t.slice(0, 5) : '';
}

// ─── styles ───────────────────────────────────────────────────────────────────

const card = {
  background: 'white', borderRadius: 14,
  border: '1.5px solid #EDDEC1', padding: '20px 24px',
};
const btnPrimary = {
  padding: '8px 16px', borderRadius: 8, border: 'none',
  background: 'linear-gradient(135deg,#EBB800,#755C00)', color: '#1A141A',
  fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex',
  alignItems: 'center', gap: 6,
};
const btnSecondary = {
  padding: '8px 16px', borderRadius: 8,
  border: '1.5px solid #EDDEC1', background: 'white', color: '#7C3D00',
  fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex',
  alignItems: 'center', gap: 6,
};
const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 8,
  border: '1.5px solid #EDDEC1', fontSize: 13, outline: 'none',
  background: 'white', boxSizing: 'border-box' as const,
};
const labelStyle = {
  display: 'block' as const, fontSize: 11, fontWeight: 700 as const,
  color: '#A33C00', textTransform: 'uppercase' as const,
  letterSpacing: 0.5, marginBottom: 5,
};

// ─── Objectif Form ─────────────────────────────────────────────────────────────

function ObjectifForm({
  projects, onSave, onCancel, initial,
}: {
  projects: any[];
  onSave: (data: any) => Promise<void>;
  onCancel: () => void;
  initial?: any;
}) {
  const [form, setForm] = useState({
    title: initial?.title || '',
    description: initial?.description || '',
    project_id: initial?.project?.id || '',
    start_date: initial?.start_date ? initial.start_date.slice(0, 10) : '',
    end_date: initial?.end_date ? initial.end_date.slice(0, 10) : '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        title: form.title,
        description: form.description || undefined,
        project_id: form.project_id || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <label style={labelStyle}>Titre *</label>
        <input
          style={inputStyle} value={form.title} required
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          placeholder="Ex: Finaliser le plan de chantier..."
        />
      </div>
      <div>
        <label style={labelStyle}>Chantier (optionnel)</label>
        <select
          style={inputStyle}
          value={form.project_id}
          onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}
        >
          <option value="">— Objectif personnel —</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
          ))}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelStyle}>Date début</label>
          <input type="date" style={inputStyle} value={form.start_date}
            onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
        </div>
        <div>
          <label style={labelStyle}>Date fin</label>
          <input type="date" style={inputStyle} value={form.end_date}
            onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
        </div>
      </div>
      <div>
        <label style={labelStyle}>Description</label>
        <textarea
          style={{ ...inputStyle, minHeight: 64, resize: 'vertical' as const }}
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          placeholder="Détails de l'objectif..."
        />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" style={btnSecondary} onClick={onCancel}>Annuler</button>
        <button type="submit" style={btnPrimary} disabled={saving}>
          {saving ? <RefreshCw size={13} className="spin" /> : <Check size={13} />}
          {initial ? 'Modifier' : 'Ajouter'}
        </button>
      </div>
    </form>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function AgendaPage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'GERANT';

  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string>(isoDate(today));
  const [filterUserId, setFilterUserId] = useState<string>('');

  const [tasks, setTasks] = useState<any[]>([]);
  const [objectifs, setObjectifs] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const [showObjectifForm, setShowObjectifForm] = useState(false);
  const [editObjectif, setEditObjectif] = useState<any | null>(null);

  // Notification from Google OAuth callback
  const googleParam = searchParams.get('google');
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; msg: string } | null>(
    googleParam === 'connected'
      ? { type: 'success', msg: 'Google Agenda connecté avec succès !' }
      : googleParam === 'error'
      ? { type: 'error', msg: 'Erreur lors de la connexion Google Agenda.' }
      : null
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [agendaRes, projectsRes, googleRes] = await Promise.all([
        agendaApi.get(month, year),
        projectsApi.list({ page: 1 }),
        agendaApi.googleStatus(),
      ]);
      setTasks(agendaRes.data.tasks || []);
      setObjectifs(agendaRes.data.objectifs || []);
      setProjects(projectsRes.data.data || []);
      setGoogleConnected(googleRes.data.connected);
      setGoogleConfigured(googleRes.data.configured);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  // Load users for filter (admin only)
  useEffect(() => {
    if (isAdmin) {
      assignableUsersApi.list().then(r => {
        setAllUsers(Array.isArray(r.data) ? r.data : []);
      }).catch(() => {});
    }
  }, [isAdmin]);

  // Build calendar grid
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const startDow = (firstDay.getDay() + 6) % 7; // Mon=0
  const daysInMonth = lastDay.getDate();

  const cells: (number | null)[] = [
    ...Array(startDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // Filter tasks by selected user
  const filteredTasks = filterUserId
    ? tasks.filter(t => t.assignments?.some((a: any) => a.user?.id === filterUserId || a.user_id === filterUserId))
    : tasks;

  // Tasks grouped by date
  const tasksByDate: Record<string, any[]> = {};
  filteredTasks.forEach(t => {
    if (t.due_date) {
      const d = t.due_date.slice(0, 10);
      if (!tasksByDate[d]) tasksByDate[d] = [];
      tasksByDate[d].push(t);
    }
  });

  // Sort tasks within each day by start_time
  Object.keys(tasksByDate).forEach(d => {
    tasksByDate[d].sort((a, b) => {
      if (!a.start_time && !b.start_time) return 0;
      if (!a.start_time) return 1;
      if (!b.start_time) return -1;
      return a.start_time.localeCompare(b.start_time);
    });
  });

  // Tasks for selected date
  const selectedTasks = tasksByDate[selectedDate] || [];

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  const handleConnectGoogle = async () => {
    const res = await agendaApi.getGoogleAuthUrl();
    if (res.data.url) {
      window.location.href = res.data.url;
    } else {
      setNotification({ type: 'error', msg: 'Google Calendar non configuré. Contactez l\'administrateur.' });
    }
  };

  const handleDisconnectGoogle = async () => {
    await agendaApi.disconnectGoogle();
    setGoogleConnected(false);
    setNotification({ type: 'success', msg: 'Google Agenda déconnecté.' });
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await agendaApi.syncToGoogle();
      setNotification({
        type: 'success',
        msg: `${res.data.synced} tâche(s) synchronisée(s) vers Google Agenda.`,
      });
      await load();
    } catch {
      setNotification({ type: 'error', msg: 'Erreur de synchronisation.' });
    } finally {
      setSyncing(false);
    }
  };

  const handleAddObjectif = async (data: any) => {
    await agendaApi.createObjectif(data);
    await load();
    setShowObjectifForm(false);
  };

  const handleEditObjectif = async (data: any) => {
    await agendaApi.updateObjectif(editObjectif.id, data);
    await load();
    setEditObjectif(null);
  };

  const handleToggleObjectif = async (obj: any) => {
    await agendaApi.updateObjectif(obj.id, { completed: !obj.completed });
    await load();
  };

  const handleDeleteObjectif = async (id: string) => {
    if (!confirm('Supprimer cet objectif ?')) return;
    await agendaApi.deleteObjectif(id);
    await load();
  };

  return (
    <div style={{ padding: '24px 28px', minHeight: '100vh', background: '#FFFBF5' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CalendarDays size={22} color="#C68B00" />
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1A141A', margin: 0 }}>Agenda</h1>
          <span style={{ fontSize: 12, color: '#9CA3AF', background: '#F3F4F6', padding: '2px 8px', borderRadius: 12 }}>
            {filteredTasks.length} tâche{filteredTasks.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Filter by user (admin only) */}
          {isAdmin && allUsers.length > 0 && (
            <select
              value={filterUserId}
              onChange={e => setFilterUserId(e.target.value)}
              style={{ padding:'7px 10px', borderRadius:8, border:'1.5px solid #EDDEC1', fontSize:12, color:'#A33C00', background:'white', cursor:'pointer' }}
            >
              <option value="">👥 Toute l'équipe</option>
              {allUsers.map(u => (
                <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>
              ))}
            </select>
          )}

          {/* Google Calendar button */}
          {googleConnected ? (
            <>
              <button
                style={{ ...btnPrimary, background: 'linear-gradient(135deg,#10B981,#065F46)' }}
                onClick={handleSync} disabled={syncing}
              >
                {syncing ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />}
                Synchroniser
              </button>
              <button style={{ ...btnSecondary, color: '#EF4444', borderColor: '#FCA5A5' }} onClick={handleDisconnectGoogle}>
                <Link2Off size={14} /> Déconnecter Google
              </button>
            </>
          ) : (
            <button style={btnPrimary} onClick={handleConnectGoogle}>
              <Link2 size={14} />
              {googleConfigured ? 'Connecter Google Agenda' : 'Config. Google requise'}
            </button>
          )}
        </div>
      </div>

      {/* Notification */}
      {notification && (
        <div style={{
          marginBottom: 16, padding: '10px 16px', borderRadius: 8, display: 'flex',
          alignItems: 'center', justifyContent: 'space-between',
          background: notification.type === 'success' ? '#DCFCE7' : '#FEE2E2',
          border: `1.5px solid ${notification.type === 'success' ? '#86EFAC' : '#FCA5A5'}`,
          color: notification.type === 'success' ? '#166534' : '#991B1B',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{notification.msg}</span>
          <button onClick={() => setNotification(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Google Calendar not configured notice */}
      {!googleConfigured && (
        <div style={{
          marginBottom: 16, padding: '10px 16px', borderRadius: 8,
          background: '#FFF7ED', border: '1.5px solid #FED7AA', color: '#92400E',
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
        }}>
          <AlertCircle size={15} />
          <span>
            Pour activer la sync Google Agenda, ajoutez <b>GOOGLE_CLIENT_ID</b> et <b>GOOGLE_CLIENT_SECRET</b> dans le fichier <b>.env</b> du backend.
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
        {/* ── LEFT: Calendar ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={card}>
            {/* Month navigation */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <button onClick={prevMonth} style={{ ...btnSecondary, padding: '6px 10px' }}>
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontSize: 17, fontWeight: 800, color: '#1A141A' }}>
                {MONTHS[month - 1]} {year}
              </span>
              <button onClick={nextMonth} style={{ ...btnSecondary, padding: '6px 10px' }}>
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Day headers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
              {DAYS.map(d => (
                <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#A33C00', padding: '4px 0' }}>
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar cells */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
              {cells.map((day, i) => {
                if (!day) return <div key={i} />;
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayTasks = tasksByDate[dateStr] || [];
                const isToday = dateStr === isoDate(today);
                const isSelected = dateStr === selectedDate;

                return (
                  <div
                    key={i}
                    onClick={() => setSelectedDate(dateStr)}
                    style={{
                      minHeight: 72, padding: '6px 5px', borderRadius: 8, cursor: 'pointer',
                      border: isSelected ? '2px solid #EBB800' : '1.5px solid transparent',
                      background: isSelected ? '#FFFBF0' : isToday ? '#FFF8E0' : 'transparent',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', marginBottom: 4,
                      fontSize: 13, fontWeight: isToday ? 800 : 500,
                      background: isToday ? '#EBB800' : 'transparent',
                      color: isToday ? '#1A141A' : '#3D2B1F',
                    }}>
                      {day}
                    </div>
                    {dayTasks.slice(0, 3).map(t => {
                      const assigneeId = t.assignments?.[0]?.user?.id;
                      const color = assigneeId ? getUserColor(assigneeId, allUsers) : STATUS_COLOR[t.status];
                      return (
                        <div key={t.id} style={{
                          fontSize: 10, fontWeight: 600, padding: '1px 4px', borderRadius: 4,
                          marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          background: color + '22',
                          color: color,
                          border: `1px solid ${color}44`,
                        }}>
                          {t.start_time ? `${formatTime(t.start_time)} ` : ''}{t.title}
                        </div>
                      );
                    })}
                    {dayTasks.length > 3 && (
                      <div style={{ fontSize: 9, color: '#9CA3AF', paddingLeft: 4 }}>
                        +{dayTasks.length - 3} autres
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected day tasks */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1A141A', margin: 0 }}>
                📅 {new Date(selectedDate + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>
              <span style={{ fontSize: 12, color: '#9CA3AF', background: '#F3F4F6', padding: '2px 8px', borderRadius: 10 }}>
                {selectedTasks.length} tâche{selectedTasks.length !== 1 ? 's' : ''}
              </span>
            </div>
            {selectedTasks.length === 0 ? (
              <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                Aucune tâche prévue ce jour
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedTasks.map(t => {
                  const assigneeId = t.assignments?.[0]?.user?.id;
                  const accentColor = assigneeId ? getUserColor(assigneeId, allUsers) : STATUS_COLOR[t.status];
                  return (
                    <div key={t.id} style={{
                      padding: '12px 14px', borderRadius: 10,
                      border: `1.5px solid ${accentColor}33`,
                      background: accentColor + '0A',
                      borderLeft: `4px solid ${accentColor}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#1A141A' }}>{t.title}</span>
                          {/* Time badge */}
                          {t.start_time && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                              <Clock size={11} color="#6B7280" />
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>
                                {formatTime(t.start_time)}{t.end_time ? ` → ${formatTime(t.end_time)}` : ''}
                              </span>
                            </div>
                          )}
                        </div>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
                          background: STATUS_COLOR[t.status] + '22', color: STATUS_COLOR[t.status],
                          flexShrink: 0,
                        }}>
                          {STATUS_LABEL[t.status]}
                        </span>
                      </div>
                      {t.project && (
                        <div style={{ fontSize: 11, color: '#A33C00', marginTop: 5 }}>
                          🏗 {t.project.code} · {t.project.name}
                        </div>
                      )}
                      {t.assignments?.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
                          <div style={{ display: 'flex', gap: -4 }}>
                            {t.assignments.slice(0, 4).map((a: any, i: number) => {
                              const color = getUserColor(a.user?.id, allUsers);
                              const initials = `${a.user?.first_name?.[0] || ''}${a.user?.last_name?.[0] || ''}`;
                              return (
                                <div key={a.user?.id || i} title={`${a.user?.first_name} ${a.user?.last_name}`} style={{
                                  width: 22, height: 22, borderRadius: '50%', background: color,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontSize: 9, fontWeight: 700, color: 'white',
                                  border: '2px solid white', marginRight: -6,
                                }}>
                                  {initials}
                                </div>
                              );
                            })}
                          </div>
                          <span style={{ fontSize: 11, color: '#6B7280', marginLeft: 10 }}>
                            {t.assignments.map((a: any) => `${a.user?.first_name} ${a.user?.last_name}`).join(', ')}
                          </span>
                        </div>
                      )}
                      {t.google_event_id && (
                        <div style={{ fontSize: 10, color: '#10B981', marginTop: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Link2 size={10} /> Sync Google Agenda
                        </div>
                      )}
                      {/* Progress bar */}
                      {t.progress > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ height: 4, background: '#F3E8D0', borderRadius: 4 }}>
                            <div style={{ width: `${t.progress}%`, height: '100%', background: accentColor, borderRadius: 4 }} />
                          </div>
                          <span style={{ fontSize: 10, color: '#6B7280' }}>{t.progress}%</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Sidebar ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Team Legend (admin only) */}
          {isAdmin && allUsers.length > 0 && (
            <div style={{ ...card, padding: '14px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Users size={14} color="#C68B00" />
                <p style={{ fontSize: 11, fontWeight: 700, color: '#A33C00', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>
                  Équipe
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {allUsers.map(u => {
                  const color = getUserColor(u.id, allUsers);
                  const userTaskCount = tasks.filter(t =>
                    t.assignments?.some((a: any) => a.user?.id === u.id || a.user_id === u.id)
                  ).length;
                  return (
                    <button
                      key={u.id}
                      onClick={() => setFilterUserId(prev => prev === u.id ? '' : u.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px',
                        borderRadius: 7, border: `1.5px solid ${filterUserId === u.id ? color : 'transparent'}`,
                        background: filterUserId === u.id ? color + '15' : 'transparent',
                        cursor: 'pointer', textAlign: 'left',
                      }}
                    >
                      <div style={{
                        width: 26, height: 26, borderRadius: '50%', background: color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0,
                      }}>
                        {u.first_name?.[0]}{u.last_name?.[0]}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#1A141A' }}>{u.first_name} {u.last_name}</div>
                        <div style={{ fontSize: 10, color: '#9CA3AF' }}>{userTaskCount} tâche{userTaskCount !== 1 ? 's' : ''} ce mois</div>
                      </div>
                      {filterUserId === u.id && (
                        <span style={{ fontSize: 10, color: color, fontWeight: 700 }}>✓</span>
                      )}
                    </button>
                  );
                })}
                {filterUserId && (
                  <button
                    onClick={() => setFilterUserId('')}
                    style={{ fontSize: 11, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '3px 8px' }}
                  >
                    ✕ Voir toute l'équipe
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Objectifs */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Target size={16} color="#C68B00" />
                <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1A141A', margin: 0 }}>Objectifs</h2>
              </div>
              <button
                style={{ ...btnPrimary, padding: '5px 10px', fontSize: 12 }}
                onClick={() => { setShowObjectifForm(true); setEditObjectif(null); }}
              >
                <Plus size={13} /> Ajouter
              </button>
            </div>

            {/* Objectif form */}
            {showObjectifForm && !editObjectif && (
              <div style={{
                marginBottom: 14, padding: 14, borderRadius: 10,
                background: '#FFF8E8', border: '1.5px solid #EDDEC1',
              }}>
                <ObjectifForm
                  projects={projects}
                  onSave={handleAddObjectif}
                  onCancel={() => setShowObjectifForm(false)}
                />
              </div>
            )}

            {loading ? (
              <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center' }}>Chargement...</p>
            ) : objectifs.length === 0 ? (
              <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
                Aucun objectif. Ajoutez-en un !
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Personal objectifs */}
                {objectifs.filter(o => !o.project).length > 0 && (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 700, color: '#A33C00', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                      Personnels
                    </p>
                    {objectifs.filter(o => !o.project).map(obj => (
                      <ObjectifCard
                        key={obj.id}
                        obj={obj}
                        editObjectif={editObjectif}
                        setEditObjectif={setEditObjectif}
                        onToggle={handleToggleObjectif}
                        onDelete={handleDeleteObjectif}
                        onEdit={handleEditObjectif}
                        onCancelEdit={() => setEditObjectif(null)}
                        projects={projects}
                      />
                    ))}
                  </div>
                )}

                {/* Chantier objectifs grouped by project */}
                {(() => {
                  const projObjs = objectifs.filter(o => o.project);
                  const byProj: Record<string, any[]> = {};
                  projObjs.forEach(o => {
                    const key = o.project.id;
                    if (!byProj[key]) byProj[key] = [];
                    byProj[key].push(o);
                  });
                  return Object.entries(byProj).map(([pid, objs]) => (
                    <div key={pid}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: '#2563EB', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                        📁 {objs[0].project.code} · {objs[0].project.name}
                      </p>
                      {objs.map(obj => (
                        <ObjectifCard
                          key={obj.id}
                          obj={obj}
                          editObjectif={editObjectif}
                          setEditObjectif={setEditObjectif}
                          onToggle={handleToggleObjectif}
                          onDelete={handleDeleteObjectif}
                          onEdit={handleEditObjectif}
                          onCancelEdit={() => setEditObjectif(null)}
                          projects={projects}
                        />
                      ))}
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>

          {/* Legend */}
          <div style={{ ...card, padding: '14px 18px' }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#A33C00', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              Statuts des tâches
            </p>
            {Object.entries(STATUS_LABEL).map(([key, label]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: 3, background: STATUS_COLOR[key] }} />
                <span style={{ fontSize: 12, color: '#3D2B1F' }}>{label}</span>
              </div>
            ))}
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #EDDEC1', fontSize: 11, color: '#9CA3AF' }}>
              💡 Les tâches créées dans « Tâches » apparaissent automatiquement ici dès qu'une date est assignée.
            </div>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── Objectif Card ─────────────────────────────────────────────────────────────

function ObjectifCard({ obj, editObjectif, setEditObjectif, onToggle, onDelete, onEdit, onCancelEdit, projects }: {
  obj: any;
  editObjectif: any;
  setEditObjectif: (o: any) => void;
  onToggle: (o: any) => void;
  onDelete: (id: string) => void;
  onEdit: (data: any) => Promise<void>;
  onCancelEdit: () => void;
  projects: any[];
}) {
  const isEditing = editObjectif?.id === obj.id;

  if (isEditing) {
    return (
      <div style={{ padding: 12, borderRadius: 10, background: '#FFF8E8', border: '1.5px solid #EDDEC1', marginBottom: 6 }}>
        <ObjectifForm
          projects={projects}
          initial={obj}
          onSave={onEdit}
          onCancel={onCancelEdit}
        />
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px',
      borderRadius: 8, border: '1.5px solid #F0E4D0', marginBottom: 4,
      background: obj.completed ? '#F0FDF4' : 'white',
      opacity: obj.completed ? 0.75 : 1,
    }}>
      <button
        onClick={() => onToggle(obj)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 1 }}
      >
        {obj.completed
          ? <CheckCircle2 size={16} color="#10B981" />
          : <Circle size={16} color="#D1B57A" />
        }
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: 13, fontWeight: 600, color: '#1A141A',
          textDecoration: obj.completed ? 'line-through' : 'none',
          display: 'block',
        }}>
          {obj.title}
        </span>
        {obj.end_date && (
          <span style={{ fontSize: 11, color: '#6B7280' }}>
            Échéance : {new Date(obj.end_date).toLocaleDateString('fr-FR')}
          </span>
        )}
        {!obj.completed && obj.progress > 0 && (
          <div style={{ marginTop: 4, height: 4, background: '#F3E8D0', borderRadius: 4 }}>
            <div style={{ width: `${obj.progress}%`, height: '100%', background: '#EBB800', borderRadius: 4 }} />
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          onClick={() => setEditObjectif(obj)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#9CA3AF' }}
        >
          <Pencil size={12} />
        </button>
        <button
          onClick={() => onDelete(obj.id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#EF4444' }}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}
