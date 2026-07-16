'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, Trash2, ChevronLeft, ChevronRight, FileEdit, X } from 'lucide-react';
import { mailApi } from '@/lib/api';
import { useLanguage } from '@/lib/i18n';
import { card, btnSecondary, btnPrimary, inputStyle, mailColors, formatMailDate } from '@/components/mail/mailUi';
import { useMailAccounts } from '@/components/mail/useMailAccounts';
import MailAccountSelect from '@/components/mail/MailAccountSelect';

export default function DraftsPage() {
  const { t } = useLanguage();
  const [messages, setMessages] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 25;
  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const { accounts, selectedId, setSelectedId, loading: loadingAccounts } = useMailAccounts();

  const load = useCallback(() => {
    if (loadingAccounts || (accounts.length > 0 && !selectedId)) return;
    setLoading(true); setError('');
    mailApi.listFolder('drafts', { page, limit, q: q || undefined, accountId: selectedId || undefined })
      .then(({ data }) => { setMessages(data.messages || []); setTotal(data.total || 0); })
      .catch((e) => setError(e?.response?.data?.message || "Erreur de connexion à la boîte mail"))
      .finally(() => setLoading(false));
  }, [page, q, selectedId, loadingAccounts, accounts.length]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [selectedId]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await mailApi.deleteMessage('drafts', deleteTarget.uid, selectedId || undefined);
      setMessages(prev => prev.filter(m => m.uid !== deleteTarget.uid));
      setTotal(n => Math.max(0, n - 1));
      setDeleteTarget(null);
    } catch (e: any) { alert(e?.response?.data?.message || 'Erreur'); }
    finally { setDeleting(false); }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div>
      <div className="flex justify-between items-start mb-4">
        <div>
          <h1 className="text-[22px] font-bold text-honey-dark font-display tracking-tight">📝 {t('menu.messagerie_drafts')}</h1>
          <p className="text-sm text-honey-caramel mt-0.5">{total} brouillon{total > 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <MailAccountSelect accounts={accounts} value={selectedId} onChange={setSelectedId} />
          <a href={`/messagerie/nouveau${selectedId ? `?accountId=${selectedId}` : ''}`} style={{ ...btnPrimary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            ✍️ {t('mail.new_message_short')}
          </a>
        </div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); setPage(1); setQ(qInput); }}
        style={{ display: 'flex', gap: 8, marginBottom: 14 }}
      >
        <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
          <Search size={14} color={mailColors.muted} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder={t('mail.search')} style={{ ...inputStyle, paddingLeft: 34 }} />
        </div>
        <button type="submit" style={btnSecondary}>OK</button>
        {q && <button type="button" onClick={() => { setQ(''); setQInput(''); setPage(1); }} style={btnSecondary}><X size={13} /></button>}
      </form>

      {error && (
        <div style={{ padding: '12px 16px', background: '#FFF5F5', border: '1px solid #FECACA', borderRadius: 10, color: '#DC2626', fontSize: 13, marginBottom: 14 }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ ...card, overflow: 'hidden' }}>
        {loading ? (
          <p style={{ padding: 24, textAlign: 'center', fontSize: 13, color: mailColors.muted }}>{t('mail.loading')}</p>
        ) : messages.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center' }}>
            <FileEdit size={28} color={mailColors.muted} style={{ marginBottom: 8 }} />
            <p style={{ fontSize: 13, color: mailColors.muted }}>{t('mail.no_messages')}</p>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.uid}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid #F5E6D3' }}
            >
              <a
                href={`/messagerie/nouveau?draft_uid=${m.uid}${selectedId ? `&accountId=${selectedId}` : ''}`}
                style={{ flex: 1, minWidth: 0, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
              >
                <span style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', background: '#FFF5F5', border: '1px solid #FECACA', borderRadius: 6, padding: '2px 8px', flexShrink: 0 }}>
                  {t('menu.messagerie_drafts')}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: mailColors.dark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {m.subject || t('mail.no_subject')}
                </span>
                {m.to && (
                  <span style={{ fontSize: 11.5, color: mailColors.caramel, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                    → {m.to}
                  </span>
                )}
              </a>
              <span style={{ fontSize: 11, color: mailColors.muted, flexShrink: 0 }}>{formatMailDate(m.date)}</span>
              <button
                onClick={() => setDeleteTarget(m)}
                style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #FECACA', background: '#FFF5F5', color: '#DC2626', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 14 }}>
          <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={{ ...btnSecondary, padding: '5px 10px', opacity: page <= 1 ? 0.4 : 1 }}>
            <ChevronLeft size={13} />
          </button>
          <span style={{ fontSize: 11, color: mailColors.caramel }}>{t('mail.page')} {page}/{totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} style={{ ...btnSecondary, padding: '5px 10px', opacity: page >= totalPages ? 0.4 : 1 }}>
            <ChevronRight size={13} />
          </button>
        </div>
      )}

      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,20,26,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ ...card, padding: 24, width: 360, maxWidth: '90vw' }}>
            <p style={{ margin: '0 0 18px', fontSize: 14, color: mailColors.dark, fontWeight: 600 }}>{t('mail.confirm_delete')}</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteTarget(null)} style={btnSecondary}>Annuler</button>
              <button onClick={handleDelete} disabled={deleting} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#EF4444,#DC2626)', color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: deleting ? 0.6 : 1 }}>
                {deleting ? '...' : t('mail.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
