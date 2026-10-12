const { json, requireAdmin, supabaseFetch } = require('./_util');

// GET   -> returns the current ui_config
// PATCH -> merges the given fields into ui_config (partial update)
exports.handler = async (event) => {
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;

  try {
    if (event.httpMethod === 'GET') {
      const rows = await supabaseFetch(`app_settings?key=eq.ui_config&select=value`);
      return json(200, rows[0] ? rows[0].value : {});
    }

    if (event.httpMethod === 'PATCH') {
      const patch = JSON.parse(event.body || '{}');
      const current = await supabaseFetch(`app_settings?key=eq.ui_config&select=value`);
      const merged = { ...(current[0] ? current[0].value : {}), ...patch };
      await supabaseFetch(`app_settings?key=eq.ui_config`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ value: merged, updated_at: new Date().toISOString() }),
      });
      return json(200, merged);
    }

    return json(405, { error: 'Method Not Allowed' });
  } catch (e) {
    console.error('admin-settings', e);
    return json(400, { error: e.message || 'Unable to save settings' });
  }
};
