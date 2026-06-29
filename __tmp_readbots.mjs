import Database from "better-sqlite3";
const db = new Database("dev.db");
const bots = db.prepare("SELECT name, minEdge, maxKelly, bankroll, sports, enableCombined, maxComboLegs, systemPrompt FROM Bot").all();
for (const bot of bots) {
  console.log(`\n=== ${bot.name} ===`);
  console.log(`minEdge=${bot.minEdge} maxKelly=${bot.maxKelly} bankroll=${bot.bankroll}`);
  console.log(`sports=${bot.sports} enableCombined=${bot.enableCombined} maxComboLegs=${bot.maxComboLegs}`);
  console.log("PROMPT:", bot.systemPrompt);
}
db.close();
