'use client';

import MailFolderView from '@/components/mail/MailFolderView';
import { useLanguage } from '@/lib/i18n';

export default function SentPage() {
  const { t } = useLanguage();
  return <MailFolderView kind="sent" title={t('menu.messagerie_sent')} icon="📤" />;
}
