// Load .env before any module (e.g. the encryption util) reads process.env at import time.
import "dotenv/config";
import app from "./app.js";
import { purgeExpiredShares } from "./integration/Abha/share/share.service.js";

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Shared profiles are personal data: delete the unclaimed, expired ones even when no staff screen is open.
const purge = () => purgeExpiredShares().catch((error: unknown) => console.error("Purging expired shares failed", error instanceof Error ? error.message : error));
void purge();
setInterval(purge, 10 * 60 * 1000).unref();
