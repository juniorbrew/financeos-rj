// netlify/functions/stripe-webhook.js
// POST /api/stripe-webhook — recebe eventos do Stripe

const { supabase, cors } = require("./_supabase");

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors(), body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors(), body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const stripeEvent = body;

    console.log("[Stripe Webhook] Event:", stripeEvent.type);

    // ── Assinatura ativada / trial iniciado ──
    if (stripeEvent.type === "customer.subscription.created" ||
        stripeEvent.type === "customer.subscription.updated") {

      const sub = stripeEvent.data.object;
      const customerId = sub.customer;
      const status = sub.status; // active, trialing, past_due, canceled

      let plan = "free";
      if (status === "active" || status === "trialing") plan = "pro";

      // Calcula quando expira
      const expiresAt = sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null;

      // Busca usuário pelo stripe_customer_id
      const { data: users } = await supabase(
        `/users?stripe_customer_id=eq.${customerId}&select=id`,
        { method: "GET" }
      );

      if (users && users.length > 0) {
        await supabase(`/users?id=eq.${users[0].id}`, {
          method: "PATCH",
          body: JSON.stringify({
            plan,
            stripe_subscription_id: sub.id,
            plan_expires_at: expiresAt,
          }),
        });
        console.log(`[Webhook] Usuário ${users[0].id} → plano: ${plan}`);
      } else {
        // Tenta achar pelo client_reference_id (enviado no Payment Link)
        const clientRef = sub.metadata?.client_reference_id || stripeEvent.data.object?.client_reference_id;
        if (clientRef) {
          await supabase(`/users?id=eq.${clientRef}`, {
            method: "PATCH",
            body: JSON.stringify({
              plan,
              stripe_customer_id: customerId,
              stripe_subscription_id: sub.id,
              plan_expires_at: expiresAt,
            }),
          });
          console.log(`[Webhook] Usuário ${clientRef} → plano: ${plan} (via client_reference_id)`);
        }
      }
    }

    // ── Assinatura cancelada / expirada ──
    if (stripeEvent.type === "customer.subscription.deleted") {
      const sub = stripeEvent.data.object;
      const customerId = sub.customer;

      const { data: users } = await supabase(
        `/users?stripe_customer_id=eq.${customerId}&select=id`,
        { method: "GET" }
      );

      if (users && users.length > 0) {
        await supabase(`/users?id=eq.${users[0].id}`, {
          method: "PATCH",
          body: JSON.stringify({ plan: "free", plan_expires_at: null }),
        });
        console.log(`[Webhook] Assinatura cancelada — usuário ${users[0].id} → free`);
      }
    }

    // ── Checkout completado (Payment Link) ──
    if (stripeEvent.type === "checkout.session.completed") {
      const session = stripeEvent.data.object;
      const customerId = session.customer;
      const clientRef = session.client_reference_id;
      const email = session.customer_details?.email;

      if (clientRef) {
        await supabase(`/users?id=eq.${clientRef}`, {
          method: "PATCH",
          body: JSON.stringify({
            plan: "pro",
            stripe_customer_id: customerId,
          }),
        });
        console.log(`[Webhook] Checkout OK — usuário ${clientRef} → pro`);
      } else if (email) {
        await supabase(`/users?email=eq.${encodeURIComponent(email)}&select=id`, {
          method: "GET",
        }).then(async ({ data: users }) => {
          if (users && users.length > 0) {
            await supabase(`/users?id=eq.${users[0].id}`, {
              method: "PATCH",
              body: JSON.stringify({ plan: "pro", stripe_customer_id: customerId }),
            });
            console.log(`[Webhook] Checkout OK — email ${email} → pro`);
          }
        });
      }
    }

    // ── Pagamento falhou ──
    if (stripeEvent.type === "invoice.payment_failed") {
      const invoice = stripeEvent.data.object;
      const customerId = invoice.customer;
      console.log(`[Webhook] Pagamento falhou — customer: ${customerId}`);
      // Não bloqueia imediatamente — Stripe tentará novamente
    }

    return { statusCode: 200, headers: cors(), body: JSON.stringify({ received: true }) };

  } catch (err) {
    console.error("[Webhook] Erro:", err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: err.message }) };
  }
};
