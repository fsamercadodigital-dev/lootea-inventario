import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const file = process.env.INVENTORY_DB_PATH || path.join(process.cwd(), "data", "inventory.db");
const db = new DatabaseSync(file);
const profiles = db
  .prepare(
    "select id from profiles where record_number = 990001 or display_name = 'TESTE-NAO-USAR'",
  )
  .all();
const bms = db
  .prepare("select id from bms where name = 'TESTE-NAO-USAR' or meta_bm_id = '990001990001990'")
  .all();

db.exec("begin");
for (const profile of profiles) {
  db.prepare("delete from secret_fields where profile_id = ?").run(profile.id);
  db.prepare("delete from email_providers where profile_id = ?").run(profile.id);
  db.prepare("delete from profile_bms where profile_id = ?").run(profile.id);
  db.prepare("delete from profiles where id = ?").run(profile.id);
}
for (const bm of bms) {
  db.prepare("delete from profile_bms where bm_id = ?").run(bm.id);
  db.prepare("delete from bms where id = ?").run(bm.id);
}
db.exec("commit");
console.log(`perfis removidos: ${profiles.length}`);
console.log(`bms removidos: ${bms.length}`);
db.close();
