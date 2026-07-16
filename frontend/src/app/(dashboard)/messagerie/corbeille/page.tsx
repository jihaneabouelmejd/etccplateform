'use client';

import MailFolderView from '@/components/mail/MailFolderView';
import { useLanguage } from '@/lib/i18n';

export default function MailTrashPage() {
  const { t } = useLanguage();
  return <MailFolderView kind="trash" title={t('menu.messagerie_trash')} icon="🗑️" />;
}
