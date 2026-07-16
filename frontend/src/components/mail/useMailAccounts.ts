'use client';

import { useState, useEffect, useCallback } from 'react';
import { mailApi } from '@/lib/api';

export interface MailAccountOption {
  id: string;
  email_address: string;
  is_primary: boolean;
}

const STORAGE_KEY = 'etcc_mail_selected_account';

// Liste des boîtes mail accessibles à l'utilisateur courant (principale + partagées),
// avec mémorisation du dernier choix (localStorage) pour rester cohérent entre les pages.
export function useMailAccounts() {
  const [accounts, setAccounts] = useState<MailAccountOption[]>([]);
  const [selectedId, setSelectedIdState] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    mailApi.myAccounts()
      .then(({ data }) => {
        if (cancelled) return;
        const list: MailAccountOption[] = Array.isArray(data) ? data : [];
        setAccounts(list);
        const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
        const valid = stored && list.some((a) => a.id === stored);
        const primary = list.find((a) => a.is_primary);
        setSelectedIdState(valid ? (stored as string) : primary?.id || list[0]?.id || '');
      })
      .catch(() => { if (!cancelled) setAccounts([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const setSelectedId = useCallback((id: string) => {
    setSelectedIdState(id);
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, id);
  }, []);

  return { accounts, selectedId, setSelectedId, loading };
}
