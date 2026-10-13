const { json, requireAdmin, supabaseFetch } = require('./_util');

const SECTION_KEYS = ['benefits', 'categories', 'promotions', 'deals', 'featured', 'store_info'];
const MAX_BANNERS = 12;
const isText = (x, max = 100) => typeof x === 'string' && x.length <= max;
const strings = (arr, maxItems, maxLen = 100) => Array.isArray(arr) &&
  arr.length <= maxItems && arr.every(x => isText(x, maxLen));
const validDate = x => !x || (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x)));

exports.handler = async event => {
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;
  try {
    if (event.httpMethod === 'GET') {
      const [rows, depts, products] = await Promise.all([
        supabaseFetch('app_settings?key=eq.ui_config&select=value'),
        supabaseFetch('store_taxonomy?kind=eq.department&select=name&order=sort_order.asc').catch(() => []),
        supabaseFetch('products?select=department').catch(() => [])
      ]);
      return json(200, {
        config: rows[0]?.value || {},
        departments: [...new Set([...depts.map(x => x.name), ...products.map(x => x.department)].filter(Boolean))]
      });
    }

    if (event.httpMethod === 'PATCH') {
      let b;
      try { b = JSON.parse(event.body || '{}'); }
      catch { return json(400, {error: 'Invalid JSON'}); }
      if (!b || typeof b !== 'object' || Array.isArray(b))
        return json(400, {error: 'Invalid homepage settings'});

      if (!strings(b.department_order, 100) ||
          !strings(b.hidden_departments, 100) ||
          !strings(b.featured_product_ids, 12) ||
          !b.home_sections || typeof b.home_sections !== 'object' || Array.isArray(b.home_sections))
        return json(400, {error: 'Invalid homepage selections'});

      const sections = Object.keys(b.home_sections);
      if (sections.length > 30 || sections.some(k => k.length > 100 || typeof b.home_sections[k] !== 'boolean'))
        return json(400, {error: 'Invalid homepage visibility settings'});

      const sectionOrder = b.home_section_order === undefined
        ? SECTION_KEYS
        : b.home_section_order;
      if (!strings(sectionOrder, SECTION_KEYS.length) ||
          new Set(sectionOrder).size !== sectionOrder.length ||
          sectionOrder.some(k => !SECTION_KEYS.includes(k)))
        return json(400, {error: 'Invalid homepage section order'});

      const banners = b.store_promotions === undefined ? [] : b.store_promotions;
      if (!Array.isArray(banners) || banners.length > MAX_BANNERS || banners.some(p =>
        !p || typeof p !== 'object' || Array.isArray(p) ||
        !isText(p.title || '', 120) || !isText(p.description || '', 500) ||
        !isText(p.department || '', 100) || !isText(p.image_url || '', 2048) ||
        (p.image_url && !/^https:\/\//i.test(p.image_url)) ||
        !validDate(p.starts_at) || !validDate(p.ends_at) ||
        (p.active !== undefined && typeof p.active !== 'boolean') ||
        (p.starts_at && p.ends_at && p.starts_at > p.ends_at)
      )) return json(400, {error: 'Invalid promotion banner settings'});

      const rows = await supabaseFetch('app_settings?key=eq.ui_config&select=value');
      const previous = rows[0]?.value || {};
      const value = {
        ...previous,
        department_order: b.department_order,
        hidden_departments: b.hidden_departments,
        home_sections: b.home_sections,
        home_section_order: sectionOrder,
        featured_product_ids: b.featured_product_ids,
        store_promotions: banners
      };
      await supabaseFetch('app_settings?on_conflict=key', {
        method: 'POST',
        headers: {Prefer: 'resolution=merge-duplicates,return=minimal'},
        body: JSON.stringify({key: 'ui_config', value})
      });
      return json(200, {ok: true});
    }
    return json(405, {error: 'Method Not Allowed'});
  } catch(e) {
    console.error('admin-homepage', e);
    return json(400, {error: e.message || 'Homepage update failed'});
  }
};
