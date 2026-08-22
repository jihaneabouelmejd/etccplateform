'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  HardHat, Wrench, Wallet, ListChecks, Receipt, CalendarClock,
  CheckCircle2, Clock, PauseCircle, AlertTriangle,
} from 'lucide-react';
import { dashboardApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import KPICard from '@/components/ui/KPICard';

const DARK    = '#1A141A';
const CARAMEL = '#8E5915';
const GOLD    = '#F4B315';
const BEIGE   = '#F5E6D3';

const card = {
  background: 'white',
  borderRadius: 12,
  padding: '18px 20px',
  boxShadow: '0 2px 8px rgba(142,89,21,0.07)',
} as const;

const sectionTitle = {
  fontSize: 13,
  fontWeight: 700,
  color: DARK,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.4,
  marginBottom: 12,
};

function StatutBar({ enCours, termines, enAttente }: { enCours: number; termines: number; enAttente: number }) {
  const total = enCours + termines + enAttente || 1;
  return (
    <>
      <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', marginBottom: 14, background: BEIGE }}>
        <div style={{ width: `${(enCours / total) * 100}%`, background: '#1565C0' }} />
        <div style={{ width: `${(termines / total) * 100}%`, background: '#2E7D32' }} />
        <div style={{ width: `${(enAttente / total) * 100}%`, background: GOLD }} />
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Clock size={14} color="#1565C0" />
          <span style={{ fontSize: 13, color: DARK }}>En cours : <b>{enCours}</b></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <CheckCircle2 size={14} color="#2E7D32" />
          <span style={{ fontSize: 13, color: DARK }}>Terminés : <b>{termines}</b></span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <PauseCircle size={14} color={GOLD} />
          <span style={{ fontSize: 13, color: DARK }}>En attente : <b>{enAttente}</b></span>
        </div>
      </div>
    </>
  );
}

export default function DashboardGerantPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const u = localStorage.getItem('user');
    const parsed = u ? JSON.parse(u) : null;
    setUser(parsed);
    const role = (parsed?.role || '').toUpperCase();
    if (parsed && role !== 'ADMIN' && role !== 'GERANT') {
      router.replace('/dashboard');
      return;
    }
    dashboardApi.gerantSummary()
      .then(({ data }) => setData(data))
      .catch(() => setError("Impossible de charger le dashboard."))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: CARAMEL, fontSize: 14 }}>Chargement…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: 24 }}>
        <p style={{ color: '#D32F2F', fontSize: 14 }}>{error || 'Aucune donnée disponible.'}</p>
      </div>
    );
  }

  const monthLabel = new Date(data.period.annee, data.period.mois - 1, 1)
    .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: DARK, margin: 0 }}>Vue d'ensemble</h1>
        <p style={{ fontSize: 13, color: CARAMEL, margin: '4px 0 0' }}>
          Aperçu rapide — {monthLabel}
        </p>
      </div>

      {/* KPIs principaux */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        <KPICard
          label="Dépenses du mois"
          value={formatCurrency(data.depenses_mois.montant_total)}
          unit="MAD"
          icon={Wallet}
          color="orange"
        />
        <KPICard
          label="TVA à payer"
          value={formatCurrency(data.tva.a_payer)}
          unit="MAD"
          icon={Receipt}
          color={data.tva.a_payer >= 0 ? 'red' : 'green'}
        />
        <KPICard
          label="Tâches en retard"
          value={data.taches_en_retard}
          icon={AlertTriangle}
          color={data.taches_en_retard > 0 ? 'red' : 'green'}
        />
      </div>

      {/* Chantiers & Prestations */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <HardHat size={16} color={CARAMEL} />
            <p style={sectionTitle as any}>Chantiers</p>
          </div>
          <StatutBar
            enCours={data.chantiers.en_cours}
            termines={data.chantiers.termines}
            enAttente={data.chantiers.en_attente}
          />
        </div>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Wrench size={16} color={CARAMEL} />
            <p style={sectionTitle as any}>Prestations</p>
          </div>
          <StatutBar
            enCours={data.prestations.en_cours}
            termines={data.prestations.termines}
            enAttente={data.prestations.en_attente}
          />
        </div>
      </div>

      {/* Tâches importantes & Agenda */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <ListChecks size={16} color={CARAMEL} />
            <p style={sectionTitle as any}>Tâches importantes</p>
          </div>
          {data.taches_importantes.length === 0 ? (
            <p style={{ fontSize: 13, color: CARAMEL }}>Aucune tâche prioritaire en attente.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.taches_importantes.map((t: any) => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderBottom: `1px solid ${BEIGE}`, paddingBottom: 8 }}>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: DARK, margin: 0 }}>{t.title}</p>
                    {t.project_name && (
                      <p style={{ fontSize: 11, color: CARAMEL, margin: '2px 0 0' }}>{t.project_name}</p>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: CARAMEL, whiteSpace: 'nowrap' }}>
                    {t.due_date ? new Date(t.due_date).toLocaleDateString('fr-FR') : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <CalendarClock size={16} color={CARAMEL} />
            <p style={sectionTitle as any}>Calendrier — 14 prochains jours</p>
          </div>
          {data.agenda.length === 0 ? (
            <p style={{ fontSize: 13, color: CARAMEL }}>Aucun échéance à venir.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.agenda.map((a: any) => (
                <div key={`${a.type}-${a.id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderBottom: `1px solid ${BEIGE}`, paddingBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 6, background: a.type === 'tache' ? '#E3F2FD' : '#FDF6E9', color: a.type === 'tache' ? '#1565C0' : CARAMEL, fontWeight: 700, textTransform: 'uppercase' }}>
                      {a.type === 'tache' ? 'Tâche' : 'Objectif'}
                    </span>
                    <p style={{ fontSize: 13, color: DARK, margin: 0 }}>{a.title}</p>
                  </div>
                  <span style={{ fontSize: 11, color: CARAMEL, whiteSpace: 'nowrap' }}>
                    {a.date ? new Date(a.date).toLocaleDateString('fr-FR') : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
