import Stripe from "stripe";
import dotenv from "dotenv";
import nodemailer from "nodemailer"; // Ensure nodemailer is imported
import db from "../config/db.js"; // Ensure the database connection is imported

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// 📌 Create a Payment Intent (for checkout)
export const createPaymentIntent = async (req, res) => {
    try {
        let { amount, appointment_id } = req.body;

        if (!amount || !appointment_id) {
            return res.status(400).json({ error: "Missing amount or booking ID" });
        }

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount * 100,
            currency: "ngn",
            metadata: { appointment_id: appointment_id },
        });

        res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
        console.error("Error creating payment intent:", error);
        res.status(500).json({ error: "Error creating payment intent" });
    }
}; // ✅ FIXED: Removed extra closing bracket

// 📌 Handle Webhook Events
export const handleWebhook = async (req, res) => {
    const signature = req.headers["stripe-signature"];
    let event;
    let email;
    let name;

    try {
        event = stripe.webhooks.constructEvent(
            req.body, // ✅ Using raw body
            signature,
            process.env.WEBHOOK_SECRET
        );

        if (!signature || !event) {
            console.log("⚠️ Webhook verification failed.");
            return res.status(400).send("Invalid webhook signature");
        }
    } catch (err) {
        console.error("❌ Webhook signature verification failed:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    let eventType = event.type;
    let paymentIntent = event.data.object;

    if (eventType === "payment_intent.succeeded") {
        const appointment_id = paymentIntent.metadata.appointment_id;
        const payment_id = paymentIntent.id;
        const amount = paymentIntent.amount / 100;
        const payment_method = paymentIntent.payment_method_types[0];
        const status = paymentIntent.status;

        try {
            // Save payment details to database
            await db.query(
                "INSERT INTO payments (appointment_id, payment_id, payment_method, amount, payment_status) VALUES($1, $2, $3, $4, $5)",
                [appointment_id, payment_id, payment_method, amount, status]
            );
            await db.query("UPDATE appointments SET status ='success' WHERE id = $1", [appointment_id]);

            console.log(`✅ Payment status updated to Confirmed for appointment ${appointment_id}`);

            // Get user details for email notification
            const result = await db.query(
                `SELECT a.id, u.email, u.name
                FROM appointments a 
                JOIN users u ON a.user_id = u.id
                WHERE a.id = $1`,
                [appointment_id]
            );

            if (result.rows.length > 0) {
                email = result.rows[0].email;
                name = result.rows[0].name;
                console.log(email, name);
            } else {
                console.log("⚠️ Missed data: No user found for appointment.");
            }

            // Send Email Notification
            try {
                const transporter = nodemailer.createTransport({
                    service: "gmail",
                    auth: {
                        user: "dhammycool@gmail.com",
                        pass: "wgmk alwf gxck kinh",
                    },
                });

                const mailOptions = {
                    from: "dhammycool@gmail.com",
                    to: email,
                    subject: "Payment Successful - Booking Confirmed",
                    text: `Dear ${name},\n\nYour payment of ₦${amount.toLocaleString()} was successful! Your booking has been confirmed.\n\nThank you!\n\nBest Regards, DJ ROMEO.`,
                };

                await transporter.sendMail(mailOptions);
                console.log("✅ Email sent successfully!");
            } catch (emailError) {
                console.error("❌ Error sending email:", emailError.message);
            }

            res.status(200).json({ received: true });
        } catch (err) {
            console.error("❌ Error processing webhook:", err);
            return res.status(500).json({ error: "Failed to update appointment status" });
        }
    } else if (eventType === "payment_intent.payment_failed") {
        const appointment_id = paymentIntent.metadata.appointment_id;

        await db.query("UPDATE appointments SET status = 'Pending' WHERE id = $1", [appointment_id]);
        res.status(200).json({ success: false, message: "Payment failed", appointment_id });
        return;
    } else {
        console.log(`⚠️ Unhandled event type: ${eventType}`);
        return res.status(400).send("Unhandled event type");
    }
};
















