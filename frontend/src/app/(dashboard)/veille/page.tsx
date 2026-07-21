'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Star, RefreshCw, Settings, Eye, EyeOff, Check, X, ArrowRight,
  Building2, MapPin, Search, TrendingUp, AlertTriangle, ExternalLink,
} from 'lucide-react';
import { veilleApi } from '@/lib/api';
import { formatDate, formatCurrency } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n';

/* ══════════════════════════ Styles partagés (repris de Marchés Privés) ══════════════════════════ */
const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #E8D4B0', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const };
const labelStyle = { display: 'block' as const, fontSize: 11, fontWeight: 700 as const, color: '#8E5915', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 6 };
const btnSecondary = { padding: '9px 18px', borderRadius: 8, border: '1.5px solid #E8D4B0', background: 'white', color: '#8E5915', fontSize: 13, fontWeight: 600 as const, cursor: 'pointer' as const };
const btnPrimary = { padding: '9px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#F4B315,#E59312)', color: '#1A141A', fontSize: 13, fontWeight: 700 as const, cursor: 'pointer' as const };
const btnSmall = { padding: '6px 12px', borderRadius: 7, border: '1.5px solid #E8D4B0', background: 'white', color: '#8E5915', fontSize: 12, fontWeight: 600 as const, cursor: 'pointer' as const, display: 'flex', alignItems: 'center', gap: 5 };
const card = { background: 'white', borderRadius: 12, border: '1px solid #F5E6D3', padding: '16px 20px' };

const TOP_TABS: { key: string; label: string; emoji: string }[] = [
  { key: 'dashboard',     label: 'Tableau de bord',    emoji: '📊' },
  { key: 'entreprises',   label: 'Entreprises',        emoji: '🏢' },
  { key: 'consultations', label: 'Consultations',      emoji: '📰' },
  { key: 'sources',       label: 'Sources à configurer', emoji: '⚙️' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  ACTIF:        { label: 'Actif',         color: '#16A34A', bg: '#F0FDF4' },
  A_CONFIGURER: { label: 'À configurer',  color: '#D97706', bg: '#FFFBEB' },
  DESACTIVE:    { label: 'Désactivé',     color: '#6B7280', bg: '#F3F4F6' },
  ERREUR:       { label: 'Erreur',        color: '#DC2626', bg: '#FEF2F2' },
};

const ANNONCE_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  NOUVELLE: { label: 'Nouvelle', color: '#3B82F6', bg: '#EFF6FF' },
  VUE:      { label: 'Vue',      color: '#6B7280', bg: '#F3F4F6' },
  IMPORTEE: { label: 'Importée', color: '#16A34A', bg: '#F0FDF4' },
  IGNOREE:  { label: 'Ignorée',  color: '#B8A090', bg: '#F5F5F4' },
  EXPIREE:  { label: 'Expirée',  color: '#DC2626', bg: '#FEF2F2' },
};

const TYPE_OPTIONS = [
  { key: 'PROMOTEUR',    label: 'Promoteur' },
  { key: 'CONSTRUCTION', label: 'Construction' },
  { key: 'INDUSTRIE',    label: 'Industrie' },
  { key: 'AUTOMOBILE',   label: 'Automobile' },
  { key: 'AERONAUTIQUE', label: 'Aéronautique' },
  { key: 'ENERGIE',      label: 'Énergie' },
  { key: 'HOTELLERIE',   label: 'Hôtellerie' },
  { key: 'DISTRIBUTION', label: 'Distribution' },
  { key: 'SANTE',        label: 'Santé' },
  { key: 'LOGISTIQUE',   label: 'Logistique' },
  { key: 'ENSEIGNEMENT', label: 'Enseignement' },
  { key: 'AUTRE',        label: 'Autre' },
];

const emptyEntForm = {
  nom: '', logo_url: '', secteur: '', ville: '', site_officiel: '',
  type_entreprise: 'AUTRE', pages_surveillees: '', frequence_cron: '0 */6 * * *', categorie_defaut: '',
};

