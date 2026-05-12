'use client';

import { create } from 'zustand';

interface User {
  id: string;
  username: string;
  email?: string;
  first_name: string;
  last_name: string;
  role: 'ADMIN' | 'GERANT' | 'COMPTABLE' | 'EMPLOYE';
  preferred_language: 'FR' | 'AR';
  avatar_url?: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
  setUser: (user: User | null) => void;
}

const API = `${process.env.NEXT_PUBLIC_API_URL || ''}/api`;

export const useAuth = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  login: async (username: string, password: string) => {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      throw new Error('Identifiants invalides');
    }

    const data = await res.json();
    localStorage.setItem('access_token', data.access_token);
    set({ user: data.user, isAuthenticated: true, isLoading: false });
  },

  logout: async () => {
    try {
      const token = localStorage.getItem('access_token');
      await fetch(`${API}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
    } catch {}
    localStorage.removeItem('access_token');
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  fetchMe: async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        set({ user: null, isAuthenticated: false, isLoading: false });
        return;
      }
      const res = await fetch(`${API}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Not authenticated');
      const data = await res.json();
      set({ user: data, isAuthenticated: true, isLoading: false });
    } catch {
      localStorage.removeItem('access_token');
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  setUser: (user) => set({ user, isAuthenticated: !!user }),
}));