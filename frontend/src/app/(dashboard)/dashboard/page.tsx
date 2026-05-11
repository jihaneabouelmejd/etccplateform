'use client';

import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { projectsApi, devisApi, invoicesApi } from '@/lib/api';
import api from '@/lib/api';
import { useLanguage } from '@/lib/i18n';

/* ─── couleurs ─── */
const GOLD    = '#F4B315';
const ORANGE  = '#E59312';
const DARK    = '#1A141A';
const CARAMEL = '#8E5915';
const CREAM   = '#FDF6E9';
const BEIGE   = '#F5E6D3';

const PIE_COLORS = ['#1565C0', '#F4B315', '#D32F2F', '#2E7D32'];

const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

/* ─── helpers ─── */
const fmt = (n: number) =>
  n >= 1_000_000 ? `${(n/1_000_000).toFixed(2)}M`
  : n >= 1_000   ? `${(n/1_000).toFixed(0)}K`
  : String(Math.round(n));

const card = (accent: string) => ({
  background: 'white',
  borderRadius: 12,
  padding: '18px 20px',
  borderTop: `3px solid ${accent}`,
  boxShadow: '0 2px 8px rgba(142,89,21,0.07)',
  flex: 1, minWidth: 0,
} as const);

/* ─── composants tooltip custom ─── */
const CustomBarTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'white', border:`1px solid ${BEIGE}`, borderRadius:10, padding:'10px 14px', boxShadow:'0 4px 16px rgba(0,0,0,0.1)' }}>
      <p style={{ margin:'0 0 4px', fontSize:11, fontWeight:700, color:CARAMEL, textTransform:'uppercase' }}>{label}</p>
      <p style={{ margin:0, fontSize:14, fontWeight:800, color:DARK, fontFamily:'monospace' }}>
        {Number(payload[0].value).toLocaleString('fr-FR')} MAD
      </p>
    </div>
  );
};

const CustomPieTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'white', border:`1px solid ${BEIGE}`, borderRadius:10, padding:'8px 12px', boxShadow:'0 4px 16px rgba(0,0,0,0.1)' }}>
      <p style={{ margin:0, fontSize:12, fontWeight:700, color:DARK }}>{payload[0].name} : <span style={{ color:payload[0].fill }}>{payload[0].value}</span></p>
    </div>
  );
};

