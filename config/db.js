import env from "dotenv";
env.config();

import pg from "pg";

const db= new pg.Client({
    user:process.env.PG_USER,
    host:process.env.PG_HOST,
    database:process.env.PG_DATABASE,
    password:process.env.PG_PASSWORD,
    port:process.env.PG_PORT,
});


(async () => {
    try {
      await db.connect();
      console.log("Database connected successfully.");
    } catch (error) {
      console.error("Database connection error:", error);
      process.exit(1);
    }
  })();

export default db;