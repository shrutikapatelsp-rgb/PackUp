import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Plane, Hotel, MapPin, Star, ExternalLink } from 'lucide-react';

type LegacyItineraryItem = {
  type: "flight" | "hotel" | "activity" | string;
  label: string;
  start_time?: string | null;
  end_time?: string | null;
  price?: number | null;
  currency?: string | null;
  deep_link?: string | null;
};

type LegacyItineraryDay = {
  date: string;
  summary: string;
  items: LegacyItineraryItem[];
};

type LegacyItineraryJSON = {
  title: string;
  meta?: { 
    origin?: string | null; 
    destination?: string; 
    start_date?: string | null; 
    end_date?: string | null; 
    currency?: string;
  };
  days: LegacyItineraryDay[];
  estimates?: { total?: number; currency?: string };
};

type FetchedImage = {
  publicUrl: string;
  caption?: string;
  reason?: string;
  author?: string;
  license?: string;
};

type NewItineraryDay = {
  day: number;
  theme: string;
  places?: string[];
  details?: string;
  _fetchedImages?: FetchedImage[];
};

type NewItineraryJSON = {
  title: string;
  days: NewItineraryDay[];
  meta?: { origin?: string; destination?: string; start_date?: string; end_date?: string; currency?: string };
  estimates?: { total?: number; currency?: string };
};

type ItineraryCardProps = {
  itinerary: LegacyItineraryJSON | NewItineraryJSON;
};

