import "dotenv/config";
import db from "../src/models";

function normalizeJsonField(val) {
  if (val == null) return null;
  if (typeof val === "object") return JSON.stringify(val);
  if (typeof val !== "string") return String(val);
  let cur = val;
  for (let i = 0; i < 5; i += 1) {
    try {
      const parsed = JSON.parse(cur);
      if (typeof parsed === "string") {
        cur = parsed;
      } else {
        return JSON.stringify(parsed);
      }
    } catch (e) {
      return cur;
    }
  }
  return cur;
}

async function main() {
  const templateId = process.argv[2] || "10a1c227-e6ea-412e-b31f-8e64f2497b39";
  const qs = await db.TemplateQuestion.findAll({ where: { templateId } });
  let fixed = 0;
  for (const q of qs) {
    const nextOptions = normalizeJsonField(q.options);
    const nextShow = normalizeJsonField(q.showCondition);
    const changes = {};
    if (nextOptions !== q.options) changes.options = nextOptions;
    if (nextShow !== q.showCondition) changes.showCondition = nextShow;
    if (Object.keys(changes).length) {
      await q.update(changes);
      fixed += 1;
    }
  }
  console.log(`fixed ${fixed} of ${qs.length}`);
  const sample = await db.TemplateQuestion.findOne({
    where: { templateId, questionIdentifier: "surgeries-yes" },
  });
  if (sample) {
    console.log("sample options starts:", String(sample.options).slice(0, 100));
  }
  await db.sequelize.close();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await db.sequelize.close();
  } catch (e) {
    // ignore
  }
  process.exit(1);
});
