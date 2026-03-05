// netlify/functions/delete-account.js
// Deleta o usuário do Supabase Auth usando a service key (só disponível no servidor)

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: "Invalid JSON" };
  }

  const { userId } = body;
  if (!userId) {
    return { statusCode: 400, body: "Missing userId" };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, body: "Server misconfigured" };
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Supabase delete error:", err);
      return { statusCode: 500, body: "Failed to delete user" };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("delete-account error:", err);
    return { statusCode: 500, body: "Internal error" };
  }
};
