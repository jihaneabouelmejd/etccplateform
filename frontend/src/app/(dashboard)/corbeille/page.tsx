'use client';

import { useEffect, useState, useCallback } from 'react';
import { Trash2, RotateCcw, RefreshCw } from 'lucide-react';
import { devisApi, blApi, invoicesApi } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

interface CancelledItem {
  id: string;
  number: string;
  updated_at: string;
  client?: { commercial_name: string } | null;
}

interface CorbeilleData {
  devis: CancelledItem[];
  bl: CancelledItem[];
  factures: CancelledItem[];
}

export default function CorbeillePage() {
  const { user } = useAuth();
  const canDel = user?.role === 'ADMIN' || user?.role === 'GERANT';

  const [data, setData] = useState<CorbeilleData>({ devis: [], bl: [], factures: [] });
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [confirmItem, setConfirmItem] = useState<{ id: string; type: 'devis' | 'bl' | 'factures'; number: string } | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // Each service returns CANCELLED items — use status filter on the list endpoint
      const [devisRes, blRes, facRes] = await Promise.all([
        devisApi.list({ status: 'CANCELLED', page: 1 }),
        blApi.list({ status: 'CANCELLED', page: 1 }),
        invoicesApi.list({ status: 'CANCELLED', page: 1 }),
      ]);
      setData({
        devis: devisRes.data?.data || [],
        bl: blRes.data?.data || [],
        factures: facRes.data?.data || [],
      });
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleRestore = async (type: 'devis' | 'bl' | 'factures', id: string) => {
    setActionId(id);
    try {
      if (type === 'devis') await devisApi.restore(id);
      else if (type === 'bl') await blApi.restore(id);
      else await invoicesApi.restore(id);
      await fetchAll();
    } finally {
      setActionId(null);
    }
  };

  const handleHardDelete = async () => {
    if (!confirmItem) return;
    const { id, type } = confirmItem;
    setActionId(id);
    setConfirmItem(null);
    try {
      if (type === 'devis') await devisApi.hardDelete(id);
      else if (type === 'bl') await blApi.hardDelete(id);
      else await invoicesApi.hardDelete(id);
      await fetchAll();
    } finally {
      setActionId(null);
    }
  };

  const total = data.devis.length + data.bl.length + data.factures.length;

  const sections: { key: 'devis' | 'bl' | 'factures'; label: string; emoji: string; color: string }[] = [
    { key: 'devis',    label: 'Devis',    emoji: '📄', color: '#755C00' },
    { key: 'bl',       label: 'BL',       emoji: '🚚', color: '#1565C0' },
    { key: 'factures', label: 'Factures', emoji: '🧾', color: '#2E7D32' },
  ];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 26 }}>🗑️</span>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1A141A' }}>Corbeille</h1>
            <p style={{ margin: 0, fontSize: 12, color: '#8E5915' }}>
              {loading ? '…' : total === 0 ? 'Aucun élément supprimé' : `${total} élément${total > 1 ? 's' : ''} supprimé${total > 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 8, border: '1px solid #EDDEC1',
            background: 'white', color: '#755C00', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          Actualiser
        </button>
      </div>

      {/* Empty state */}
      {!loading && total === 0 && (
        <div style={{
          textAlign: 'center', padding: '60px 20px', borderRadius: 12,
          border: '1.5px dashed #EDDEC1', background: 'white',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🗑️</div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: '#1A141A' }}>La corbeille est vide</p>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#8E5915' }}>
            Les éléments supprimés apparaissent ici avant suppression définitive.
          </p>
        </div>
      )}

      {/* Sections */}
      {sections.map(({ key, label, emoji, color }) => {
        const items = data[key];
        if (!loading && items.length === 0) return null;
        return (
          <div key={key} style={{ marginBottom: 24 }}>
            {/* Section header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              marginBottom: 10, paddingBottom: 8,
              borderBottom: '1.5px solid #EDDEC1',
            }}>
              <span style={{ fontSize: 18 }}>{emoji}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color }}>{label}</span>
              <span style={{
                padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700,
                background: `${color}18`, color,
              }}>{items.length}</span>
            </div>

            {/* Table */}
            <div style={{ background: 'white', borderRadius: 10, border: '1px solid #EDDEC1', overflow: 'hidden' }}>
              {loading ? (
                <div style={{ padding: '20px', textAlign: 'center', fontSize: 12, color: '#8E5915' }}>Chargement…</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#FBF6EE' }}>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#5C3A1E', width: '30%' }}>Numéro</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#5C3A1E' }}>Client</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#5C3A1E', width: '150px' }}>Supprimé le</th>
                      <th style={{ padding: '10px 14px', width: '110px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr
                        key={item.id}
                        style={{
                          borderTop: idx > 0 ? '1px solid #F5ECD7' : 'none',
                          background: actionId === item.id ? '#FBF6EE' : 'white',
                          opacity: actionId === item.id ? 0.6 : 1,
                          transition: 'background 0.15s',
                        }}
                      >
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#1A141A', fontFamily: 'monospace' }}>
                          {item.number}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#5C3A1E' }}>
                          {item.client?.commercial_name || '—'}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#8E5915', fontSize: 12 }}>
                          {new Date(item.updated_at).toLocaleDateString('fr-FR')}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {canDel && (
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                              {/* Restore */}
                              <button
                                onClick={() => handleRestore(key, item.id)}
                                disabled={!!actionId}
                                title="Restaurer"
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 4,
                                  padding: '5px 10px', borderRadius: 7, border: '1px solid #C8E6C9',
                                  background: '#E8F5E9', color: '#2E7D32',
                                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                }}
                              >
                                <RotateCcw size={11} /> Restaurer
                              </button>
                              {/* Hard delete */}
                              <button
                                onClick={() => setConfirmItem({ id: item.id, type: key, number: item.number })}
                                disabled={!!actionId}
                                title="Supprimer définitivement"
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 4,
                                  padding: '5px 10px', borderRadius: 7, border: '1px solid #FFCDD2',
                                  background: '#FFEBEE', color: '#C62828',
                                  fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                }}
                              >
                                <Trash2 size={11} /> Supprimer
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        );
      })}

      {/* Confirm hard delete modal */}
      {confirmItem && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }}>
          <div style={{
            background: 'white', borderRadius: 14, padding: 28, maxWidth: 400, width: '90%',
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
          }}>
            <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 12 }}>⚠️</div>
            <h3 style={{ margin: '0 0 8px', textAlign: 'center', fontSize: 16, fontWeight: 700, color: '#1A141A' }}>
              Suppression définitive
            </h3>
            <p style={{ margin: '0 0 20px', textAlign: 'center', fontSize: 13, color: '#5C3A1E' }}>
              Voulez-vous vraiment supprimer <strong>{confirmItem.number}</strong> définitivement ?<br />
              <span style={{ color: '#C62828', fontSize: 12 }}>Cette action est irréversible.</span>
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setConfirmItem(null)}
                style={{
                  flex: 1, padding: '10px', borderRadius: 8,
                  border: '1px solid #EDDEC1', background: 'white',
                  color: '#5C3A1E', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleHardDelete}
                style={{
                  flex: 1, padding: '10px', borderRadius: 8,
                  border: 'none', background: '#C62828',
                  color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}
              >
                🗑️ Supprimer définitivement
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
