type ItineraryDay = {
  day: number;
  theme: string;
  places?: string[];
  details?: string;
  images?: { query: string; caption?: string; reason?: string }[];
};

type ItineraryJson = { title: string; days: ItineraryDay[] };

export async function getStrictItinerary(
  req: { destination: string; startDate: string; endDate: string; origin?: string; days?: number; travelers?: string; style?: string },
  opts: { apiKey?: string; model?: string; operationId: string }
): Promise<ItineraryJson> {
  // If no key, throw a typed error that the route will map to OPENAI_INVALID_OUTPUT or use mock before calling this.
  if (!opts.apiKey) {
    throw Object.assign(new Error('OPENAI_API_KEY missing'), { code: 'OPENAI_KEY_MISSING' });
  }

  // Build prompt → call OpenAI Responses API (or Chat Completions if that’s what you had)
  // Keep this lightweight here; stubbed for now to avoid build-time issues if key is absent.
  // TODO: plug actual OpenAI call when you have credits.
  return {
    title: `Trip to ${req.destination}`,
    days: [
      { day: 1, theme: 'Arrival', places: ['Central'], details: 'Welcome!', images: [{ query: `${req.destination} city center` }] },
    ],
  };
}
