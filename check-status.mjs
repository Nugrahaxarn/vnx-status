// Pemeriksa status layanan untuk VNX STORE.
// Dijalankan otomatis oleh GitHub Actions (lihat .github/workflows/status.yml).
// Menulis hasilnya ke status.json di root repo ini, yang lalu dibaca oleh
// website (js/config.js -> statusFeedUrl) via GitHub Pages.

const TIMEOUT_MS = 8000;
const MAX_RETRY = 2; // total percobaan = 1 awal + 2 retry = 3x

const TARGETS = [
  { key: "instagram", nama: "Instagram", url: "https://www.instagram.com/" },
  { key: "tiktok", nama: "TikTok", url: "https://www.tiktok.com/" },
  { key: "facebook", nama: "Facebook", url: "https://www.facebook.com/" },
  { key: "youtube", nama: "YouTube", url: "https://www.youtube.com/" },
  { key: "twitter_x", nama: "Twitter / X", url: "https://x.com/" },
  { key: "telegram", nama: "Telegram", url: "https://web.telegram.org/" },
  { key: "whatsapp", nama: "WhatsApp", url: "https://web.whatsapp.com/" },
  { key: "threads", nama: "Threads", url: "https://www.threads.net/" },
];

// Dua target ini opsional: kalau secret-nya belum diisi di GitHub Actions,
// statusnya otomatis "unknown" (tidak dianggap gangguan).
const OPTIONAL_TARGETS = [
  { key: "payment", nama: "Payment", envUrl: "PAYMENT_STATUS_URL" },
  { key: "notif_wa", nama: "Notifikasi WA", envUrl: "NOTIF_WA_STATUS_URL" },
];

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "VNX-Store-Status-Checker/1.0" },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function checkOne(target) {
  const start = Date.now();
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    try {
      const res = await fetchWithTimeout(target.url, TIMEOUT_MS);
      const responseMs = Date.now() - start;
      if (res.ok || (res.status >= 200 && res.status < 500)) {
        return { ...target, status: "normal", responseMs, note: `HTTP ${res.status}` };
      }
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err.name === "AbortError" ? "Timeout" : `Gagal diakses (${err.message || "fetch failed"})`;
    }
  }

  const responseMs = Date.now() - start;
  return { ...target, status: "perbaikan", responseMs, note: lastError || "Gagal diakses (fetch failed)" };
}

async function checkOptional(target) {
  const url = process.env[target.envUrl];
  if (!url) {
    return {
      key: target.key,
      nama: target.nama,
      status: "unknown",
      note: `URL belum dikonfigurasi. Set secret "${target.envUrl}" di GitHub Actions.`,
    };
  }
  const result = await checkOne({ key: target.key, nama: target.nama, url });
  return result;
}

async function main() {
  const results = [];
  for (const t of TARGETS) results.push(await checkOne(t));
  for (const t of OPTIONAL_TARGETS) results.push(await checkOptional(t));

  const output = {
    generatedAt: new Date().toISOString(),
    items: results.map(({ url, ...rest }) => rest),
  };

  const fs = await import("node:fs/promises");
  await fs.writeFile("status.json", JSON.stringify(output, null, 2) + "\n", "utf-8");
  console.log("status.json diperbarui:", output.generatedAt);
}

main().catch((err) => {
  console.error("Checker gagal total:", err);
  process.exit(1);
});
