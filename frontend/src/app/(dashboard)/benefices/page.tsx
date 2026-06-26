'use client';

import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import { projectsApi, devisApi, depensesApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

/* ─── helpers ─── */
function getPrestations(): any[] {
  try { return JSON.parse(localStorage.getItem('etcc_prestations') || '[]'); } catch { return []; }
}

function startOf(unit: 'week' | 'month' | 'year'): Date {
  const now = new Date();
  if (unit === 'week') {
    const d = new Date(now);
    const day = d.getDay() || 7;
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - day + 1);
    return d;
  }
  if (unit === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  return new Date(now.getFullYear(), 0, 1);
}

function inPeriod(dateStr: string | null | undefined, unit: 'week' | 'month' | 'year'): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d >= startOf(unit);
}

const STYLE = {
  card: { background: 'white', borderRadius: 14, border: '1px solid #F5E6D3', padding: '18px 22px' } as React.CSSProperties,
  th: { padding: '10px 14px', textAlign: 'left' as const, fontSize: 11, fontWeight: 700, color: '#8E5915', textTransform: 'uppercase' as const, letterSpacing: 0.5, background: '#FAF7F2', borderBottom: '1px solid #F5E6D3' },
  td: { padding: '11px 14px', fontSize: 13, borderBottom: '1px solid #FBF5EC', color: '#2D1B00' },
};

function BeneficeBadge({ value }: { value: number }) {
  const pos = value >= 0;
  const zero = value === 0;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'monospace',
      fontWeight: 700, fontSize: 13,
      color: zero ? '#8E5915' : pos ? '#16A34A' : '#DC2626',
    }}>
      {zero ? <Minus size={13} /> : pos ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
      {formatCurrency(Math.abs(value))}
    </span>
  );
}

