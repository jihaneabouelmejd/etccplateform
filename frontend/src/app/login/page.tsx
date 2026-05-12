'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lang, setLang] = useState<'FR' | 'AR'>('FR');

  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) { setError('Identifiants invalides'); return; }
      const data = await res.json();
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      router.push('/dashboard');
    } catch {
      setError('Erreur réseau — vérifiez que le backend est lancé');
    } finally {
      setLoading(false);
    }
  };

  const isAR = lang === 'AR';

  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(135deg,#FDF6E9 0%,#FAEAC0 40%,#F5E6D3 100%)' }} dir={isAR ? 'rtl' : 'ltr'}>
      <div style={{ width:'100%', maxWidth:420, padding:'0 16px' }}>
        {/* Lang toggle */}
        <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:16 }}>
          <div style={{ background:'white', borderRadius:8, padding:4, border:'1px solid #F5E6D3', display:'flex', gap:4 }}>
            {(['FR','AR'] as const).map(l => (
              <button key={l} onClick={() => setLang(l)} style={{ padding:'6px 14px', borderRadius:6, border:'none', cursor:'pointer', fontWeight:600, fontSize:12, background: lang === l ? '#F4B315' : 'transparent', color: lang === l ? '#1A141A' : '#8E5915' }}>{l}</button>
            ))}
          </div>
        </div>

        {/* Card */}
        <div style={{ background:'white', borderRadius:16, padding:32, boxShadow:'0 4px 24px rgba(142,89,21,0.12)', border:'1px solid #F5E6D3' }}>
          {/* Logo */}
          <div style={{ textAlign:'center', marginBottom:28 }}>
            <div style={{ width:64, height:64, margin:'0 auto 12px', borderRadius:14, background:'linear-gradient(135deg,#F4B315,#E59312)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28 }}>🏗️</div>
            <h1 style={{ margin:0, fontSize:22, fontWeight:800, color:'#1A141A' }}>ETCC<span style={{ color:'#E59312' }}>.</span></h1>
            <p style={{ margin:'4px 0 0', fontSize:13, color:'#8E5915' }}>{isAR ? 'بلاطفورم تسيير ETCC' : 'Plateforme de gestion ETCC'}</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom:16 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#8E5915', textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>
                {isAR ? 'اسم المستخدم' : "Nom d'utilisateur"}
              </label>
              <input value={username} onChange={e => setUsername(e.target.value)} required placeholder={isAR ? 'admin' : 'admin'}
                style={{ width:'100%', padding:'10px 14px', borderRadius:8, border:'1.5px solid #E8D4B0', fontSize:14, outline:'none', boxSizing:'border-box', background:'#FAFAFA' }} />
            </div>

            <div style={{ marginBottom:20 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#8E5915', textTransform:'uppercase', letterSpacing:1, marginBottom:6 }}>
                {isAR ? 'كلمة السر' : 'Mot de passe'}
              </label>
              <div style={{ position:'relative' }}>
                <input value={password} onChange={e => setPassword(e.target.value)} required type={showPass ? 'text' : 'password'}
                  style={{ width:'100%', padding:'10px 40px 10px 14px', borderRadius:8, border:'1.5px solid #E8D4B0', fontSize:14, outline:'none', boxSizing:'border-box', background:'#FAFAFA' }} />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:16 }}>
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ background:'#FFF0F0', border:'1px solid #FFCDD2', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:13, color:'#D32F2F', display:'flex', alignItems:'center', gap:8 }}>
                ⚠️ {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              style={{ width:'100%', padding:'12px', borderRadius:10, border:'none', background:'linear-gradient(135deg,#F4B315,#E59312)', color:'#1A141A', fontSize:15, fontWeight:700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>
              {loading ? '...' : (isAR ? 'دخول' : 'Se connecter')}
            </button>
          </form>
        </div>

        <p style={{ textAlign:'center', fontSize:12, color:'#8E5915', marginTop:16 }}>
          © {new Date().getFullYear()} ETCC SARL — Casablanca
        </p>
      </div>
    </div>
  );
}