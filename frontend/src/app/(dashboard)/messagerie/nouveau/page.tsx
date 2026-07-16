'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Paperclip, X, Send, Save, Loader2 } from 'lucide-react';
import { mailApi } from '@/lib/api';
import { useLanguage } from '@/lib/i18n';
import { card, btnSecondary, btnPrimary, inputStyle, labelStyle, mailColors, formatBytes } from '@/components/mail/mailUi';
import { useMailAccounts } from '@/components/mail/useMailAccounts';
import MailAccountSelect from '@/components/mail/MailAccountSelect';

type Mode = 'new' | 'reply' | 'reply_all' | 'forward';

function ComposeInner() {
  const { t } = useLanguage();
  const router = useRouter();
  const params = useSearchParams();

  const mode = (params.get('mode') as Mode) || 'new';
  const sourceUid = params.get('uid') ? parseInt(params.get('uid') as string, 10) : undefined;
  const sourceFolder = params.get('folder') || undefined;
  const draftUid = params.get('draft_uid') ? parseInt(params.get('draft_uid') as string, 10) : undefined;
  const accountIdParam = params.get('accountId') || undefined;

  const { accounts, selectedId, setSelectedId, loading: loadingAccounts } = useMailAccounts();
  useEffect(() => {
    if (accountIdParam) setSelectedId(accountIdParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountIdParam]);

  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [loadingSource, setLoadingSource] = useState(false);
  const [sending, setSending] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Pré-remplissage : brouillon existant
  useEffect(() => {
    if (!draftUid) return;
    setLoadingSource(true);
    mailApi.getMessage('drafts', draftUid, accountIdParam)
      .then(({ data }) => {
        setTo(data.to || ''); setCc(data.cc || ''); setSubject(data.subject === '(sans objet)' ? '' : data.subject || '');
        setText(data.text || '');
        if (data.cc) setShowCcBcc(true);
      })
      .catch(() => setError('Impossible de charger le brouillon'))
      .finally(() => setLoadingSource(false));
  }, [draftUid]);

  // Pré-remplissage : répondre / transférer
  useEffect(() => {
    if (!sourceUid || !sourceFolder || mode === 'new' || draftUid) return;
    setLoadingSource(true);
    mailApi.getMessage(sourceFolder, sourceUid, accountIdParam)
      .then(({ data }) => {
        const quoteHeader = `\n\n---------- Message original ----------\nDe : ${data.from}\nDate : ${data.date ? new Date(data.date).toLocaleString('fr-FR') : ''}\nObjet : ${data.subject}\n\n${data.text || ''}`;
        if (mode === 'reply') {
          setTo(data.from || '');
          setSubject(data.subject?.toLowerCase().startsWith('re:') ? data.subject : `Re: ${data.subject || ''}`);
          setText(quoteHeader);
        } else if (mode === 'reply_all') {
          setTo(data.from || '');
          setCc(data.cc || ''); setShowCcBcc(!!data.cc);
          setSubject(data.subject?.toLowerCase().startsWith('re:') ? data.subject : `Re: ${data.subject || ''}`);
          setText(quoteHeader);
        } else if (mode === 'forward') {
          setSubject(data.subject?.toLowerCase().startsWith('fwd:') ? data.subject : `Fwd: ${data.subject || ''}`);
          setText(quoteHeader);
        }
      })
      .catch(() => setError('Impossible de charger le message d\'origine'))
      .finally(() => setLoadingSource(false));
  }, [sourceUid, sourceFolder, mode, draftUid]);

  const handleAddFiles = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files);
    setAttachments(prev => [...prev, ...arr].slice(0, 10));
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeAttachment = (idx: number) => setAttachments(prev => prev.filter((_, i) => i !== idx));

  const buildFormData = () => {
    const fd = new FormData();
    if (selectedId) fd.append('account_id', selectedId);
    if (to) fd.append('to', to);
    if (cc) fd.append('cc', cc);
    if (bcc) fd.append('bcc', bcc);
    fd.append('subject', subject || '');
    fd.append('text', text || '');
    if (mode !== 'new' && sourceUid && sourceFolder) {
      fd.append('mode', mode);
      fd.append('source_uid', String(sourceUid));
      fd.append('source_folder', sourceFolder);
    }
    attachments.forEach(f => fd.append('attachments', f));
    return fd;
  };

  const handleSend = async () => {
    setError(''); setSuccess('');
    if (!to.trim()) { setError('Veuillez indiquer au moins un destinataire'); return; }
    setSending(true);
    try {
      const fd = buildFormData();
      await mailApi.send(fd);
      // Si c'était un brouillon envoyé, le supprimer
      if (draftUid) {
        try { await mailApi.deleteMessage('drafts', draftUid, selectedId || undefined); } catch { /* noop */ }
      }
      setSuccess('Message envoyé avec succès');
      setTimeout(() => router.push('/messagerie/envoyes'), 800);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Échec de l'envoi du message");
    } finally { setSending(false); }
  };

  const handleSaveDraft = async () => {
    setError(''); setSuccess('');
    setSavingDraft(true);
    try {
      const fd = buildFormData();
      if (draftUid) fd.append('draft_uid', String(draftUid));
      await mailApi.saveDraft(fd);
      setSuccess('Brouillon enregistré');
      setTimeout(() => router.push('/messagerie/brouillons'), 700);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Échec de l'enregistrement du brouillon");
    } finally { setSavingDraft(false); }
  };

  const modeLabel = mode === 'reply' ? t('mail.reply') : mode === 'reply_all' ? t('mail.reply_all') : mode === 'forward' ? t('mail.forward') : t('menu.messagerie_new');

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[22px] font-bold text-honey-dark font-display tracking-tight">✍️ {draftUid ? t('menu.messagerie_drafts') : modeLabel}</h1>
        <p className="text-sm text-honey-caramel mt-0.5">{t('menu.messagerie_new')}</p>
      </div>

      {error && (
        <div style={{ padding: '12px 16px', background: '#FFF5F5', border: '1px solid #FECACA', borderRadius: 10, color: '#DC2626', fontSize: 13, marginBottom: 14 }}>
          ⚠️ {error}
        </div>
      )}
      {success && (
        <div style={{ padding: '12px 16px', background: '#F0FFF4', border: '1px solid #BBF7D0', borderRadius: 10, color: '#16A34A', fontSize: 13, marginBottom: 14 }}>
          ✓ {success}
        </div>
      )}

      <div style={{ ...card, padding: 20, maxWidth: 760 }}>
        {loadingSource ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 20, color: mailColors.muted, fontSize: 13 }}>
            <Loader2 size={14} className="animate-spin" /> {t('mail.loading')}
          </div>
        ) : (
          <>
            {accounts.length > 1 && (
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>De</label>
                <MailAccountSelect accounts={accounts} value={selectedId} onChange={setSelectedId} />
              </div>
            )}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>{t('mail.to')}</label>
              <input value={to} onChange={e => setTo(e.target.value)} placeholder="destinataire@exemple.com, autre@exemple.com" style={inputStyle} />
            </div>

            {!showCcBcc ? (
              <button type="button" onClick={() => setShowCcBcc(true)} style={{ background: 'none', border: 'none', color: mailColors.caramel, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', marginBottom: 14, padding: 0 }}>
                + Cc / Cci
              </button>
            ) : (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>{t('mail.cc')}</label>
                  <input value={cc} onChange={e => setCc(e.target.value)} style={inputStyle} />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>{t('mail.bcc')}</label>
                  <input value={bcc} onChange={e => setBcc(e.target.value)} style={inputStyle} />
                </div>
              </>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>{t('mail.subject')}</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder={t('mail.no_subject')} style={inputStyle} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>{t('mail.body')}</label>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={t('mail.write_message')}
                rows={12}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>{t('mail.attachments')}</label>
              <input ref={fileRef} type="file" multiple onChange={e => handleAddFiles(e.target.files)} style={{ display: 'none' }} id="mail-file-input" />
              <label htmlFor="mail-file-input" style={{ ...btnSecondary, display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                <Paperclip size={12} /> {t('mail.add_attachment')}
              </label>
              {attachments.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                  {attachments.map((f, i) => (
                    <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, border: '1px solid #E8D4B0', background: '#FFFDF5', fontSize: 11.5, color: mailColors.brown }}>
                      {f.name} <span style={{ color: mailColors.muted }}>({formatBytes(f.size)})</span>
                      <button type="button" onClick={() => removeAttachment(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', display: 'flex' }}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, borderTop: '1px solid #F5E6D3', paddingTop: 16 }}>
              <button type="button" onClick={handleSend} disabled={sending || savingDraft} style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: sending ? 0.7 : 1 }}>
                <Send size={13} /> {sending ? '...' : t('mail.send')}
              </button>
              <button type="button" onClick={handleSaveDraft} disabled={sending || savingDraft} style={{ ...btnSecondary, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: savingDraft ? 0.7 : 1 }}>
                <Save size={13} /> {savingDraft ? '...' : t('mail.save_draft')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ComposePage() {
  return (
    <Suspense fallback={<p style={{ padding: 24, fontSize: 13, color: mailColors.muted }}>...</p>}>
      <ComposeInner />
    </Suspense>
  );
}
