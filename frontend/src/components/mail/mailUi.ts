// Tokens de style partagés pour les pages Messagerie — alignés sur la charte ETCC
// (mêmes couleurs / rayons que les autres modules : #1A141A, #8E5915, #F4B315...)
import type { CSSProperties } from 'react';

export const mailColors = {
  dark: '#1A141A',
  caramel: '#8E5915',
  brown: '#5C3A1E',
  muted: '#B8A090',
  border: '#F5E6D3',
  borderStrong: '#E8D4B0',
  bg: '#FBF6EE',
  card: '#FFFFFF',
  gold: '#F4B315',
  goldDark: '#E59312',
  danger: '#DC2626',
};

export const card: CSSProperties = {
  background: 'white',
  borderRadius: 12,
  border: '1px solid #F5E6D3',
};

export const inputStyle: CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 8,
  border: '1.5px solid #E8D4B0',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};

export const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: '#8E5915',
  textTransform: 'uppercase',
  letterSpacing: 0.5,
  marginBottom: 6,
};

export const btnSecondary: CSSProperties = {
  padding: '9px 18px',
  borderRadius: 8,
  border: '1.5px solid #E8D4B0',
  background: 'white',
  color: '#8E5915',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
};

export const btnPrimary: CSSProperties = {
  padding: '9px 20px',
  borderRadius: 8,
  border: 'none',
  background: 'linear-gradient(135deg,#F4B315,#E59312)',
  color: '#1A141A',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
};

export const btnDanger: CSSProperties = {
  padding: '9px 20px',
  borderRadius: 8,
  border: 'none',
  background: 'linear-gradient(135deg,#EF4444,#DC2626)',
  color: 'white',
  fontSize: 13,
  fontWeight: 700,
  cursor: 'pointer',
};

export function formatMailDate(d?: string | null): string {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: sameYear ? undefined : 'numeric' });
}

export function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function extractName(addr?: string): string {
  if (!addr) return '';
  const m = addr.match(/^([^<]+)</);
  if (m) return m[1].trim().replace(/^"|"$/g, '');
  return addr.split('<')[0].trim() || addr;
}
