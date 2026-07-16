'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, Trash2, Reply, ReplyAll, Forward, Paperclip, ChevronLeft, ChevronRight, Download, X, RefreshCw, Inbox as InboxIcon } from 'lucide-react';
import { mailApi } from '@/lib/api';
import { useLanguage } from '@/lib/i18n';
import { card, btnSecondary, btnPrimary, inputStyle, mailColors, formatMailDate, formatBytes, extractName } from './mailUi';

interface MailFolderViewProps {
  kind: 'inbox' | 'sent' | 'trash';
  title: string;
  icon: string;
}

export default function MailFolderView({ kind, title, icon }: MailFolderViewProps) {
  const { t } = useLanguage();
  const [messages, setMessages] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 25;
  const [q, setQ] = useState('');
  const [qInput, setQInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedUid, setSelectedUid] = useState<number | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true); setError('');
    mailApi.listFolder(kind, { page, limit, q: q || undefined })
      .then(({ data }) => { setMessages(data.messages || []); setTotal(data.total || 0); })
      .catch((e) => setError(e?.response?.data?.message || "Erreur de connexion à la boîte mail"))
      .finally(() => setLoading(false));
  }, [kind, page, q]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); setQ(''); setQInput(''); setSelectedUid(null); setDetail(null); }, [kind]);

  const openMessage = (uid: number) => {
    setSelectedUid(uid); setLoadingDetail(true); setDetail(null);
    mailApi.getMessage(kind, uid)
      .then(({ data }) => {
        setDetail(data);
        setMessages(prev => prev.map(m => (m.uid === uid ? { ...m, seen: true } : m)));
      })
      .catch((e) => setError(e?.response?.data?.message || 'Erreur'))
      .finally(() => setLoadingDetail(false));
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await mailApi.deleteMessage(kind, deleteTarget.uid);
      setMessages(prev => prev.filter(m => m.uid !== deleteTarget.uid));
      setTotal(n => Math.max(0, n - 1));
      if (selectedUid === deleteTarget.uid) { setSelectedUid(null); setDetail(null); }
      setDeleteTarget(null);
    } catch (e: any) { alert(e?.response?.data?.message || 'Erreur'); }
    finally { setDeleting(false); }
  };

  const downloadAttachment = async (uid: number, index: number, filename: string) => {
    try {
      const res = await mailApi.downloadAttachment(kind, uid, index);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = filename; document.body.appendChild(a); a.click();
      a.remove(); URL.revokeObjectURL(url);
    } catch { alert('Erreur de téléchargement'); }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const composeUrl = (mode: 'reply' | 'reply_all' | 'forward', uid: number) =>
    `/messagerie/nouveau?mode=${mode}&uid=${uid}&folder=${kind}`;

  return (
    <div>
      <div className="flex justify-between items-start mb-4">
        <div>
          <h1 className="text-[22px] font-bold text-honey-dark font-display tracking-tight">{icon} {title}</h1>
          <p className="text-sm text-honey-caramel mt-0.5">{total} message{total > 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} style={btnSecondary} title="Actualiser">
            <RefreshCw size={13} />
          </button>
          <a href="/messagerie/nouveau" style={{ ...btnPrimary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            ✍️ {t('mail.new_message_short')}
          </a>
        </div>
      </div>

      {/* Recherche */}
      <form
        onSubmit={(e) => { e.preventDefault(); setPage(1); setQ(qInput); }}
        style={{ display: 'flex', gap: 8, marginBottom: 14 }}
      >
        <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
          <Search size={14} color={mailColors.muted} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder={t('mail.search')}
            style={{ ...inputStyle, paddingLeft: 34 }}
          />
        </div>
        <button type="submit" style={btnSecondary}>OK</button>
        {q && (
          <button type="button" onClick={() => { setQ(''); setQInput(''); setPage(1); }} style={btnSecondary}>
            <X size={13} />
          </button>
        )}
      </form>

      {error && (
        <div style={{ padding: '12px 16px', background: '#FFF5F5', border: '1px solid #FECACA', borderRadius: 10, color: '#DC2626', fontSize: 13, marginBottom: 14 }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 14, alignItems: 'stretch', minHeight: 480 }}>
        {/* ── Liste ── */}
        <div style={{ ...card, flex: selectedUid ? '0 0 360px' : 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: 560 }}>
            {loading ? (
              <p style={{ padding: 24, textAlign: 'center', fontSize: 13, color: mailColors.muted }}>{t('mail.loading')}</p>
            ) : messages.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                <InboxIcon size={28} color={mailColors.muted} style={{ marginBottom: 8 }} />
                <p style={{ fontSize: 13, color: mailColors.muted }}>{t('mail.no_messages')}</p>
              </div>
            ) : (
              messages.map((m) => {
                const isActive = selectedUid === m.uid;
                const other = kind === 'sent' ? m.to : m.from;
                return (
                  <div
                    key={m.uid}
                    onClick={() => openMessage(m.uid)}
                    style={{
                      padding: '11px 14px', cursor: 'pointer',
                      borderBottom: '1px solid #F5E6D3',
                      background: isActive ? 'rgba(235,184,0,0.12)' : m.seen ? 'white' : '#FFFDF5',
                      borderLeft: isActive ? '3px solid #F4B315' : '3px solid transparent',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 12.5, fontWeight: m.seen ? 500 : 800, color: mailColors.dark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {extractName(other) || '—'}
                      </span>
                      <span style={{ fontSize: 10.5, color: mailColors.muted, flexShrink: 0 }}>{formatMailDate(m.date)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      {!m.seen && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F4B315', flexShrink: 0 }} />}
                      <span style={{ fontSize: 12.5, fontWeight: m.seen ? 400 : 700, color: m.seen ? mailColors.brown : mailColors.dark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {m.subject}
                      </span>
                      {m.hasAttachments && <Paperclip size={11} color={mailColors.muted} style={{ flexShrink: 0 }} />}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderTop: '1px solid #F5E6D3' }}>
              <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={{ ...btnSecondary, padding: '5px 10px', opacity: page <= 1 ? 0.4 : 1 }}>
                <ChevronLeft size={13} />
              </button>
              <span style={{ fontSize: 11, color: mailColors.caramel }}>{t('mail.page')} {page}/{totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} style={{ ...btnSecondary, padding: '5px 10px', opacity: page >= totalPages ? 0.4 : 1 }}>
                <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>

        {/* ── Lecteur ── */}
        {selectedUid && (
          <div style={{ ...card, flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {loadingDetail ? (
              <p style={{ padding: 24, textAlign: 'center', fontSize: 13, color: mailColors.muted }}>{t('mail.loading')}</p>
            ) : detail ? (
              <>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #F5E6D3' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: mailColors.dark }}>{detail.subject || t('mail.no_subject')}</h2>
                    <button onClick={() => { setSelectedUid(null); setDetail(null); }} style={{ ...btnSecondary, padding: '5px 9px', flexShrink: 0 }}>
                      <X size={13} />
                    </button>
                  </div>
                  <div style={{ marginTop: 10, fontSize: 12, color: mailColors.brown, lineHeight: 1.7 }}>
                    <div><strong style={{ color: mailColors.caramel }}>{t('mail.from')} :</strong> {detail.from}</div>
                    {detail.to && <div><strong style={{ color: mailColors.caramel }}>{t('mail.to')} :</strong> {detail.to}</div>}
                    {detail.cc && <div><strong style={{ color: mailColors.caramel }}>{t('mail.cc')} :</strong> {detail.cc}</div>}
                    <div style={{ fontSize: 11, color: mailColors.muted, marginTop: 2 }}>{detail.date ? new Date(detail.date).toLocaleString('fr-FR') : ''}</div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    <a href={composeUrl('reply', detail.uid)} style={{ ...btnSecondary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px' }}>
                      <Reply size={12} /> {t('mail.reply')}
                    </a>
                    <a href={composeUrl('reply_all', detail.uid)} style={{ ...btnSecondary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px' }}>
                      <ReplyAll size={12} /> {t('mail.reply_all')}
                    </a>
                    <a href={composeUrl('forward', detail.uid)} style={{ ...btnSecondary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px' }}>
                      <Forward size={12} /> {t('mail.forward')}
                    </a>
                    <button
                      onClick={() => setDeleteTarget(messages.find(m => m.uid === selectedUid) || { uid: selectedUid })}
                      style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid #FECACA', background: '#FFF5F5', color: '#DC2626', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <Trash2 size={12} /> {t('mail.delete')}
                    </button>
                  </div>
                </div>

                {detail.attachments?.length > 0 && (
                  <div style={{ padding: '10px 20px', borderBottom: '1px solid #F5E6D3', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {detail.attachments.map((a: any) => (
                      <button
                        key={a.index}
                        onClick={() => downloadAttachment(detail.uid, a.index, a.filename)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, border: '1px solid #E8D4B0', background: '#FFFDF5', fontSize: 11.5, color: mailColors.brown, cursor: 'pointer' }}
                      >
                        <Paperclip size={11} /> {a.filename} <span style={{ color: mailColors.muted }}>({formatBytes(a.size)})</span>
                        <Download size={11} color={mailColors.caramel} />
                      </button>
                    ))}
                  </div>
                )}

                <div style={{ flex: 1, overflow: 'auto', padding: 0 }}>
                  {detail.html ? (
                    <iframe
                      title="mail-body"
                      sandbox=""
                      srcDoc={detail.html}
                      style={{ width: '100%', height: '100%', minHeight: 380, border: 'none' }}
                    />
                  ) : (
                    <pre style={{ padding: '16px 20px', margin: 0, fontSize: 13, color: mailColors.dark, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                      {detail.text || t('mail.no_messages')}
                    </pre>
                  )}
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* Modal suppression */}
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
