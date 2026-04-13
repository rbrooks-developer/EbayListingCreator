/**
 * eBay Condition Descriptor IDs for Trading Cards
 *
 * Static lookup tables from eBay's official documentation:
 * https://developer.ebay.com/api-docs/user-guides/static/mip-user-guide/
 *   mip-enum-condition-descriptor-ids-for-trading-cards.html
 *
 * Applies to categories 183050 (Non-Sport), 183454 (CCG/MTG), 261328 (Sports).
 *
 * IMPORTANT: These numeric IDs are required by the Trading API XML.
 * The Metadata API returns human-readable labels — never use those as IDs.
 */

/** Professional Grader (descriptor 27501) */
export const GRADER_OPTIONS = [
  { valueId: '275010',  value: 'PSA'   },
  { valueId: '275011',  value: 'BCCG'  },
  { valueId: '275012',  value: 'BVG'   },
  { valueId: '275013',  value: 'BGS'   },
  { valueId: '275014',  value: 'CSG'   },
  { valueId: '275015',  value: 'CGC'   },
  { valueId: '275016',  value: 'SGC'   },
  { valueId: '275017',  value: 'KSA'   },
  { valueId: '275018',  value: 'GMA'   },
  { valueId: '275019',  value: 'HGA'   },
  { valueId: '2750110', value: 'ISA'   },
  { valueId: '2750111', value: 'PCA'   },
  { valueId: '2750112', value: 'GSG'   },
  { valueId: '2750113', value: 'PGS'   },
  { valueId: '2750114', value: 'MNT'   },
  { valueId: '2750115', value: 'TAG'   },
  { valueId: '2750116', value: 'Rare'  },
  { valueId: '2750117', value: 'RCG'   },
  { valueId: '2750118', value: 'PCG'   },
  { valueId: '2750119', value: 'Ace'   },
  { valueId: '2750120', value: 'CGA'   },
  { valueId: '2750121', value: 'TCG'   },
  { valueId: '2750122', value: 'ARK'   },
  { valueId: '2750123', value: 'Other' },
];

/** Grade (descriptor 27502) */
export const GRADE_OPTIONS = [
  { valueId: '275020',  value: '10'                   },
  { valueId: '275021',  value: '9.5'                  },
  { valueId: '275022',  value: '9'                    },
  { valueId: '275023',  value: '8.5'                  },
  { valueId: '275024',  value: '8'                    },
  { valueId: '275025',  value: '7.5'                  },
  { valueId: '275026',  value: '7'                    },
  { valueId: '275027',  value: '6.5'                  },
  { valueId: '275028',  value: '6'                    },
  { valueId: '275029',  value: '5.5'                  },
  { valueId: '2750210', value: '5'                    },
  { valueId: '2750211', value: '4.5'                  },
  { valueId: '2750212', value: '4'                    },
  { valueId: '2750213', value: '3.5'                  },
  { valueId: '2750214', value: '3'                    },
  { valueId: '2750215', value: '2.5'                  },
  { valueId: '2750216', value: '2'                    },
  { valueId: '2750217', value: '1.5'                  },
  { valueId: '2750218', value: '1'                    },
  { valueId: '2750219', value: 'Authentic'            },
  { valueId: '2750220', value: 'Authentic Altered'    },
  { valueId: '2750221', value: 'Authentic - Trimmed'  },
  { valueId: '2750222', value: 'Authentic - Coloured' },
];

/**
 * Card Condition for Ungraded cards (descriptor 40001).
 * Note: some values are category-specific —
 *   Excellent/Very Good/Poor: 183050 and 261328 only
 *   Lightly/Moderately/Heavily Played: 183454 only
 *   Near Mint or Better: all three categories
 */
export const CARD_COND_OPTIONS = [
  { valueId: '400010', value: 'Near Mint or Better'           },
  { valueId: '400011', value: 'Excellent'                     },
  { valueId: '400012', value: 'Very Good'                     },
  { valueId: '400013', value: 'Poor'                          },
  { valueId: '400015', value: 'Lightly Played (Excellent)'    },
  { valueId: '400016', value: 'Moderately Played (Very Good)' },
  { valueId: '400017', value: 'Heavily Played (Poor)'         },
];

/**
 * Resolve a stored value to its eBay numeric valueId.
 * Handles two cases:
 *   - Already a numeric ID (e.g. "275022")  → returned as-is
 *   - A human-readable label (e.g. "9")     → looked up by label (case-insensitive)
 * Returns '' if the value is empty or unrecognised.
 */
export function resolveDescriptorId(stored, options) {
  if (!stored) return '';
  const s = String(stored).trim();
  if (options.find((o) => o.valueId === s)) return s;
  const byLabel = options.find((o) => o.value.toLowerCase() === s.toLowerCase());
  return byLabel ? byLabel.valueId : '';
}

/** Look up the display label for a valueId (returns the raw valueId if not found). */
export function descriptorLabel(valueId, options) {
  return options.find((o) => o.valueId === valueId)?.value ?? valueId ?? '';
}
