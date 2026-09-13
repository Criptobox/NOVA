'use client';

/* NOVA v018 — Pantalla de acceso al panel (protección por contraseña) */
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const d = await r.json();
      if (d.ok) {
        router.replace(params.get('next') || '/');
        router.refresh();
      } else {
        setError(d.error || 'No se pudo entrar');
      }
    } catch {
      setError('Sin conexión con el servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="nova-app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: 16 }}>
      <article className="card" style={{ width: '100%', maxWidth: 360 }}>
        <div className="cardhead">
          <h3>NOVA — Acceso al panel</h3>
        </div>
        <div className="panelbody">
          <p className="muted" style={{ margin: '0 0 14px', lineHeight: 1.6 }}>
            Este panel controla WhatsApp, la tienda y el trading real. Introduce la contraseña de administrador para entrar.
          </p>
          <form onSubmit={submit}>
            <div className="field">
              <label>Contraseña</label>
              <input
                autoFocus
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            {error && <div style={{ margin: '8px 0' }}><span className="tag yellow">⚠ {error}</span></div>}
            <button className="button green" type="submit" disabled={loading} style={{ width: '100%', marginTop: 10 }}>
              {loading ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </div>
      </article>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
