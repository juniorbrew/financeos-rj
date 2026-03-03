// netlify/functions/auth.js
// POST /api/auth  { action: "register" | "login", ...dados }

const { supabase, hashPassword, cors } = require("./_supabase");

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors(), body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { action } = body;

    // ── REGISTER ──
    if (action === "register") {
      const { name, email, password, tenant } = body;

      // Validações
      if (!name || !email || !password || !tenant) {
        return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Todos os campos são obrigatórios." }) };
      }
      if (password.length < 6) {
        return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Senha deve ter pelo menos 6 caracteres." }) };
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Email inválido." }) };
      }

      // Verifica email duplicado
      const { data: existing } = await supabase(
        `/users?email=eq.${encodeURIComponent(email.toLowerCase().trim())}&select=id`,
        { method: "GET" }
      );
      if (existing && existing.length > 0) {
        return { statusCode: 409, headers: cors(), body: JSON.stringify({ error: "Este email já está cadastrado." }) };
      }

      // Cria usuário
      const hash = await hashPassword(password);
      const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

      const { data: newUsers, ok } = await supabase("/users", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          email: email.toLowerCase().trim(),
          password_hash: hash,
          tenant: tenant.trim(),
          plan: "free",
          trial_ends_at: trialEndsAt,
        }),
      });

      if (!ok || !newUsers || !newUsers[0]) {
        return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: "Erro ao criar conta. Tente novamente." }) };
      }

      const user = newUsers[0];

      // Cria registro de dados financeiros vazio
      await supabase("/user_data", {
        method: "POST",
        body: JSON.stringify({ user_id: user.id, data: {} }),
      });

      return {
        statusCode: 201,
        headers: cors(),
        body: JSON.stringify({
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            tenant: user.tenant,
            plan: user.plan,
            trial_ends_at: user.trial_ends_at,
          }
        }),
      };
    }

    // ── LOGIN ──
    if (action === "login") {
      const { email, password } = body;

      if (!email || !password) {
        return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Email e senha são obrigatórios." }) };
      }

      // Busca usuário
      const { data: users } = await supabase(
        `/users?email=eq.${encodeURIComponent(email.toLowerCase().trim())}&select=*`,
        { method: "GET" }
      );

      if (!users || users.length === 0) {
        return { statusCode: 401, headers: cors(), body: JSON.stringify({ error: "Email ou senha incorretos." }) };
      }

      const user = users[0];

      // Verifica senha (demo user usa senha raw)
      let passwordOk = false;
      if (user.id === "00000000-0000-0000-0000-000000000001") {
        passwordOk = password === "demo123";
      } else {
        const hash = await hashPassword(password);
        passwordOk = hash === user.password_hash;
      }

      if (!passwordOk) {
        return { statusCode: 401, headers: cors(), body: JSON.stringify({ error: "Email ou senha incorretos." }) };
      }

      // Verifica se trial expirou e atualiza plano
      let plan = user.plan;
      if (plan === "free" && user.trial_ends_at) {
        const trialExpired = new Date(user.trial_ends_at) < new Date();
        if (trialExpired) plan = "free"; // trial expirado, mantém free
      }

      // Busca dados financeiros
      const { data: userData } = await supabase(
        `/user_data?user_id=eq.${user.id}&select=data`,
        { method: "GET" }
      );

      return {
        statusCode: 200,
        headers: cors(),
        body: JSON.stringify({
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            tenant: user.tenant,
            plan,
            trial_ends_at: user.trial_ends_at,
            stripe_customer_id: user.stripe_customer_id,
          },
          data: userData && userData[0] ? userData[0].data : {},
        }),
      };
    }

    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Ação inválida." }) };

  } catch (err) {
    console.error("Auth error:", err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: "Erro interno do servidor." }) };
  }
};
