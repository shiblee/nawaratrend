// must be the first import: modules imported below read process.env as soon as they load
import "dotenv/config";

import app from "./app.js";
import { testConnection } from "./config/db.js";
import { startEmailWorker } from "./lib/email/index.js";
import { startCleanup } from "./lib/cleanup.js";

const PORT = process.env.PORT || 5050;

// Sign-in tokens are only as safe as this secret: refuse to start with a missing or weak one.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || /change_this/i.test(process.env.JWT_SECRET)) {
  console.error("JWT_SECRET in server/.env is missing or too weak. Set it to a long random value (see .env.example).");
  process.exit(1);
}

testConnection()
  .then(() => {
    console.log("MySQL connected");
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
    startEmailWorker();   // sends queued emails and retries failed ones
    startCleanup();       // expires abandoned sign-ups and removes old logs
  })
  .catch((error) => {
    console.error("Failed to connect to MySQL:", error.message);
    process.exit(1);
  });
