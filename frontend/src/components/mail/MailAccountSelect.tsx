'use client';

import { Mail } from 'lucide-react';
import { mailColors } from './mailUi';
import type { MailAccountOption } from './useMailAccounts';

interface MailAccountSelectProps {
  accounts: MailAccountOption[];
  value: string;
  onChange: (id: string) => void;
}

// N'affiche rien si l'utilisateur n'a qu'une seule boîte (cas le plus courant) —
// le sélecteur n'apparaît que pour les comptes ayant accès à une boîte partagée.
export default function MailAccountSelect({ accounts, value, onChange }: MailAccountSelectProps) {
  if (accounts.length <= 1) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <Mail size={13} color={mailColors.caramel} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: '8px 10px',
          borderRadius: 8,
          border: '1.5px solid #E8D4B0',
          fontSize: 12.5,
          fontWeight: 700,
          color: mailColors.brown,
          background: 'white',
          outline: 'none',
          cursor: 'pointer',
        }}
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.email_address}{a.is_primary ? '' : ' (partagée)'}
          </option>
        ))}
      </select>
    </div>
  );
}
