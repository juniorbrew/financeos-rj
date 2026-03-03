// netlify/functions/save-data.js
// POST /api/save-data  { userId, data }

const { supabase, cors } = require("./_supabase");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors(), body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { userId, data } = JSON.parse(event.body || "{}");

    if (!userId || !data) {
      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "userId e data são obrigatórios." }) };
    }

    // Verifica se já existe registro
    const { data: existing } = await supabase(
      `/user_data?user_id=eq.${userId}&select=id`,
      { method: "GET" }
    );

    if (existing && existing.length > 0) {
      // Atualiza
      await supabase(`/user_data?user_id=eq.${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ data }),
      });
    } else {
      // Cria novo
      await supabase("/user_data", {
        method: "POST",
        body: JSON.stringify({ user_id: userId, data }),
      });
    }

    return { statusCode: 200, headers: cors(), body: JSON.stringify({ ok: true }) };

  } catch (err) {
    console.error("save-data error:", err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: "Erro ao salvar dados." }) };
  }
};
