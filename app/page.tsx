'use client';
import { useState } from 'react';

export default function Home() {
  const [form, setForm] = useState({
    origin: 'Bangalore',
    destination: 'Ladakh',
    date_from: '',
    date_to: '',
    pax: 2,
    budget: 80000,
    vibe: 'scenic',
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
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
    <main className="max-w-3xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Packup – AI Travel Itinerary</h1>
      <form
        onSubmit={submit}
        className="grid gap-4 bg-white p-6 rounded-xl shadow"
      >
        <input
          className="border p-2 rounded"
          placeholder="Origin"
          value={form.origin}
          onChange={(e) => setForm((s) => ({ ...s, origin: e.target.value }))}
        />
        <input
          className="border p-2 rounded"
          placeholder="Destination"
          value={form.destination}
          onChange={(e) =>
            setForm((s) => ({ ...s, destination: e.target.value }))
          }
        />
        <input
          type="date"
          className="border p-2 rounded"
          value={form.date_from}
          onChange={(e) =>
            setForm((s) => ({ ...s, date_from: e.target.value }))
          }
        />
        <input
          type="date"
          className="border p-2 rounded"
          value={form.date_to}
          onChange={(e) =>
            setForm((s) => ({ ...s, date_to: e.target.value }))
          }
        />
        <input
          type="number"
          className="border p-2 rounded"
          placeholder="Pax"
          value={form.pax}
          onChange={(e) =>
            setForm((s) => ({ ...s, pax: Number(e.target.value) }))
          }
        />
        <input
          type="number"
          className="border p-2 rounded"
          placeholder="Budget (INR)"
          value={form.budget}
          onChange={(e) =>
            setForm((s) => ({ ...s, budget: Number(e.target.value) }))
          }
        />
        <input
          className="border p-2 rounded"
          placeholder="Vibe (scenic, adventure, chill)"
          value={form.vibe}
          onChange={(e) =>
            setForm((s) => ({ ...s, vibe: e.target.value }))
          }
        />
        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
        >
          {loading ? 'Thinking…' : 'Generate Itinerary'}
        </button>
      </form>

      {error && (
        <p className="text-red-600 mt-4">Error: {error}</p>
      )}

      {result && (
        <div className="mt-6 bg-gray-100 p-4 rounded">
          <h2 className="text-xl font-semibold mb-2">Result</h2>
          <pre className="whitespace-pre-wrap text-sm">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </main>
  );
}

