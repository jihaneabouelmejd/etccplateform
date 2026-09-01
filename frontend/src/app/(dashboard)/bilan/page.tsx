'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Wallet, TrendingDown, AlertCircle } from 'lucide-react';
import { projectsApi, depensesApi, prestationsApi, dettesApi } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

/* ─── styles ─── */
const STYLE = {
  card: { background: 'white', borderRadius: 14, border: '1px solid #F5E6D3', padding: '18px 22px' } as React.CSSProperties,
  th: { padding: '10px 14px', textAlign: 'left' as const, fontSize: 11, fontWeight: 700, color: '#8E5915', textTransform: 'uppercase' as const, letterSpacing: 0.5, background: '#FAF7F2', borderBottom: '1px solid #F5E6D3' },
  td: { padding: '11px 14px', fontSize: 13, borderBottom: '1px solid #FBF5EC', color: '#2D1B00' },
};

function KPI({ label, value, color, icon }: { label: string; value: number; color: string; icon?: React.ReactNode }) {
  return (
    <div style={{ ...STYLE.card, flex: 1, minWidth: 180 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#B8A090', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: 21, fontWeight: 800, fontFamily: 'monospace', color }}>
        {formatCurrency(value)}
      </div>
    </div>
  );
}

/* ─── main ─── */
export default function BilanPage() {
  const [tab, setTab] = useState<'chantiers' | 'prestations'>('chantiers');
  const [projects, setProjects] = useState<any[]>([]);
  const [prestations, setPrestations] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [dettes, setDettes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      projectsApi.list({ limit: 200 }),
      prestationsApi.list(),
      depensesApi.list({ status: 'APPROVED', limit: 1000 }),
      dettesApi.list(),
    ]).then(([pRes, prRes, eRes, dRes]) => {
      setProjects(Array.isArray(pRes.data) ? pRes.data : (pRes.data?.data || []));
      setPrestations(Array.isArray(prRes.data) ? prRes.data : []);
      setExpenses(Array.isArray(eRes.data) ? eRes.data : (eRes.data?.data || []));
      setDettes(Array.isArray(dRes.data) ? dRes.data : (dRes.data?.data || []));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  /* ─── totaux globaux (toutes dettes/dépenses, affectées ou non) ─── */
  const totalDepenses   = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const totalDettes     = dettes.reduce((s, d) => s + Number(d.montant), 0);
  const totalDettePayee = dettes.reduce((s, d) => s + Number(d.montant_paye), 0);
  const totalDetteReste = totalDettes - totalDettePayee;
  // Total combiné = argent déjà sorti (dépenses, y compris les paiements de dettes
  // déjà enregistrés comme dépense "MAIN_OEUVRE") + argent qui reste à sortir sur les dettes.
  const totalCombine = totalDepenses + totalDetteReste;

  /* ─── helpers par périmètre ─── */
  function depFor(filterFn: (e: any) => boolean) {
    return expenses.filter(filterFn).reduce((s, e) => s + Number(e.amount), 0);
  }
  function dettesFor(filterFn: (d: any) => boolean) {
    const items = dettes.filter(filterFn);
    const montant = items.reduce((s, d) => s + Number(d.montant), 0);
    const paye    = items.reduce((s, d) => s + Number(d.montant_paye), 0);
    return { items, montant, paye, reste: montant - paye };
  }

  /* ─── par chantier ─── */
  const chantiersRows = projects.map(p => {
    const dep = depFor(e => e.project_id === p.id);
    const det = dettesFor(d => d.project_id === p.id && !d.prestation_id && !d.prestation_nom);
    return { ...p, dep, det, combine: dep + det.reste };
  });

  /* ─── par prestation ─── */
  const prestRows = prestations.map(p => {
    const dep = depFor(e => e.prestation_id === p.id);
    const det = dettesFor(d => d.prestation_id === p.id || (d.prestation_nom && d.prestation_nom === p.nom));
    return { ...p, dep, det, combine: dep + det.reste };
  });

  const totalCombineChantiers = chantiersRows.reduce((s, r) => s + r.combine, 0);
  const totalCombinePrest     = prestRows.reduce((s, r) => s + r.combine, 0);

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

  const rows = tab === 'chantiers' ? chantiersRows : prestRows;
  const totalCombineTab = tab === 'chantiers' ? totalCombineChantiers : totalCombinePrest;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1A141A', margin: 0 }}>🧮 Bilan Dettes &amp; Dépenses</h1>
        <p style={{ fontSize: 13, color: '#8E5915', marginTop: 4, marginBottom: 0 }}>
          Vue d'ensemble des dettes et dépenses, réparties par chantier et par prestation
        </p>
      </div>

      {/* KPI globaux */}
      <div className="etcc-kpi-grid etcc-kpi-grid-4" style={{ marginBottom: 28 }}>
        <KPI label="Total dépenses" value={totalDepenses} color="#DC2626" icon={<TrendingDown size={12} />} />
        <KPI label="Total dettes" value={totalDettes} color="#F4B315" icon={<Wallet size={12} />} />
        <KPI label="Reste à payer (dettes)" value={totalDetteReste} color="#EA580C" icon={<AlertCircle size={12} />} />
        <KPI label="Total combiné" value={totalCombine} color="#1A141A" icon={<Wallet size={12} />} />
      </div>

      {/* Tabs */}
      <div style={{ ...STYLE.card, padding: 0 }}>
        <div style={{ display: 'flex', gap: 6, padding: '14px 18px', borderBottom: '1px solid #F5E6D3', alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={tabStyle(tab === 'chantiers')} onClick={() => setTab('chantiers')}>
            Par chantier
          </button>
          <button style={tabStyle(tab === 'prestations')} onClick={() => setTab('prestations')}>
            Par prestation
          </button>
          <div style={{ marginLeft: 'auto', fontSize: 12, color: '#8E5915', fontWeight: 700 }}>
            Total combiné :{' '}
            <span style={{ fontFamily: 'monospace', color: '#1A141A' }}>
              {formatCurrency(totalCombineTab)}
            </span>
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={STYLE.th}>{tab === 'chantiers' ? 'Chantier' : 'Prestation'}</th>
              <th style={{ ...STYLE.th, textAlign: 'right' }}>Dépenses</th>
              <th style={{ ...STYLE.th, textAlign: 'right' }}>Dettes (total)</th>
              <th style={{ ...STYLE.th, textAlign: 'right' }}>Dette payée</th>
              <th style={{ ...STYLE.th, textAlign: 'right' }}>Reste à payer</th>
              <th style={{ ...STYLE.th, textAlign: 'right' }}>Total combiné</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} style={{ ...STYLE.td, textAlign: 'center', color: '#B8A090' }}>
                {tab === 'chantiers' ? 'Aucun chantier' : 'Aucune prestation enregistrée'}
              </td></tr>
            )}
            {rows.map((r: any) => {
              const rowKey = `${tab}-${r.id}`;
              const isExpanded = expandedRow === rowKey;
              const hasDetail = r.dep > 0 || r.det.items.length > 0;
              const depDetail = tab === 'chantiers'
                ? expenses.filter(e => e.project_id === r.id)
                : expenses.filter(e => e.prestation_id === r.id);
              return (
                <>
                  <tr key={rowKey} style={{ cursor: hasDetail ? 'pointer' : 'default', background: isExpanded ? '#FDF9F3' : 'transparent' }}
                    onClick={() => hasDetail && setExpandedRow(isExpanded ? null : rowKey)}>
                    <td style={STYLE.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {hasDetail && (isExpanded ? <ChevronUp size={14} color="#8E5915" /> : <ChevronDown size={14} color="#8E5915" />)}
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{tab === 'chantiers' ? r.name : r.nom}</div>
                          <div style={{ fontSize: 11, color: '#B8A090' }}>
                            {tab === 'chantiers' ? (r.code || '') : (r.client || '')}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ ...STYLE.td, textAlign: 'right', fontFamily: 'monospace', color: r.dep > 0 ? '#DC2626' : '#B8A090' }}>
                      {r.dep > 0 ? formatCurrency(r.dep) : '—'}
                    </td>
                    <td style={{ ...STYLE.td, textAlign: 'right', fontFamily: 'monospace', color: r.det.montant > 0 ? '#F4B315' : '#B8A090' }}>
                      {r.det.montant > 0 ? formatCurrency(r.det.montant) : '—'}
                    </td>
                    <td style={{ ...STYLE.td, textAlign: 'right', fontFamily: 'monospace', color: r.det.paye > 0 ? '#16A34A' : '#B8A090' }}>
                      {r.det.paye > 0 ? formatCurrency(r.det.paye) : '—'}
                    </td>
                    <td style={{ ...STYLE.td, textAlign: 'right', fontFamily: 'monospace', color: r.det.reste > 0 ? '#EA580C' : '#B8A090' }}>
                      {r.det.reste > 0 ? formatCurrency(r.det.reste) : '—'}
                    </td>
                    <td style={{ ...STYLE.td, textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: '#1A141A' }}>
                      {formatCurrency(r.combine)}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${rowKey}-exp`}>
                      <td colSpan={6} style={{ padding: '0 20px 14px 48px', background: '#FDF9F3' }}>
                        {depDetail.length > 0 && (
                          <div style={{ marginBottom: r.det.items.length > 0 ? 14 : 0 }}>
                            <p style={{ fontSize: 11, fontWeight: 800, color: '#8E5915', textTransform: 'uppercase', margin: '10px 0 6px' }}>Dépenses</p>
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
                          </div>
                        )}
                        {r.det.items.length > 0 && (
                          <div>
                            <p style={{ fontSize: 11, fontWeight: 800, color: '#8E5915', textTransform: 'uppercase', margin: '10px 0 6px' }}>Dettes</p>
                            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                              <thead>
                                <tr>
                                  <th style={{ ...STYLE.th, fontSize: 10, padding: '6px 10px' }}>Date</th>
                                  <th style={{ ...STYLE.th, fontSize: 10, padding: '6px 10px' }}>Nom</th>
                                  <th style={{ ...STYLE.th, fontSize: 10, padding: '6px 10px', textAlign: 'right' }}>Montant</th>
                                  <th style={{ ...STYLE.th, fontSize: 10, padding: '6px 10px', textAlign: 'right' }}>Reste</th>
                                  <th style={{ ...STYLE.th, fontSize: 10, padding: '6px 10px' }}>Statut</th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.det.items.map((d: any) => (
                                  <tr key={d.id}>
                                    <td style={{ ...STYLE.td, fontSize: 12, padding: '7px 10px' }}>{d.date ? new Date(d.date).toLocaleDateString('fr-FR') : '—'}</td>
                                    <td style={{ ...STYLE.td, fontSize: 12, padding: '7px 10px' }}>{d.nom}</td>
                                    <td style={{ ...STYLE.td, fontSize: 12, padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(Number(d.montant))}</td>
                                    <td style={{ ...STYLE.td, fontSize: 12, padding: '7px 10px', textAlign: 'right', fontFamily: 'monospace', color: '#EA580C' }}>{formatCurrency(Number(d.montant) - Number(d.montant_paye))}</td>
                                    <td style={{ ...STYLE.td, fontSize: 12, padding: '7px 10px' }}>{d.statut}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr style={{ background: '#FAF7F2' }}>
                <td style={{ ...STYLE.td, fontWeight: 800, color: '#1A141A' }}>Total</td>
                <td style={{ ...STYLE.td, textAlign: 'right', fontWeight: 800, fontFamily: 'monospace', color: '#DC2626' }}>
                  {formatCurrency(rows.reduce((s: number, r: any) => s + r.dep, 0))}
                </td>
                <td style={{ ...STYLE.td, textAlign: 'right', fontWeight: 800, fontFamily: 'monospace' }}>
                  {formatCurrency(rows.reduce((s: number, r: any) => s + r.det.montant, 0))}
                </td>
                <td style={{ ...STYLE.td, textAlign: 'right', fontWeight: 800, fontFamily: 'monospace', color: '#16A34A' }}>
                  {formatCurrency(rows.reduce((s: number, r: any) => s + r.det.paye, 0))}
                </td>
                <td style={{ ...STYLE.td, textAlign: 'right', fontWeight: 800, fontFamily: 'monospace', color: '#EA580C' }}>
                  {formatCurrency(rows.reduce((s: number, r: any) => s + r.det.reste, 0))}
                </td>
                <td style={{ ...STYLE.td, textAlign: 'right', fontWeight: 800, fontFamily: 'monospace' }}>
                  {formatCurrency(totalCombineTab)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Note bas de page */}
      <div style={{ marginTop: 16, fontSize: 11, color: '#B8A090', textAlign: 'right' }}>
        * Le <strong>Total combiné</strong> additionne les dépenses déjà engagées et le reste à payer sur les dettes, sans double-compter les paiements de dettes déjà enregistrés comme dépense.
        Seules les dépenses avec statut <strong>Approuvé</strong> sont comptabilisées.
      </div>
    </div>
  );
}
