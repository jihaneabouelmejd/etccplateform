'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Search, Bell, Settings, LogOut, ChevronDown } from 'lucide-react';

export default function TopBar() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [lang, setLang] = useState<'FR' | 'AR'>('FR');
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  const initials = user
    ? `${user.first_name[0]}${user.last_name[0]}`.toUpperCase()
    : '??';

  const roleLabels = {
    ADMIN: '👑 Admin',
    GERANT: '⭐ Gérant',
    COMPTABLE: '📊 Comptable',
    EMPLOYE: '👷 Employé',
  };

  return (
    <header className="h-[56px] bg-white border-b border-honey-beige-soft flex items-center gap-4 px-5 shadow-honey-sm">
      {/* Logo */}
      <div className="flex items-center gap-2.5 mr-4">
        <div className="w-[34px] h-[34px] rounded-lg bg-honey-gradient flex items-center justify-center shadow-sm">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1A141A" strokeWidth="2.5">
            <path d="M12 2L2 7v10l10 5 10-5V7l-10-5z" />
            <path d="M2 7l10 5 10-5M12 22V12" />
          </svg>
        </div>
        <span className="text-base font-bold text-honey-dark font-display">
          ETCC<span className="text-honey-orange">.</span>
        </span>
      </div>

      {/* Search */}
      <div className="flex-1 max-w-md relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-honey-caramel"
        />
        <input
          type="text"
          placeholder="Rechercher un chantier, client, facture..."
          className="w-full pl-9 pr-4 py-2 bg-honey-cream border border-honey-beige-soft rounded-lg text-sm text-honey-dark placeholder:text-honey-beige focus:outline-none focus:border-honey-gold focus:ring-2 focus:ring-honey-gold/20"
        />
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-3 ml-auto">
        {/* Language */}
        <div className="inline-flex bg-honey-cream rounded-lg p-0.5 border border-honey-beige-soft">
          <button
            onClick={() => setLang('FR')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
              lang === 'FR' ? 'bg-honey-gold text-honey-dark' : 'text-honey-caramel'
            }`}
          >
            FR
          </button>
          <button
            onClick={() => setLang('AR')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
              lang === 'AR' ? 'bg-honey-gold text-honey-dark' : 'text-honey-caramel'
            }`}
          >
            AR
          </button>
        </div>

        {/* Notifications */}
        <button className="relative w-[34px] h-[34px] rounded-lg bg-honey-cream border border-honey-beige-soft flex items-center justify-center text-honey-caramel hover:bg-amber-50 hover:text-honey-dark hover:border-honey-gold transition-all">
          <Bell size={16} />
          <span className="absolute -top-1 -right-1 bg-honey-orange text-white text-[9px] font-bold min-w-[16px] h-[16px] rounded-full flex items-center justify-center px-1">
            5
          </span>
        </button>

        {/* Settings */}
        <button
          onClick={() => router.push('/parametres')}
          className="w-[34px] h-[34px] rounded-lg bg-honey-cream border border-honey-beige-soft flex items-center justify-center text-honey-caramel hover:bg-amber-50 hover:text-honey-dark hover:border-honey-gold transition-all"
        >
          <Settings size={16} />
        </button>

        {/* User */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 pl-1 pr-3 py-1 bg-honey-cream rounded-full border border-honey-beige-soft hover:border-honey-gold transition-all"
          >
            <div className="w-7 h-7 rounded-full bg-honey-gradient flex items-center justify-center text-[11px] font-bold text-honey-dark">
              {initials}
            </div>
            <span className="text-xs font-medium text-honey-dark">{user?.first_name}</span>
            <ChevronDown size={12} className="text-honey-caramel" />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg border border-honey-beige-soft shadow-honey-lg py-2 z-50">
              <div className="px-3 py-2 border-b border-honey-beige-soft">
                <p className="text-sm font-medium text-honey-dark">
                  {user?.first_name} {user?.last_name}
                </p>
                <p className="text-xs text-honey-caramel">
                  {roleLabels[user?.role || 'EMPLOYE']}
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut size={14} />
                Déconnexion
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
