// netlify/functions/notify.js
// Chamada pelo app quando orçamento estoura ou fatura vence em breve

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

async function sendEmail({ to, toName, subject, html }) {
  const res = await fetch(BREVO_URL, {
    method: "POST",
    headers: {
      "api-key": BREVO_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "FinanceOS", email: "noreply@financeos.app" },
      to: [{ email: to, name: toName || to }],
      subject,
      htmlContent: html,
    }),
  });
  return res.ok;
}

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

  const { type, email, name, data } = body;

  if (!email || !type) {
    return { statusCode: 400, body: "Missing email or type" };
  }

  let subject = "";
  let html = "";

  if (type === "budget_alert") {
    // data = { category, spent, limit, percent }
    const { category, spent, limit, percent } = data || {};
    subject = `⚠️ Orçamento de ${category} em ${percent}%`;
    html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <div style="background:#f0b429;border-radius:12px 12px 0 0;padding:20px 24px;">
          <h2 style="margin:0;color:#000;font-size:18px;">⚠️ Alerta de Orçamento</h2>
        </div>
        <div style="background:#1a1a2e;border-radius:0 0 12px 12px;padding:24px;color:#e2e8f0;">
          <p>Olá, <strong>${name || "usuário"}</strong>!</p>
          <p>Seu orçamento de <strong style="color:#f0b429">${category}</strong> atingiu <strong style="color:#f87171">${percent}%</strong> do limite.</p>
          <div style="background:#0f0f1a;border-radius:8px;padding:16px;margin:16px 0;">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
              <span style="color:#94a3b8">Gasto</span>
              <span style="color:#f87171;font-weight:700">R$ ${Number(spent).toFixed(2)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;">
              <span style="color:#94a3b8">Limite</span>
              <span style="color:#e2e8f0;font-weight:700">R$ ${Number(limit).toFixed(2)}</span>
            </div>
            <div style="background:#1e293b;border-radius:99px;height:6px;margin-top:12px;overflow:hidden;">
              <div style="background:${percent >= 100 ? '#ef4444' : '#f0b429'};height:6px;width:${Math.min(percent,100)}%;border-radius:99px;"></div>
            </div>
          </div>
          <a href="https://financeos-rj.netlify.app" style="display:inline-block;background:#f0b429;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:8px;">Ver no FinanceOS</a>
        </div>
        <p style="text-align:center;color:#64748b;font-size:11px;margin-top:16px;">Você recebe este email porque ativou alertas financeiros no FinanceOS.</p>
      </div>`;
  }

  else if (type === "bill_due") {
    // data = { cardName, amount, dueDate, daysLeft }
    const { cardName, amount, dueDate, daysLeft } = data || {};
    subject = `💳 Fatura de ${cardName} vence em ${daysLeft} dia${daysLeft !== 1 ? "s" : ""}`;
    html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <div style="background:#f0b429;border-radius:12px 12px 0 0;padding:20px 24px;">
          <h2 style="margin:0;color:#000;font-size:18px;">💳 Fatura a Vencer</h2>
        </div>
        <div style="background:#1a1a2e;border-radius:0 0 12px 12px;padding:24px;color:#e2e8f0;">
          <p>Olá, <strong>${name || "usuário"}</strong>!</p>
          <p>A fatura do cartão <strong style="color:#f0b429">${cardName}</strong> vence em <strong style="color:#fbbf24">${daysLeft} dia${daysLeft !== 1 ? "s" : ""}</strong>.</p>
          <div style="background:#0f0f1a;border-radius:8px;padding:16px;margin:16px 0;">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
              <span style="color:#94a3b8">Valor</span>
              <span style="color:#f0b429;font-weight:700;font-size:20px;">R$ ${Number(amount).toFixed(2)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;">
              <span style="color:#94a3b8">Vencimento</span>
              <span style="color:#e2e8f0;font-weight:600">${dueDate}</span>
            </div>
          </div>
          <a href="https://financeos-rj.netlify.app" style="display:inline-block;background:#f0b429;color:#000;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:8px;">Pagar Fatura</a>
        </div>
        <p style="text-align:center;color:#64748b;font-size:11px;margin-top:16px;">Você recebe este email porque ativou alertas de fatura no FinanceOS.</p>
      </div>`;
  }

  else {
    return { statusCode: 400, body: "Unknown notification type" };
  }

  const ok = await sendEmail({ to: email, toName: name, subject, html });
  return {
    statusCode: ok ? 200 : 500,
    body: JSON.stringify({ ok }),
  };
};
