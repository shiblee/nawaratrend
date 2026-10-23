// Startup file for cPanel "Setup Node.js App" (Phusion Passenger).
// Passenger loads apps with require(), and this project uses ES modules, so this small
// CommonJS file just imports the real server. Locally you still use `npm run dev`.
import("./src/server.js").catch((err) => {
  console.error("Failed to start the server:", err);
  process.exit(1);
});
