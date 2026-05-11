'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, RefreshCw } from 'lucide-react';
import api from '@/lib/api';
import { useLanguage } from '@/lib/i18n';
import { formatDate, cn } from '@/lib/utils';

const alertConfig: Record<string, { label: string; icon: string; cls: string }> = {
  NO_INVOICE_FOUND:        { label: 'Facture manquante',   icon: '🚨', cls: 'border-red-200 bg-red-50/30' },
  UNKNOWN_BENEFICIARY:     { label: 'Bénéficiaire inconnu', icon: '❓', cls: 'border-amber-200 bg-amber-50/30' },
  AMOUNT_MISMATCH:         { label: 'Montant incorrect',   icon: '⚡', cls: 'border-amber-200 bg-amber-50/30' },
  DUPLICATE_PAYMENT:       { label: 'Double paiement',     icon: '🔁', cls: 'border-red-200 bg-red-50/30' },
  LOW_STOCK:               { label: 'Stock bas',            icon: '📦', cls: 'border-amber-200 bg-amber-50/30' },
  OVERDUE_INVOICE:         { label: 'Facture en retard',   icon: '⏰', cls: 'border-red-200 bg-red-50/30' },
  EXPENSE_WITHOUT_RECEIPT: { label: 'Dépense sans reçu',   icon: '🧾', cls: 'border-amber-200 bg-amber-50/30' },
};

const severityCls: Record<string, string> = {
  DANGER: 'badge-danger',
  WARN:   'badge-warning',
  INFO:   'badge-info',
};

const btnSecondary = { padding:'9px 18px', borderRadius:8, border:'1.5px solid #E8D4B0', background:'white', color:'#8E5915', fontSize:13, fontWeight:600 as const, cursor:'pointer' as const };
const btnSuccess   = { padding:'9px 20px', borderRadius:8, border:'none', background:'linear-gradient(135deg,#22C55E,#16A34A)', color:'white', fontSize:13, fontWeight:700 as const, cursor:'pointer' as const };

