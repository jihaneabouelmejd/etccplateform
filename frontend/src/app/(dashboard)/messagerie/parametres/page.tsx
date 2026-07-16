'use client';

import { useState, useEffect } from 'react';
import { Mail, CheckCircle2, XCircle, RefreshCw, ShieldCheck } from 'lucide-react';
import { mailApi } from '@/lib/api';
import { useLanguage } from '@/lib/i18n';
import { card, btnPrimary, mailColors } from '@/components/mail/mailUi';

function getUser() { try { return JSON.parse(localStorage.getItem('user') || '{}'); } catch { return {}; } }

export default function MailSettingsPage() {
  const { t } = useLanguage();
  const [account, setAccount] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string } | null>(null);
  const user = getUser();
  const isManager = user?.role === 'ADMIN' || user?.role === 'GERANT';

  const load = () => {
    setLoading(true);
    mailApi.myAccount()
      .then(({ data }) => setAccount(data))
      .catch(() => setAccount({ configured: false }))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleTest = async () => {
    if (!user?.id) return;
    setTesting(true); setTestResult(null);
    try {
      const { data } = await mailApi.adminTestAccount(user.id);
      setTestResult(data);
      load();
    } catch (e: any) {
      setTestResult({ success: false, message: e?.response?.data?.message || 'Erreur' });
    } finally { setTesting(false); }
  };

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[22px] font-bold text-honey-dark font-display tracking-tight">⚙️ {t('menu.messagerie_settings')}</h1>
        <p className="text-sm text-honey-caramel mt-0.5">{t('mail.account_status')}</p>
      </div>

      <div style={{ ...card, padding: 20, maxWidth: 560 }}>
        {loading ? (
          <p style={{ fontSize: 13, color: mailColors.muted }}>{t('mail.loading')}</p>
        ) : account?.configured ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#F4B315,#E59312)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Mail size={19} color="#1A141A" />
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: mailColors.dark }}>{account.email_address}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                  {account.is_active ? (
                    <>
                      <CheckCircle2 size={13} color="#16A34A" />
                      <span style={{ fontSize: 12, color: '#16A34A', fontWeight: 600 }}>{t('mail.account_active')}</span>
                    </>
                  ) : (
                    <>
                      <XCircle size={13} color="#DC2626" />
                      <span style={{ fontSize: 12, color: '#DC2626', fontWeight: 600 }}>{t('mail.account_inactive')}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18, fontSize: 12.5 }}>
              <div style={{ background: '#FFFDF5', border: '1px solid #F5E6D3', borderRadius: 8, padding: '10px 12px' }}>
                <p style={{ margin: '0 0 3px', color: mailColors.caramel, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{t('mail.imap_host')}</p>
                <p style={{ margin: 0, color: mailColors.dark, fontWeight: 600 }}>{account.imap_host}:{account.imap_port}</p>
              </div>
              <div style={{ background: '#FFFDF5', border: '1px solid #F5E6D3', borderRadius: 8, padding: '10px 12px' }}>
                <p style={{ margin: '0 0 3px', color: mailColors.caramel, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>{t('mail.smtp_host')}</p>
                <p style={{ margin: 0, color: mailColors.dark, fontWeight: 600 }}>{account.smtp_host}:{account.smtp_port}</p>
              </div>
            </div>

            {account.last_checked_at && (
              <p style={{ fontSize: 11.5, color: mailColors.muted, marginBottom: 14 }}>
                Dernière vérification : {new Date(account.last_checked_at).toLocaleString('fr-FR')}
              </p>
            )}
            {account.last_error && (
              <div style={{ padding: '10px 14px', background: '#FFF5F5', border: '1px solid #FECACA', borderRadius: 8, color: '#DC2626', fontSize: 12, marginBottom: 14 }}>
                ⚠️ {account.last_error}
              </div>
            )}

            {isManager && (
              <button onClick={handleTest} disabled={testing} style={{ ...btnPrimary, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: testing ? 0.7 : 1 }}>
                <RefreshCw size={13} /> {testing ? '...' : t('mail.test_connection')}
              </button>
            )}
            {testResult && (
              <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, background: testResult.success ? '#F0FFF4' : '#FFF5F5', border: `1px solid ${testResult.success ? '#BBF7D0' : '#FECACA'}`, color: testResult.success ? '#16A34A' : '#DC2626' }}>
                {testResult.success ? '✓ Connexion réussie' : `✗ ${testResult.message || 'Échec de connexion'}`}
              </div>
            )}

            <p style={{ marginTop: 18, fontSize: 11.5, color: mailColors.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={13} /> Vos identifiants sont chiffrés et gérés par votre administrateur.
            </p>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px 10px' }}>
            <Mail size={30} color={mailColors.muted} style={{ marginBottom: 10 }} />
            <p style={{ fontSize: 13, color: mailColors.muted, marginBottom: 4 }}>{t('mail.no_account_set')}</p>
            <p style={{ fontSize: 12, color: mailColors.muted }}>Contactez votre administrateur pour associer votre boîte mail professionnelle.</p>
          </div>
        )}
      </div>
    </div>
  );
}
