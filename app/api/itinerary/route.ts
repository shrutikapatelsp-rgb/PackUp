'use client';
import { useState } from 'react';

// ---- Shared types (keep in sync with the API types) ----
type Flight = { provider: string; from: string; to: string; price: number; currency: string; depart?: string; return?: string; };
type Hotel  = { provider: string; name: string; nights: number; price: number; currency: string; };
type Activity = { provider: string; name: string; price: number; currency: string; };
type Itinerary = { flights: Flight[]; hotels: Hotel[]; activities: Activity[]; notes?: string; };

type Intent = {
  origin: string;
  destination: string;
  date_from: string;
  date_to: string;
  pax: number;
  budget: number;
  vibe: string;
};

export default function Home() {
  const [form, setForm] = useState<Intent>({
    origin: 'Bangalore',
    destination: 'Ladakh',
    date_from: '',
    date_to: '',
    pax: 2,
    budget: 80000,
    vibe: 'scenic',
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<Itinerary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch('/api/itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data: Itinerary = await r.json();
      if (!r.ok) throw new Error('Request failed');
      setResult(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const onChange =
    <K extends keyof Intent>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.type === 'number' ? Number(e.target.value) : e.target.value;
      setForm((s) => ({ ...s, [key]: value } as Intent));
    };

  return (
    <main className="max-w-3xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Packup – AI Travel Itinerary</h1>
      <form onSubmit={submit} className="grid gap-4 bg-white p-6 rounded-xl shadow">
        <input className="border p-2 rounded" placeholder="Origin" value={form.origin} onChange={onChange('origin')} />
        <input className="border p-2 rounded" placeholder="Destination" value={form.destination} onChange={onChange('destination')} />
        <input type="date" className="border p-2 rounded" value={form.date_from} onChange={onChange('date_from')} />
        <input type="date" className="border p-2 rounded" value={form.date_to} onChange={onChange('date_to')} />
        <input type="number" className="border p-2 rounded" placeholder="Pax" value={form.pax} onChange={onChange('pax')} />
        <input type="number" className="border p-2 rounded" placeholder="Budget (INR)" value={form.budget} onChange={onChange('budget')} />
        <input className="border p-2 rounded" placeholder="Vibe (scenic, adventure, chill)" value={form.vibe} onChange={onChange('vibe')} />
        <button type="submit" disabled={loading} className="bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
          {loading ? 'Thinking…' : 'Generate Itinerary'}
        </button>
      </form>

      {error && <p className="text-red-600 mt-4">Error: {error}</p>}

      {result && (
        <div className="mt-6 bg-gray-100 p-4 rounded">
          <h2 className="text-xl font-semibold mb-2">Result</h2>
          <pre className="whitespace-pre-wrap text-sm">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </main>
  );
}

