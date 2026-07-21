// Chạy 1 LẦN sau khi deploy bản .env đã dọn key:
//   GATEWAY_URL=https://huyyhere-gateways.vercel.app OWNER_SECRET=xxx node scripts/migrate-keys-to-mongo.mjs
//
// Đẩy toàn bộ key thật (đã từng nằm trong .env) vào MongoDB qua Provider Key
// Manager API, để gateway lấy key runtime từ Mongo thay vì .env.
// Sau khi chạy xong và confirm "Provider Keys" tab hiện đủ key + test pass,
// có thể xoá file này (không cần chạy lại — chạy lại chỉ bị báo "duplicate key").

const GATEWAY_URL = process.env.GATEWAY_URL || "http://localhost:3000";
const OWNER_SECRET = process.env.OWNER_SECRET;

if (!OWNER_SECRET) {
  console.error("Thiếu OWNER_SECRET. Chạy: OWNER_SECRET=xxx GATEWAY_URL=https://... node scripts/migrate-keys-to-mongo.mjs");
  process.exit(1);
}

// Các key thật đã lấy ra từ .env cũ trước khi bị xoá.
const LEGACY_KEYS = {
  BlackCat: ["sk-3a2356d08be557bd-ygdugk-f8520280"],
  ZLKPro: [
    "sk-32dIsWUnHBEu_aDgswuNbQ", "sk-Ly65om_R1ind7NSIhc_eOg", "sk-LSFJ4UiE_aTBDtc001YEOA",
    "sk-xFSs_Z2Kals4byNieLuDrg", "sk-FhOq1eu7iEI66nmlF2kWfA", "sk-Y9rCtYxdBXJUHx6ccGCVNg",
    "sk-mD5lJ3PrX0L9EPqUmtV8iQ", "sk-gOI-nEPRjCWakJf9z41FVg", "sk--7SMrkAi2uqmA65ggRrrng",
    "sk-Z2_f4qwehv4BsGehlkAPAw", "sk-LPRoYDRWDd9RoV2rHQgguA",
  ],
  Venuses: ["vsk-74a8e42588adde6a5d616cb3d1c5918dc2de61ca6a343ab5"],
  "Z.AI": [
    "1af69356c2e0406599ad41298da78a9c.vRUj1pYqEp3jnLR1",
    "60eb1bd1222845939e414e7bd61eb11f.o0jgQxzud0ZDjbhT",
  ],
  "Stability AI": [
    "sk-rYHrUv8YSMTgJmKEGZZytv4m4KNkguBGdwBW7MI92ANHhgV8",
    "sk-aptUmvCkoomqsoBkHRt4mZ5POEGr9BMPF5HT3A2znC5xdfcl",
  ],
  ElectronHub: [
    "ek-ZP3Gzg95defeyE8qPhXAISRYL9wmSlTkbfB7NLroSdDs0oGtp7",
    "ek-uTpU4v1RGrWZ3PTxGcyeIipf9RrMmeGtTPwOTd0MNyi2BUV2RQ",
    "ek-f0FF46kDWivfsOfhkd8zjMmxbhYPmMzy6ccD1kxvLbEnarl4VO",
  ],
  NagaAI: [
    "ng-iOyAYQPepfyPUQansXhVi8OOc4Y3Gpyx", "ng-ChLMdtixvxOWB5KAV4vBIpw3zLKG4lsF",
    "ng-b5hvgLUHyocLoa5z3bAEb1OReEQDAVy1", "ng-eRB2dRc4c2m98UmOuMpTurdyqweJkAZV",
  ],
  NavyAI: [
    "sk-navy-DI8t-HLiJzHqMs0GDpw60ZsyFLLUsM14sf-1K7Nbc6Y",
    "sk-navy-CwI87b7VoesahtBZJ6HEnIR10gNCfiwbDtcLBRxo4-4",
    "sk-navy-S3Yg4AqoYeFwxvUm9bvYLQhtaOOSDyEqApNZ_bUTgU0",
    "sk-navy-aSMrq1ShhrAAUARGUJdgj6jx2qNRGMvBhKjJLDrKUj4",
    "sk-navy-vJCv-C5q-VIwKq6RhAbZ_GKYuqZrAeYySPI1RXdM4U0",
    "sk-navy-wSMYFr-L4Cyn_OPF-id9MVvCclOT9nQqKjFW-XJacjA",
  ],
  MNN: [
    "mnn-key-iUGP3FRl6YOFW7qrCGRKe5rQg25vs3",
    "mnn-key-1un6NRo5ttvierLLjYkzgTfSUylRUO",
    "mnn-key-mmSv0cU8bhpBxS3pATRelDOiTCeevy",
  ],
  Mistral: [
    "OCcElA8sQOaPNq2l2tvSSujWHoQXaw5M", "pvZ6wPEvCoEsZyLp4e9oCJDjAbtvzioq",
    "BaLmDazo2J8apaYrBD6ngmfTMX9CRQz1", "PbwVsXnmmTgKvBcgYK8CyPXna6KsDH3J",
  ],
};

async function main() {
  for (const [provider, keys] of Object.entries(LEGACY_KEYS)) {
    const res = await fetch(`${GATEWAY_URL}/api/owner/provider-keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OWNER_SECRET}` },
      body: JSON.stringify({ provider, keysText: keys.join("\n") }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      console.log(`✅ ${provider}: ${data.added}/${data.total} key đã thêm`);
    } else {
      console.log(`❌ ${provider}: HTTP ${res.status} — ${JSON.stringify(data)}`);
    }
  }
  console.log("\nXong. Vào Dashboard → Owner → Provider Keys → Test All để kiểm tra.");
}

main();
