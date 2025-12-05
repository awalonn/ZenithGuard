// js/background/modules/default_rules.js

// This list is converted from the original static rules.json.
// By managing them in storage, they become dynamic and can respect
// the "disable protection" switch for specific sites.
export const DEFAULT_BLOCKLIST = [
  { "value": "||doubleclick.net^", "enabled": true },
  { "value": "||google-analytics.com^", "enabled": true },
  { "value": "||googletagmanager.com^", "enabled": true },
  { "value": "||googlesyndication.com^", "enabled": true },
  { "value": "||facebook.net^", "enabled": true },
  { "value": "||connect.facebook.net^", "enabled": true },
  { "value": "||criteo.com^", "enabled": true },
  { "value": "||adroll.com^", "enabled": true },
  { "value": "||rubiconproject.com^", "enabled": true },
  { "value": "||outbrain.com^", "enabled": true },
  { "value": "||taboola.com^", "enabled": true },
  { "value": "||scorecardresearch.com^", "enabled": true },
  { "value": "||quantserve.com^", "enabled": true },
  { "value": "||hotjar.com^", "enabled": true },
  { "value": "||mixpanel.com^", "enabled": true },
  { "value": "||segment.com^", "enabled": true },
  { "value": "||optimizely.com^", "enabled": true },
  { "value": "||crazyegg.com^", "enabled": true },
  { "value": "||adnxs.com^", "enabled": true },
  { "value": "||pubmatic.com^", "enabled": true },
  { "value": "adservice.", "enabled": true },
  { "value": "adserver.", "enabled": true },
  { "value": "pagead/", "enabled": true },
  { "value": "prebid.", "enabled": true },
  { "value": "/ad-logic.", "enabled": true },
  { "value": "/ad-delivery/", "enabled": true },
  { "value": "/ads/banner.", "enabled": true },
  { "value": "/ads/preroll.", "enabled": true }
];