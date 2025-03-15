import express from "express";
import { createPaymentIntent, handleWebhook } from "../controllers/paymentController.js";

const router = express.Router();

// Payment Intent Route
router.post("/create-payment-intent", express.json(), createPaymentIntent);

// Webhook Route (must use raw body)
router.post("/webhook", express.raw({ type: "application/json" }), handleWebhook);

export default router;