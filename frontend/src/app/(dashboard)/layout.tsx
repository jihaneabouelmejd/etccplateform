'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { LanguageProvider, useLanguage } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';

const menuItems = [
  { href: '/dashboard',            key: 'menu.dashboard',      emoji: '📊', roles: ['ADMIN', 'GERANT', 'COMPTABLE', 'EMPLOYE'] },
  { href: '/chantiers',            key: 'menu.chantiers',      emoji: '🏗️', roles: ['ADMIN', 'GERANT'] },
  { href: '/taches',               key: 'menu.taches',         emoji: '✅', roles: ['ADMIN', 'GERANT', 'EMPLOYE'] },
  { href: '/mon-bl',               key: 'menu.mon_bl',         emoji: '📤', roles: ['EMPLOYE'] },
  { href: '/mes-factures',         key: 'menu.mes_factures',   emoji: '🧾', roles: ['EMPLOYE'] },
  { href: '/clients',              key: 'menu.clients',        emoji: '👥', roles: ['ADMIN', 'GERANT'] },
  { href: '/fournisseurs',         key: 'menu.fournisseurs',   emoji: '🏭', roles: ['ADMIN', 'GERANT'] },
  { href: '/employes',             key: 'menu.employes',       emoji: '👷', roles: ['ADMIN', 'GERANT'] },
  { href: '/devis',                key: 'menu.devis',          emoji: '📄', roles: ['ADMIN', 'GERANT'] },
  { href: '/bc',                   key: 'menu.bc',             emoji: '📋', roles: ['ADMIN', 'GERANT'] },
  { href: '/bl',                   key: 'menu.bl',             emoji: '🚚', roles: ['ADMIN', 'GERANT'] },
  { href: '/factures',             key: 'menu.factures',       emoji: '🧾', roles: ['ADMIN', 'GERANT', 'COMPTABLE'] },
  { href: '/merge',                key: 'menu.merge',          emoji: '🔗', roles: ['ADMIN', 'GERANT'] },
  { href: '/stock',                key: 'menu.stock',          emoji: '📦', roles: ['ADMIN', 'GERANT'] },
  { href: '/depenses',             key: 'menu.depenses',       emoji: '💰', roles: ['ADMIN', 'GERANT', 'EMPLOYE'] },
  { href: '/benefices',            key: 'menu.benefices',      emoji: '📈', roles: ['ADMIN', 'GERANT', 'COMPTABLE'] },
  { href: '/comptabilite',         key: 'menu.comptabilite',   emoji: '📒', roles: ['ADMIN', 'GERANT', 'COMPTABLE'] },
  { href: '/comptabilite-interne', key: 'menu.compta_interne', emoji: '📊', roles: ['ADMIN', 'GERANT'] },
  { href: '/rapprochement',        key: 'menu.rapprochement',  emoji: '🏦', roles: ['ADMIN', 'GERANT', 'COMPTABLE'] },
  { href: '/alertes',              key: 'menu.alertes',        emoji: '⚠️', roles: ['ADMIN', 'GERANT'] },
  { href: '/agenda',               key: 'menu.agenda',         emoji: '📅', roles: ['ADMIN', 'GERANT', 'EMPLOYE'] },
  { href: '/corbeille',            key: 'menu.corbeille',      emoji: '🗑️', roles: ['ADMIN', 'GERANT'] },
  { href: '/parametres',           key: 'menu.parametres',     emoji: '⚙️', roles: ['ADMIN', 'GERANT'] },
];

