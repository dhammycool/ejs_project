import env from "dotenv";
import pg from "pg";
import logger from "../middlewares/logger.js"


env.config();




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
      logger.info("Database connected successfully.");
    } catch (error) {
      logger.info("Database connection error:", error);
      process.exit(1);
    }
  })();

export default db;