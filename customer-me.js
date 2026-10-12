const { json, requireCustomer, supabaseFetch } = require('./_util');

// GET  -> the signed-in customer's own profile
// PATCH -> update name/phone (email and password change through their own flows)
exports.handler = async (event) => {
  const auth = await requireCustomer(event);
  if (!auth.ok) return auth.response;

  try {
    if (event.httpMethod === 'GET') {
      return json(200, { email: auth.email, name: auth.name || '', phone: auth.phone || '', favorites: auth.favorites || [] });
    }

    if (event.httpMethod === 'PATCH') {
      const b = JSON.parse(event.body || '{}');
      const patch = {};
      if (b.name !== undefined) patch.name = String(b.name).trim().slice(0, 60);
      if (b.phone !== undefined) patch.phone = String(b.phone).trim().slice(0, 30);
      // favorites: an array of product ids stored as a jsonb column, so a customer's
      // liked items follow them across devices when they sign in.
      if (b.favorites !== undefined) {
        const ids = Array.isArray(b.favorites) ? b.favorites.map(Number).filter(Number.isFinite) : [];
        patch.favorites = ids;
      }
      if (!Object.keys(patch).length) return json(400, { error: 'Nothing to update' });

      const rows = await supabaseFetch(`customers?id=eq.${auth.customerId}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(patch),
      });
      const person = rows && rows[0];
      if (!person) return json(404, { error: 'Account not found' });
      return json(200, { email: person.email, name: person.name || '', phone: person.phone || '' });
    }

    return json(405, { error: 'Method Not Allowed' });
  } catch (e) {
    console.error('customer-me', e);
    return json(500, { error: 'Unable to load your profile right now.' });
  }
};
