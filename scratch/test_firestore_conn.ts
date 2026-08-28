import fs from "fs";
import path from "path";

// Load .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.substring(0, eqIdx).trim();
      let val = trimmed.substring(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

import { getFirestoreDb } from "../lib/firebaseAdmin";

async function test() {
  console.log("Testing Firestore connection with project:", process.env.FIREBASE_PROJECT_ID);
  console.log("Client email:", process.env.FIREBASE_CLIENT_EMAIL);
  const db = getFirestoreDb();
  console.log("Got Firestore DB instance. Listing collections...");
  const collections = await db.listCollections();
  console.log("Collections in Firestore:", collections.map(c => c.id));
}

test().then(() => {
  console.log("Firestore connection test finished successfully!");
  process.exit(0);
}).catch(e => {
  console.error("Error connecting to Firestore:", e);
  process.exit(1);
});
