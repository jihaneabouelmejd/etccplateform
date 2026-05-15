'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Download, FileText, Truck, Receipt, ShoppingCart, ArrowUp, ArrowDown } from 'lucide-react';
import { devisApi, blApi, invoicesApi, bcApi, pdfMergeApi } from '@/lib/api';
import { useLanguage } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type DocType = 'devis' | 'bl' | 'invoice' | 'bc';

interface MergeItem {
  id: string;
  type: DocType;
  label: string;
  number: string;
}

const typeConfig: Record<DocType, { icon: any; color: string; bg: string; label: string }> = {
  devis:   { icon: FileText,     color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',   label: 'Devis'   },
  bl:      { icon: Truck,        color: 'text-green-700',  bg: 'bg-green-50 border-green-200',  label: 'BL'      },
  invoice: { icon: Receipt,      color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200', label: 'Facture' },
  bc:      { icon: ShoppingCart, color: 'text-honey-dark', bg: 'bg-honey-cream border-honey-beige-soft', label: 'BC' },
};

export default function MergePage() {
  const [devisList,   setDevisList]   = useState<any[]>([]);
  const [blList,      setBlList]      = useState<any[]>([]);
  const [invoiceList, setInvoiceList] = useState<any[]>([]);
  const [bcList,      setBcList]      = useState<any[]>([]);
  const [loading,     setLoading]     = useState(true);

  const [items,       setItems]       = useState<MergeItem[]>([]);
  const [addType,     setAddType]     = useState<DocType>('devis');
  const [addId,       setAddId]       = useState('');
  const [merging,     setMerging]     = useState(false);
  const [mergeError,  setMergeError]  = useState('');

  useEffect(() => {
    Promise.all([
      devisApi.list({ limit: 200 }),
      blApi.list({ limit: 200 }),
      invoicesApi.list({ limit: 200 }),
      bcApi.list({ limit: 200 }),
    ]).then(([d, b, i, bc]) => {
      setDevisList(d.data.data || []);
      setBlList(b.data.data || []);
      setInvoiceList(i.data.data || []);
      setBcList(bc.data.data || []);
    }).finally(() => setLoading(false));
  }, []);

  const getOptions = () => {
    if (addType === 'devis')   return devisList.map(d => ({ id: d.id, label: `${d.number} – ${d.client?.commercial_name || ''}` }));
    if (addType === 'bl')      return blList.map(b    => ({ id: b.id, label: `${b.number} – ${b.client?.commercial_name || ''}` }));
    if (addType === 'invoice') return invoiceList.map(i => ({ id: i.id, label: `${i.number} – ${i.client?.commercial_name || ''}` }));
    if (addType === 'bc')      return bcList.map(b    => ({ id: b.id, label: `${b.number} – ${b.client?.commercial_name || ''}` }));
    return [];
  };

  const handleAdd = () => {
    if (!addId) return;
    const opts = getOptions();
    const found = opts.find(o => o.id === addId);
    if (!found) return;
    if (items.find(it => it.id === addId && it.type === addType)) return; // already added
    setItems(prev => [...prev, { id: addId, type: addType, label: found.label, number: found.label.split(' – ')[0] }]);
    setAddId('');
  };

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));
  const moveUp   = (idx: number) => { if (idx === 0) return; const a = [...items]; [a[idx-1],a[idx]]=[a[idx],a[idx-1]]; setItems(a); };
  const moveDown = (idx: number) => { if (idx === items.length-1) return; const a=[...items]; [a[idx],a[idx+1]]=[a[idx+1],a[idx]]; setItems(a); };

  const handleMerge = async () => {
    if (items.length < 2) { setMergeError('Sélectionnez au moins 2 documents à fusionner'); return; }
    setMerging(true); setMergeError('');
    try {
      const res = await pdfMergeApi.merge(items.map(it => ({ type: it.type, id: it.id })));
      const url  = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `dossier-${items.map(it=>it.number).join('_')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'Erreur lors de la fusion';
      setMergeError(Array.isArray(msg) ? msg.join(', ') : String(msg));
    } finally { setMerging(false); }
  };

  return (
    <div>
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-[22px] font-bold text-honey-dark font-display tracking-tight">Fusion de documents</h1>
          <p className="text-sm text-honey-caramel mt-0.5">Combiner plusieurs documents (Devis, BL, Factures) en un seul PDF téléchargeable</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* Left — sélection */}
        <div className="card">
          <h2 className="text-sm font-bold text-honey-dark mb-4">Ajouter un document</h2>

          {/* Type toggle */}
          <div style={{ display:'flex', gap:6, marginBottom:14, background:'#FBF6EE', padding:4, borderRadius:10 }}>
            {(['devis','bl','invoice','bc'] as DocType[]).map(t => (
              <button key={t} type="button" onClick={() => { setAddType(t); setAddId(''); }}
                style={{ flex:1, padding:'7px 0', borderRadius:7, border:'none', background:addType===t?'white':'transparent', color:addType===t?'#1A141A':'#8E5915', fontSize:12, fontWeight:700, cursor:'pointer', boxShadow:addType===t?'0 1px 4px rgba(0,0,0,0.08)':'none' }}>
                {typeConfig[t].label}
              </button>
            ))}
          </div>

          {/* Document select */}
          {loading ? (
            <p className="text-sm text-honey-caramel">Chargement...</p>
          ) : (
            <div style={{ display:'flex', gap:8 }}>
              <select value={addId} onChange={e => setAddId(e.target.value)}
                style={{ flex:1, padding:'9px 12px', borderRadius:8, border:'1.5px solid #E8D4B0', fontSize:13, outline:'none' }}>
                <option value="">Sélectionner un {typeConfig[addType].label.toLowerCase()}...</option>
                {getOptions().map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
              <button onClick={handleAdd} disabled={!addId}
                className="btn-primary text-sm" style={{ opacity: addId?1:0.4 }}>
                <Plus size={14} />
              </button>
            </div>
          )}

          <div className="mt-4 p-3 rounded-lg" style={{ background:'#FFF8EE', border:'1px solid #E8D4B0' }}>
            <p className="text-xs text-honey-caramel font-semibold mb-1">💡 Comment ça marche</p>
            <p className="text-xs text-honey-caramel">Sélectionnez les documents à fusionner dans l'ordre souhaité. Vous pouvez réorganiser avec les flèches. Le PDF final contiendra tous les documents à la suite.</p>
          </div>
        </div>

        {/* Right — liste + merge */}
        <div className="card flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-bold text-honey-dark">Documents sélectionnés ({items.length})</h2>
            {items.length >= 2 && (
              <button onClick={handleMerge} disabled={merging}
                className="btn-primary text-sm flex items-center gap-1.5"
                style={{ opacity: merging?0.7:1 }}>
                <Download size={13} />
                {merging ? 'Fusion en cours...' : 'Télécharger le PDF fusionné'}
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
              <div style={{ width:52, height:52, borderRadius:13, background:'#FFF8EE', border:'2px dashed #E8D4B0', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px' }}>
                <FileText size={22} className="text-honey-caramel" />
              </div>
              <p className="text-sm text-honey-caramel font-semibold">Aucun document ajouté</p>
              <p className="text-xs text-honey-caramel mt-1">Ajoutez des documents depuis la colonne de gauche</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 flex-1">
              {items.map((item, idx) => {
                const cfg = typeConfig[item.type];
                const Icon = cfg.icon;
                return (
                  <div key={`${item.type}-${item.id}`}
                    className={cn('flex items-center gap-3 p-3 rounded-lg border', cfg.bg)}>
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => moveUp(idx)} disabled={idx===0}
                        className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 disabled:opacity-20">
                        <ArrowUp size={11} />
                      </button>
                      <button onClick={() => moveDown(idx)} disabled={idx===items.length-1}
                        className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 disabled:opacity-20">
                        <ArrowDown size={11} />
                      </button>
                    </div>
                    <div style={{ width:28, height:28, borderRadius:7, background:'white', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <Icon size={14} className={cfg.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-xs font-bold uppercase tracking-wide', cfg.color)}>{cfg.label}</p>
                      <p className="text-sm font-semibold text-honey-dark truncate">{item.label}</p>
                    </div>
                    <span style={{ fontSize:11, color:'#A33C00', fontWeight:700, background:'rgba(255,255,255,0.6)', borderRadius:4, padding:'2px 7px' }}>#{idx+1}</span>
                    <button onClick={() => removeItem(idx)}
                      className="w-7 h-7 rounded-md border border-red-200 flex items-center justify-center text-red-400 hover:text-red-600 hover:border-red-400 hover:bg-red-50 transition-all flex-shrink-0">
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {mergeError && (
            <div style={{ background:'#FFF0F0', border:'1px solid #FFCDD2', borderRadius:8, padding:'8px 12px', marginTop:12, fontSize:12, color:'#D32F2F' }}>
              ⚠️ {mergeError}
            </div>
          )}

          {items.length >= 2 && (
            <div className="mt-4 pt-4 border-t border-honey-beige-soft">
              <button onClick={handleMerge} disabled={merging}
                className="w-full btn-primary text-sm flex items-center justify-center gap-2"
                style={{ opacity:merging?0.7:1, padding:'11px 0' }}>
                <Download size={15} />
                {merging ? 'Génération du PDF fusionné...' : `Télécharger le dossier (${items.length} documents)`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