/* ════════════════════════════════════════════════════════ */
export default function DashboardPage() {
  const { t, lang, dir } = useLanguage();
  const MONTHS = lang === 'ar' ? MONTHS_AR : MONTHS_FR;
  const [user, setUser]             = useState<any>({});
  const [loading, setLoading]       = useState(true);

  /* KPIs */
  const [caMonth, setCaMonth]       = useState(0);
  const [caQuarter, setCaQuarter]   = useState(0);
  const [projStats, setProjStats]   = useState<any>({});
  const [taskStats, setTaskStats]   = useState<any>({});
  const [invStats, setInvStats]     = useState<any>({});
  const [alertCount, setAlertCount] = useState(0);

  /* Graphiques */
  const [caChart, setCaChart]       = useState<{name:string; ca:number}[]>([]);
  const [taskChart, setTaskChart]   = useState<{name:string; value:number}[]>([]);

  /* Productivité employés */
  const [empRows, setEmpRows]       = useState<any[]>([]);

  /* Activité récente */
  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const [recentDevis, setRecentDevis]       = useState<any[]>([]);

  useEffect(() => {
    const u = localStorage.getItem('user');
    if (u) setUser(JSON.parse(u));

    const now = new Date();
    const curM = now.getMonth() + 1;
    const curY = now.getFullYear();

    /* 6 derniers mois pour le graphique CA */
    const last6: { m: number; y: number; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(curY, curM - 1 - i, 1);
      last6.push({ m: d.getMonth() + 1, y: d.getFullYear(), label: MONTHS[d.getMonth()] });
    }

    /* trimestre courant: 3 derniers mois */
    const last3 = last6.slice(3);

    Promise.allSettled([
      /* 0 — stats projets   */ projectsApi.stats(),
      /* 1 — stats factures  */ invoicesApi.stats(curM, curY),
      /* 2 — stats tâches    */ api.get('/tasks/stats?all=true'),
      /* 3 — alertes         */ api.get('/alerts?limit=1'),
      /* 4 — projets récents */ projectsApi.list({ limit: 5 }),
      /* 5 — devis récents   */ devisApi.list({ limit: 5 }),
      /* 6 — tâches (tous)   */ api.get('/tasks?limit=200'),
      /* 7-12 — CA 6 mois    */ ...last6.map(({ m, y }) => invoicesApi.stats(m, y)),
    ] as any[]).then((results) => {

      /* projets */
      if (results[0].status === 'fulfilled') setProjStats(results[0].value.data || {});

      /* factures mois courant */
      if (results[1].status === 'fulfilled') {
        const d = results[1].value.data || {};
        setCaMonth(Number(d.total_paid || 0));
        setInvStats(d);
      }

      /* tâches stats globales */
      if (results[2].status === 'fulfilled') {
        const d = results[2].value.data || {};
        setTaskStats(d);
        setTaskChart([
          { name: t('task.todo'),        value: d.todo        || 0 },
          { name: t('task.in_progress'), value: d.in_progress  || 0 },
          { name: t('task.blocked'),     value: d.blocked      || 0 },
          { name: t('task.done'),        value: d.done         || 0 },
        ]);
      }

      /* alertes */
      if (results[3].status === 'fulfilled') {
        const d = results[3].value.data;
        setAlertCount(d?.total || d?.count || (Array.isArray(d) ? d.length : 0));
      }

      /* projets récents */
      if (results[4].status === 'fulfilled') {
        const d = results[4].value.data;
        setRecentProjects(Array.isArray(d) ? d.slice(0,5) : (d?.data || []).slice(0,5));
      }

      /* devis récents */
      if (results[5].status === 'fulfilled') {
        const d = results[5].value.data;
        setRecentDevis(Array.isArray(d) ? d.slice(0,5) : (d?.data || []).slice(0,5));
      }

      /* productivité employés depuis la liste des tâches */
      if (results[6].status === 'fulfilled') {
        const tasks: any[] = results[6].value.data?.data || results[6].value.data || [];
        const map: Record<string, { name: string; todo: number; in_progress: number; blocked: number; done: number }> = {};
        tasks.forEach((t: any) => {
          (t.assignments || []).forEach((a: any) => {
            const uid = a.user_id || a.user?.id;
            if (!uid) return;
            const name = `${a.user?.first_name || ''} ${a.user?.last_name || ''}`.trim() || 'Inconnu';
            if (!map[uid]) map[uid] = { name, todo: 0, in_progress: 0, blocked: 0, done: 0 };
            if (t.status === 'TODO')        map[uid].todo++;
            if (t.status === 'IN_PROGRESS') map[uid].in_progress++;
            if (t.status === 'BLOCKED')     map[uid].blocked++;
            if (t.status === 'DONE')        map[uid].done++;
          });
        });
        setEmpRows(Object.values(map).sort((a, b) => (b.in_progress + b.done) - (a.in_progress + a.done)));
      }

      /* CA 6 mois (results[7] à results[12]) */
      let quarterTotal = 0;
      const chartData = last6.map((item, i) => {
        const r = results[7 + i];
        const ca = r?.status === 'fulfilled' ? Number(r.value.data?.total_paid || 0) : 0;
        if (i >= 3) quarterTotal += ca;
        return { name: item.label, ca };
      });
      setCaChart(chartData);
      setCaQuarter(quarterTotal);

      setLoading(false);
    });
  }, []);

  const statusCfg: Record<string, { label: string; color: string; bg: string }> = {
    ACTIVE:    { label: t('status.active'),    color: '#1565C0', bg: '#E3F2FD' },
    LATE:      { label: t('status.late'),      color: '#E65100', bg: '#FFF3E0' },
    COMPLETED: { label: t('status.completed'), color: '#2E7D32', bg: '#E8F5E9' },
    ARCHIVED:  { label: 'Archivé',             color: '#6D4C41', bg: '#EFEBE9' },
    DRAFT:     { label: t('status.draft'),     color: '#757575', bg: '#F5F5F5' },
    SENT:      { label: t('status.sent'),      color: '#1565C0', bg: '#E3F2FD' },
    VALIDATED: { label: t('status.approved'),  color: '#2E7D32', bg: '#E8F5E9' },
    REJECTED:  { label: t('status.rejected'),  color: '#D32F2F', bg: '#FFEBEE' },
  };

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:40, height:40, border:`3px solid ${BEIGE}`, borderTopColor:GOLD, borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 12px' }} />
        <p style={{ color:CARAMEL, fontSize:13 }}>{t('loading')}</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  /* ── score productivité ── */
  const score = (row: any) => {
    const total = row.todo + row.in_progress + row.blocked + row.done;
    if (!total) return 0;
    return Math.round(((row.done * 1 + row.in_progress * 0.5) / total) * 100);
  };

  const firstName = user?.first_name || user?.username || '';
  const today = new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const role = (user?.role || '').toUpperCase();

  /* ═══════════════════════════════════════════════════════
     DASHBOARD EMPLOYÉ
  ═══════════════════════════════════════════════════════ */
  if (role === 'EMPLOYE') return <EmployeDashboard user={user} firstName={firstName} today={today} />;

  /* ═══════════════════════════════════════════════════════
     DASHBOARD COMPTABLE
  ═══════════════════════════════════════════════════════ */
  if (role === 'COMPTABLE') return <ComptableDashboard user={user} firstName={firstName} today={today} />;

  return (
    <div style={{ maxWidth:1400 }}>

      {/* ── En-tête ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:24 }}>
        <div>
          <h1 style={{ margin:0, fontSize:26, fontWeight:800, color:DARK }}>
            Bonjour{firstName ? `, ${firstName}` : ''} 👋
          </h1>
          <p style={{ margin:'4px 0 0', fontSize:13, color:CARAMEL, textTransform:'capitalize' }}>{today}</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {alertCount > 0 && (
            <a href="/alertes" style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:10, background:'#FFF8E1', border:'1px solid #FFE082', textDecoration:'none', fontSize:12, fontWeight:700, color:'#E65100' }}>
              ⚠️ {alertCount} alerte{alertCount > 1 ? 's' : ''} active{alertCount > 1 ? 's' : ''}
            </a>
          )}
        </div>
      </div>

      {/* ── KPIs ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:12, marginBottom:24 }}>
        {[
          { label: t('dash.ca_month'),       value: `${fmt(caMonth)} MAD`,         sub:`${invStats?.count_paid||0} ${t('dash.paid_count').toLowerCase()}`, accent:GOLD,     icon:'💰' },
          { label: t('dash.ca_year'),        value: `${fmt(caQuarter)} MAD`,       sub: lang === 'ar' ? 'آخر 3 أشهر' : '3 derniers mois', accent:ORANGE,   icon:'📈' },
          { label: t('chantier.title'),      value: projStats?.active ?? '—',      sub:`${projStats?.late||0} ${t('status.late').toLowerCase()}`, accent:'#1565C0',icon:'🏗️' },
          { label: t('task.in_progress'),    value: taskStats?.in_progress ?? '—', sub:`${taskStats?.blocked||0} ${t('task.blocked').toLowerCase()}`, accent:'#9C27B0',icon:'✅' },
          { label: t('dash.unpaid'),         value: invStats?.count_unpaid ?? '—', sub: invStats?.total_unpaid ? `${fmt(Number(invStats.total_unpaid))} MAD` : '', accent:'#D32F2F',icon:'🧾' },
          { label: lang === 'ar' ? 'مشاريع منجزة' : 'Chantiers terminés', value: projStats?.completed ?? '—', sub: lang === 'ar' ? `من أصل ${projStats?.total||0}` : `sur ${projStats?.total||0} total`, accent:'#2E7D32',icon:'🏁' },
        ].map((k) => (
          <div key={k.label} style={card(k.accent)}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ margin:'0 0 8px', fontSize:9, fontWeight:700, color:CARAMEL, textTransform:'uppercase', letterSpacing:0.8 }}>{k.label}</p>
                <p style={{ margin:0, fontSize:20, fontWeight:800, color:DARK, fontFamily:'monospace', lineHeight:1.1, wordBreak:'break-all' }}>{k.value}</p>
                {k.sub && <p style={{ margin:'5px 0 0', fontSize:10, color:CARAMEL }}>{k.sub}</p>}
              </div>
              <span style={{ fontSize:22, opacity:0.6, marginLeft:6 }}>{k.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Graphiques ── */}
      <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:16, marginBottom:24 }}>

        {/* Graphique CA 6 mois */}
        <div style={{ background:'white', borderRadius:14, padding:'20px 24px', boxShadow:'0 2px 8px rgba(142,89,21,0.07)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <div>
              <p style={{ margin:0, fontSize:13, fontWeight:700, color:DARK }}>📊 Chiffre d'affaires — 6 derniers mois</p>
              <p style={{ margin:'2px 0 0', fontSize:11, color:CARAMEL }}>Factures réglées (MAD)</p>
            </div>
            <span style={{ fontSize:11, color:CARAMEL, background:CREAM, padding:'4px 10px', borderRadius:20, border:`1px solid ${BEIGE}`, fontWeight:600 }}>
              Total : {fmt(caChart.reduce((s,c)=>s+c.ca,0))} MAD
            </span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={caChart} barCategoryGap="30%" barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F5E6D3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize:11, fill:CARAMEL }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={fmt} tick={{ fontSize:10, fill:CARAMEL }} axisLine={false} tickLine={false} width={50} />
              <Tooltip content={<CustomBarTooltip />} cursor={{ fill:'rgba(244,179,21,0.08)' }} />
              <Bar dataKey="ca" name="CA" radius={[6,6,0,0]}
                fill="url(#goldGrad)" />
              <defs>
                <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={GOLD} />
                  <stop offset="100%" stopColor={ORANGE} />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Graphique tâches par statut */}
        <div style={{ background:'white', borderRadius:14, padding:'20px 24px', boxShadow:'0 2px 8px rgba(142,89,21,0.07)' }}>
          <div style={{ marginBottom:16 }}>
            <p style={{ margin:0, fontSize:13, fontWeight:700, color:DARK }}>✅ Répartition des tâches</p>
            <p style={{ margin:'2px 0 0', fontSize:11, color:CARAMEL }}>Par statut · {taskStats?.total||0} au total</p>
          </div>
          {(taskStats?.total || 0) === 0 ? (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200, color:CARAMEL, fontSize:13 }}>
              Aucune tâche enregistrée
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={taskChart} cx="50%" cy="45%" innerRadius={55} outerRadius={85}
                  dataKey="value" nameKey="name" paddingAngle={3}>
                  {taskChart.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomPieTooltip />} />
                <Legend iconType="circle" iconSize={8}
                  formatter={(v) => <span style={{ fontSize:11, color:CARAMEL, fontWeight:600 }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Productivité employés ── */}
      <div style={{ background:'white', borderRadius:14, padding:'20px 24px', boxShadow:'0 2px 8px rgba(142,89,21,0.07)', marginBottom:24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <div>
            <p style={{ margin:0, fontSize:13, fontWeight:700, color:DARK }}>👷 Productivité de l'équipe</p>
            <p style={{ margin:'2px 0 0', fontSize:11, color:CARAMEL }}>Tâches par employé · en temps réel</p>
          </div>
          <a href="/taches" style={{ fontSize:11, color:ORANGE, fontWeight:600, textDecoration:'none' }}>Voir les tâches →</a>
        </div>
        {empRows.length === 0 ? (
          <p style={{ textAlign:'center', padding:'28px 0', color:CARAMEL, fontSize:13 }}>Aucune tâche assignée pour l'instant</p>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:CREAM }}>
                {['Employé','À faire','En cours','Bloquées','Terminées','Score productivité'].map(h => (
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:9, fontWeight:700, color:CARAMEL, textTransform:'uppercase', letterSpacing:0.8, borderBottom:`1px solid ${BEIGE}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {empRows.map((row, i) => {
                const s = score(row);
                const total = row.todo + row.in_progress + row.blocked + row.done;
                return (
                  <tr key={i} style={{ borderBottom:`1px solid ${BEIGE}` }}>
                    <td style={{ padding:'12px 14px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ width:32, height:32, borderRadius:'50%', background:`linear-gradient(135deg,${GOLD},${ORANGE})`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:DARK, flexShrink:0 }}>
                          {row.name.split(' ').map((n: string) => n[0]).join('').slice(0,2).toUpperCase()}
                        </div>
                        <span style={{ fontWeight:600, color:DARK }}>{row.name}</span>
                      </div>
                    </td>
                    <td style={{ padding:'12px 14px' }}>
                      <span style={{ background:'#F5F5F5', color:'#616161', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700 }}>{row.todo}</span>
                    </td>
                    <td style={{ padding:'12px 14px' }}>
                      <span style={{ background:'#E3F2FD', color:'#1565C0', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700 }}>{row.in_progress}</span>
                    </td>
                    <td style={{ padding:'12px 14px' }}>
                      <span style={{ background:'#FFEBEE', color:'#D32F2F', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700 }}>{row.blocked}</span>
                    </td>
                    <td style={{ padding:'12px 14px' }}>
                      <span style={{ background:'#E8F5E9', color:'#2E7D32', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700 }}>{row.done}</span>
                    </td>
                    <td style={{ padding:'12px 14px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ flex:1, height:7, background:BEIGE, borderRadius:4, overflow:'hidden', maxWidth:120 }}>
                          <div style={{ height:'100%', width:`${s}%`, borderRadius:4, background: s>=70 ? 'linear-gradient(90deg,#43A047,#66BB6A)' : s>=40 ? `linear-gradient(90deg,${GOLD},${ORANGE})` : 'linear-gradient(90deg,#EF5350,#E53935)' }} />
                        </div>
                        <span style={{ fontSize:12, fontWeight:800, fontFamily:'monospace', color: s>=70 ? '#2E7D32' : s>=40 ? CARAMEL : '#D32F2F', minWidth:34 }}>{s}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Activité récente ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

        {/* Chantiers récents */}
        <div style={{ background:'white', borderRadius:14, padding:'20px 24px', boxShadow:'0 2px 8px rgba(142,89,21,0.07)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <p style={{ margin:0, fontSize:13, fontWeight:700, color:DARK }}>🏗️ Chantiers récents</p>
            <a href="/chantiers" style={{ fontSize:11, color:ORANGE, fontWeight:600, textDecoration:'none' }}>Voir tout →</a>
          </div>
          {recentProjects.length === 0 ? (
            <p style={{ textAlign:'center', padding:'20px 0', color:CARAMEL, fontSize:13 }}>Aucun chantier</p>
          ) : recentProjects.map((p: any) => {
            const st = statusCfg[p.status] || statusCfg.ACTIVE;
            return (
              <div key={p.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:`1px solid ${BEIGE}` }}>
                <div>
                  <p style={{ margin:0, fontSize:13, fontWeight:600, color:DARK }}>{p.name}</p>
                  <p style={{ margin:'2px 0 0', fontSize:11, color:CARAMEL }}>{p.code}{p.city ? ` · ${p.city}` : ''}</p>
                </div>
                <div style={{ textAlign:'right' }}>
                  <span style={{ padding:'3px 10px', borderRadius:20, fontSize:10, fontWeight:700, color:st.color, background:st.bg }}>{st.label}</span>
                  <p style={{ margin:'3px 0 0', fontSize:10, color:CARAMEL, fontFamily:'monospace' }}>
                    {p.progress||0}% avancement
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Devis récents */}
        <div style={{ background:'white', borderRadius:14, padding:'20px 24px', boxShadow:'0 2px 8px rgba(142,89,21,0.07)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <p style={{ margin:0, fontSize:13, fontWeight:700, color:DARK }}>📄 Devis récents</p>
            <a href="/devis" style={{ fontSize:11, color:ORANGE, fontWeight:600, textDecoration:'none' }}>Voir tout →</a>
          </div>
          {recentDevis.length === 0 ? (
            <p style={{ textAlign:'center', padding:'20px 0', color:CARAMEL, fontSize:13 }}>Aucun devis</p>
          ) : recentDevis.map((d: any) => {
            const st = statusCfg[d.status] || statusCfg.DRAFT;
            return (
              <div key={d.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:`1px solid ${BEIGE}` }}>
                <div>
                  <p style={{ margin:0, fontSize:13, fontWeight:600, color:DARK }}>
                    {d.reference || `DEV-${d.id?.slice(0,6)?.toUpperCase()}`}
                  </p>
                  <p style={{ margin:'2px 0 0', fontSize:11, color:CARAMEL }}>
                    {d.client?.commercial_name || '—'}
                    {d.total_ttc ? ` · ${Number(d.total_ttc).toLocaleString('fr-FR')} MAD` : ''}
                  </p>
                </div>
                <span style={{ padding:'3px 10px', borderRadius:20, fontSize:10, fontWeight:700, color:st.color, background:st.bg }}>{st.label}</span>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DASHBOARD EMPLOYÉ
════════════════════════════════════════════════════════════════ */
function EmployeDashboard({ user, firstName, today }: { user: any; firstName: string; today: string }) {
  const [myTasks,    setMyTasks]    = useState<any[]>([]);
  const [myExpenses, setMyExpenses] = useState<any[]>([]);
  const [myBls,      setMyBls]      = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    const userId = user?.id || user?.sub;
    Promise.allSettled([
      api.get('/tasks?limit=200'),
      api.get('/depenses?limit=200'),
      api.get('/bl?limit=200'),
    ]).then(([t, d, b]) => {
      /* Tâches assignées à cet employé */
      const allTasks: any[] = t.status === 'fulfilled' ? (t.value.data?.data || t.value.data || []) : [];
      const mine = allTasks.filter((task: any) =>
        (task.assignments || []).some((a: any) => a.user_id === userId || a.user?.id === userId)
      );
      setMyTasks(mine);

      /* Dépenses de cet employé */
      const allDep: any[] = d.status === 'fulfilled' ? (d.value.data?.data || d.value.data || []) : [];
      const myDep = allDep.filter((dep: any) => dep.employee_id === userId || dep.user_id === userId || !dep.employee_id);
      setMyExpenses(myDep);

      /* BL de cet employé */
      const allBl: any[] = b.status === 'fulfilled' ? (b.value.data?.data || b.value.data || []) : [];
      setMyBls(allBl);

      setLoading(false);
    });
  }, [user]);

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh' }}>
      <p style={{ color:CARAMEL, fontSize:13 }}>Chargement...</p>
    </div>
  );

  const todo        = myTasks.filter(t => t.status === 'TODO').length;
  const inProgress  = myTasks.filter(t => t.status === 'IN_PROGRESS').length;
  const blocked     = myTasks.filter(t => t.status === 'BLOCKED').length;
  const done        = myTasks.filter(t => t.status === 'DONE').length;

  const now = new Date();
  const thisMonth = myExpenses.filter(d => {
    const dDate = new Date(d.date || d.created_at);
    return dDate.getMonth() === now.getMonth() && dDate.getFullYear() === now.getFullYear();
  });
  const totalExpMonth = thisMonth.reduce((s, d) => s + Number(d.amount || d.montant || 0), 0);
  const totalExpAll   = myExpenses.reduce((s, d) => s + Number(d.amount || d.montant || 0), 0);

  const blSigned    = myBls.filter(b => b.status === 'SIGNED' || b.signed_scan_url).length;
  const blDelivered = myBls.filter(b => b.status === 'DELIVERED').length;

  const scoreVal = myTasks.length ? Math.round(((done + inProgress * 0.5) / myTasks.length) * 100) : 0;

  const recentTasks = [...myTasks].sort((a, b) => new Date(b.updated_at||0).getTime() - new Date(a.updated_at||0).getTime()).slice(0, 6);

  const taskStatusCfg: Record<string, { label: string; bg: string; color: string }> = {
    TODO:        { label: 'À faire',    bg: '#F5F5F5',  color: '#616161' },
    IN_PROGRESS: { label: 'En cours',   bg: '#E3F2FD',  color: '#1565C0' },
    BLOCKED:     { label: 'Bloqué',     bg: '#FFEBEE',  color: '#D32F2F' },
    DONE:        { label: 'Terminé',    bg: '#E8F5E9',  color: '#2E7D32' },
  };

  return (
    <div style={{ maxWidth: 1000 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin:0, fontSize:26, fontWeight:800, color:DARK }}>Bonjour{firstName ? `, ${firstName}` : ''} 👷</h1>
        <p style={{ margin:'4px 0 0', fontSize:13, color:CARAMEL, textTransform:'capitalize' }}>{today}</p>
      </div>

      {/* KPIs tâches */}
      <p style={{ margin:'0 0 10px', fontSize:11, fontWeight:700, color:CARAMEL, textTransform:'uppercase', letterSpacing:1 }}>Mes tâches</p>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
        {[
          { label:'À faire',    value: todo,       accent:'#9E9E9E', bg:'#F5F5F5',  color:'#616161' },
          { label:'En cours',   value: inProgress, accent:'#1565C0', bg:'#E3F2FD',  color:'#1565C0' },
          { label:'Bloquées',   value: blocked,    accent:'#D32F2F', bg:'#FFEBEE',  color:'#D32F2F' },
          { label:'Terminées',  value: done,       accent:'#2E7D32', bg:'#E8F5E9',  color:'#2E7D32' },
        ].map(k => (
          <div key={k.label} style={{ background:'white', borderRadius:12, padding:'18px 20px', borderTop:`3px solid ${k.accent}`, boxShadow:'0 2px 8px rgba(142,89,21,0.07)' }}>
            <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:CARAMEL, textTransform:'uppercase', letterSpacing:0.8 }}>{k.label}</p>
            <p style={{ margin:0, fontSize:28, fontWeight:900, color:k.color, fontFamily:'monospace' }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Score + Dépenses + BL */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:24 }}>
        {/* Score productivité */}
        <div style={{ background:'white', borderRadius:12, padding:'20px', boxShadow:'0 2px 8px rgba(142,89,21,0.07)', borderTop:`3px solid ${GOLD}` }}>
          <p style={{ margin:'0 0 12px', fontSize:11, fontWeight:700, color:CARAMEL, textTransform:'uppercase', letterSpacing:0.8 }}>Score productivité</p>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
            <div style={{ width:60, height:60, borderRadius:'50%', background: scoreVal>=70 ? 'linear-gradient(135deg,#43A047,#66BB6A)' : scoreVal>=40 ? `linear-gradient(135deg,${GOLD},${ORANGE})` : 'linear-gradient(135deg,#EF5350,#E53935)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:900, color:'white', flexShrink:0 }}>
              {scoreVal}%
            </div>
            <div>
              <p style={{ margin:0, fontSize:12, fontWeight:700, color:DARK }}>{scoreVal >= 70 ? 'Excellent !' : scoreVal >= 40 ? 'En progression' : 'À améliorer'}</p>
              <p style={{ margin:'2px 0 0', fontSize:11, color:CARAMEL }}>{myTasks.length} tâches au total</p>
            </div>
          </div>
          <div style={{ height:8, background:BEIGE, borderRadius:4, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${scoreVal}%`, borderRadius:4, background: scoreVal>=70 ? 'linear-gradient(90deg,#43A047,#66BB6A)' : scoreVal>=40 ? `linear-gradient(90deg,${GOLD},${ORANGE})` : 'linear-gradient(90deg,#EF5350,#E53935)', transition:'width 0.6s ease' }} />
          </div>
        </div>

        {/* Dépenses */}
        <div style={{ background:'white', borderRadius:12, padding:'20px', boxShadow:'0 2px 8px rgba(142,89,21,0.07)', borderTop:'3px solid #E59312' }}>
          <p style={{ margin:'0 0 8px', fontSize:11, fontWeight:700, color:CARAMEL, textTransform:'uppercase', letterSpacing:0.8 }}>Mes dépenses</p>
          <p style={{ margin:'0 0 4px', fontSize:24, fontWeight:900, color:DARK, fontFamily:'monospace' }}>{fmt(totalExpMonth)} <span style={{ fontSize:13, color:CARAMEL }}>MAD</span></p>
          <p style={{ margin:'0 0 12px', fontSize:11, color:CARAMEL }}>Ce mois-ci · {thisMonth.length} dépense{thisMonth.length > 1 ? 's' : ''}</p>
          <div style={{ borderTop:`1px solid ${BEIGE}`, paddingTop:10 }}>
            <p style={{ margin:0, fontSize:11, color:CARAMEL }}>Total cumulé : <strong style={{ color:DARK }}>{fmt(totalExpAll)} MAD</strong></p>
          </div>
          <a href="/depenses" style={{ display:'block', marginTop:10, fontSize:11, color:ORANGE, fontWeight:600, textDecoration:'none' }}>Voir mes dépenses →</a>
        </div>

        {/* BL signés */}
        <div style={{ background:'white', borderRadius:12, padding:'20px', boxShadow:'0 2px 8px rgba(142,89,21,0.07)', borderTop:'3px solid #6A1B9A' }}>
          <p style={{ margin:'0 0 8px', fontSize:11, fontWeight:700, color:CARAMEL, textTransform:'uppercase', letterSpacing:0.8 }}>Bons de livraison</p>
          <p style={{ margin:'0 0 4px', fontSize:24, fontWeight:900, color:'#6A1B9A', fontFamily:'monospace' }}>{blSigned}</p>
          <p style={{ margin:'0 0 12px', fontSize:11, color:CARAMEL }}>BL signé{blSigned > 1 ? 's' : ''} importé{blSigned > 1 ? 's' : ''}</p>
          <div style={{ borderTop:`1px solid ${BEIGE}`, paddingTop:10 }}>
            <p style={{ margin:0, fontSize:11, color:CARAMEL }}>En attente de signature : <strong style={{ color:DARK }}>{blDelivered}</strong></p>
          </div>
          <a href="/mon-bl" style={{ display:'block', marginTop:10, fontSize:11, color:ORANGE, fontWeight:600, textDecoration:'none' }}>Importer un BL signé →</a>
        </div>
      </div>

      {/* Mes tâches récentes */}
      <div style={{ background:'white', borderRadius:14, padding:'20px 24px', boxShadow:'0 2px 8px rgba(142,89,21,0.07)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <p style={{ margin:0, fontSize:13, fontWeight:700, color:DARK }}>✅ Mes tâches récentes</p>
          <a href="/taches" style={{ fontSize:11, color:ORANGE, fontWeight:600, textDecoration:'none' }}>Voir tout →</a>
        </div>
        {recentTasks.length === 0 ? (
          <p style={{ textAlign:'center', padding:'28px 0', color:CARAMEL, fontSize:13 }}>Aucune tâche assignée</p>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:CREAM }}>
                {['Tâche','Projet','Priorité','Statut','Échéance'].map(h => (
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:9, fontWeight:700, color:CARAMEL, textTransform:'uppercase', letterSpacing:0.8, borderBottom:`1px solid ${BEIGE}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentTasks.map((t: any, i) => {
                const sc = taskStatusCfg[t.status] || taskStatusCfg.TODO;
                const prioCfg: Record<string, { label: string; color: string }> = {
                  HIGH:   { label: '🔴 Haute',   color: '#D32F2F' },
                  MEDIUM: { label: '🟡 Moyenne', color: '#E65100' },
                  LOW:    { label: '🟢 Basse',   color: '#2E7D32' },
                };
                const prio = prioCfg[t.priority] || { label: t.priority || '—', color: CARAMEL };
                const due = t.due_date ? new Date(t.due_date).toLocaleDateString('fr-FR') : '—';
                return (
                  <tr key={i} style={{ borderBottom:`1px solid ${BEIGE}` }}>
                    <td style={{ padding:'11px 14px', fontWeight:600, color:DARK }}>{t.title || t.name || '—'}</td>
                    <td style={{ padding:'11px 14px', color:CARAMEL, fontSize:12 }}>{t.project?.name || t.chantier?.name || '—'}</td>
                    <td style={{ padding:'11px 14px', fontSize:11, fontWeight:700, color:prio.color }}>{prio.label}</td>
                    <td style={{ padding:'11px 14px' }}>
                      <span style={{ background:sc.bg, color:sc.color, padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:700 }}>{sc.label}</span>
                    </td>
                    <td style={{ padding:'11px 14px', fontSize:12, color:CARAMEL, fontFamily:'monospace' }}>{due}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DASHBOARD COMPTABLE
════════════════════════════════════════════════════════════════ */
function ComptableDashboard({ user, firstName, today }: { user: any; firstName: string; today: string }) {
  const [invStats,   setInvStats]   = useState<any>({});
  const [stmts,      setStmts]      = useState<any[]>([]);
  const [caChart,    setCaChart]    = useState<{name:string; ca:number}[]>([]);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    const now = new Date();
    const curM = now.getMonth() + 1;
    const curY = now.getFullYear();
    const last6: { m:number; y:number; label:string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(curY, curM - 1 - i, 1);
      last6.push({ m: d.getMonth()+1, y: d.getFullYear(), label: MONTHS_FR[d.getMonth()] });
    }

    Promise.allSettled([
      invoicesApi.stats(curM, curY),
      api.get('/rapprochement/statements?page=1'),
      ...last6.map(({ m, y }) => invoicesApi.stats(m, y)),
    ] as any[]).then((results) => {
      if (results[0].status === 'fulfilled') setInvStats(results[0].value.data || {});
      if (results[1].status === 'fulfilled') {
        const d = results[1].value.data;
        setStmts(d?.data || d || []);
      }
      const chartData = last6.map((item, i) => {
        const r = results[2 + i];
        const ca = r?.status === 'fulfilled' ? Number(r.value.data?.total_paid || 0) : 0;
        return { name: item.label, ca };
      });
      setCaChart(chartData);
      setLoading(false);
    });
  }, []);

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh' }}>
      <p style={{ color:CARAMEL, fontSize:13 }}>Chargement...</p>
    </div>
  );

  const totalPaid   = Number(invStats.total_paid   || 0);
  const totalUnpaid = Number(invStats.total_unpaid || 0);
  const countPaid   = Number(invStats.count_paid   || 0);
  const countUnpaid = Number(invStats.count_unpaid || 0);
  const countTotal  = countPaid + countUnpaid;
  const payRate     = countTotal ? Math.round((countPaid / countTotal) * 100) : 0;

  const matchedStmts   = stmts.filter(s => s.status === 'MATCHED' || s.status === 'CLOSED').length;
  const pendingStmts   = stmts.filter(s => s.status === 'PENDING' || s.status === 'PARTIAL' || !s.status).length;

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin:0, fontSize:26, fontWeight:800, color:DARK }}>Bonjour{firstName ? `, ${firstName}` : ''} 📒</h1>
        <p style={{ margin:'4px 0 0', fontSize:13, color:CARAMEL, textTransform:'capitalize' }}>{today}</p>
      </div>

      {/* KPIs Factures */}
      <p style={{ margin:'0 0 10px', fontSize:11, fontWeight:700, color:CARAMEL, textTransform:'uppercase', letterSpacing:1 }}>Factures — mois en cours</p>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
        {[
          { label:'CA encaissé',    value:`${fmt(totalPaid)} MAD`,   sub:`${countPaid} facture${countPaid>1?'s':''} réglée${countPaid>1?'s':''}`, accent:GOLD },
          { label:'En attente',     value:`${fmt(totalUnpaid)} MAD`, sub:`${countUnpaid} facture${countUnpaid>1?'s':''} impayée${countUnpaid>1?'s':''}`, accent:'#D32F2F' },
          { label:'Taux recouvrement', value:`${payRate} %`,         sub:`${countTotal} factures au total`, accent:payRate>=70?'#2E7D32':payRate>=40?ORANGE:'#D32F2F' },
          { label:'Relevés en attente',value: pendingStmts,          sub:`${matchedStmts} rapprochés`, accent:'#6A1B9A' },
        ].map(k => (
          <div key={k.label} style={{ background:'white', borderRadius:12, padding:'18px 20px', borderTop:`3px solid ${k.accent}`, boxShadow:'0 2px 8px rgba(142,89,21,0.07)' }}>
            <p style={{ margin:'0 0 6px', fontSize:9, fontWeight:700, color:CARAMEL, textTransform:'uppercase', letterSpacing:0.8 }}>{k.label}</p>
            <p style={{ margin:0, fontSize:20, fontWeight:900, color:DARK, fontFamily:'monospace', wordBreak:'break-all' }}>{k.value}</p>
            {k.sub && <p style={{ margin:'5px 0 0', fontSize:10, color:CARAMEL }}>{k.sub}</p>}
          </div>
        ))}
      </div>

      {/* Graphique CA 6 mois */}
      <div style={{ background:'white', borderRadius:14, padding:'20px 24px', boxShadow:'0 2px 8px rgba(142,89,21,0.07)', marginBottom:24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div>
            <p style={{ margin:0, fontSize:13, fontWeight:700, color:DARK }}>📊 CA encaissé — 6 derniers mois</p>
            <p style={{ margin:'2px 0 0', fontSize:11, color:CARAMEL }}>Factures réglées (MAD)</p>
          </div>
          <span style={{ fontSize:11, color:CARAMEL, background:CREAM, padding:'4px 10px', borderRadius:20, border:`1px solid ${BEIGE}`, fontWeight:600 }}>
            Total 6 mois : {fmt(caChart.reduce((s,c)=>s+c.ca,0))} MAD
          </span>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={caChart} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="#F5E6D3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize:11, fill:CARAMEL }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmt} tick={{ fontSize:10, fill:CARAMEL }} axisLine={false} tickLine={false} width={50} />
            <Tooltip content={<CustomBarTooltip />} cursor={{ fill:'rgba(244,179,21,0.08)' }} />
            <Bar dataKey="ca" name="CA" radius={[6,6,0,0]}>
              {caChart.map((_, i) => (
                <Cell key={i} fill={`url(#goldGrad2)`} />
              ))}
            </Bar>
            <defs>
              <linearGradient id="goldGrad2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GOLD} />
                <stop offset="100%" stopColor={ORANGE} />
              </linearGradient>
            </defs>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Taux recouvrement + Relevés */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        {/* Recouvrement visuel */}
        <div style={{ background:'white', borderRadius:14, padding:'20px 24px', boxShadow:'0 2px 8px rgba(142,89,21,0.07)' }}>
          <p style={{ margin:'0 0 16px', fontSize:13, fontWeight:700, color:DARK }}>💳 Taux de recouvrement</p>
          <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:16 }}>
            <div style={{ width:80, height:80, borderRadius:'50%', background: payRate>=70 ? 'linear-gradient(135deg,#43A047,#66BB6A)' : payRate>=40 ? `linear-gradient(135deg,${GOLD},${ORANGE})` : 'linear-gradient(135deg,#EF5350,#E53935)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, fontWeight:900, color:'white' }}>
              {payRate}%
            </div>
            <div>
              <p style={{ margin:0, fontSize:14, fontWeight:700, color:DARK }}>{payRate>=70?'Excellent':payRate>=40?'Correct':'À surveiller'}</p>
              <p style={{ margin:'4px 0 0', fontSize:12, color:CARAMEL }}>{countPaid} réglées / {countTotal} total</p>
              <p style={{ margin:'2px 0 0', fontSize:12, color:'#D32F2F', fontWeight:600 }}>{countUnpaid} en attente de règlement</p>
            </div>
          </div>
          <div style={{ height:10, background:BEIGE, borderRadius:5, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${payRate}%`, borderRadius:5, background: payRate>=70?'linear-gradient(90deg,#43A047,#66BB6A)':payRate>=40?`linear-gradient(90deg,${GOLD},${ORANGE})`:'linear-gradient(90deg,#EF5350,#E53935)', transition:'width 0.6s' }} />
          </div>
          <a href="/factures" style={{ display:'block', marginTop:14, fontSize:11, color:ORANGE, fontWeight:600, textDecoration:'none' }}>Gérer les factures →</a>
        </div>

        {/* Rapprochement relevés */}
        <div style={{ background:'white', borderRadius:14, padding:'20px 24px', boxShadow:'0 2px 8px rgba(142,89,21,0.07)' }}>
          <p style={{ margin:'0 0 16px', fontSize:13, fontWeight:700, color:DARK }}>🏦 Rapprochement bancaire</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
            <div style={{ background:CREAM, borderRadius:10, padding:'14px', textAlign:'center', border:`1px solid ${BEIGE}` }}>
              <p style={{ margin:0, fontSize:26, fontWeight:900, color:'#6A1B9A', fontFamily:'monospace' }}>{pendingStmts}</p>
              <p style={{ margin:'4px 0 0', fontSize:10, fontWeight:700, color:CARAMEL, textTransform:'uppercase', letterSpacing:0.5 }}>En attente</p>
            </div>
            <div style={{ background:'#E8F5E9', borderRadius:10, padding:'14px', textAlign:'center', border:'1px solid #A5D6A7' }}>
              <p style={{ margin:0, fontSize:26, fontWeight:900, color:'#2E7D32', fontFamily:'monospace' }}>{matchedStmts}</p>
              <p style={{ margin:'4px 0 0', fontSize:10, fontWeight:700, color:'#2E7D32', textTransform:'uppercase', letterSpacing:0.5 }}>Rapprochés</p>
            </div>
          </div>
          <p style={{ margin:'0 0 12px', fontSize:12, color:CARAMEL }}>{stmts.length} relevé{stmts.length>1?'s':''} importé{stmts.length>1?'s':''} au total</p>
          <a href="/rapprochement" style={{ fontSize:11, color:ORANGE, fontWeight:600, textDecoration:'none' }}>Aller au rapprochement →</a>
        </div>
      </div>
    </div>
  );
}
