'use client';

import { useState, useEffect, useRef } from 'react';
import { Upload, CheckCircle, ExternalLink, FileText } from 'lucide-react';
import { uploadApi, depensesApi } from '@/lib/api';
import { useLanguage } from '@/lib/i18n';

export default function MonBLPage() {
  const { t, dir } = useLanguage();
  const [imports, setImports]     = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess]     = useState('');
  const [dragging, setDragging]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const statusCfg: Record<string, { label: string; bg: string; color: string }> = {
    PENDING:  { label: t('monbl.status_p'), bg: '#FFF8E1', color: '#D4A017' },
    APPROVED: { label: t('monbl.status_a'), bg: '#E8F5E9', color: '#2E7D32' },
    REJECTED: { label: t('monbl.status_r'), bg: '#FFEBEE', color: '#D32F2F' },
  };

  const fetchImports = () => {
    depensesApi.findMine()
      .then(r => {
        const all: any[] = r.data?.data || r.data || [];
        setImports(all.filter((d: any) => d.description?.startsWith('[BL-IMPORT]')));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchImports(); }, []);

  const handleUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const up = await uploadApi.upload(file);
      const url = up.data?.url || up.data?.filename || '';
      await depensesApi.create({
        description: `[BL-IMPORT] ${file.name}`,
        category:    'AUTRE',
        amount:      1,
        receipt_url: url,
      });
      setSuccess(t('monbl.success'));
      setTimeout(() => setSuccess(''), 5000);
      fetchImports();
    } catch {
      alert(t('monbl.error'));
    } finally {
      setUploading(false);
    }
  };

  const onFile = (file: File | null) => { if (file) handleUpload(file); };

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }} dir={dir}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1A141A', margin: 0 }}>📤 {t('monbl.title')}</h1>
        <p style={{ margin: '6px 0 0', fontSize: 13, color: '#8E5915' }}>{t('monbl.subtitle')}</p>
      </div>

      {/* Bannière succès */}
      {success && (
        <div style={{ background: '#E8F5E9', border: '1px solid #A5D6A7', borderRadius: 10, padding: '12px 18px', marginBottom: 20, color: '#2E7D32', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle size={16} /> {success}
        </div>
      )}

      {/* Zone de dépôt */}
      <div
        onClick={() => !uploading && fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files[0]); }}
        style={{
          border: `2px dashed ${dragging ? '#F5C842' : '#E8D4B0'}`,
          borderRadius: 16, padding: '48px 24px', textAlign: 'center',
          cursor: uploading ? 'default' : 'pointer',
          background: dragging ? '#FFFBF0' : '#FFFDF8',
          marginBottom: 28, transition: 'all 0.2s',
        }}
      >
        {uploading ? (
          <div>
            <div style={{ width: 48, height: 48, borderRadius: '50%', border: '4px solid #F5E6D3', borderTopColor: '#F5C842', margin: '0 auto 16px', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1A141A' }}>{t('monbl.importing')}</p>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#8E5915' }}>{t('monbl.wait')}</p>
          </div>
        ) : (
          <div>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg,#F5C842,#D4A017)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 28 }}>
              📁
            </div>
            <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 800, color: '#1A141A' }}>{t('monbl.drop')}</p>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#8E5915' }}>{t('monbl.or_click')}</p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#F5C842,#D4A017)', color: '#1A141A', fontSize: 13, fontWeight: 700 }}>
              <Upload size={15} /> {t('monbl.btn')}
            </div>
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }} onChange={e => onFile(e.target.files?.[0] || null)} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Liste */}
      <p style={{ fontSize: 11, fontWeight: 700, color: '#8E5915', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 12px' }}>
        {t('monbl.count')} ({imports.length})
      </p>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#8E5915', fontSize: 13 }}>{t('loading')}</div>
      ) : imports.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, background: 'white', borderRadius: 12, border: '1px solid #EDDEC1', color: '#8E5915', fontSize: 13 }}>
          {t('monbl.no_data')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {imports.map((d: any) => {
            const st = statusCfg[d.status] || statusCfg.PENDING;
            const fileName = d.description?.replace('[BL-IMPORT] ', '') || 'Document';
            const date = new Date(d.created_at || d.date).toLocaleDateString('fr-FR');
            return (
              <div key={d.id} style={{ background: 'white', border: '1px solid #EDDEC1', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexDirection: dir === 'rtl' ? 'row-reverse' : 'row' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexDirection: dir === 'rtl' ? 'row-reverse' : 'row' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: '#FFF8E1', border: '1.5px solid #F5C842', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FileText size={18} color="#D4A017" />
                  </div>
                  <div style={{ textAlign: dir === 'rtl' ? 'right' : 'left' }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#1A141A' }}>{fileName}</div>
                    <div style={{ fontSize: 11, color: '#8E5915', marginTop: 2 }}>{t('monbl.imported_on')} {date}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ background: st.bg, color: st.color, padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                    {st.label}
                  </span>
                  {d.receipt_url && (
                    <a href={d.receipt_url.startsWith('http') ? d.receipt_url : `http://localhost:4000${d.receipt_url}`}
                      target="_blank" rel="noreferrer"
                      style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 8, border: '1.5px solid #E8D4B0', background: 'white', color: '#8E5915', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>
                      <ExternalLink size={12} /> {t('see')}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
