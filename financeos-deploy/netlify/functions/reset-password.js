// netlify/functions/reset-password.js
// POST /api/reset-password  { action: "request" | "confirm", email?, token?, newPassword? }

const { supabase, hashPassword, cors } = require("./_supabase");
const crypto = require("crypto");

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const APP_URL = process.env.URL || "https://financeos-rj.netlify.app";

async function sendResetEmail(email, token, name) {
  const resetLink = `${APP_URL}?reset=${token}`;
  
  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:#111118;border-radius:16px;overflow:hidden;border:1px solid #1e1e2a;">
    <div style="background:linear-gradient(135deg,#1a1a24,#111118);padding:32px;text-align:center;border-bottom:1px solid #1e1e2a;">
      <div style="width:48px;height:48px;background:#f0b429;border-radius:12px;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:24px;">💰</div>
      <h1 style="color:#f0b429;font-size:22px;margin:0;letter-spacing:-0.02em;">FinanceOS</h1>
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
        Se você não solicitou a redefinição, ignore este email com segurança.<br/>
        Sua senha permanece inalterada até você clicar no link.
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
</html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: "FinanceOS <noreply@financeos-rj.netlify.app>",
      to: [email],
      subject: "🔑 Redefinir senha — FinanceOS",
      html,
    }),
  });
  return res.ok;
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: cors(), body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: "Method not allowed" }) };

  try {
    const body = JSON.parse(event.body || "{}");
    const { action } = body;

    // ── SOLICITAR RESET ──
    if (action === "request") {
      const { email } = body;
      if (!email) return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Informe o email." }) };

      // Busca usuário
      const { data: users } = await supabase(
        `/users?email=eq.${encodeURIComponent(email.toLowerCase().trim())}&select=id,name,email`,
        { method: "GET" }
      );

      // Sempre retorna sucesso (não revela se email existe)
      if (!users || users.length === 0) {
        return { statusCode: 200, headers: cors(), body: JSON.stringify({ ok: true }) };
      }

      const user = users[0];

      // Gera token único e expira em 1h
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      // Salva token no usuário
      await supabase(`/users?id=eq.${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ reset_token: token, reset_token_expires: expiresAt }),
      });

      // Envia email
      if (RESEND_API_KEY) {
        await sendResetEmail(user.email, token, user.name);
      } else {
        // Dev mode: loga o link
        console.log(`[DEV] Reset link: ${APP_URL}?reset=${token}`);
      }

      return { statusCode: 200, headers: cors(), body: JSON.stringify({ ok: true }) };
    }

    // ── CONFIRMAR RESET (nova senha) ──
    if (action === "confirm") {
      const { token, newPassword } = body;
      if (!token || !newPassword) return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Token e nova senha são obrigatórios." }) };
      if (newPassword.length < 6) return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Senha deve ter pelo menos 6 caracteres." }) };

      // Busca usuário pelo token
      const { data: users } = await supabase(
        `/users?reset_token=eq.${token}&select=id,name,email,reset_token_expires`,
        { method: "GET" }
      );

      if (!users || users.length === 0) {
        return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Link inválido ou já utilizado." }) };
      }

      const user = users[0];

      // Verifica expiração
      if (new Date(user.reset_token_expires) < new Date()) {
        return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Link expirado. Solicite um novo." }) };
      }

      // Atualiza senha e limpa token
      const newHash = hashPassword(newPassword);
      await supabase(`/users?id=eq.${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ password_hash: newHash, reset_token: null, reset_token_expires: null }),
      });

      return { statusCode: 200, headers: cors(), body: JSON.stringify({ ok: true, message: "Senha alterada com sucesso!" }) };
    }

    // ── VERIFICAR TOKEN (valida se link ainda é válido) ──
    if (action === "verify") {
      const { token } = body;
      if (!token) return { statusCode: 400, headers: cors(), body: JSON.stringify({ valid: false }) };

      const { data: users } = await supabase(
        `/users?reset_token=eq.${token}&select=id,name,reset_token_expires`,
        { method: "GET" }
      );

      if (!users || users.length === 0) return { statusCode: 200, headers: cors(), body: JSON.stringify({ valid: false }) };
      
      const valid = new Date(users[0].reset_token_expires) > new Date();
      return { statusCode: 200, headers: cors(), body: JSON.stringify({ valid, name: users[0].name }) };
    }

    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Ação inválida." }) };

  } catch (err) {
    console.error("Reset password error:", err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: "Erro interno. Tente novamente." }) };
  }
};
