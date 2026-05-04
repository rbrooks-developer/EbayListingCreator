import { useEffect, useRef, useState } from 'react';
import { supabase } from '../services/authService.js';
import { useAuth } from '../contexts/AuthContext.jsx';

export const EMPTY_DEFAULTS = {
  categoryId:          '',
  categoryName:        '',
  fulfillmentPolicyId: '',
  shippingService:     '',
  length:              '',
  width:               '',
  height:              '',
  weightLbs:           '',
  weightOz:            '',
};

function toDb(d, userId) {
  return {
    user_id:               userId,
    category_id:           d.categoryId           || null,
    category_name:         d.categoryName         || null,
    fulfillment_policy_id: d.fulfillmentPolicyId  || null,
    shipping_service:      d.shippingService      || null,
    length:                Number(d.length)    > 0 ? Number(d.length)    : null,
    width:                 Number(d.width)     > 0 ? Number(d.width)     : null,
    height:                Number(d.height)    > 0 ? Number(d.height)    : null,
    weight_lbs:            Number(d.weightLbs) > 0 ? Number(d.weightLbs) : null,
    weight_oz:             Number(d.weightOz)  > 0 ? Number(d.weightOz)  : null,
    updated_at:            new Date().toISOString(),
  };
}

function fromDb(row) {
  if (!row) return { ...EMPTY_DEFAULTS };
  return {
    categoryId:          row.category_id           ?? '',
    categoryName:        row.category_name         ?? '',
    fulfillmentPolicyId: row.fulfillment_policy_id ?? '',
    shippingService:     row.shipping_service      ?? '',
    length:              row.length     != null ? String(row.length)     : '',
    width:               row.width      != null ? String(row.width)      : '',
    height:              row.height     != null ? String(row.height)     : '',
    weightLbs:           row.weight_lbs != null ? String(row.weight_lbs) : '',
    weightOz:            row.weight_oz  != null ? String(row.weight_oz)  : '',
  };
}

export function countDefaults(defaults) {
  return [
    !!defaults.categoryId,
    !!defaults.fulfillmentPolicyId,
    !!defaults.shippingService,
    Number(defaults.length)    > 0,
    Number(defaults.width)     > 0,
    Number(defaults.height)    > 0,
    Number(defaults.weightLbs) > 0,
    Number(defaults.weightOz)  > 0,
  ].filter(Boolean).length;
}

export function applyListingDefaults(listing, defaults) {
  if (!defaults) return listing;
  return {
    ...listing,
    categoryId:          listing.categoryId          || defaults.categoryId          || '',
    categoryName:        listing.categoryName        || defaults.categoryName        || '',
    fulfillmentPolicyId: listing.fulfillmentPolicyId || defaults.fulfillmentPolicyId || '',
    shippingService:     listing.shippingService     || defaults.shippingService     || '',
    length:              listing.length              || defaults.length              || '',
    width:               listing.width               || defaults.width               || '',
    height:              listing.height              || defaults.height              || '',
    weightLbs:           listing.weightLbs           || defaults.weightLbs           || '',
    weightOz:            listing.weightOz            || defaults.weightOz            || '',
  };
}

export default function useListingDefaults() {
  const { user } = useAuth();
  const [defaults, setDefaults] = useState(EMPTY_DEFAULTS);
  const defaultsRef = useRef(EMPTY_DEFAULTS);

  useEffect(() => { defaultsRef.current = defaults; }, [defaults]);

  useEffect(() => {
    if (!user) {
      setDefaults(EMPTY_DEFAULTS);
      defaultsRef.current = EMPTY_DEFAULTS;
      return;
    }
    supabase
      .from('user_listing_defaults')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        const loaded = fromDb(data);
        setDefaults(loaded);
        defaultsRef.current = loaded;
      });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveDefaults(patch) {
    const updated = { ...defaultsRef.current, ...patch };
    setDefaults(updated);
    defaultsRef.current = updated;
    if (!user) return;
    await supabase
      .from('user_listing_defaults')
      .upsert(toDb(updated, user.id), { onConflict: 'user_id' });
  }

  return { defaults, saveDefaults };
}
