import { createLogger, format, transports } from "winston";

const logger = createLogger({
    level: "info",
    format: format.combine(
        format.timestamp(),
        format.json()
    ),
    transports: [
        new transports.File({ filename: "security.log" }),  // Save to file
        new transports.Console(), 
    ],
});

export default logger; 