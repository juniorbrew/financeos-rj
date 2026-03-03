// netlify/functions/check-plan.js
// GET /api/check-plan?userId=xxx

const { supabase, cors } = require("./_supabase");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors(), body: "" };
  }

  try {
    const userId = event.queryStringParameters?.userId;
    if (!userId) {
      return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "userId obrigatório." }) };
    }

    const { data: users } = await supabase(
      `/users?id=eq.${userId}&select=plan,trial_ends_at,plan_expires_at`,
      { method: "GET" }
    );

    if (!users || users.length === 0) {
      return { statusCode: 404, headers: cors(), body: JSON.stringify({ error: "Usuário não encontrado." }) };
    }

    const user = users[0];
    let { plan, trial_ends_at, plan_expires_at } = user;

    // Verifica expiração
    const now = new Date();
    if (plan === "pro" && plan_expires_at && new Date(plan_expires_at) < now) {
      plan = "free";
      // Atualiza no banco
      await supabase(`/users?id=eq.${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ plan: "free" }),
      });
    }

    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({ plan, trial_ends_at, plan_expires_at }),
    };

  } catch (err) {
    console.error("check-plan error:", err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: "Erro interno." }) };
  }
};
