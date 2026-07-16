'use client';

import { useEffect } from 'react';

export default function MessagerieIndexPage() {
  useEffect(() => {
    window.location.replace('/messagerie/inbox');
  }, []);
  return null;
}