function PeriodKPI({ label, revenus, depenses }: { label: string; revenus: number; depenses: number }) {
  const net = revenus - depenses;
  const pos = net >= 0;
  return (
    <div style={{ ...STYLE.card, flex: 1, minWidth: 200 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#B8A090', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'monospace', color: pos ? '#16A34A' : '#DC2626', marginBottom: 8 }}>
        {pos ? '+' : '-'}{formatCurrency(Math.abs(net))}
      </div>
      <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
        <span style={{ color: '#16A34A' }}>↑ {formatCurrency(revenus)}</span>
        <span style={{ color: '#DC2626' }}>↓ {formatCurrency(depenses)}</span>
      </div>
    </div>
  );
}

/* ─── main ─── */
export default function BeneficesPage() {
  const [tab, setTab] = useState<'chantiers' | 'devis' | 'prestations'>('chantiers');
  const [projects, setProjects] = useState<any[]>([]);
  const [devis, setDevis] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [prestations, setPrestations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  useEffect(() => {
    setPrestations(getPrestations());
    Promise.all([
      projectsApi.list({ limit: 200 }),
      devisApi.list({ status: 'VALIDATED', limit: 200 }),
      depensesApi.list({ status: 'APPROVED', limit: 500 }),
    ]).then(([pRes, dRes, eRes]) => {
      setProjects(Array.isArray(pRes.data) ? pRes.data : (pRes.data?.data || []));
      setDevis(Array.isArray(dRes.data) ? dRes.data : (dRes.data?.data || []));
      const expList = Array.isArray(eRes.data) ? eRes.data : (eRes.data?.data || []);
      setExpenses(expList);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  /* ─── calculs ─── */
  // Revenus = budget chantiers actifs + montant devis validés + montant prestations
  // Dépenses = toutes les dépenses approuvées

  function expForProject(pid: string) {
    return expenses.filter(e => e.project_id === pid).reduce((s, e) => s + Number(e.amount), 0);
  }
  function expForPrestation(pid: string) {
    return expenses.filter(e => e.prestation_id === pid).reduce((s, e) => s + Number(e.amount), 0);
  }

  // KPI par période: revenus = devis validés dans la période, dépenses = dépenses dans la période
  function kpi(unit: 'week' | 'month' | 'year') {
    const rev = devis
      .filter(d => inPeriod(d.issue_date, unit))
      .reduce((s, d) => s + Number(d.total_ttc), 0)
      + prestations
        .filter(p => inPeriod(p.date_debut, unit))
        .reduce((s, p) => s + Number(p.montant), 0);
    const dep = expenses
      .filter(e => inPeriod(e.date, unit))
      .reduce((s, e) => s + Number(e.amount), 0);
    return { revenus: rev, depenses: dep };
  }

  const kpiWeek  = kpi('week');
  const kpiMonth = kpi('month');
  const kpiYear  = kpi('year');

  /* ─── chantiers ─── */
  const chantiersRows = projects.map(p => {
    const budget = Number(p.budget_amount) || 0;
    const depenses = expForProject(p.id);
    return { ...p, depenses, benefice: budget - depenses };
  });

  /* ─── devis validés ─── */
  const devisRows = devis.map(d => {
    // Dépenses liées via project
    const dep = d.project_id ? expForProject(d.project_id) : 0;
    return { ...d, depenses: dep, benefice: Number(d.total_ttc) - dep };
  });

  /* ─── prestations ─── */
  const prestRows = prestations.map(p => {
    const dep = expForPrestation(p.id);
    return { ...p, depenses: dep, benefice: Number(p.montant) - dep };
  });

  /* ─── totaux onglets ─── */
  const totalBenChantiers = chantiersRows.reduce((s, r) => s + r.benefice, 0);
  const totalBenDevis = devisRows.reduce((s, r) => s + r.benefice, 0);
  const totalBenPrest = prestRows.reduce((s, r) => s + r.benefice, 0);

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
    border: 'none', transition: 'all 0.15s',
    background: active ? 'linear-gradient(135deg,#F4B315,#E59312)' : 'transparent',
    color: active ? '#1A141A' : '#8E5915',
  });

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: '#8E5915', fontSize: 14 }}>
      Chargement…
    </div>
  );

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1A141A', margin: 0 }}>Bénéfices</h1>
        <p style={{ fontSize: 13, color: '#8E5915', marginTop: 4, marginBottom: 0 }}>
          Suivi des revenus, dépenses et bénéfice net par période
        </p>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 28, flexWrap: 'wrap' }}>
        <PeriodKPI label="Cette semaine" revenus={kpiWeek.revenus} depenses={kpiWeek.depenses} />
        <PeriodKPI label="Ce mois" revenus={kpiMonth.revenus} depenses={kpiMonth.depenses} />
        <PeriodKPI label="Cette année" revenus={kpiYear.revenus} depenses={kpiYear.depenses} />
      </div>

      {/* Tabs */}
      <div style={{ ...STYLE.card, padding: 0 }}>
        <div style={{ display: 'flex', gap: 6, padding: '14px 18px', borderBottom: '1px solid #F5E6D3', alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={tabStyle(tab === 'chantiers')} onClick={() => setTab('chantiers')}>
            Chantiers
          </button>
          <button style={tabStyle(tab === 'devis')} onClick={() => setTab('devis')}>
            Devis validés
          </button>
          <button style={tabStyle(tab === 'prestations')} onClick={() => setTab('prestations')}>
            Prestations
          </button>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: '#8E5915', fontWeight: 700 }}>
            Bénéfice total :{' '}
            <span style={{ fontFamily: 'monospace', color: (tab === 'chantiers' ? totalBenChantiers : tab === 'devis' ? totalBenDevis : totalBenPrest) >= 0 ? '#16A34A' : '#DC2626' }}>
              {formatCurrency(tab === 'chantiers' ? totalBenChantiers : tab === 'devis' ? totalBenDevis : totalBenPrest)}
            </span>
          </div>
        </div>

        {/* ── CHANTIERS ── */}
        {tab === 'chantiers' && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={STYLE.th}>Chantier</th>
                <th style={{ ...STYLE.th, textAlign: 'right' }}>Budget initial</th>
                <th style={{ ...STYLE.th, textAlign: 'right' }}>Dépenses</th>
                <th style={{ ...STYLE.th, textAlign: 'right' }}>Budget restant</th>
                <th style={{ ...STYLE.th, textAlign: 'right' }}>Bénéfice</th>
                <th style={STYLE.th}>Statut</th>
              </tr>
            </thead>
            <tbody>
              {chantiersRows.length === 0 && (
                <tr><td colSpan={6} style={{ ...STYLE.td, textAlign: 'center', color: '#B8A090' }}>Aucun chantier</td></tr>
              )}
              {chantiersRows.map(p => {
                const budgetRestant = Number(p.budget_amount) - p.depenses;
                const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
                  ACTIVE:    { label: 'En cours',  color: '#1565C0', bg: '#E3F2FD' },
                  LATE:      { label: 'En retard', color: '#E65100', bg: '#FFF3E0' },
                  COMPLETED: { label: 'Terminé',   color: '#2E7D32', bg: '#E8F5E9' },
                  ARCHIVED:  { label: 'Archivé',   color: '#6D4C41', bg: '#EFEBE9' },
                };
                const s = STATUS_CFG[p.status] || STATUS_CFG.ACTIVE;
                const isExpanded = expandedRow === p.id;
                const depDetail = expenses.filter(e => e.project_id === p.id);
                return (
                  <>
                    <tr key={p.id} style={{ cursor: 'pointer', background: isExpanded ? '#FDF9F3' : 'transparent' }}
                      onClick={() => setExpandedRow(isExpanded ? null : p.id)}>
                      <td style={STYLE.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {isExpanded ? <ChevronUp size={14} color="#8E5915" /> : <ChevronDown size={14} color="#8E5915" />}
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
                            <div style={{ fontSize: 11, color: '#B8A090' }}>{p.code} {p.client?.commercial_name ? `· ${p.client.commercial_name}` : ''}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ ...STYLE.td, textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(Number(p.budget_amount))}</td>
                      <td style={{ ...STYLE.td, textAlign: 'right', fontFamily: 'monospace', color: p.depenses > 0 ? '#DC2626' : '#B8A090' }}>
                        {p.depenses > 0 ? `- ${formatCurrency(p.depenses)}` : '—'}
                      </td>
                      <td style={{ ...STYLE.td, textAlign: 'right', fontFamily: 'monospace', color: budgetRestant >= 0 ? '#16A34A' : '#DC2626' }}>
                        {formatCurrency(budgetRestant)}
                      </td>
                      <td style={{ ...STYLE.td, textAlign: 'right' }}>
                        <BeneficeBadge value={p.benefice} />
                      </td>
                      <td style={STYLE.td}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: s.color, background: s.bg, padding: '3px 8px', borderRadius: 6 }}>
                          {s.label}
                        </span>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${p.id}-exp`}>
                        <td colSpan={6} style={{ padding: '0 20px 14px 48px', background: '#FDF9F3' }}>
                          {depDetail.length === 0
                            ? <div style={{ fontSize: 12, color: '#B8A090', padding: '8px 0' }}>Aucune dépense liée à ce chantier</div>
                            : (
                              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr>
                                    <th style={{ ...STYLE.th, fontSize: 10, padding: '6px 10px' }}>Date</th>
                                    <th style={{ ...STYLE.th, fontSize: 10, padding: '6px 10px' }}>Description</th>
                                    <th style={{ ...STYLE.th, fontSize: 10, padding: '6px 10px' }}>Catégorie</th>
                                    <th style={{ ...STYLE.th, fontSize: 10, padding: '6px 10px', textAlign: 'right' }}>Montant</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {depDetail.map((d: any) => (
                                    <tr key={d.id}>
                                      <td style={{ ...STYLE.td, fontSize: 12, padding: '7px 10px' }}>{d.date ? new Date(d.date).toLocaleDateString('fr-FR') : '—'}</td>
                                      <td style={{ ...STYLE.td, fontSize: 12, padding: '7px 10px' }}>{d.description}</td>
                                      <td style={{ ...STYLE.td, fontSize: 12, padding: '7px 10px', color: '#8E5915' }}>{d.category}</td>
                                      <td style={{ ...STYLE.td, fontSize: 12, padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace', color: '#DC2626' }}>- {formatCurrency(Number(d.amount))}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )
                          }
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
            {chantiersRows.length > 0 && (
              <tfoot>
                <tr style={{ background: '#FAF7F2' }}>
                  <td style={{ ...STYLE.td, fontWeight: 800, color: '#1A141A' }}>Total</td>
                  <td style={{ ...STYLE.td, textAlign: 'right', fontWeight: 800, fontFamily: 'monospace' }}>
                    {formatCurrency(chantiersRows.reduce((s, r) => s + Number(r.budget_amount), 0))}
                  </td>
                  <td style={{ ...STYLE.td, textAlign: 'right', fontWeight: 800, fontFamily: 'monospace', color: '#DC2626' }}>
                    - {formatCurrency(chantiersRows.reduce((s, r) => s + r.depenses, 0))}
                  </td>
                  <td style={{ ...STYLE.td, textAlign: 'right', fontWeight: 800, fontFamily: 'monospace' }}>
                    {formatCurrency(chantiersRows.reduce((s, r) => s + (Number(r.budget_amount) - r.depenses), 0))}
                  </td>
                  <td style={{ ...STYLE.td, textAlign: 'right' }}>
                    <BeneficeBadge value={totalBenChantiers} />
                  </td>
                  <td style={STYLE.td} />
                </tr>
              </tfoot>
            )}
          </table>
        )}

        {/* ── DEVIS VALIDÉS ── */}
        {tab === 'devis' && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={STYLE.th}>Devis</th>
                <th style={STYLE.th}>Client</th>
                <th style={{ ...STYLE.th, textAlign: 'right' }}>Montant TTC</th>
                <th style={{ ...STYLE.th, textAlign: 'right' }}>Dépenses liées</th>
                <th style={{ ...STYLE.th, textAlign: 'right' }}>Bénéfice</th>
                <th style={STYLE.th}>Date</th>
              </tr>
            </thead>
            <tbody>
              {devisRows.length === 0 && (
                <tr><td colSpan={6} style={{ ...STYLE.td, textAlign: 'center', color: '#B8A090' }}>Aucun devis validé</td></tr>
              )}
              {devisRows.map(d => {
                const isExpanded = expandedRow === `dv-${d.id}`;
                const depDetail = d.project_id ? expenses.filter(e => e.project_id === d.project_id) : [];
                return (
                  <>
                    <tr key={d.id} style={{ cursor: depDetail.length > 0 ? 'pointer' : 'default', background: isExpanded ? '#FDF9F3' : 'transparent' }}
                      onClick={() => depDetail.length > 0 && setExpandedRow(isExpanded ? null : `dv-${d.id}`)}>
                      <td style={STYLE.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {depDetail.length > 0 && (isExpanded ? <ChevronUp size={14} color="#8E5915" /> : <ChevronDown size={14} color="#8E5915" />)}
                          <div>
                            <div style={{ fontWeight: 700 }}>{d.number}</div>
                            {d.object && <div style={{ fontSize: 11, color: '#B8A090' }}>{d.object}</div>}
                          </div>
                        </div>
                      </td>
                      <td style={STYLE.td}>{d.client?.commercial_name || '—'}</td>
                      <td style={{ ...STYLE.td, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#16A34A' }}>
                        {formatCurrency(Number(d.total_ttc))}
                      </td>
                      <td style={{ ...STYLE.td, textAlign: 'right', fontFamily: 'monospace', color: d.depenses > 0 ? '#DC2626' : '#B8A090' }}>
                        {d.depenses > 0 ? `- ${formatCurrency(d.depenses)}` : '—'}
                      </td>
                      <td style={{ ...STYLE.td, textAlign: 'right' }}>
                        <BeneficeBadge value={d.benefice} />
                      </td>
                      <td style={{ ...STYLE.td, color: '#8E5915', fontSize: 12 }}>
                        {d.issue_date ? new Date(d.issue_date).toLocaleDateString('fr-FR') : '—'}
                      </td>
                    </tr>
                    {isExpanded && depDetail.length > 0 && (
                      <tr key={`dv-${d.id}-exp`}>
                        <td colSpan={6} style={{ padding: '0 20px 14px 48px', background: '#FDF9F3' }}>
                          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                            <thead>
                              <tr>
                                <th style={{ ...STYLE.th, fontSize: 10, padding: '6px 10px' }}>Date</th>
                                <th style={{ ...STYLE.th, fontSize: 10, padding: '6px 10px' }}>Description</th>
                                <th style={{ ...STYLE.th, fontSize: 10, padding: '6px 10px', textAlign: 'right' }}>Montant</th>
                              </tr>
                            </thead>
                            <tbody>
                              {depDetail.map((dep: any) => (
                                <tr key={dep.id}>
                                  <td style={{ ...STYLE.td, fontSize: 12, padding: '7px 10px' }}>{dep.date ? new Date(dep.date).toLocaleDateString('fr-FR') : '—'}</td>
                                  <td style={{ ...STYLE.td, fontSize: 12, padding: '7px 10px' }}>{dep.description}</td>
                                  <td style={{ ...STYLE.td, fontSize: 12, padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace', color: '#DC2626' }}>- {formatCurrency(Number(dep.amount))}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
            {devisRows.length > 0 && (
              <tfoot>
                <tr style={{ background: '#FAF7F2' }}>
                  <td colSpan={2} style={{ ...STYLE.td, fontWeight: 800, color: '#1A141A' }}>Total</td>
                  <td style={{ ...STYLE.td, textAlign: 'right', fontWeight: 800, fontFamily: 'monospace', color: '#16A34A' }}>
                    {formatCurrency(devisRows.reduce((s, r) => s + Number(r.total_ttc), 0))}
                  </td>
                  <td style={{ ...STYLE.td, textAlign: 'right', fontWeight: 800, fontFamily: 'monospace', color: '#DC2626' }}>
                    - {formatCurrency(devisRows.reduce((s, r) => s + r.depenses, 0))}
                  </td>
                  <td style={{ ...STYLE.td, textAlign: 'right' }}>
                    <BeneficeBadge value={totalBenDevis} />
                  </td>
                  <td style={STYLE.td} />
                </tr>
              </tfoot>
            )}
          </table>
        )}

        {/* ── PRESTATIONS ── */}
        {tab === 'prestations' && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={STYLE.th}>Prestation</th>
                <th style={STYLE.th}>Client</th>
                <th style={{ ...STYLE.th, textAlign: 'right' }}>Montant</th>
                <th style={{ ...STYLE.th, textAlign: 'right' }}>Dépenses</th>
                <th style={{ ...STYLE.th, textAlign: 'right' }}>Bénéfice</th>
                <th style={STYLE.th}>Statut</th>
              </tr>
            </thead>
            <tbody>
              {prestRows.length === 0 && (
                <tr><td colSpan={6} style={{ ...STYLE.td, textAlign: 'center', color: '#B8A090' }}>Aucune prestation enregistrée</td></tr>
              )}
              {prestRows.map(p => {
                const PREST_STATUS: Record<string, { label: string; color: string; bg: string }> = {
                  EN_COURS: { label: 'En cours', color: '#1565C0', bg: '#E3F2FD' },
                  TERMINE:  { label: 'Terminé',  color: '#2E7D32', bg: '#E8F5E9' },
                  ANNULE:   { label: 'Annulé',   color: '#B71C1C', bg: '#FFEBEE' },
                };
                const s = PREST_STATUS[p.statut] || PREST_STATUS.EN_COURS;
                const isExpanded = expandedRow === `pr-${p.id}`;
                const depDetail = expenses.filter(e => e.prestation_id === p.id);
                return (
                  <>
                    <tr key={p.id} style={{ cursor: 'pointer', background: isExpanded ? '#FDF9F3' : 'transparent' }}
                      onClick={() => setExpandedRow(isExpanded ? null : `pr-${p.id}`)}>
                      <td style={STYLE.td}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {isExpanded ? <ChevronUp size={14} color="#8E5915" /> : <ChevronDown size={14} color="#8E5915" />}
                          <div>
                            <div style={{ fontWeight: 700 }}>{p.nom}</div>
                            {p.description && <div style={{ fontSize: 11, color: '#B8A090' }}>{p.description}</div>}
                          </div>
                        </div>
                      </td>
                      <td style={STYLE.td}>{p.client || '—'}</td>
                      <td style={{ ...STYLE.td, textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#16A34A' }}>
                        {formatCurrency(Number(p.montant))}
                      </td>
                      <td style={{ ...STYLE.td, textAlign: 'right', fontFamily: 'monospace', color: p.depenses > 0 ? '#DC2626' : '#B8A090' }}>
                        {p.depenses > 0 ? `- ${formatCurrency(p.depenses)}` : '—'}
                      </td>
                      <td style={{ ...STYLE.td, textAlign: 'right' }}>
                        <BeneficeBadge value={p.benefice} />
                      </td>
                      <td style={STYLE.td}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: s.color, background: s.bg, padding: '3px 8px', borderRadius: 6 }}>
                          {s.label}
                        </span>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`pr-${p.id}-exp`}>
                        <td colSpan={6} style={{ padding: '0 20px 14px 48px', background: '#FDF9F3' }}>
                          {depDetail.length === 0
                            ? <div style={{ fontSize: 12, color: '#B8A090', padding: '8px 0' }}>Aucune dépense liée à cette prestation</div>
                            : (
                              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr>
                                    <th style={{ ...STYLE.th, fontSize: 10, padding: '6px 10px' }}>Date</th>
                                    <th style={{ ...STYLE.th, fontSize: 10, padding: '6px 10px' }}>Description</th>
                                    <th style={{ ...STYLE.th, fontSize: 10, padding: '6px 10px', textAlign: 'right' }}>Montant</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {depDetail.map((d: any) => (
                                    <tr key={d.id}>
                                      <td style={{ ...STYLE.td, fontSize: 12, padding: '7px 10px' }}>{d.date ? new Date(d.date).toLocaleDateString('fr-FR') : '—'}</td>
                                      <td style={{ ...STYLE.td, fontSize: 12, padding: '7px 10px' }}>{d.description}</td>
                                      <td style={{ ...STYLE.td, fontSize: 12, padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace', color: '#DC2626' }}>- {formatCurrency(Number(d.amount))}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )
                          }
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
            {prestRows.length > 0 && (
              <tfoot>
                <tr style={{ background: '#FAF7F2' }}>
                  <td colSpan={2} style={{ ...STYLE.td, fontWeight: 800, color: '#1A141A' }}>Total</td>
                  <td style={{ ...STYLE.td, textAlign: 'right', fontWeight: 800, fontFamily: 'monospace', color: '#16A34A' }}>
                    {formatCurrency(prestRows.reduce((s, r) => s + Number(r.montant), 0))}
                  </td>
                  <td style={{ ...STYLE.td, textAlign: 'right', fontWeight: 800, fontFamily: 'monospace', color: '#DC2626' }}>
                    - {formatCurrency(prestRows.reduce((s, r) => s + r.depenses, 0))}
                  </td>
                  <td style={{ ...STYLE.td, textAlign: 'right' }}>
                    <BeneficeBadge value={totalBenPrest} />
                  </td>
                  <td style={STYLE.td} />
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>

      {/* Note bas de page */}
      <div style={{ marginTop: 16, fontSize: 11, color: '#B8A090', textAlign: 'right' }}>
        * Seules les dépenses avec statut <strong>Approuvé</strong> sont comptabilisées dans les calculs.
      </div>
    </div>
  );
}
