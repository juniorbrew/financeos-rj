// netlify/functions/reset-password.js
const { supabase, hashPassword, cors } = require("./_supabase");
const crypto = require("crypto");

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const APP_URL = process.env.URL || "https://financeos-rj.netlify.app";

async function sendResetEmail(email, token, name) {
  const resetLink = `${APP_URL}?reset=${token}`;

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: "FinanceOS", email: "rjsolucoes@hotmail.com" },
      to: [{ email, name }],
      subject: "🔑 Redefinir senha — FinanceOS",
      htmlContent: `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#111118;border-radius:16px;overflow:hidden;border:1px solid #1e1e2a;">
    <div style="background:linear-gradient(135deg,#1a1a24,#111118);padding:32px;text-align:center;border-bottom:1px solid #1e1e2a;">
      <div style="width:48px;height:48px;background:#f0b429;border-radius:12px;margin:0 auto 16px;font-size:24px;line-height:48px;text-align:center;">💰</div>
      <h1 style="color:#f0b429;font-size:22px;margin:0;">FinanceOS</h1>
      <p style="color:#8888a0;font-size:13px;margin:6px 0 0;">Gestão Financeira Pessoal</p>
    </div>
    <div style="padding:32px;">
      <h2 style="color:#e8e8f0;font-size:18px;margin:0 0 12px;">Olá, ${name}!</h2>
      <p style="color:#8888a0;font-size:14px;line-height:1.6;margin:0 0 24px;">
        Recebemos uma solicitação para redefinir a senha da sua conta FinanceOS.<br/>
        Clique no botão abaixo para criar uma nova senha.
      </p>
      <a href="${resetLink}" style="display:block;background:#f0b429;color:#000;text-align:center;padding:14px 24px;border-radius:10px;font-size:15px;font-weight:700;text-decoration:none;margin-bottom:24px;">
        🔑 Redefinir Senha
      </a>
      <p style="color:#44445a;font-size:12px;line-height:1.6;margin:0;">
        Este link expira em <strong style="color:#8888a0;">1 hora</strong>.<br/>
        Se você não solicitou a redefinição, ignore este email.
      </p>
      <div style="margin-top:24px;padding-top:20px;border-top:1px solid #1e1e2a;">
        <p style="color:#44445a;font-size:11px;margin:0;">
          Ou copie e cole este link no navegador:<br/>
          <span style="color:#f0b429;word-break:break-all;">${resetLink}</span>
        </p>
      </div>
    </div>
    <div style="padding:20px 32px;background:#0a0a0f;text-align:center;border-top:1px solid #1e1e2a;">
      <p style="color:#44445a;font-size:11px;margin:0;">FinanceOS · Gestão Financeira Pessoal</p>
    </div>
  </div>
</body>
</html>`,
    }),
  });

  const result = await res.json();
  console.log("Brevo response:", JSON.stringify(result));
  return res.ok;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: cors(), body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: "Method not allowed" }) };

  try {
    const body = JSON.parse(event.body || "{}");
    const { action } = body;

    if (action === "request") {
      const { email } = body;
      if (!email) return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Informe o email." }) };

      const { data: users } = await supabase(
        `/users?email=eq.${encodeURIComponent(email.toLowerCase().trim())}&select=id,name,email`,
        { method: "GET" }
      );

      if (!users || users.length === 0) {
        return { statusCode: 200, headers: cors(), body: JSON.stringify({ ok: true }) };
      }

      const user = users[0];
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      await supabase(`/users?id=eq.${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ reset_token: token, reset_token_expires: expiresAt }),
      });

      await sendResetEmail(user.email, token, user.name);

      return { statusCode: 200, headers: cors(), body: JSON.stringify({ ok: true }) };
    }

    if (action === "verify") {
      const { token } = body;
      if (!token) return { statusCode: 200, headers: cors(), body: JSON.stringify({ valid: false }) };

      const { data: users } = await supabase(
        `/users?reset_token=eq.${token}&select=id,name,reset_token_expires`,
        { method: "GET" }
      );

      if (!users || users.length === 0) return { statusCode: 200, headers: cors(), body: JSON.stringify({ valid: false }) };
      const valid = new Date(users[0].reset_token_expires) > new Date();
      return { statusCode: 200, headers: cors(), body: JSON.stringify({ valid, name: users[0].name }) };
    }

    if (action === "confirm") {
      const { token, newPassword } = body;
      if (!token || !newPassword) return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Token e nova senha são obrigatórios." }) };
      if (newPassword.length < 6) return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Senha deve ter pelo menos 6 caracteres." }) };

      const { data: users } = await supabase(
        `/users?reset_token=eq.${token}&select=id,name,email,reset_token_expires`,
        { method: "GET" }
      );

      if (!users || users.length === 0) return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Link inválido ou já utilizado." }) };
      if (new Date(users[0].reset_token_expires) < new Date()) return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Link expirado. Solicite um novo." }) };

      const newHash = hashPassword(newPassword);
      await supabase(`/users?id=eq.${users[0].id}`, {
        method: "PATCH",
        body: JSON.stringify({ password_hash: newHash, reset_token: null, reset_token_expires: null }),
      });

      return { statusCode: 200, headers: cors(), body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Ação inválida." }) };

  } catch (err) {
    console.error("Reset password error:", err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: "Erro interno." }) };
  }
};
