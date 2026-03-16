'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  // Verify user is actually a registered admin
  const adminClient = createAdminClient();
  const { data: admin } = await adminClient
    .from('master_admins')
    .select('id')
    .eq('email', user.email)
    .eq('is_active', true)
    .single();
  if (!admin) throw new Error('Forbidden: not an admin');

  return user;
}

export async function createBrand(formData: {
  name: string; slug: string; category: string; tier: string;
  website: string; bot_prefix: string; wa_number: string;
  group_wa_id: string; social_handles: Record<string, string>;
  api_keys: Record<string, Record<string, string>>;
}) {
  const user = await requireAdmin();
  const supabase = createAdminClient();

  // 1. Insert brand
  const { data: brand, error: brandErr } = await supabase
    .from('brands')
    .insert({
      name: formData.name,
      slug: formData.slug,
      category: formData.category,
      tier: formData.tier,
      website: formData.website || null,
      bot_prefix: formData.bot_prefix || null,
      wa_number: formData.wa_number || null,
      group_wa_id: formData.group_wa_id || null,
      user_id: user.id,
    })
    .select()
    .single();

  if (brandErr) throw new Error(brandErr.message);

  // 2. Insert brand_profiles
  await supabase.from('brand_profiles').insert({
    brand_id: brand.id,
    brand_name: formData.name,
    website_url: formData.website || null,
    social_handles: formData.social_handles || {},
    instagram_handle: formData.social_handles?.instagram || null,
    tiktok_handle: formData.social_handles?.tiktok || null,
    facebook_page: formData.social_handles?.facebook || null,
  });

  // 3. Save API keys
  const apiKeyRows = Object.entries(formData.api_keys || {}).flatMap(([platform, keys]) =>
    Object.entries(keys)
      .filter(([, v]) => v)
      .map(([key_name, api_key]) => ({
        brand_id: brand.id,
        platform,
        key_name,
        api_key,
      }))
  );

  if (apiKeyRows.length > 0) {
    await supabase.from('platform_api_keys').insert(apiKeyRows);
  }

  // 4. Trigger onboarding (fire-and-forget)
  try {
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/onboarding-workflow`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ brand_id: brand.id, user_id: brand.user_id }),
    });
  } catch {
    // Non-blocking
  }

  return { id: brand.id };
}

export async function updateBrand(id: string, formData: {
  name: string; slug: string; category: string; tier: string;
  website: string; bot_prefix: string; wa_number: string;
  group_wa_id: string; social_handles: Record<string, string>;
  api_keys: Record<string, Record<string, string>>;
}) {
  await requireAdmin();
  const supabase = createAdminClient();

  await supabase
    .from('brands')
    .update({
      name: formData.name,
      slug: formData.slug,
      category: formData.category,
      tier: formData.tier,
      website: formData.website || null,
      bot_prefix: formData.bot_prefix || null,
      wa_number: formData.wa_number || null,
      group_wa_id: formData.group_wa_id || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  await supabase
    .from('brand_profiles')
    .update({
      brand_name: formData.name,
      website_url: formData.website || null,
      social_handles: formData.social_handles || {},
      instagram_handle: formData.social_handles?.instagram || null,
      tiktok_handle: formData.social_handles?.tiktok || null,
      facebook_page: formData.social_handles?.facebook || null,
      updated_at: new Date().toISOString(),
    })
    .eq('brand_id', id);

  // Upsert API keys
  for (const [platform, keys] of Object.entries(formData.api_keys || {})) {
    for (const [key_name, api_key] of Object.entries(keys)) {
      if (!api_key) continue;
      await supabase
        .from('platform_api_keys')
        .upsert({ brand_id: id, platform, key_name, api_key }, { onConflict: 'brand_id,platform,key_name' });
    }
  }

  return { id };
}

export async function triggerRefresh(brandId: string) {
  await requireAdmin();
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/brand-refresh-scheduler`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ brand_id: brandId }),
    }
  );
  if (!res.ok) throw new Error('Gagal trigger refresh');
  return { success: true };
}
