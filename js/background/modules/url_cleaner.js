// js/background/modules/url_cleaner.js

// A list of common tracking parameters to be removed from URLs.
const TRACKING_PARAMETERS = [
  // Google Analytics
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  // Facebook
  'fbclid', 'fbc',
  // Google Ads
  'gclid', 'gclsrc', 'dclid',
  // HubSpot
'_hsenc', '_hsmi', 'hsCtaTracking',
  // Marketo
  'mkt_tok',
  // Mailchimp
  'mc_cid', 'mc_eid',
  // Misc
  'vero_id',
  'yclid',
  '_openstat',
  'rb_clickid',
  's_cid'
];

/**
 * Generates declarativeNetRequest rules to strip tracking parameters from URLs.
 * @param {number} startingRuleId - The ID to start numbering rules from.
 * @param {string[]} excludedDomains - A list of domains where stripping should not occur.
 * @returns {chrome.declarativeNetRequest.Rule[]} An array of rules.
 */
export function getURLCleanerRules(startingRuleId, excludedDomains) {
  if (!TRACKING_PARAMETERS.length) {
    return [];
  }
  
  const rules = [];
  let ruleId = startingRuleId;
  const CHUNK_SIZE = 15; // Split into smaller chunks to avoid regex complexity limits.

  for (let i = 0; i < TRACKING_PARAMETERS.length; i += CHUNK_SIZE) {
    const chunk = TRACKING_PARAMETERS.slice(i, i + CHUNK_SIZE);
    
    // This simplified regex is more efficient and avoids the compilation size limit.
    // It looks for a URL query parameter separator (? or &) followed by a tracking keyword and an equals sign.
    const regex = `[?&](${chunk.join('|')})=`;

    const rule = {
      id: ruleId++,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: {
          transform: {
            queryTransform: {
              // The action removes *all* known tracking parameters, even if only one triggered the rule.
              removeParams: TRACKING_PARAMETERS
            }
          }
        }
      },
      condition: {
        regexFilter: regex,
        resourceTypes: ['main_frame', 'sub_frame'],
      }
    };

    if (excludedDomains && excludedDomains.length > 0) {
      rule.condition.excludedInitiatorDomains = excludedDomains;
    }
    
    rules.push(rule);
  }

  return rules;
}
