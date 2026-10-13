
const {
  json,
  requireAdmin,
  supabaseFetch,
  hashPin,
  generatePin,
  isWeakPin
} = require('./_util');

const PUBLIC_COLUMNS =
  'id,name,active,can_approve,role,last_login_at,locked_until,created_at';

function cleanName(raw) {
  const name = String(raw || '')
    .trim()
    .replace(/\s+/g, ' ');

  if (name.length < 2 || name.length > 30) {
    throw httpError(400, 'Use a name between 2 and 30 characters.');
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9 .'\-]*$/.test(name)) {
    throw httpError(
      400,
      "Names can only use letters, numbers, spaces, and . ' -"
    );
  }

  return name;
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

// Generate a PIN if none is supplied.
function pinFrom(raw) {
  if (
    raw === undefined ||
    raw === null ||
    String(raw).trim() === ''
  ) {
    return {
      pin: generatePin(),
      generated: true
    };
  }

  const pin = String(raw).trim();

  if (!/^\d{4,8}$/.test(pin)) {
    throw httpError(400, 'A PIN must be 4 to 8 digits.');
  }

  if (isWeakPin(pin)) {
    throw httpError(
      400,
      'That PIN is too easy to guess (like 1234 or 1111). Pick another, or leave it blank for a random one.'
    );
  }

  return {
    pin,
    generated: false
  };
}

// Owner-only staff management.
exports.handler = async (event) => {
  const auth = requireAdmin(event);

  if (!auth.ok) {
    return auth.response;
  }

  try {

    // GET: List employees
    if (event.httpMethod === 'GET') {
      const rows = await supabaseFetch(
        `staff?select=${PUBLIC_COLUMNS}&order=name.asc`
      );

      return json(200, rows || []);
    }

    const b = JSON.parse(event.body || '{}');

    // POST: Add employee
    if (event.httpMethod === 'POST') {
      const name = cleanName(b.name);
      const nameKey = name.toLowerCase();

      const dupe = await supabaseFetch(
        `staff?name_key=eq.${encodeURIComponent(nameKey)}&select=id`
      );

      if (dupe && dupe.length) {
        throw httpError(
          409,
          `There's already someone named "${name}". Use a different name (for example add an initial).`
        );
      }

      const { pin } = pinFrom(b.pin);

      const role = b.role === 'butcher'
        ? 'butcher'
        : 'employee';

      const rows = await supabaseFetch('staff', {
        method: 'POST',
        headers: {
          Prefer: 'return=representation'
        },
        body: JSON.stringify({
          name,
          name_key: nameKey,
          pin_hash: hashPin(pin),
          active: true,
          role,
          can_approve:
            role === 'butcher'
              ? false
              : !!b.can_approve
        })
      });

      const {
        pin_hash,
        name_key,
        failed_attempts,
        ...person
      } = rows[0];

      return json(201, {
        staff: person,
        pin
      });
    }

    const id = Number(b.id);

    if (!Number.isInteger(id) || id <= 0) {
      throw httpError(400, 'A valid staff id is required');
    }

    // PATCH: Update employee
    if (event.httpMethod === 'PATCH') {
      const patch = {};
      let newPin = null;

      // Rename employee
      if (b.name !== undefined) {
        const name = cleanName(b.name);

        const clash = await supabaseFetch(
          `staff?name_key=eq.${encodeURIComponent(name.toLowerCase())}&id=neq.${id}&select=id`
        );

        if (clash && clash.length) {
          throw httpError(
            409,
            `There's already someone named "${name}".`
          );
        }

        patch.name = name;
        patch.name_key = name.toLowerCase();
      }

      // Activate/deactivate employee
      if (b.active !== undefined) {
        patch.active = !!b.active;

        if (!b.active) {
          patch.sessions_valid_after =
            new Date().toISOString();
        }
      }

      // Change employee role
      if (b.role !== undefined) {
        if (!['employee', 'butcher'].includes(b.role)) {
          throw httpError(
            400,
            'Invalid staff role'
          );
        }

        patch.role = b.role;

        // Butchers cannot approve refunds or cancellations.
        if (b.role === 'butcher') {
          patch.can_approve = false;
        }

        // Require employee to sign in again.
        patch.sessions_valid_after =
          new Date().toISOString();
      }

      // Refund/cancellation permissions
      if (b.can_approve !== undefined) {
        if (b.can_approve) {
          const existing = await supabaseFetch(
            `staff?id=eq.${id}&select=role`
          );

          if (
            patch.role === 'butcher' ||
            (!patch.role && existing[0]?.role === 'butcher')
          ) {
            throw httpError(
              403,
              'Butchers cannot approve refunds or cancellations'
            );
          }
        }

        patch.can_approve = !!b.can_approve;
      }

      // Unlock employee account
      if (b.unlock) {
        patch.failed_attempts = 0;
        patch.locked_until = null;
      }

      // Reset employee PIN
      if (b.reset_pin) {
        const p = pinFrom(
          b.reset_pin === true
            ? undefined
            : b.reset_pin
        );

        newPin = p.pin;

        patch.pin_hash = hashPin(p.pin);
        patch.failed_attempts = 0;
        patch.locked_until = null;

        // Invalidate previous staff sessions.
        patch.sessions_valid_after =
          new Date().toISOString();
      }

      if (!Object.keys(patch).length) {
        throw httpError(
          400,
          'Nothing to change'
        );
      }

      const rows = await supabaseFetch(
        `staff?id=eq.${id}`,
        {
          method: 'PATCH',
          headers: {
            Prefer: 'return=representation'
          },
          body: JSON.stringify(patch)
        }
      );

      if (!rows || !rows.length) {
        throw httpError(
          404,
          'Person not found'
        );
      }

      const {
        pin_hash,
        name_key,
        failed_attempts,
        ...person
      } = rows[0];

      return json(200, {
        staff: person,
        ...(newPin ? { pin: newPin } : {})
      });
    }

    // DELETE: Remove employee
    if (event.httpMethod === 'DELETE') {
      await supabaseFetch(
        `staff?id=eq.${id}`,
        {
          method: 'DELETE',
          headers: {
            Prefer: 'return=minimal'
          }
        }
      );

      return json(200, { ok: true });
    }

    return json(405, {
      error: 'Method Not Allowed'
    });

  } catch (e) {
    console.error('admin-staff', e);

    return json(
      e.status || 400,
      {
        error:
          e.message ||
          'Unable to complete this action'
      }
    );
  }
};
