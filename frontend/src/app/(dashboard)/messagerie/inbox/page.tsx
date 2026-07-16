'use client';

import MailFolderView from '@/components/mail/MailFolderView';
import { useLanguage } from '@/lib/i18n';

export default function InboxPage() {
  const { t } = useLanguage();
  return <MailFolderView kind="inbox" title={t('menu.messagerie_inbox')} icon="📥" />;
}
