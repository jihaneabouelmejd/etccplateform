'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Eye, Check, X, Trash2, FileText, Upload, ArrowRight, Building2, Calendar as CalendarIcon, TrendingUp, Bot, Settings } from 'lucide-react';
import { marchesPrivesApi, clientsApi, assignableUsersApi, uploadApi } from '@/lib/api';
import { formatDate, formatCurrency } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n';

/* ══════════════════════════ Styles partagés ══════════════════════════ */
const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #E8D4B0', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const };
const labelStyle = { display: 'block' as const, fontSize: 11, fontWeight: 700 as const, color: '#8E5915', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 6 };
const btnSecondary = { padding: '9px 18px', borderRadius: 8, border: '1.5px solid #E8D4B0', background: 'white', color: '#8E5915', fontSize: 13, fontWeight: 600 as const, cursor: 'pointer' as const };
const btnPrimary = { padding: '9px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#F4B315,#E59312)', color: '#1A141A', fontSize: 13, fontWeight: 700 as const, cursor: 'pointer' as const };
const btnDanger = { padding: '9px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#EF4444,#DC2626)', color: 'white', fontSize: 13, fontWeight: 700 as const, cursor: 'pointer' as const };
const btnSmall = { padding: '6px 12px', borderRadius: 7, border: '1.5px solid #E8D4B0', background: 'white', color: '#8E5915', fontSize: 12, fontWeight: 600 as const, cursor: 'pointer' as const, display: 'flex', alignItems: 'center', gap: 5 };
const card = { background: 'white', borderRadius: 12, border: '1px solid #F5E6D3', padding: '16px 20px' };

const STAGE_CONFIG: Record<string, { label: string; color: string; bg: string; tab: string }> = {
  NOUVEAU:        { label: 'Nouveau',        color: '#3B82F6', bg: '#EFF6FF', tab: 'nouveaux' },
  RETENU:         { label: 'Retenu',         color: '#8B5CF6', bg: '#F5F3FF', tab: 'retenus' },
  EN_PREPARATION: { label: 'En préparation', color: '#F59E0B', bg: '#FFFBEB', tab: 'preparation' },
  A_VALIDER:      { label: 'À valider',      color: '#EA580C', bg: '#FFF7ED', tab: 'a_valider' },
  DEPOSE:         { label: 'Déposé',         color: '#0EA5E9', bg: '#F0F9FF', tab: 'deposes' },
  GAGNE:          { label: 'Gagné',          color: '#16A34A', bg: '#F0FDF4', tab: 'gagnes' },
  PERDU:          { label: 'Perdu',          color: '#DC2626', bg: '#FEF2F2', tab: 'perdus' },
};

const PIPELINE_TABS = ['nouveaux', 'retenus', 'preparation', 'a_valider', 'deposes', 'gagnes', 'perdus'] as const;
const TAB_TO_STAGE: Record<string, string> = {
  nouveaux: 'NOUVEAU', retenus: 'RETENU', preparation: 'EN_PREPARATION',
  a_valider: 'A_VALIDER', deposes: 'DEPOSE', gagnes: 'GAGNE', perdus: 'PERDU',
};

const TOP_TABS: { key: string; label: string; emoji: string }[] = [
  { key: 'dashboard',    label: 'Tableau de bord',           emoji: '📊' },
  { key: 'nouveaux',     label: 'Nouveaux marchés',          emoji: '🆕' },
  { key: 'retenus',      label: 'Opportunités retenues',     emoji: '⭐' },
  { key: 'preparation',  label: 'Dossiers en préparation',   emoji: '🛠️' },
  { key: 'a_valider',    label: 'Dossiers à valider',        emoji: '🔍' },
  { key: 'deposes',      label: 'Dossiers déposés',          emoji: '📮' },
  { key: 'gagnes',       label: 'Marchés gagnés',            emoji: '🏆' },
  { key: 'perdus',       label: 'Marchés perdus',            emoji: '❌' },
  { key: 'documents',    label: 'Bibliothèque documentaire', emoji: '📚' },
  { key: 'depenses',     label: 'Dépenses',                  emoji: '💰' },
  { key: 'calendrier',   label: 'Calendrier',                emoji: '📅' },
  { key: 'statistiques', label: 'Statistiques',              emoji: '📈' },
  { key: 'ia',           label: 'Assistant IA',              emoji: '🤖' },
  { key: 'parametres',   label: 'Paramètres',                emoji: '⚙️' },
];

const emptyForm = {
  objet: '', reference: '', client_id: '', client_name: '', ville: '',
  budget_estimatif: '', devise: 'MAD', date_limite: '', source: '', score_ia: '',
  responsable_id: '', notes: '',
};