const emptyConfigForm = {
  site_officiel: '',
  listUrl: '', listSelector: '', titleSelector: '', linkSelector: '', descriptionSelector: '',
  dateLimiteSelector: '', datePublicationSelector: '', villeSelector: '', budgetSelector: '',
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { label: status, color: '#6B7280', bg: '#F3F4F6' };
  return <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg }}>{cfg.label}</span>;
}

function AnnonceBadge({ status }: { status: string }) {
  const cfg = ANNONCE_STATUS_CONFIG[status] || { label: status, color: '#6B7280', bg: '#F3F4F6' };
  return <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg }}>{cfg.label}</span>;
}

function getUser() { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } }

export default function VeillePage() {
  useLanguage();
  const user = getUser();
  const canManage = user?.role === 'ADMIN' || user?.role === 'GERANT';

  const [tab, setTab] = useState<string>('dashboard');
  const [stats, setStats] = useState<any>(null);
  const [aConfigurerCount, setAConfigurerCount] = useState(0);

  const loadStats = useCallback(() => {
    veilleApi.entreprises.dashboard().then(r => setStats(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    loadStats();
    veilleApi.entreprises.aConfigurer().then(r => setAConfigurerCount((r.data || []).length)).catch(() => {});
  }, [loadStats]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1A141A', margin: 0 }}>🔎 Veille commerciale</h1>
          <p style={{ fontSize: 13, color: '#8E5915', margin: '2px 0 0' }}>Détection automatique d'opportunités — 100% gratuit, sans API IA payante</p>
        </div>
      </div>

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
            {tItem.key === 'sources' && aConfigurerCount > 0 && (
              <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#D97706' }}>({aConfigurerCount})</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && <DashboardTab stats={stats} setTab={setTab} />}
      {tab === 'entreprises' && <EntreprisesTab canManage={canManage} onChanged={() => { loadStats(); veilleApi.entreprises.aConfigurer().then(r => setAConfigurerCount((r.data || []).length)).catch(() => {}); }} />}
      {tab === 'consultations' && <ConsultationsTab />}
      {tab === 'sources' && <SourcesTab canManage={canManage} onChanged={() => { loadStats(); veilleApi.entreprises.aConfigurer().then(r => setAConfigurerCount((r.data || []).length)).catch(() => {}); }} />}
    </div>
  );
}

/* ══════════════════════════ Dashboard ══════════════════════════ */
function DashboardTab({ stats, setTab }: { stats: any; setTab: (t: string) => void }) {
  if (!stats) return <div style={{ textAlign: 'center', padding: 40, color: '#B8A090', fontSize: 13 }}>Chargement des statistiques…</div>;

  const kpis = [
    { label: 'Entreprises surveillées', value: stats.total_entreprises || 0, color: '#3B82F6' },
    { label: 'Actives', value: stats.entreprises_actives || 0, color: '#16A34A' },
    { label: 'À configurer', value: stats.entreprises_a_configurer || 0, color: '#D97706' },
    { label: 'En erreur', value: stats.entreprises_en_erreur || 0, color: '#DC2626' },
    { label: 'Consultations totales', value: stats.total_consultations || 0, color: '#8B5CF6' },
    { label: "Nouvelles aujourd'hui", value: stats.nouvelles_consultations_aujourdhui || 0, color: '#0EA5E9' },
  ];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 20 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ ...card, borderTop: `3px solid ${k.color}` }}>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 800, color: '#1A141A' }}>{k.value}</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#8E5915', fontWeight: 600 }}>{k.label}</p>
          </div>
        ))}
      </div>

      {stats.entreprises_a_configurer > 0 && (
        <div style={{ ...card, marginBottom: 20, borderLeft: '3px solid #D97706', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setTab('sources')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} color="#D97706" />
            <span style={{ fontSize: 13, color: '#5C3A1E' }}>{stats.entreprises_a_configurer} entreprise(s) attendent une configuration de sélecteurs pour démarrer la veille automatique.</span>
          </div>
          <ArrowRight size={14} color="#D97706" />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
        <div style={card}>
          <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#1A141A' }}>Répartition par secteur</p>
          {(stats.repartition_par_secteur || []).length === 0 ? (
            <p style={{ fontSize: 12.5, color: '#B8A090' }}>Aucune donnée pour le moment.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {stats.repartition_par_secteur.slice(0, 8).map((s: any) => (
                <div key={s.secteur} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span style={{ color: '#5C3A1E' }}>{s.secteur || '—'}</span>
                  <span style={{ fontWeight: 700, color: '#1A141A' }}>{s.total}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={card}>
          <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: '#1A141A' }}>Répartition par ville</p>
          {(stats.repartition_par_ville || []).length === 0 ? (
            <p style={{ fontSize: 12.5, color: '#B8A090' }}>Aucune donnée pour le moment.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {stats.repartition_par_ville.slice(0, 8).map((v: any) => (
                <div key={v.ville} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span style={{ color: '#5C3A1E' }}>{v.ville || '—'}</span>
                  <span style={{ fontWeight: 700, color: '#1A141A' }}>{v.total}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <TrendingUp size={16} color="#8E5915" />
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1A141A' }}>Entreprises les plus actives</p>
        </div>
        {(stats.entreprises_plus_actives || []).length === 0 ? (
          <p style={{ fontSize: 12.5, color: '#B8A090' }}>Aucune donnée pour le moment.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stats.entreprises_plus_actives.map((e: any) => (
              <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#FFFBF5', borderRadius: 8, fontSize: 12.5 }}>
                <span>{e.nom} {e.secteur && <span style={{ color: '#B8A090' }}>· {e.secteur}</span>}</span>
                <span style={{ fontWeight: 700, color: '#8E5915' }}>{e.total_consultations} consultation(s)</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════ Entreprises ══════════════════════════ */
function EntreprisesTab({ canManage, onChanged }: { canManage: boolean; onChanged: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', type_entreprise: '', secteur: '', ville: '', search: '', favoris: false });

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [form, setForm] = useState({ ...emptyEntForm });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [detailTarget, setDetailTarget] = useState<any>(null);
  const [syncingId, setSyncingId] = useState<string>('');

  const load = useCallback(() => {
    setLoading(true);
    const params: any = { limit: 200 };
    if (filters.status) params.status = filters.status;
    if (filters.type_entreprise) params.type_entreprise = filters.type_entreprise;
    if (filters.secteur) params.secteur = filters.secteur;
    if (filters.ville) params.ville = filters.ville;
    if (filters.search) params.search = filters.search;
    if (filters.favoris) params.favoris = '1';
    veilleApi.entreprises.list(params)
      .then(r => setItems(r.data?.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditTarget(null); setForm({ ...emptyEntForm }); setSaveError(''); setShowForm(true); };
  const openEdit = (e: any) => {
    setEditTarget(e);
    setForm({
      nom: e.nom || '', logo_url: e.logo_url || '', secteur: e.secteur || '', ville: e.ville || '',
      site_officiel: e.site_officiel || '', type_entreprise: e.type_entreprise || 'AUTRE',
      pages_surveillees: (e.pages_surveillees || []).join(', '), frequence_cron: e.frequence_cron || '0 */6 * * *',
      categorie_defaut: e.categorie_defaut || '',
    });
    setSaveError(''); setShowForm(true);
  };

  const submitForm = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.nom.trim()) { setSaveError("Le nom de l'entreprise est requis"); return; }
    setSaving(true); setSaveError('');
    const payload: any = {
      ...form,
      pages_surveillees: form.pages_surveillees.split(',').map(p => p.trim()).filter(Boolean),
    };
    try {
      if (editTarget) await veilleApi.entreprises.update(editTarget.id, payload);
      else await veilleApi.entreprises.create(payload);
      setShowForm(false);
      load(); onChanged();
    } catch (err: any) {
      setSaveError(err?.response?.data?.message || "Erreur lors de l'enregistrement");
    } finally { setSaving(false); }
  };

  const doSync = async (e: any) => {
    setSyncingId(e.id);
    try {
      await veilleApi.entreprises.syncNow(e.id);
      load(); onChanged();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erreur lors de la synchronisation');
    } finally { setSyncingId(''); }
  };

  const doToggleFavori = async (e: any) => {
    try { await veilleApi.entreprises.toggleFavori(e.id); load(); } catch (err) { console.error(err); }
  };

  const openDetail = async (e: any) => {
    try {
      const r = await veilleApi.entreprises.get(e.id);
      setDetailTarget(r.data);
    } catch { setDetailTarget(e); }
  };

  return (
    <div>
      <div style={{ ...card, marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'end' }}>
        <div style={{ flex: '1 1 200px' }}>
          <label style={labelStyle}>Recherche</label>
          <input style={inputStyle} placeholder="Nom de l'entreprise…" value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} />
        </div>
        <div style={{ width: 160 }}>
          <label style={labelStyle}>Statut</label>
          <select style={inputStyle} value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
            <option value="">Tous</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div style={{ width: 170 }}>
          <label style={labelStyle}>Type</label>
          <select style={inputStyle} value={filters.type_entreprise} onChange={e => setFilters({ ...filters, type_entreprise: e.target.value })}>
            <option value="">Tous</option>
            {TYPE_OPTIONS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        <div style={{ width: 140 }}>
          <label style={labelStyle}>Ville</label>
          <input style={inputStyle} value={filters.ville} onChange={e => setFilters({ ...filters, ville: e.target.value })} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#8E5915', paddingBottom: 9, cursor: 'pointer' }}>
          <input type="checkbox" checked={filters.favoris} onChange={e => setFilters({ ...filters, favoris: e.target.checked })} /> Favoris uniquement
        </label>
        {canManage && (
          <button style={btnPrimary} onClick={openCreate}><Plus size={15} style={{ verticalAlign: -3, marginRight: 4 }} />Nouvelle entreprise</button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#B8A090', fontSize: 13 }}>Chargement…</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#B8A090', fontSize: 13 }}>Aucune entreprise trouvée.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
          {items.map(e => (
            <div key={e.id} style={{ ...card, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1 }} onClick={() => openDetail(e)}>
                  {e.logo_url ? (
                    <img src={e.logo_url} alt={e.nom} style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F5E6D3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Building2 size={16} color="#8E5915" />
                    </div>
                  )}
                  <div>
                    <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#1A141A' }}>{e.nom}</p>
                    <p style={{ margin: 0, fontSize: 11, color: '#8E5915' }}>{e.secteur || '—'} {e.ville && <>· <MapPin size={9} style={{ verticalAlign: -1 }} /> {e.ville}</>}</p>
                  </div>
                </div>
                <button onClick={() => doToggleFavori(e)} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 2 }}>
                  <Star size={16} color={e.favoris?.length ? '#F4B315' : '#D8C4A8'} fill={e.favoris?.length ? '#F4B315' : 'none'} />
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <StatusBadge status={e.status} />
                <span style={{ fontSize: 11, color: '#8E5915' }}>{e._count?.consultations ?? 0} consultation(s)</span>
              </div>

              <p style={{ margin: 0, fontSize: 10.5, color: '#B8A090' }}>
                Dernière sync : {e.last_sync_at ? formatDate(e.last_sync_at) : 'jamais'}
                {e.taux_reussite != null && <> · réussite {Math.round(e.taux_reussite * 100)}%</>}
              </p>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button style={btnSmall} onClick={() => doSync(e)} disabled={syncingId === e.id}>
                  <RefreshCw size={12} className={syncingId === e.id ? 'etcc-spinner' : ''} /> {syncingId === e.id ? 'Sync…' : 'Surveiller'}
                </button>
                {canManage && <button style={btnSmall} onClick={() => openEdit(e)}>✏️ Modifier</button>}
                {e.site_officiel && (
                  <a href={e.site_officiel} target="_blank" rel="noopener noreferrer" style={{ ...btnSmall, textDecoration: 'none' }}>
                    <ExternalLink size={12} /> Site
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal création / édition ── */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
          <form onSubmit={submitForm} style={{ background: 'white', borderRadius: 14, padding: 24, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 800, color: '#1A141A' }}>{editTarget ? "Modifier l'entreprise" : 'Nouvelle entreprise à surveiller'}</h3>
            {saveError && <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '8px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 12 }}>{saveError}</div>}

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Nom *</label>
              <input style={inputStyle} value={form.nom} onChange={e => setForm({ ...form, nom: e.target.value })} required />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Secteur</label>
                <input style={inputStyle} value={form.secteur} onChange={e => setForm({ ...form, secteur: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Ville</label>
                <input style={inputStyle} value={form.ville} onChange={e => setForm({ ...form, ville: e.target.value })} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Type</label>
                <select style={inputStyle} value={form.type_entreprise} onChange={e => setForm({ ...form, type_entreprise: e.target.value })}>
                  {TYPE_OPTIONS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Site officiel</label>
                <input style={inputStyle} placeholder="https://…" value={form.site_officiel} onChange={e => setForm({ ...form, site_officiel: e.target.value })} />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Logo (URL)</label>
              <input style={inputStyle} value={form.logo_url} onChange={e => setForm({ ...form, logo_url: e.target.value })} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Pages à surveiller (séparées par des virgules)</label>
              <input style={inputStyle} placeholder="/appels-offres, /consultations, /fournisseurs…" value={form.pages_surveillees} onChange={e => setForm({ ...form, pages_surveillees: e.target.value })} />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Fréquence de synchronisation (cron)</label>
              <input style={inputStyle} value={form.frequence_cron} onChange={e => setForm({ ...form, frequence_cron: e.target.value })} />
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#B8A090' }}>Ex: "0 */6 * * *" = toutes les 6 heures</p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" style={btnSecondary} onClick={() => setShowForm(false)}>Annuler</button>
              <button type="submit" style={btnPrimary} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Modal détail ── */}
      {detailTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 14, padding: 24, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#1A141A' }}>{detailTarget.nom}</h3>
              <StatusBadge status={detailTarget.status} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13, marginBottom: 12 }}>
              <p><b>Secteur:</b> {detailTarget.secteur || '—'}</p>
              <p><b>Ville:</b> {detailTarget.ville || '—'}</p>
              <p><b>Total consultations:</b> {detailTarget.total_consultations ?? detailTarget._count?.consultations ?? 0}</p>
              <p><b>Erreurs:</b> {detailTarget.total_erreurs ?? 0}</p>
              <p><b>Taux de réussite:</b> {detailTarget.taux_reussite != null ? `${Math.round(detailTarget.taux_reussite * 100)}%` : '—'}</p>
              <p><b>Dernière consultation:</b> {detailTarget.derniere_consultation_at ? formatDate(detailTarget.derniere_consultation_at) : '—'}</p>
            </div>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#1A141A', marginBottom: 6 }}>Historique des synchronisations</p>
            {(detailTarget.logs || []).length === 0 ? (
              <p style={{ fontSize: 12.5, color: '#B8A090' }}>Aucune synchronisation encore.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {detailTarget.logs.map((l: any) => (
                  <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#FFFBF5', borderRadius: 6, fontSize: 11.5 }}>
                    <span>{formatDate(l.started_at)} — {l.status}</span>
                    <span>{l.annonces_nouvelles} nouvelle(s), {l.annonces_maj} maj</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button style={btnSecondary} onClick={() => setDetailTarget(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════ Consultations ══════════════════════════ */
function ConsultationsTab() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ q: '', secteur: '', ville: '', categorie: '', status: '' });
  const [detailTarget, setDetailTarget] = useState<any>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params: any = { limit: 100 };
    if (filters.q) params.q = filters.q;
    if (filters.secteur) params.secteur = filters.secteur;
    if (filters.ville) params.ville = filters.ville;
    if (filters.categorie) params.categorie = filters.categorie;
    if (filters.status) params.status = filters.status;
    veilleApi.consultations.search(params)
      .then(r => { setItems(r.data?.items || []); setTotal(r.data?.total || 0); })
      .catch(() => { setItems([]); setTotal(0); })
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (c: any) => {
    try {
      const r = await veilleApi.consultations.get(c.id);
      setDetailTarget(r.data);
      if (c.status === 'NOUVELLE') { veilleApi.consultations.markVue(c.id).then(load).catch(() => {}); }
    } catch { setDetailTarget(c); }
  };

  const doIgnorer = async (c: any) => {
    try { await veilleApi.consultations.ignorer(c.id); load(); setDetailTarget(null); } catch (err) { console.error(err); }
  };

  const doImporter = async (c: any) => {
    if (!confirm(`Importer "${c.title}" vers Marchés Privés ?`)) return;
    try {
      await veilleApi.consultations.importer(c.id);
      alert('Consultation importée vers Marchés Privés.');
      load(); setDetailTarget(null);
    } catch (err: any) {
      alert(err?.response?.data?.message || "Erreur lors de l'import");
    }
  };

  return (
    <div>
      <div style={{ ...card, marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'end' }}>
        <div style={{ flex: '1 1 220px' }}>
          <label style={labelStyle}><Search size={11} style={{ verticalAlign: -1 }} /> Recherche</label>
          <input style={inputStyle} placeholder="Mots-clés (recherche plein texte)…" value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value })} />
        </div>
        <div style={{ width: 150 }}>
          <label style={labelStyle}>Secteur</label>
          <input style={inputStyle} value={filters.secteur} onChange={e => setFilters({ ...filters, secteur: e.target.value })} />
        </div>
        <div style={{ width: 150 }}>
          <label style={labelStyle}>Ville</label>
          <input style={inputStyle} value={filters.ville} onChange={e => setFilters({ ...filters, ville: e.target.value })} />
        </div>
        <div style={{ width: 160 }}>
          <label style={labelStyle}>Statut</label>
          <select style={inputStyle} value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
            <option value="">Tous</option>
            {Object.entries(ANNONCE_STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>

      <p style={{ fontSize: 12, color: '#8E5915', marginBottom: 10 }}>{total} consultation(s) trouvée(s)</p>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#B8A090', fontSize: 13 }}>Chargement…</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#B8A090', fontSize: 13 }}>Aucune consultation trouvée.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((c: any) => (
            <div key={c.id} style={{ ...card, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => openDetail(c)}>
              <div style={{ flex: '1 1 260px', minWidth: 220 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1A141A' }}>{c.title}</p>
                  <AnnonceBadge status={c.status} />
                </div>
                <p style={{ margin: 0, fontSize: 12, color: '#8E5915' }}>
                  {(c.entreprise?.nom || c.entreprise_nom) && <>{c.entreprise?.nom || c.entreprise_nom} · </>}
                  {c.ville && <>{c.ville} · </>}
                  {c.budget_estimatif && <>{formatCurrency(Number(c.budget_estimatif))} {c.devise || 'MAD'} · </>}
                  {c.date_limite && <>Limite: {formatDate(c.date_limite)}</>}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                {c.status !== 'IGNOREE' && <button style={btnSmall} onClick={() => doIgnorer(c)}><EyeOff size={12} /> Ignorer</button>}
                {c.status !== 'IMPORTEE' && !c.imported_marche_id && <button style={{ ...btnSmall, background: '#F0FDF4', color: '#16A34A', borderColor: '#BBF7D0' }} onClick={() => doImporter(c)}><Check size={12} /> Importer</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Modal détail consultation ── */}
      {detailTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
          <div style={{ background: 'white', borderRadius: 14, padding: 24, width: '100%', maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1A141A' }}>{detailTarget.title}</h3>
              <AnnonceBadge status={detailTarget.status} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13, marginBottom: 10 }}>
              <p><b>Entreprise:</b> {detailTarget.entreprise?.nom || '—'}</p>
              <p><b>Catégorie:</b> {detailTarget.categorie || '—'}</p>
              <p><b>Ville:</b> {detailTarget.ville || '—'}</p>
              <p><b>Maître d'ouvrage:</b> {detailTarget.maitre_ouvrage || '—'}</p>
              <p><b>Budget estimatif:</b> {detailTarget.budget_estimatif ? `${formatCurrency(Number(detailTarget.budget_estimatif))} ${detailTarget.devise || 'MAD'}` : '—'}</p>
              <p><b>Date limite:</b> {detailTarget.date_limite ? formatDate(detailTarget.date_limite) : '—'}</p>
              <p><b>Publication:</b> {detailTarget.date_publication ? formatDate(detailTarget.date_publication) : '—'}</p>
              <p><b>Détecté le:</b> {formatDate(detailTarget.first_seen_at)}</p>
            </div>
            {detailTarget.description && <p style={{ fontSize: 13, color: '#5C3A1E', marginBottom: 10 }}>{detailTarget.description}</p>}
            {detailTarget.source_url && (
              <a href={detailTarget.source_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: '#0EA5E9' }}>
                <ExternalLink size={11} style={{ verticalAlign: -1 }} /> Voir la source
              </a>
            )}
            {(detailTarget.history || []).length > 0 && (
              <div style={{ marginTop: 14 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#1A141A', marginBottom: 6 }}>Historique des modifications</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {detailTarget.history.map((h: any) => (
                    <div key={h.id} style={{ fontSize: 11.5, padding: '6px 10px', background: '#FFFBF5', borderRadius: 6 }}>
                      <b>{h.champ}</b> : {h.ancienne_valeur || '—'} → {h.nouvelle_valeur || '—'} <span style={{ color: '#B8A090' }}>({formatDate(h.changed_at)})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {detailTarget.imported_marche_id && (
              <p style={{ marginTop: 10, fontSize: 12.5, color: '#16A34A', fontWeight: 700 }}>✓ Déjà importée vers Marchés Privés</p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              {detailTarget.status !== 'IGNOREE' && <button style={btnSecondary} onClick={() => doIgnorer(detailTarget)}>Ignorer</button>}
              {!detailTarget.imported_marche_id && <button style={btnPrimary} onClick={() => doImporter(detailTarget)}>Importer vers Marchés Privés</button>}
              <button style={btnSecondary} onClick={() => setDetailTarget(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════ Sources à configurer ══════════════════════════ */
function SourcesTab({ canManage, onChanged }: { canManage: boolean; onChanged: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [configTarget, setConfigTarget] = useState<any>(null);
  const [form, setForm] = useState({ ...emptyConfigForm });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    veilleApi.entreprises.aConfigurer()
      .then(r => setItems(r.data || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const openConfig = (e: any) => {
    setConfigTarget(e);
    const cfg = e.config || {};
    setForm({
      site_officiel: e.site_officiel || '',
      listUrl: cfg.listUrl || '', listSelector: cfg.listSelector || '', titleSelector: cfg.titleSelector || '', linkSelector: cfg.linkSelector || '',
      descriptionSelector: cfg.descriptionSelector || '', dateLimiteSelector: cfg.dateLimiteSelector || '',
      datePublicationSelector: cfg.datePublicationSelector || '', villeSelector: cfg.villeSelector || '', budgetSelector: cfg.budgetSelector || '',
    });
    setSaveError('');
  };

  const submitConfig = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!configTarget) return;
    setSaving(true); setSaveError('');
    try {
      if (form.site_officiel !== configTarget.site_officiel) {
        await veilleApi.entreprises.update(configTarget.id, { site_officiel: form.site_officiel });
      }
      await veilleApi.entreprises.configureSelectors(configTarget.id, {
        listUrl: form.listUrl || undefined, listSelector: form.listSelector, titleSelector: form.titleSelector, linkSelector: form.linkSelector,
        descriptionSelector: form.descriptionSelector, dateLimiteSelector: form.dateLimiteSelector,
        datePublicationSelector: form.datePublicationSelector, villeSelector: form.villeSelector, budgetSelector: form.budgetSelector,
      });
      setConfigTarget(null);
      load(); onChanged();
    } catch (err: any) {
      setSaveError(err?.response?.data?.message || 'Erreur lors de la configuration');
    } finally { setSaving(false); }
  };

  const doTestSync = async () => {
    if (!configTarget) return;
    setSaving(true);
    try {
      const r = await veilleApi.entreprises.syncNow(configTarget.id);
      alert(`Résultat : ${r.data?.status} — ${r.data?.annonces_trouvees ?? 0} annonce(s) trouvée(s) (${r.data?.extracteur_utilise || '—'})`);
      load(); onChanged();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Erreur lors du test');
    } finally { setSaving(false); }
  };

  return (
    <div>
      <p style={{ fontSize: 12.5, color: '#8E5915', marginBottom: 14 }}>
        Ces entreprises n'ont pas encore de site officiel configuré, ou l'extraction générique (RSS, JSON-LD, sitemap, heuristiques HTML)
        n'a pas permis de récupérer d'annonces. Configurez les sélecteurs CSS ci-dessous — aucune modification de code n'est nécessaire,
        la synchronisation automatique reprendra dès l'activation.
      </p>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#B8A090', fontSize: 13 }}>Chargement…</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#B8A090', fontSize: 13 }}>Toutes les sources sont configurées 🎉</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((e: any) => (
            <div key={e.id} style={{ ...card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: '#1A141A' }}>{e.nom}</p>
                <p style={{ margin: 0, fontSize: 11.5, color: '#8E5915' }}>{e.site_officiel || 'Site officiel non renseigné'} {e.total_erreurs > 0 && <>· {e.total_erreurs} erreur(s)</>}</p>
              </div>
              {canManage && <button style={btnPrimary} onClick={() => openConfig(e)}><Settings size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Configurer</button>}
            </div>
          ))}
        </div>
      )}

      {configTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
          <form onSubmit={submitConfig} style={{ background: 'white', borderRadius: 14, padding: 24, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ margin: '0 0 4px', fontSize: 17, fontWeight: 800, color: '#1A141A' }}>Configurer {configTarget.nom}</h3>
            <p style={{ margin: '0 0 16px', fontSize: 12, color: '#B8A090' }}>Sélecteurs CSS utilisés en dernier recours si RSS/JSON-LD/sitemap ne suffisent pas.</p>
            {saveError && <div style={{ background: '#FEF2F2', color: '#DC2626', padding: '8px 12px', borderRadius: 8, fontSize: 12.5, marginBottom: 12 }}>{saveError}</div>}

            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Site officiel</label>
              <input style={inputStyle} placeholder="https://…" value={form.site_officiel} onChange={e => setForm({ ...form, site_officiel: e.target.value })} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>URL de la page liste (optionnel, sinon site officiel)</label>
              <input style={inputStyle} placeholder="ex: /appels-offres" value={form.listUrl} onChange={e => setForm({ ...form, listUrl: e.target.value })} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>Sélecteur — liste des annonces</label>
              <input style={inputStyle} placeholder="ex: .liste-appels-offres li" value={form.listSelector} onChange={e => setForm({ ...form, listSelector: e.target.value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Sélecteur — titre</label>
                <input style={inputStyle} value={form.titleSelector} onChange={e => setForm({ ...form, titleSelector: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Sélecteur — lien</label>
                <input style={inputStyle} value={form.linkSelector} onChange={e => setForm({ ...form, linkSelector: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Sélecteur — date limite</label>
                <input style={inputStyle} value={form.dateLimiteSelector} onChange={e => setForm({ ...form, dateLimiteSelector: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Sélecteur — date de publication</label>
                <input style={inputStyle} value={form.datePublicationSelector} onChange={e => setForm({ ...form, datePublicationSelector: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={labelStyle}>Sélecteur — ville</label>
                <input style={inputStyle} value={form.villeSelector} onChange={e => setForm({ ...form, villeSelector: e.target.value })} />
              </div>
              <div>
                <label style={labelStyle}>Sélecteur — budget</label>
                <input style={inputStyle} value={form.budgetSelector} onChange={e => setForm({ ...form, budgetSelector: e.target.value })} />
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Sélecteur — description</label>
              <input style={inputStyle} value={form.descriptionSelector} onChange={e => setForm({ ...form, descriptionSelector: e.target.value })} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <button type="button" style={btnSecondary} onClick={doTestSync} disabled={saving}>Tester la synchronisation</button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" style={btnSecondary} onClick={() => setConfigTarget(null)}>Annuler</button>
                <button type="submit" style={btnPrimary} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