/* ── Inner layout (accède au contexte de langue) ── */
function DashboardInner({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [user, setUser] = useState<any>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const { lang, setLang, t, dir } = useLanguage();
  const { fetchMe, setUser: setZustandUser } = useAuth();

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      window.location.href = '/login';
      return;
    }
    // Afficher immédiatement depuis localStorage
    const u = localStorage.getItem('user');
    if (u) {
      const parsed = JSON.parse(u);
      setUser(parsed);
      setZustandUser(parsed); // ← Peupler Zustand immédiatement (canDel réactif)
    }
    setIsReady(true);
    // Rafraîchir depuis le backend en arrière-plan
    fetchMe().then(() => {
      const u2 = localStorage.getItem('user');
      if (u2) setUser(JSON.parse(u2));
    }).catch(() => {
      // Ne pas rediriger si fetchMe échoue — l'utilisateur est déjà affiché
    });
  }, []);

  // Fermer sidebar au changement de page (navigation mobile)
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  // Bloquer le scroll quand sidebar ouverte sur mobile
  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [sidebarOpen]);

  if (!isReady) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FBF6EE' }}>
      <p style={{ color: '#A33C00', fontSize: 14 }}>{t('loading')}</p>
    </div>
  );

  const isRTL = dir === 'rtl';

  // Label de la page courante pour la topbar mobile
  const currentPage = menuItems.find(item =>
    pathname === item.href || pathname.startsWith(item.href + '/')
  );

  return (
    <div dir={dir} style={{
      display: 'flex', minHeight: '100vh', background: '#FBF6EE',
      fontFamily: isRTL ? "'Segoe UI', Tahoma, Arial, sans-serif" : undefined,
      flexDirection: 'column',
    }}>

      {/* ── TOPBAR MOBILE (hamburger + titre) ── */}
      <div
        className="etcc-topbar"
        style={{
          flexDirection: isRTL ? 'row-reverse' : 'row',
          width: '100%',
        }}
      >
        <button
          className="etcc-hamburger"
          onClick={() => setSidebarOpen(true)}
          aria-label="Ouvrir le menu"
          style={{ display: 'flex' }}
        >
          <Menu size={20} color="#755C00" />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          {currentPage && <span style={{ fontSize: 18 }}>{currentPage.emoji}</span>}
          <span style={{ fontSize: 15, fontWeight: 700, color: '#1A141A' }}>
            {currentPage ? t(currentPage.key) : 'ETCC'}
          </span>
        </div>
        <span style={{ fontSize: 15, fontWeight: 800, color: '#1A141A', flexShrink: 0 }}>
          ETCC<span style={{ color: '#755C00' }}>.</span>
        </span>
      </div>

      <div style={{ display: 'flex', flex: 1, position: 'relative' }}>

        {/* ── OVERLAY MOBILE ── */}
        {sidebarOpen && (
          <div
            className="etcc-overlay"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ── SIDEBAR ── */}
        <div
          className={`etcc-sidebar${sidebarOpen ? ' open' : ''}`}
          style={{
            width: 220, background: 'white',
            borderRight: isRTL ? 'none' : '1px solid #EDDEC1',
            borderLeft:  isRTL ? '1px solid #EDDEC1' : 'none',
            position: 'fixed', height: '100vh', overflowY: 'auto',
            display: 'flex', flexDirection: 'column', zIndex: 1000,
            right: isRTL ? 0 : 'auto', left: isRTL ? 'auto' : 0,
            top: 0,
          }}
        >
          {/* Logo + bouton fermer mobile */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #EDDEC1', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#EBB800,#755C00)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🏗️</div>
              <span style={{ fontSize: 17, fontWeight: 800, color: '#1A141A' }}>ETCC<span style={{ color: '#755C00' }}>.</span></span>
            </div>
            {/* Bouton fermer — visible uniquement sur mobile via CSS */}
            <button
              className="etcc-hamburger"
              onClick={() => setSidebarOpen(false)}
              aria-label="Fermer le menu"
              style={{ display: 'flex', width: 32, height: 32 }}
            >
              <X size={16} color="#755C00" />
            </button>
          </div>

          {/* Langue toggle FR | AR */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #EDDEC1' }}>
            <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1.5px solid #EDDEC1', background: '#FBF6EE' }}>
              {(['fr', 'ar'] as const).map((l, i) => (
                <button key={l} onClick={() => setLang(l)} style={{
                  flex: 1, padding: '6px 0', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer',
                  background: lang === l ? 'linear-gradient(135deg,#EBB800,#755C00)' : 'transparent',
                  color: lang === l ? '#1A141A' : '#8E5915',
                  borderLeft: i > 0 ? '1px solid #EDDEC1' : 'none',
                }}>
                  {l === 'fr' ? 'FR' : 'AR عربي'}
                </button>
              ))}
            </div>
          </div>

          {/* Menu */}
          <nav style={{ padding: '8px', flex: 1 }}>
            {menuItems
              .filter(item => !user?.role || item.roles.includes((user.role || '').toUpperCase()))
              .map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <a key={item.href} href={item.href} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 8, marginBottom: 2,
                    textDecoration: 'none', fontSize: 13, fontWeight: 500,
                    background: isActive ? 'rgba(235,184,0,0.15)' : 'transparent',
                    color: isActive ? '#1A141A' : '#5C3A1E',
                    border: isActive ? '1px solid rgba(235,184,0,0.4)' : '1px solid transparent',
                    cursor: 'pointer',
                    flexDirection: isRTL ? 'row-reverse' : 'row',
                  }}>
                    <span style={{ fontSize: 16 }}>{item.emoji}</span>
                    <span>{t(item.key)}</span>
                  </a>
                );
              })}
          </nav>

          {/* User + logout */}
          <div style={{ padding: '12px', borderTop: '1px solid #EDDEC1' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexDirection: isRTL ? 'row-reverse' : 'row' }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#EBB800,#755C00)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#1A141A', flexShrink: 0 }}>
                {user?.first_name?.[0]}{user?.last_name?.[0]}
              </div>
              <div style={{ textAlign: isRTL ? 'right' : 'left', minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#1A141A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.first_name} {user?.last_name}</p>
                <p style={{ margin: 0, fontSize: 10, color: '#A33C00' }}>{user?.role}</p>
              </div>
            </div>
            <button
              onClick={() => { localStorage.clear(); window.location.href = '/login'; }}
              style={{ width: '100%', padding: '8px', borderRadius: 8, border: '1px solid #FFCDD2', background: '#FFF0F0', color: '#D32F2F', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
              🚪 {t('logout')}
            </button>
          </div>
        </div>

        {/* ── CONTENT ── */}
        <div
          className="etcc-content"
          style={{
            marginLeft:  isRTL ? 0 : 220,
            marginRight: isRTL ? 220 : 0,
            flex: 1, padding: 24, minHeight: '100vh',
            background: '#FFFDF8', overflowX: 'hidden',
          }}
        >
          {children}
        </div>

      </div>
    </div>
  );
}

/* ── Layout racine : fournit le contexte de langue ── */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <DashboardInner>{children}</DashboardInner>
    </LanguageProvider>
  );
}
