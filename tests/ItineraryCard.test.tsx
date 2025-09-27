import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import path from 'path';

// Build absolute path so we don't depend on alias or relative guessing
const compPath = path.resolve(process.cwd(), 'src/components/ItineraryCard.tsx');
// Require: prefer default export, fallback to named
// eslint-disable-next-line @typescript-eslint/no-var-requires
const mod = require(compPath);
const ItineraryCard = mod.default || mod.ItineraryCard;

describe('ItineraryCard', () => {
  it('renders legacy itinerary shape', () => {
    const legacy = {
      title: 'Legacy Trip',
      meta: { destination: 'Goa', start_date: '2025-10-01', end_date: '2025-10-02' },
      days: [
        { date: '2025-10-01', summary: 'Arrival', items: [
          { type: 'flight', label: 'BLR → GOI', start_time: '09:00', price: 100, currency: 'USD' }
        ]}
      ]
    };
    render(<ItineraryCard itinerary={legacy as any} />);
    expect(screen.getByText('Legacy Trip')).toBeInTheDocument();
    expect(screen.getByText('BLR → GOI')).toBeInTheDocument();
  });

  it('renders new itinerary shape with images', () => {
    const server = {
      title: 'Server Trip',
      days: [
        { day: 1, theme: 'Beach', details: 'Relax', _fetchedImages: [
          { publicUrl: 'https://example.com/img.jpg', caption: 'Beach', author: 'Alice' }
        ]}
      ]
    };
    render(<ItineraryCard itinerary={server as any} />);
    expect(screen.getByText('Server Trip')).toBeInTheDocument();
    expect(screen.getByText('Day 1 — Beach')).toBeInTheDocument();
    expect(screen.getByAltText('Beach')).toBeInTheDocument();
  });
});
