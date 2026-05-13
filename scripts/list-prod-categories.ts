import "dotenv/config";
import { db, sql } from "#/server/db";
import { categories } from "#/server/db/schema";

const rows = await db
	.select({
		id: categories.id,
		name: categories.name,
		active: categories.active,
		routingType: categories.routingType,
	})
	.from(categories)
	.orderBy(categories.name);

for (const r of rows) {
	console.log(r.active ? "✓" : "·", JSON.stringify(r.name), r.routingType);
}
await sql.end();
