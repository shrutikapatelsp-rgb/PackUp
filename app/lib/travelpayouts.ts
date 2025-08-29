const deep_link = buildAviasalesDeepLink({
  base: env.TP_DEEPLINK_BASE,
  marker: env.TP_MARKER,
  origin,
  destination,
  depart,
  ret,
  adults: params.adults ?? 1,
  userId: 'anon' // or the real user id if you have it in this context
});