function StageBadge({ stage }: { stage: string }) {
  const cfg = STAGE_CONFIG[stage] || { label: stage, color: '#6B7280', bg: '#F3F4F6' };
  return (
    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg }}>
      {cfg.label}
    </span>
  );
}

function getUser() { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } }

export default function MarchesPrivesPage() {
  useLanguage();
  const user = getUser();

  const [tab, setTab] = useState<string>('dashboard');
  const [marches, setMarches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>(null);
  const [clients, setClients] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [viewTarget, setViewTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  const [selectedMarcheId, setSelectedMarcheId] = useState<string>('');

  const load = useCallback(() => {
    setLoading(true);
    marchesPrivesApi.list({ limit: 500 })
      .then(r => setMarches(r.data?.data || []))
      .catch(() => setMarches([]))
      .finally(() => setLoading(false));
  }, []);

  const loadStats = useCallback(() => {
    marchesPrivesApi.stats().then(r => setStats(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    loadStats();
    clientsApi.list({ limit: 500 }).then(r => setClients(r.data?.data || r.data || [])).catch(() => {});
    assignableUsersApi.list().then(r => setUsers(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, [load, loadStats]);

  useEffect(() => {
    if (marches.length && !selectedMarcheId) setSelectedMarcheId(marches[0].id);
  }, [marches, selectedMarcheId]);

  const refreshAfterMutation = () => { load(); loadStats(); };

  /* ── Form ── */
  const openCreate = () => { setEditTarget(null); setForm({ ...emptyForm }); setSaveError(''); setShowForm(true); };
  const openEdit = (m: any) => {
    setEditTarget(m);
    setForm({
      objet: m.objet || '', reference: m.reference || '', client_id: m.client_id || '', client_name: m.client_name || '',
      ville: m.ville || '', budget_estimatif: m.budget_estimatif != null ? String(m.budget_estimatif) : '', devise: m.devise || 'MAD',
      date_limite: m.date_limite ? String(m.date_limite).slice(0, 10) : '', source: m.source || '',
      score_ia: m.score_ia != null ? String(m.score_ia) : '', responsable_id: m.responsable_id || '', notes: m.notes || '',
    });
    setSaveError('');
    setShowForm(true);
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.objet.trim()) { setSaveError("L'objet du marché est requis"); return; }
    setSaving(true);
    setSaveError('');
    const payload: any = {
      ...form,
      budget_estimatif: form.budget_estimatif ? Number(form.budget_estimatif) : undefined,
      score_ia: form.score_ia ? Number(form.score_ia) : undefined,
      date_limite: form.date_limite || undefined,
      client_id: form.client_id || undefined,
      responsable_id: form.responsable_id || undefined,
    };
    try {
      if (editTarget) await marchesPrivesApi.update(editTarget.id, payload);
      else await marchesPrivesApi.create(payload);
      setShowForm(false);
      refreshAfterMutation();
    } catch (err: any) {
      setSaveError(err?.response?.data?.message || 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await marchesPrivesApi.delete(deleteTarget.id);
      refreshAfterMutation();
    } catch (err) { console.error(err); }
    setDeleting(false);
    setDeleteTarget(null);
  };

  /* ── Transitions de stage ── */
  const doChangeStage = async (m: any, stage: string, extra?: any) => {
    try {
      await marchesPrivesApi.changeStage(m.id, stage, extra);
      refreshAfterMutation();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erreur lors du changement de statut');
    }
  };

  const refuser = async (m: any) => {
    const reason = window.prompt('Motif du refus (optionnel) :') || '';
    try {
      await marchesPrivesApi.update(m.id, { refuse_reason: reason || 'Refusé' });
      refreshAfterMutation();
    } catch (err) { console.error(err); }
  };

  const marquerPerdu = (m: any) => {
    const cause = window.prompt('Cause de la perte (requis) :');
    if (!cause) return;
    doChangeStage(m, 'PERDU', { cause_perte: cause });
  };

  const marquerGagne = (m: any) => {
    const montantStr = window.prompt('Montant final du marché (optionnel) :', m.budget_estimatif ? String(m.budget_estimatif) : '');
    doChangeStage(m, 'GAGNE', montantStr ? { montant_final: Number(montantStr) } : {});
  };

  const transformer = async (m: any) => {
    if (!confirm(`Transformer "${m.objet}" en chantier ?`)) return;
    try {
      await marchesPrivesApi.transformerEnChantier(m.id, {});
      refreshAfterMutation();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erreur lors de la transformation en chantier');
    }
  };

  /* ── Data dérivées ── */
  const nouveaux = marches.filter(m => m.stage === 'NOUVEAU' && !m.refuse_reason);
  const marchesByStage = (stage: string) => stage === 'NOUVEAU' ? nouveaux : marches.filter(m => m.stage === stage);
  const canManage = user?.role === 'ADMIN' || user?.role === 'GERANT';

  const selectedMarche = marches.find(m => m.id === selectedMarcheId) || null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1A141A', margin: 0 }}>📑 Marchés Privés</h1>
          <p style={{ fontSize: 13, color: '#8E5915', margin: '2px 0 0' }}>Cycle de vie complet — de la détection au chantier</p>
        </div>
        {tab === 'nouveaux' && (
          <button style={btnPrimary} onClick={openCreate}><Plus size={15} style={{ verticalAlign: -3, marginRight: 4 }} />Nouveau marché</button>
        )}
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 8, marginBottom: 18, borderBottom: '1px solid #F5E6D3' }}>
        {TOP_TABS.map(tItem => (
          <button
            key={tItem.key}
            onClick={() => setTab(tItem.key)}
            style={{
              padding: '8px 14px', borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer',
              background: tab === tItem.key ? 'white' : 'transparent',
              borderBottom: tab === tItem.key ? '2px solid #E59312' : '2px solid transparent',
              color: tab === tItem.key ? '#1A141A' : '#8E5915',
              fontSize: 12.5, fontWeight: tab === tItem.key ? 700 : 500, whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            {tItem.emoji} {tItem.label}
            {(TAB_TO_STAGE[tItem.key]) && (
              <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#B8A090' }}>
                ({marchesByStage(TAB_TO_STAGE[tItem.key]).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && tab !== 'ia' && tab !== 'parametres' ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#B8A090', fontSize: 13 }}>Chargement…</div>
      ) : (
        <>
          {tab === 'dashboard' && <DashboardTab stats={stats} marches={marches} setTab={setTab} />}

          {PIPELINE_TABS.includes(tab as any) && (
            <PipelineTab
              stage={TAB_TO_STAGE[tab]}
              items={marchesByStage(TAB_TO_STAGE[tab])}
              onView={setViewTarget}
              onEdit={openEdit}
              onDelete={canManage ? setDeleteTarget : undefined}
              onAccepter={(m) => doChangeStage(m, 'RETENU')}
              onRefuser={refuser}
              onDemarrerPrep={(m) => doChangeStage(m, 'EN_PREPARATION')}
              onEnvoyerValidation={(m) => doChangeStage(m, 'A_VALIDER')}
              onToggleDossier={(m, field, val) => marchesPrivesApi.update(m.id, { [field]: val }).then(refreshAfterMutation)}
              onValider={(m) => doChangeStage(m, 'DEPOSE')}
              onGagner={marquerGagne}
              onPerdre={marquerPerdu}
              onTransformer={transformer}
            />
          )}

          {tab === 'documents' && (
            <DocumentsTab marches={marches} selectedId={selectedMarcheId} onSelect={setSelectedMarcheId} onChanged={load} />
          )}

          {tab === 'depenses' && (
            <DepensesTab marches={marches} selectedId={selectedMarcheId} onSelect={setSelectedMarcheId} onChanged={refreshAfterMutation} />
          )}

          {tab === 'calendrier' && <CalendrierTab marches={marches} />}

          {tab === 'statistiques' && <StatistiquesTab stats={stats} />}

          {tab === 'ia' && <AssistantIATab />}

          {tab === 'parametres' && <ParametresTab />}
        </>
      )}

      {/* ── Modal création / édition ── */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
          <form onSubmit={submitForm} style={{ background: 'white', borderRadius: 14, padding: 24, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 800, color: '#1A141A' }}>
              {editTarget ? 'Modifier le marché' : 'Nouveau marché'}
            </h3>
            {saveError && <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '8px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 12 }}>{saveError}</div>}

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Objet du marché *</label>
              <input style={inputStyle} value={form.objet} onChange={e => setForm({ ...form, objet: e.target.value })} required />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Référence</label>
                <input style={inputStyle} value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Ville</label>
                <input style={inputStyle} value={form.ville} onChange={e => setForm({ ...form, ville: e.target.value })} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Client (existant)</label>
                <select style={inputStyle} value={form.client_id} onChange={e => setForm({ ...form, client_id: e.target.value })}>
                  <option value="">— Aucun —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.commercial_name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Ou nom du client (si non enregistré)</label>
                <input style={inputStyle} value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} placeholder="Nom libre" />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Budget estimatif (MAD)</label>
                <input style={inputStyle} type="number" step="0.01" value={form.budget_estimatif} onChange={e => setForm({ ...form, budget_estimatif: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Date limite</label>
                <input style={inputStyle} type="date" value={form.date_limite} onChange={e => setForm({ ...form, date_limite: e.target.value })} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Source</label>
                <input style={inputStyle} value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} placeholder="Site, portail, email…" />
              </div>
              <div>
                <label style={labelStyle}>Score IA (0-100)</label>
                <input style={inputStyle} type="number" min={0} max={100} value={form.score_ia} onChange={e => setForm({ ...form, score_ia: e.target.value })} />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Responsable</label>
              <select style={inputStyle} value={form.responsable_id} onChange={e => setForm({ ...form, responsable_id: e.target.value })}>
                <option value="">— Non assigné —</option>
                {users.map((u: any) => <option key={u.id} value={u.id}>{u.first_name} {u.last_name}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Notes</label>
              <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical' as const }} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" style={btnSecondary} onClick={() => setShowForm(false)}>Annuler</button>
              <button type="submit" style={btnPrimary} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Modal vue détaillée ── */}
      {viewTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 14, padding: 24, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#1A141A' }}>{viewTarget.objet}</h3>
              <StageBadge stage={viewTarget.stage} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
              <p><b>Référence:</b> {viewTarget.reference || '—'}</p>
              <p><b>Ville:</b> {viewTarget.ville || '—'}</p>
              <p><b>Client:</b> {viewTarget.client?.commercial_name || viewTarget.client_name || '—'}</p>
              <p><b>Source:</b> {viewTarget.source || '—'}</p>
              <p><b>Budget estimatif:</b> {viewTarget.budget_estimatif ? `${formatCurrency(Number(viewTarget.budget_estimatif))} ${viewTarget.devise || 'MAD'}` : '—'}</p>
              <p><b>Date limite:</b> {viewTarget.date_limite ? formatDate(viewTarget.date_limite) : '—'}</p>
              <p><b>Score IA:</b> {viewTarget.score_ia ?? '—'}</p>
              <p><b>Documents:</b> {viewTarget.documents?.length || 0}</p>
            </div>
            {viewTarget.notes && <p style={{ fontSize: 13, marginTop: 10 }}><b>Notes:</b> {viewTarget.notes}</p>}
            {viewTarget.refuse_reason && <p style={{ fontSize: 13, marginTop: 10, color: '#DC2626' }}><b>Refusé:</b> {viewTarget.refuse_reason}</p>}
            {viewTarget.cause_perte && <p style={{ fontSize: 13, marginTop: 10, color: '#DC2626' }}><b>Cause de perte:</b> {viewTarget.cause_perte}</p>}
            {viewTarget.montant_final && <p style={{ fontSize: 13, marginTop: 10, color: '#16A34A' }}><b>Montant final:</b> {formatCurrency(Number(viewTarget.montant_final))} {viewTarget.devise || 'MAD'}</p>}
            {viewTarget.project && <p style={{ fontSize: 13, marginTop: 10 }}><b>Chantier lié:</b> {viewTarget.project.code} — {viewTarget.project.name}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button style={btnSecondary} onClick={() => setViewTarget(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal suppression ── */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 14, padding: 24, width: '100%', maxWidth: 400 }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 800, color: '#1A141A' }}>Supprimer ce marché ?</h3>
            <p style={{ fontSize: 13, color: '#8E5915', marginBottom: 18 }}>« {deleteTarget.objet} » sera supprimé définitivement, ainsi que ses documents et dépenses liés.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button style={btnSecondary} onClick={() => setDeleteTarget(null)}>Annuler</button>
              <button style={btnDanger} onClick={confirmDelete} disabled={deleting}>{deleting ? 'Suppression…' : 'Supprimer'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════ Dashboard ══════════════════════════ */
function DashboardTab({ stats, marches, setTab }: { stats: any; marches: any[]; setTab: (t: string) => void }) {
  if (!stats) return <div style={{ textAlign: 'center', padding: 40, color: '#B8A090', fontSize: 13 }}>Chargement des statistiques…</div>;
  const kpis = [
    { label: 'Nouveaux marchés', value: stats.by_stage?.NOUVEAU || 0, tab: 'nouveaux', color: '#3B82F6' },
    { label: 'Opportunités retenues', value: stats.by_stage?.RETENU || 0, tab: 'retenus', color: '#8B5CF6' },
    { label: 'En préparation', value: stats.by_stage?.EN_PREPARATION || 0, tab: 'preparation', color: '#F59E0B' },
    { label: 'Dossiers déposés', value: stats.by_stage?.DEPOSE || 0, tab: 'deposes', color: '#0EA5E9' },
    { label: 'Marchés gagnés', value: stats.by_stage?.GAGNE || 0, tab: 'gagnes', color: '#16A34A' },
    { label: 'Marchés perdus', value: stats.by_stage?.PERDU || 0, tab: 'perdus', color: '#DC2626' },
  ];
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 20 }}>
        {kpis.map(k => (
          <div key={k.label} onClick={() => setTab(k.tab)} style={{ ...card, cursor: 'pointer', borderTop: `3px solid ${k.color}` }}>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#1A141A' }}>{k.value}</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#8E5915', fontWeight: 600 }}>{k.label}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
        <div style={card}>
          <p style={{ margin: 0, fontSize: 12, color: '#8E5915', fontWeight: 700, textTransform: 'uppercase' }}>Dépenses totales (préparation)</p>
          <p style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 800, color: '#1A141A' }}>{formatCurrency(stats.total_depenses || 0)} MAD</p>
        </div>
        <div style={card}>
          <p style={{ margin: 0, fontSize: 12, color: '#8E5915', fontWeight: 700, textTransform: 'uppercase' }}>Taux de réussite</p>
          <p style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 800, color: '#16A34A' }}>{stats.taux_reussite || 0}%</p>
        </div>
      </div>

      <div style={{ ...card, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Bot size={16} color="#8E5915" />
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1A141A' }}>Résumé Assistant IA</p>
        </div>
        <p style={{ margin: 0, fontSize: 12.5, color: '#8E5915' }}>
          {marches.length} marché(s) suivi(s) au total — {stats.by_stage?.NOUVEAU || 0} en attente de décision,{' '}
          {(stats.alertes_dates_limites || []).length} avec échéance dans les 7 prochains jours.
          L'analyse automatique détaillée (résumé AO, CPS, recommandations) sera disponible une fois la clé API IA configurée dans Paramètres.
        </p>
      </div>

      <div style={card}>
        <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#1A141A' }}>⚠️ Alertes — échéances proches (7 jours)</p>
        {(stats.alertes_dates_limites || []).length === 0 ? (
          <p style={{ fontSize: 12.5, color: '#B8A090' }}>Aucune échéance urgente.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stats.alertes_dates_limites.map((m: any) => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#FFFBEB', borderRadius: 8, fontSize: 12.5 }}>
                <span>{m.objet}</span>
                <span style={{ fontWeight: 700, color: '#EA580C' }}>{formatDate(m.date_limite)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════ Pipeline (table générique par étape) ══════════════════════════ */
function PipelineTab(props: {
  stage: string; items: any[];
  onView: (m: any) => void; onEdit: (m: any) => void; onDelete?: (m: any) => void;
  onAccepter: (m: any) => void; onRefuser: (m: any) => void;
  onDemarrerPrep: (m: any) => void; onEnvoyerValidation: (m: any) => void;
  onToggleDossier: (m: any, field: string, val: boolean) => void;
  onValider: (m: any) => void; onGagner: (m: any) => void; onPerdre: (m: any) => void;
  onTransformer: (m: any) => void;
}) {
  const { stage, items } = props;
  if (items.length === 0) return <div style={{ textAlign: 'center', padding: 40, color: '#B8A090', fontSize: 13 }}>Aucun marché dans cette étape.</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map(m => (
        <div key={m.id} style={{ ...card, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, justifyContent: 'space-between' }}>
          <div style={{ flex: '1 1 260px', minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1A141A' }}>{m.objet}</p>
              <StageBadge stage={m.stage} />
            </div>
            <p style={{ margin: 0, fontSize: 12, color: '#8E5915' }}>
              {(m.client?.commercial_name || m.client_name) && <><Building2 size={11} style={{ verticalAlign: -1 }} /> {m.client?.commercial_name || m.client_name} · </>}
              {m.ville && <>{m.ville} · </>}
              {m.budget_estimatif && <>{formatCurrency(Number(m.budget_estimatif))} {m.devise || 'MAD'} · </>}
              {m.date_limite && <>Limite: {formatDate(m.date_limite)}</>}
            </p>
            {stage === 'EN_PREPARATION' && (
              <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11.5 }}>
                {[['dossier_admin_ok', 'Administratif'], ['dossier_technique_ok', 'Technique'], ['dossier_financier_ok', 'Financier']].map(([field, label]) => (
                  <label key={field} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!m[field]} onChange={e => props.onToggleDossier(m, field, e.target.checked)} />
                    {label}
                  </label>
                ))}
              </div>
            )}
            {stage === 'DEPOSE' && m.date_depot && (
              <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#0EA5E9' }}>Déposé le {formatDate(m.date_depot)}</p>
            )}
            {stage === 'GAGNE' && m.montant_final && (
              <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#16A34A', fontWeight: 700 }}>Montant final: {formatCurrency(Number(m.montant_final))} {m.devise || 'MAD'}</p>
            )}
            {stage === 'PERDU' && m.cause_perte && (
              <p style={{ margin: '4px 0 0', fontSize: 11.5, color: '#DC2626' }}>Cause: {m.cause_perte}</p>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button style={btnSmall} onClick={() => props.onView(m)}><Eye size={13} /> Voir</button>
            <button style={btnSmall} onClick={() => props.onEdit(m)}>✏️ Modifier</button>

            {stage === 'NOUVEAU' && (
              <>
                <button style={{ ...btnSmall, background: '#F0FDF4', color: '#16A34A', borderColor: '#BBF7D0' }} onClick={() => props.onAccepter(m)}><Check size={13} /> Accepter</button>
                <button style={{ ...btnSmall, background: '#FEF2F2', color: '#DC2626', borderColor: '#FFCDD2' }} onClick={() => props.onRefuser(m)}><X size={13} /> Refuser</button>
              </>
            )}
            {stage === 'RETENU' && (
              <button style={{ ...btnSmall, background: '#FFFBEB', color: '#D97706', borderColor: '#FDE68A' }} onClick={() => props.onDemarrerPrep(m)}><ArrowRight size={13} /> Démarrer préparation</button>
            )}
            {stage === 'EN_PREPARATION' && (
              <button style={{ ...btnSmall, background: '#FFF7ED', color: '#EA580C', borderColor: '#FDBA74' }} onClick={() => props.onEnvoyerValidation(m)}><ArrowRight size={13} /> Envoyer à validation</button>
            )}
            {stage === 'A_VALIDER' && (
              <button style={{ ...btnSmall, background: '#F0F9FF', color: '#0EA5E9', borderColor: '#BAE6FD' }} onClick={() => props.onValider(m)}><Check size={13} /> Valider et déposer</button>
            )}
            {stage === 'DEPOSE' && (
              <>
                <button style={{ ...btnSmall, background: '#F0FDF4', color: '#16A34A', borderColor: '#BBF7D0' }} onClick={() => props.onGagner(m)}>🏆 Gagné</button>
                <button style={{ ...btnSmall, background: '#FEF2F2', color: '#DC2626', borderColor: '#FFCDD2' }} onClick={() => props.onPerdre(m)}>❌ Perdu</button>
              </>
            )}
            {stage === 'GAGNE' && !m.project_id && (
              <button style={{ ...btnSmall, background: '#F0FDF4', color: '#16A34A', borderColor: '#BBF7D0' }} onClick={() => props.onTransformer(m)}>🏗️ Transformer en chantier</button>
            )}
            {stage === 'GAGNE' && m.project_id && (
              <span style={{ fontSize: 11.5, color: '#16A34A', fontWeight: 700, alignSelf: 'center' }}>✓ Chantier créé</span>
            )}
            {props.onDelete && <button style={{ ...btnSmall, color: '#DC2626' }} onClick={() => props.onDelete!(m)}><Trash2 size={13} /></button>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════ Bibliothèque documentaire ══════════════════════════ */
function DocumentsTab({ marches, selectedId, onSelect, onChanged }: { marches: any[]; selectedId: string; onSelect: (id: string) => void; onChanged: () => void }) {
  const marche = marches.find(m => m.id === selectedId);
  const [uploading, setUploading] = useState(false);
  const [docForm, setDocForm] = useState({ nom: '', type: 'AUTRE', obligatoire: false, expire_at: '' });
  const [file, setFile] = useState<File | null>(null);

  const addDoc = async () => {
    if (!marche || !file || !docForm.nom.trim()) { alert('Nom et fichier requis'); return; }
    setUploading(true);
    try {
      const up = await uploadApi.upload(file);
      const fileUrl = up.data?.url || up.data?.secure_url || up.data?.file_url;
      await marchesPrivesApi.addDocument(marche.id, { ...docForm, file_url: fileUrl, expire_at: docForm.expire_at || undefined });
      setDocForm({ nom: '', type: 'AUTRE', obligatoire: false, expire_at: '' });
      setFile(null);
      onChanged();
    } catch (err: any) {
      alert(err?.response?.data?.message || "Erreur lors de l'ajout du document");
    } finally {
      setUploading(false);
    }
  };

  const deleteDoc = async (docId: string) => {
    if (!confirm('Supprimer ce document ?')) return;
    await marchesPrivesApi.deleteDocument(docId);
    onChanged();
  };

  const toggleValide = async (doc: any) => {
    await marchesPrivesApi.updateDocument(doc.id, { valide: !doc.valide });
    onChanged();
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Marché</label>
        <select style={{ ...inputStyle, maxWidth: 420 }} value={selectedId} onChange={e => onSelect(e.target.value)}>
          <option value="">— Sélectionner un marché —</option>
          {marches.map(m => <option key={m.id} value={m.id}>{m.objet}</option>)}
        </select>
      </div>

      {!marche ? (
        <p style={{ fontSize: 13, color: '#B8A090' }}>Sélectionnez un marché pour gérer ses documents.</p>
      ) : (
        <>
          <div style={{ ...card, marginBottom: 16, display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr auto auto', gap: 10, alignItems: 'end' }}>
            <div>
              <label style={labelStyle}>Nom du document</label>
              <input style={inputStyle} value={docForm.nom} onChange={e => setDocForm({ ...docForm, nom: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Type</label>
              <select style={inputStyle} value={docForm.type} onChange={e => setDocForm({ ...docForm, type: e.target.value })}>
                <option value="ADMINISTRATIF">Administratif</option>
                <option value="TECHNIQUE">Technique</option>
                <option value="FINANCIER">Financier</option>
                <option value="AUTRE">Autre</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Expiration</label>
              <input style={inputStyle} type="date" value={docForm.expire_at} onChange={e => setDocForm({ ...docForm, expire_at: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Fichier</label>
              <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} style={{ fontSize: 12 }} />
            </div>
            <button style={btnPrimary} onClick={addDoc} disabled={uploading}><Upload size={13} style={{ verticalAlign: -2, marginRight: 4 }} />{uploading ? 'Envoi…' : 'Ajouter'}</button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(marche.documents || []).length === 0 && <p style={{ fontSize: 13, color: '#B8A090' }}>Aucun document.</p>}
            {(marche.documents || []).map((doc: any) => (
              <div key={doc.id} style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <FileText size={16} color="#8E5915" />
                  <div>
                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 700, color: '#1A141A', textDecoration: 'none' }}>{doc.nom}</a>
                    <p style={{ margin: 0, fontSize: 11, color: '#8E5915' }}>
                      {doc.type} {doc.obligatoire && '· obligatoire'} {doc.expire_at && `· expire ${formatDate(doc.expire_at)}`}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <button style={{ ...btnSmall, background: doc.valide ? '#F0FDF4' : 'white', color: doc.valide ? '#16A34A' : '#8E5915' }} onClick={() => toggleValide(doc)}>
                    {doc.valide ? '✓ Validé' : 'Valider'}
                  </button>
                  <button style={{ ...btnSmall, color: '#DC2626' }} onClick={() => deleteDoc(doc.id)}><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════ Dépenses ══════════════════════════ */
function DepensesTab({ marches, selectedId, onSelect, onChanged }: { marches: any[]; selectedId: string; onSelect: (id: string) => void; onChanged: () => void }) {
  const marche = marches.find(m => m.id === selectedId);
  const [form, setForm] = useState({ libelle: '', montant: '', categorie: '', date: new Date().toISOString().slice(0, 10), notes: '' });
  const [saving, setSaving] = useState(false);

  const addDepense = async () => {
    if (!marche || !form.libelle.trim() || !form.montant) { alert('Libellé et montant requis'); return; }
    setSaving(true);
    try {
      await marchesPrivesApi.addDepense(marche.id, { ...form, montant: Number(form.montant) });
      setForm({ libelle: '', montant: '', categorie: '', date: new Date().toISOString().slice(0, 10), notes: '' });
      onChanged();
    } catch (err: any) {
      alert(err?.response?.data?.message || "Erreur lors de l'ajout de la dépense");
    } finally {
      setSaving(false);
    }
  };

  const deleteDepense = async (id: string) => {
    if (!confirm('Supprimer cette dépense ?')) return;
    await marchesPrivesApi.deleteDepense(id);
    onChanged();
  };

  const total = (marche?.depenses || []).reduce((s: number, d: any) => s + Number(d.montant), 0);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Marché</label>
        <select style={{ ...inputStyle, maxWidth: 420 }} value={selectedId} onChange={e => onSelect(e.target.value)}>
          <option value="">— Sélectionner un marché —</option>
          {marches.map(m => <option key={m.id} value={m.id}>{m.objet}</option>)}
        </select>
      </div>

      {!marche ? (
        <p style={{ fontSize: 13, color: '#B8A090' }}>Sélectionnez un marché pour gérer ses dépenses de préparation.</p>
      ) : (
        <>
          <div style={{ ...card, marginBottom: 16, display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
            <div>
              <label style={labelStyle}>Libellé</label>
              <input style={inputStyle} value={form.libelle} onChange={e => setForm({ ...form, libelle: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Montant (MAD)</label>
              <input style={inputStyle} type="number" step="0.01" value={form.montant} onChange={e => setForm({ ...form, montant: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Catégorie</label>
              <input style={inputStyle} value={form.categorie} onChange={e => setForm({ ...form, categorie: e.target.value })} placeholder="Impression, déplacement…" />
            </div>
            <div>
              <label style={labelStyle}>Date</label>
              <input style={inputStyle} type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </div>
            <button style={btnPrimary} onClick={addDepense} disabled={saving}><Plus size={13} style={{ verticalAlign: -2 }} />{saving ? '…' : 'Ajouter'}</button>
          </div>

          <div style={{ ...card, marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1A141A' }}>Total dépenses préparation</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#8E5915' }}>{formatCurrency(total)} MAD</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(marche.depenses || []).length === 0 && <p style={{ fontSize: 13, color: '#B8A090' }}>Aucune dépense.</p>}
            {(marche.depenses || []).map((d: any) => (
              <div key={d.id} style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px' }}>
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1A141A' }}>{d.libelle}</p>
                  <p style={{ margin: 0, fontSize: 11, color: '#8E5915' }}>{d.categorie || 'Sans catégorie'} · {formatDate(d.date)}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1A141A' }}>{formatCurrency(Number(d.montant))} MAD</span>
                  <button style={{ ...btnSmall, color: '#DC2626' }} onClick={() => deleteDepense(d.id)}><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════ Calendrier ══════════════════════════ */
function CalendrierTab({ marches }: { marches: any[] }) {
  const events: { date: string; label: string; type: string }[] = [];
  marches.forEach(m => {
    if (m.date_limite) events.push({ date: m.date_limite, label: `Date limite — ${m.objet}`, type: 'limite' });
    if (m.date_depot) events.push({ date: m.date_depot, label: `Dépôt — ${m.objet}`, type: 'depot' });
  });
  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div>
      <p style={{ fontSize: 12.5, color: '#8E5915', marginBottom: 14 }}>
        <CalendarIcon size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
        Dates limites et dépôts issus des marchés privés. La synchronisation avec le module Agenda pourra être ajoutée dans une prochaine itération, sur validation.
      </p>
      {events.length === 0 ? (
        <p style={{ fontSize: 13, color: '#B8A090' }}>Aucune échéance enregistrée.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {events.map((ev, i) => (
            <div key={i} style={{ ...card, display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderLeft: `3px solid ${ev.type === 'limite' ? '#EA580C' : '#0EA5E9'}` }}>
              <span style={{ fontSize: 13 }}>{ev.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1A141A' }}>{formatDate(ev.date)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════ Statistiques ══════════════════════════ */
function StatistiquesTab({ stats }: { stats: any }) {
  if (!stats) return <div style={{ textAlign: 'center', padding: 40, color: '#B8A090', fontSize: 13 }}>Chargement…</div>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
      <div style={card}>
        <TrendingUp size={16} color="#16A34A" />
        <p style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 800 }}>{stats.taux_reussite || 0}%</p>
        <p style={{ margin: 0, fontSize: 12, color: '#8E5915' }}>Taux de réussite (gagnés / gagnés+perdus)</p>
      </div>
      <div style={card}>
        <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#16A34A' }}>{formatCurrency(stats.montant_total_gagne || 0)} MAD</p>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#8E5915' }}>Montant total des marchés gagnés</p>
      </div>
      <div style={card}>
        <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#DC2626' }}>{formatCurrency(stats.montant_total_perdu || 0)} MAD</p>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#8E5915' }}>Budget estimatif des marchés perdus</p>
      </div>
      <div style={card}>
        <p style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{formatCurrency(stats.total_depenses || 0)} MAD</p>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#8E5915' }}>Dépenses cumulées de préparation</p>
      </div>
      {Object.entries(stats.by_stage || {}).map(([stage, count]) => (
        <div key={stage} style={card}>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{count as number}</p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#8E5915' }}>{STAGE_CONFIG[stage]?.label || stage}</p>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════ Assistant IA (placeholder Lot 1) ══════════════════════════ */
function AssistantIATab() {
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Bot size={20} color="#8E5915" />
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1A141A' }}>Assistant IA — Marchés Privés</h3>
      </div>
      <p style={{ fontSize: 13, color: '#5C3A1E', lineHeight: 1.6 }}>
        L'assistant IA (résumé d'AO, analyse de CPS, réponses aux questions sur un marché, détection des documents manquants,
        recommandations et aide à la préparation des dossiers) sera activé une fois la clé <code>ANTHROPIC_API_KEY</code> configurée
        côté serveur.
      </p>
      <p style={{ fontSize: 12.5, color: '#B8A090' }}>Cette fonctionnalité fait partie d'un prochain lot de développement du module.</p>
    </div>
  );
}

/* ══════════════════════════ Paramètres (placeholder Lot 1) ══════════════════════════ */
function ParametresTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Settings size={18} color="#8E5915" />
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#1A141A' }}>Robot de veille</h3>
        </div>
        <p style={{ fontSize: 13, color: '#5C3A1E' }}>
          La saisie des nouveaux marchés se fait actuellement de façon manuelle, via le bouton « Nouveau marché » de l'onglet
          « Nouveaux marchés ». La détection automatique sur Internet (robot de veille) pourra être ajoutée dans un prochain lot,
          sur validation.
        </p>
      </div>
      <div style={card}>
        <p style={{ fontSize: 13, fontWeight: 700, color: '#1A141A', marginBottom: 6 }}>Assistant IA</p>
        <p style={{ fontSize: 13, color: '#5C3A1E' }}>Clé API : non configurée (ANTHROPIC_API_KEY).</p>
      </div>
    </div>
  );
}
