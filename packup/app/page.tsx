'use client';
import { useState } from 'react';

export default function Home() {
  const [form, setForm] = useState({ origin: 'Bangalore', destination: 'Ladakh', date_from: '', date_to: '', pax: 2, budget: 80000, vibe: 'scenic' });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await fetch('/api/itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || 'Request failed');
      setResult(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>
      <h1>Packup – Itinerary MVP</h1>
      <form onSubmit={submit} style={{ display: 'grid', gap: 8 }}>
        <input placeholder="Origin" value={form.origin} onChange={(e)=>setForm(s=>({ ...s, origin: e.target.value }))}/>
        <input placeholder="Destination" value={form.destination} onChange={(e)=>setForm(s=>({ ...s, destination: e.target.value }))}/>
        <input type="date" value={form.date_from} onChange={(e)=>setForm(s=>({ ...s, date_from: e.target.value }))}/>
        <input type="date" value={form.date_to} onChange={(e)=>setForm(s=>({ ...s, date_to: e.target.value }))}/>
        <input type="number" placeholder="Pax" value={form.pax} onChange={(e)=>setForm(s=>({ ...s, pax: Number(e.target.value) }))}/>
        <input type="number" placeholder="Budget (INR)" value={form.budget} onChange={(e)=>setForm(s=>({ ...s, budget: Number(e.target.value) }))}/>
        <input placeholder="Vibe (e.g., scenic, adventure)" value={form.vibe} onChange={(e)=>setForm(s=>({ ...s, vibe: e.target.value }))}/>
        <button type="submit" disabled={loading}>{loading ? 'Thinking…' : 'Generate itinerary'}</button>
      </form>

      {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}
      {result && (
        <>
          <h2>Result</h2>
          <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 8 }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </>
      )}
    </main>
  );
}
