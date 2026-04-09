/**
 * Rules engine — pure functions, no side effects.
 *
 * A rule fires when:
 *  1. rule.categoryId matches listing.categoryId
 *  2. rule.keywords is empty (catch-all) OR any keyword appears in listing.title
 *
 * Only empty aspect fields are filled — existing values are never overwritten.
 * First matching rule wins per aspect name.
 */

function ruleMatches(rule, listing) {
  if (rule.categoryId !== listing.categoryId) return false;
  if (!rule.keywords || rule.keywords.length === 0) return true; // catch-all
  const titleLower = (listing.title ?? '').toLowerCase();
  return rule.keywords.some((kw) => titleLower.includes(kw.toLowerCase()));
}

/**
 * @param {object[]} rules
 * @param {{ categoryId: string, title: string, aspects: object }} listing
 * @returns {object} aspects to merge — only keys not already set in listing.aspects
 */
export function applyRules(rules, listing) {
  const result = {};

  for (const rule of rules) {
    if (!ruleMatches(rule, listing)) continue;
    if (rule.aspectName in result) continue; // first rule wins

    const existing = listing.aspects?.[rule.aspectName];
    const isEmpty  = !existing ||
      (Array.isArray(existing) ? existing.every((v) => !v) : String(existing).trim() === '');

    if (isEmpty) {
      result[rule.aspectName] = rule.aspectValue;
    }
  }

  return result;
}
