'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import {
  LayoutDashboard, Building2, ListTodo, Users, Package,
  UserCog, FileText, ClipboardList, Truck, Receipt,
  Combine, Boxes, Clock, Landmark, AlertTriangle,
  Calendar, BarChart3, Settings,
} from 'lucide-react';

const menuSections = [
  {
    label: 'Vue générale',
    items: [
      { href: '/', label: 'Tableau de bord', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Opérations',
    items: [
      { href: '/chantiers', label: 'Chantiers', icon: Building2, badge: '6' },
      { href: '/taches', label: 'Tâches', icon: ListTodo },
      { href: '/clients', label: 'Clients', icon: Users },
      { href: '/fournisseurs', label: 'Fournisseurs', icon: Package },
      { href: '/employes', label: 'Employés', icon: UserCog },
    ],
  },
  {
    label: 'Documents',
    items: [
      { href: '/devis', label: 'Devis', icon: FileText },
      { href: '/bc', label: 'Bons de commande', icon: ClipboardList },
      { href: '/bl', label: 'Bons de livraison', icon: Truck },
      { href: '/factures', label: 'Factures', icon: Receipt, badge: '3' },
      { href: '/fusion-pdf', label: 'Fusion PDF', icon: Combine },
    ],
  },
  {
    label: 'Finances',
    items: [
      { href: '/stock', label: 'Stock', icon: Boxes, badge: '2' },
      { href: '/depenses', label: 'Dépenses', icon: Clock },
{ href: '/alertes', label: 'Alertes', icon: AlertTriangle },
    ],
  },
  {
    label: 'Outils',
    items: [
      { href: '/calendrier', label: 'Calendrier', icon: Calendar },
      { href: '/rapports', label: 'Rapports', icon: BarChart3 },
    ],
  },
  {
    label: 'Système',
    items: [
      { href: '/parametres', label: 'Paramètres', icon: Settings },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();

  // Filtrer selon le rôle
  const visibleSections = menuSections.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (user?.role === 'EMPLOYE') {
        return ['/', '/taches', '/stock', '/depenses'].includes(item.href);
      }
      if (user?.role === 'COMPTABLE') {
        return ['/', '/factures', '/depenses', '/alertes', '/rapports', '/fournisseurs'].includes(item.href);
      }
      return true;
    }),
  })).filter((s) => s.items.length > 0);

  return (
    <aside className="w-[230px] bg-white border-r border-honey-beige-soft flex flex-col min-h-screen">
      <nav className="flex-1 py-3 px-2.5 overflow-y-auto">
        {visibleSections.map((section) => (
          <div key={section.label} className="mb-1">
            <p className="text-[9px] font-semibold uppercase tracking-[0.8px] text-honey-caramel px-3 pt-4 pb-1.5">
              {section.label}
            </p>
            {section.items.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium mb-0.5 transition-all group',
                    isActive
                      ? 'bg-honey-gradient-soft text-honey-dark border border-honey-gold/30'
                      : 'text-honey-brown hover:bg-honey-cream hover:text-honey-dark border border-transparent',
                  )}
                >
                  <span
                    className={cn(
                      'w-[26px] h-[26px] rounded-md flex items-center justify-center transition-all flex-shrink-0',
                      isActive
                        ? 'bg-honey-gradient text-honey-dark shadow-sm'
                        : 'bg-honey-cream text-honey-caramel group-hover:bg-honey-beige-soft group-hover:text-honey-dark',
                    )}
                  >
                    <Icon size={14} strokeWidth={1.75} />
                  </span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge && (
                    <span className="text-[9px] font-bold bg-honey-orange text-white px-1.5 py-0.5 rounded-full">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