export function ItineraryCard({ itinerary }: ItineraryCardProps) {
  const [expandedDays, setExpandedDays] = useState<number[]>([0]);

  const toggleDay = (dayIndex: number) => {
    setExpandedDays(prev => 
      prev.includes(dayIndex) 
        ? prev.filter(i => i !== dayIndex)
        : [...prev, dayIndex]
    );
  };

  const getItemIcon = (type: string) => {
    switch (type) {
      case 'flight': return <Plane className="w-4 h-4" />;
      case 'hotel': return <Hotel className="w-4 h-4" />;
      case 'activity': return <MapPin className="w-4 h-4" />;
      default: return <Star className="w-4 h-4" />;
    }
  };

  const getItemColor = (type: string) => {
    switch (type) {
      case 'flight': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'hotel': return 'bg-green-100 text-green-800 border-green-200';
      case 'activity': return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(amount);
    } catch {
      return `${currency} ${amount}`;
    }
  };

  const normalizeDeepLink = (link?: string | null) => {
    if (!link) return '#';
    if (link.includes('[') && link.includes(']')) return '#';
    return link;
  };

  const looksLikeLegacy = (obj: any): obj is LegacyItineraryJSON =>
    Array.isArray(obj?.days) && obj.days.length > 0 && !!obj.days[0]?.items;

  const looksLikeNew = (obj: any): obj is NewItineraryJSON =>
    Array.isArray(obj?.days) && obj.days.length > 0 && (obj.days[0]?.day !== undefined || obj.days[0]?._fetchedImages !== undefined);

  const renderLegacyDay = (day: LegacyItineraryDay, dayIndex: number) => (
    <Collapsible key={dayIndex} open={expandedDays.includes(dayIndex)} onOpenChange={() => toggleDay(dayIndex)}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between p-4 h-auto bg-muted/30 hover:bg-muted/50 rounded-xl">
          <div className="text-left">
            <div className="font-medium text-foreground">{day.date}</div>
            <div className="text-sm text-muted-foreground">{day.summary}</div>
          </div>
          <ChevronDown className={`w-5 h-5 transition-transform ${expandedDays.includes(dayIndex) ? 'rotate-180' : ''}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 mt-3">
        {day.items.map((item, itemIndex) => (
          <Card key={itemIndex} className="bg-card/60 border-border/20">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <div className={`p-2 rounded-lg border ${getItemColor(item.type)}`}>
                    {getItemIcon(item.type)}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-foreground mb-1">{item.label}</h4>
                    <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                      {item.start_time && <span>{item.start_time}</span>}
                      {item.end_time && item.start_time && <span>→ {item.end_time}</span>}
                      {item.price !== undefined && item.price !== null && (
                        <span className="font-medium">
                          {formatCurrency(item.price, item.currency || (itinerary as any).meta?.currency || 'USD')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  {item.deep_link && (
                    <Button size="sm" variant="outline" className="text-xs hover:scale-105 transition-transform" asChild>
                      <a href={normalizeDeepLink(item.deep_link)} target="_blank" rel="noopener noreferrer" aria-label={`Book ${item.label}`}>
                        <ExternalLink className="w-3 h-3 mr-1" /> Book
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );

  const renderNewDay = (day: NewItineraryDay, dayIndex: number) => (
    <Collapsible key={dayIndex} open={expandedDays.includes(dayIndex)} onOpenChange={() => toggleDay(dayIndex)}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between p-4 h-auto bg-muted/30 hover:bg-muted/50 rounded-xl">
          <div className="text-left">
            <div className="font-medium text-foreground">Day {day.day} — {day.theme}</div>
            <div className="text-sm text-muted-foreground">{(day.places || []).join(' · ')}</div>
          </div>
          <ChevronDown className={`w-5 h-5 transition-transform ${expandedDays.includes(dayIndex) ? 'rotate-180' : ''}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 mt-3">
        <Card className="bg-card/60 border-border/20">
          <CardContent className="p-4">
            <div className="text-muted-foreground mb-2">{day.details}</div>
            {day._fetchedImages && day._fetchedImages.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                {day._fetchedImages.map((img, idx) => (
                  <figure key={idx} className="rounded overflow-hidden border">
                    <img src={img.publicUrl} alt={img.caption || `day-${day.day}-img-${idx}`} className="w-full h-48 object-cover" />
                    <figcaption className="p-2 text-xs text-gray-600">
                      <div className="font-medium">{img.caption}</div>
                      <div className="text-[11px] mt-1">{img.author ? `Photo: ${img.author}` : (img.license || '')}</div>
                      {img.reason && <div className="italic text-[11px] mt-1">Why: {img.reason}</div>}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );

  return (
    <Card className="glass-card border-border/40 shadow-sophisticated">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-2xl font-light text-foreground mb-2">{itinerary.title}</CardTitle>
            {('meta' in itinerary) && (itinerary as any).meta?.destination && (
              <p className="text-muted-foreground">
                {(itinerary as any).meta?.origin && `${(itinerary as any).meta.origin} → `}
                {(itinerary as any).meta.destination}
              </p>
            )}
            {('meta' in itinerary) && (itinerary as any).meta?.start_date && (itinerary as any).meta?.end_date && (
              <p className="text-sm text-muted-foreground">
                {(itinerary as any).meta.start_date} to {(itinerary as any).meta.end_date}
              </p>
            )}
          </div>
          {(itinerary as any).estimates?.total && (
            <div className="text-right">
              <div className="text-2xl font-semibold text-foreground">
                {formatCurrency((itinerary as any).estimates.total, (itinerary as any).estimates.currency)}
              </div>
              <div className="text-sm text-muted-foreground">Total Estimate</div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {looksLikeLegacy(itinerary) && (itinerary as LegacyItineraryJSON).days.map((d, idx) => renderLegacyDay(d, idx))}
        {(!looksLikeLegacy(itinerary) && looksLikeNew(itinerary)) && (itinerary as NewItineraryJSON).days.map((d, idx) => renderNewDay(d, idx))}
        {!looksLikeLegacy(itinerary) && !looksLikeNew(itinerary) && (
          <div className="text-sm text-muted-foreground">Itinerary format not recognized.</div>
        )}
      </CardContent>
    </Card>
  );
}

export default ItineraryCard;
