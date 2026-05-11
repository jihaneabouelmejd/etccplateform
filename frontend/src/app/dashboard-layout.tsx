'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isReady, setIsReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) {
      router.push('/login');
    } else {
      setIsReady(true);
    }
  }, [router]);

  if (!isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: '#FDF6E9' }}>
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-xl flex items-center justify-center animate-pulse"
            style={{ background: 'linear-gradient(135deg, #F4B315 0%, #E59312 100%)' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1A141A" strokeWidth="2.5">
              <path d="M12 2L2 7v10l10 5 10-5V7l-10-5z" />
            </svg>
          </div>
          <p style={{ color: '#8E5915', fontSize: '14px' }}>Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#FDF6E9' }}>
      <TopBar />
      <div className="flex">
        <Sidebar />
        <main className="flex-1 p-5 overflow-auto min-h-[calc(100vh-56px)]">
          {children}
        </main>
      </div>
    </div>
  );
}
