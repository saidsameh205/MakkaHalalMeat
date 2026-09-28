const { json, requireStaff, supabaseFetch } = require('./_util');

// Active products (name, price, unit, stock) so staff can search for a
// substitute when something is unavailable.
exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method Not Allowed' });
  const auth = requireStaff(event);
  if (!auth.ok) return auth.response;

  try {
    const rows = await supabaseFetch(
      'products?select=id,name,price,unit,stock,image,emoji,department,category&active=eq.true&price=not.is.null&order=name.asc&limit=1000'
    );
    return json(200, rows || []);
  } catch (e) {
    console.error('staff-catalog', e);
    return json(500, { error: 'Unable to load products' });
  }
};