export default function AlertesPage() {
  const [alerts, setAlerts]       = useState<any[]>([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [loading, setLoading]     = useState(true);
  const [counts, setCounts]       = useState<Record<string, number>>({});
  const [resolveTarget, setResolveTarget]     = useState<any>(null);   // single alert to confirm
  const [resolveAllOpen, setResolveAllOpen]   = useState(false);        // "tout résoudre" confirm
  const [resolving, setResolving] = useState(false);

  const load = () => {
    setLoading(true);
    api.get('/alerts', { params: { status: 'OPEN', type: typeFilter || undefined } })
      .then((r) => {
        const data = r.data?.data || r.data || [];
        setAlerts(data);
        const c: Record<string, number> = {};
        data.forEach((a: any) => { c[a.type] = (c[a.type] || 0) + 1; });
        setCounts(c);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [typeFilter]);

  // Resolve a single alert
  const confirmResolve = async () => {
    if (!resolveTarget) return;
    setResolving(true);
    try {
      await api.patch(`/alerts/${resolveTarget.id}/resolve`);
      setResolveTarget(null);
      load();
    } finally {
      setResolving(false);
    }
  };

  // Resolve all currently displayed alerts
  const confirmResolveAll = async () => {
    setResolving(true);
    try {
      await Promise.all(alerts.map(a => api.patch(`/alerts/${a.id}/resolve`)));
      setResolveAllOpen(false);
      load();
    } finally {
      setResolving(false);
    }
  };

  const topTypes = Object.entries(alertConfig)
    .filter(([key]) => (counts[key] || 0) > 0)
    .sort((a, b) => (counts[b[0]] || 0) - (counts[a[0]] || 0));

  return (
    <div>
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-[22px] font-bold text-honey-dark font-display tracking-tight">Centre d'alertes</h1>
          <p className="text-sm text-honey-caramel mt-0.5">
            {alerts.length} alerte{alerts.length !== 1 ? 's' : ''} en cours · Action requise
          </p>
        </div>
        <div className="flex gap-2">
          {alerts.length > 1 && (
            <button
              onClick={() => setResolveAllOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-50 text-green-700 border border-green-200 text-sm font-semibold hover:bg-green-100 transition-all">
              <CheckCircle size={13} /> Tout résoudre ({alerts.length})
            </button>
          )}
          <button onClick={load} className="btn-secondary text-sm">
            <RefreshCw size={13} /> Actualiser
          </button>
        </div>
      </div>

      {/* Type filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setTypeFilter('')}
          className={cn('px-3 py-2 rounded-lg text-xs font-semibold border transition-all',
            typeFilter === '' ? 'bg-honey-dark text-white border-honey-dark' : 'bg-white text-honey-caramel border-honey-beige-soft hover:border-honey-gold'
          )}>
          Toutes ({alerts.length})
        </button>
        {topTypes.map(([key, cfg]) => (
          <button key={key} onClick={() => setTypeFilter(key)}
            className={cn('px-3 py-2 rounded-lg text-xs font-semibold border transition-all',
              typeFilter === key ? 'bg-honey-dark text-white border-honey-dark' : 'bg-white text-honey-caramel border-honey-beige-soft hover:border-honey-gold'
            )}>
            {cfg.icon} {cfg.label} ({counts[key]})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card py-12 text-center text-honey-caramel">Chargement...</div>
      ) : alerts.length === 0 ? (
        <div className="card py-16 text-center">
          <CheckCircle size={40} className="mx-auto mb-3 text-green-400" />
          <p className="font-semibold text-honey-dark">Aucune alerte en cours</p>
          <p className="text-sm text-honey-caramel mt-1">Tout est en ordre 🍯</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const cfg = alertConfig[alert.type] || { label: alert.type, icon: '⚠', cls: 'border-gray-200' };
            return (
              <div key={alert.id} className={cn('flex items-start gap-4 p-4 rounded-lg border', cfg.cls)}>
                <span className="text-2xl flex-shrink-0">{cfg.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold text-honey-dark">{alert.title}</p>
                    <span className={cn('badge border text-[10px]', severityCls[alert.severity] || 'badge-warning')}>
                      {alert.severity}
                    </span>
                  </div>
                  <p className="text-xs text-honey-caramel">{alert.description}</p>
                  <p className="text-[11px] text-honey-caramel mt-1">{formatDate(alert.created_at)}</p>
                </div>
                {alert.amount && (
                  <p className="font-mono font-bold text-honey-dark text-sm flex-shrink-0">
                    {Number(alert.amount).toFixed(2)} MAD
                  </p>
                )}
                <div className="flex gap-2 flex-shrink-0">
                  {alert.type === 'NO_INVOICE_FOUND' && (
                    <button className="text-xs text-blue-600 hover:underline font-medium">Lier facture</button>
                  )}
                  <button
                    onClick={() => setResolveTarget(alert)}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-semibold hover:bg-green-100 transition-all">
                    <CheckCircle size={11} /> Résoudre
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── POPUP Confirmer résolution d'une alerte ─────────────────────────── */}
      {resolveTarget && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setResolveTarget(null)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.55)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:400, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', padding:28 }}>
            <h3 style={{ margin:'0 0 8px', fontSize:17, fontWeight:700, color:'#1A141A' }}>✅ Résoudre l'alerte</h3>
            <p style={{ fontSize:13, color:'#8E5915', marginBottom:8 }}>
              Confirmer la résolution de cette alerte ?
            </p>
            <div style={{ background:'#F9F5EE', border:'1px solid #F5E6D3', borderRadius:8, padding:'10px 14px', marginBottom:20 }}>
              <p style={{ margin:0, fontSize:14, fontWeight:600, color:'#1A141A' }}>{resolveTarget.title}</p>
              <p style={{ margin:'4px 0 0', fontSize:12, color:'#8E5915' }}>{resolveTarget.description}</p>
            </div>
            <p style={{ fontSize:12, color:'#999', marginBottom:20 }}>L'alerte sera marquée comme résolue et disparaîtra de la liste.</p>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setResolveTarget(null)} style={{ ...btnSecondary, flex:1 }}>Annuler</button>
              <button onClick={confirmResolve} disabled={resolving} style={{ ...btnSuccess, flex:1, opacity:resolving?0.7:1 }}>
                {resolving ? 'Résolution...' : '✅ Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── POPUP Confirmer "Tout résoudre" ─────────────────────────────────── */}
      {resolveAllOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setResolveAllOpen(false)} style={{ position:'absolute', inset:0, background:'rgba(26,20,26,0.55)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:10, background:'white', borderRadius:16, width:'100%', maxWidth:420, margin:'0 16px', boxShadow:'0 20px 60px rgba(0,0,0,0.25)', padding:28 }}>
            <h3 style={{ margin:'0 0 8px', fontSize:17, fontWeight:700, color:'#1A141A' }}>✅ Tout résoudre</h3>
            <p style={{ fontSize:13, color:'#8E5915', marginBottom:20 }}>
              Vous êtes sur le point de marquer <strong>{alerts.length} alerte{alerts.length !== 1 ? 's' : ''}</strong> comme résolue{alerts.length !== 1 ? 's' : ''}.
              {typeFilter && ` (filtre : ${alertConfig[typeFilter]?.label || typeFilter})`}
            </p>
            <p style={{ fontSize:12, color:'#999', marginBottom:20 }}>Cette action résoudra toutes les alertes actuellement affichées.</p>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => setResolveAllOpen(false)} style={{ ...btnSecondary, flex:1 }}>Annuler</button>
              <button onClick={confirmResolveAll} disabled={resolving} style={{ ...btnSuccess, flex:1, opacity:resolving?0.7:1 }}>
                {resolving ? 'Résolution...' : `✅ Tout résoudre (${alerts.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
