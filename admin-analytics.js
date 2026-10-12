const { json, requireAdmin, supabaseFetch } = require('./_util');

const LIVE_WINDOW_SECONDS = 60; // counts as "here now" if seen within this long

// Owner-only. Cheap on purpose — a small shop's traffic never needs more
// than counting rows, so there's no analytics service to pay for.
exports.handler = async (event) => {
  const auth = requireAdmin(event);
  if (!auth.ok) return auth.response;

  try {
    const now = Date.now();
    const liveSince = new Date(now - LIVE_WINDOW_SECONDS * 1000).toISOString();
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();

    const [liveRows, todayRows] = await Promise.all([
      supabaseFetch(`visits?last_seen=gte.${encodeURIComponent(liveSince)}&select=session_id`),
      supabaseFetch(`visits?first_seen=gte.${encodeURIComponent(todayStart)}&select=session_id`),
    ]);

    return json(200, {
      live_now: (liveRows || []).length,
      today: (todayRows || []).length,
      server_time: new Date().toISOString(),
    });
  } catch (e) {
    console.error('admin-analytics', e);
    return json(500, { error: 'Unable to load visitor stats' });
  }
};
