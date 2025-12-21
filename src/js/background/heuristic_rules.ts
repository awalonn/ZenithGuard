
// default_heuristic_keywords.js - REFINED

// These are the default keywords for the user-configurable heuristic engine.
// High-confidence patterns have been moved to the more performant `rules.json`.
export const HEURISTIC_KEYWORDS = [
  // Generic ad-related keywords
  '/ads/',
  '-ads-',
  '_ads_',
  '/advert/',
  'adserver.',
  'adservice.',
  'ad-delivery',
  'third-party-ads',

  // Tracking and analytics keywords
  '/track.js',
  '/tracking.',
  '/beacon.',
  '/pixel.',
  '/collect?',
  'analytics.js',
  'metrics.',
  'track.gif',

  // Advanced "Pro" Keywords (Telemetry & Fingerprinting)
  'telemetry',
  'fingerprint',
  'user-identification',

  // Aggressive Ad Tech
  'popunder',
  'adloader',
  'prebid',
  'doubleclick',
  'affiliate',
  'offer-wall'
];