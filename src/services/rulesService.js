import { supabase, isSupabaseConfigured } from './authService.js';

function assertConfigured() {
  if (!isSupabaseConfigured) throw new Error('Supabase is not configured.');
}

function toRule(row) {
  return {
    id:           row.id,
    categoryId:   row.category_id,
    categoryName: row.category_name,
    keywords:     row.keywords ?? [],
    aspectName:   row.aspect_name,
    aspectValue:  row.aspect_value,
    createdAt:    row.created_at,
  };
}

export async function fetchRules() {
  assertConfigured();
  const { data, error } = await supabase
    .from('listing_rules')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toRule);
}

export async function createRule({ categoryId, categoryName, keywords, aspectName, aspectValue }) {
  assertConfigured();
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('listing_rules')
    .insert({ user_id: user.id, category_id: categoryId, category_name: categoryName, keywords, aspect_name: aspectName, aspect_value: aspectValue })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toRule(data);
}

export async function updateRule(id, { categoryId, categoryName, keywords, aspectName, aspectValue }) {
  assertConfigured();
  const { data, error } = await supabase
    .from('listing_rules')
    .update({ category_id: categoryId, category_name: categoryName, keywords, aspect_name: aspectName, aspect_value: aspectValue })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return toRule(data);
}

export async function deleteRule(id) {
  assertConfigured();
  const { error } = await supabase.from('listing_rules').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
