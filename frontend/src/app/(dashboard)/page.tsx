'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    router.push('/chantiers');
  }, [router]);

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'50vh' }}>
      <p style={{ color:'#8E5915' }}>Chargement... 🍯</p>
    </div>
  );
}