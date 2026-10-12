const { json, supabaseFetch } = require('./_util');

// Public (no token) — every visitor calls this, so it stays deliberately
// simple: no cookies, no personal data, just a random id the page keeps in
// sessionStorage for as long as that tab is open. Ensures a row exists for
// this session, then refreshes its last_seen — that's the whole feature.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const body = JSON.parse(event.body || '{}');
    const sessionId = String(body.session_id || '').trim();
    // A UUID is 36 chars; allow some slack either way but reject junk/oversized input.
    if (!sessionId || sessionId.length < 8 || sessionId.length > 100) {
      return json(400, { error: 'Invalid session id' });
    }

    const now = new Date().toISOString();

    // "Ensure this session exists" without clobbering first_seen on repeat
    // heartbeats: insert, but ignore the conflict if the row is already there.
    await supabaseFetch('visits?on_conflict=session_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({ session_id: sessionId, first_seen: now, last_seen: now }),
    });
    // Then always refresh last_seen, whether the row was just created or already existed.
    await supabaseFetch(`visits?session_id=eq.${encodeURIComponent(sessionId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ last_seen: now }),
    });

    return json(200, { ok: true });
  } catch (e) {
    // Never let a tracking hiccup show up to a customer — fail silently server-side.
    console.error('track-visit', e);
    return json(200, { ok: false });
  }
};
