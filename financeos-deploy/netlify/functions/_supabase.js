// netlify/functions/_supabase.js
// Cliente Supabase compartilhado entre as functions

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabase(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Prefer": options.prefer || "return=representation",
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  return { data, status: res.status, ok: res.ok };
}

// Hash simples de senha (SHA-256 via crypto)
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "financeos_salt_2024");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function cors(headers = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Content-Type": "application/json",
    ...headers,
  };
}

module.exports = { supabase, hashPassword, cors };
