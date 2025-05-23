import Stripe from "stripe";
import dotenv from "dotenv";
import nodemailer from "nodemailer"; 
import pool from "../config/db.js"; 
import logger from "../middlewares/logger.js";
import axios from "axios";



dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);


// stripe payment intent
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

        res.json({ 
            clientSecret: paymentIntent.client_secret,
            publishableKey:process.env.STRIPE_PUBLISHABLE_KEY
         });
    } catch (error) {
        logger.info("Error creating payment intent:", error);
        res.status(500).json({ error: "Error creating payment intent" });
    }
}; 

// paystack back end

export const paystackTrans= ("/paystack/create-transaction", async (req, res) => {
  const { amount, email, appointment_id } = req.body;

  try {
    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        amount: amount * 100, 
        email,
        metadata: {
          appointment_id,
        },
        callback_url: "https://dj-romeo.onrender.com/get/payment-success-receipt",
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({ url: response.data.data.authorization_url });
  } catch (err) {
    console.error("Paystack init error", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to initiate Paystack transaction" });
  }
});


// stripe webhook
export const handleWebhook = async (req, res) => {
   
    const signature = req.headers["stripe-signature"];
    let event;
    let email;
    let name;

    try {
        event = stripe.webhooks.constructEvent(
            req.body, 
            signature,
            process.env.WEBHOOK_SECRET
        );

        if (!signature || !event) {
            logger.info(" Webhook verification failed.");
            return res.status(400).send("Invalid webhook signature");
        }
    } catch (err) {
        logger.info(" Webhook signature verification failed:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }


    let eventType = event.type;
    let paymentIntent = event.data.object;

    const appointment_id = paymentIntent.metadata?.appointment_id;  
    const payment_id = paymentIntent.id;
    const amount = paymentIntent.amount / 100;
    const payment_method = paymentIntent.payment_method_types[0];
    const status = paymentIntent.status;

    if (!appointment_id) {
        logger.info("No appointment ID found in metadata!");
        return res.status(400).send("Missing appointment_id in metadata");
    }


    if (eventType === "payment_intent.succeeded") {
        const appointment_id = paymentIntent.metadata.appointment_id;
        const payment_id = paymentIntent.id;
        const amount = paymentIntent.amount / 100;
        const payment_method = paymentIntent.payment_method_types[0];
        const status = paymentIntent.status;

        try {

            const exist= await pool.query("SELECT * FROM payments WHERE payment_id=$1",[payment_id]);
            if(exist.rows.length>0){
                logger.info("Payment already inserted, check other codes");
                res.status(200).send({success:true});
            }
            
            await pool.query(
                "INSERT INTO payments (appointment_id, payment_id, payment_method, amount, payment_status) VALUES($1, $2, $3, $4, $5)",
                [appointment_id, payment_id, payment_method, amount, status]
            );

            logger.info("payment inserted successfully");
            
            await pool.query("UPDATE appointments SET status ='success' WHERE id = $1", [appointment_id]);

            logger.info(`Payment status updated to Confirmed for appointment ${appointment_id}`);

            const result = await pool.query(
                `SELECT a.id, u.email, u.name
                FROM appointments a 
                JOIN users u ON a.user_id = u.id
                WHERE a.id = $1`,
                [appointment_id]
            );

            if (result.rows.length > 0) {
                email = result.rows[0].email;
                name = result.rows[0].name;
                logger.info(email, name);
            } else {
                logger.info(" Missed data: No user found for appointment.");
            }

            
            try {
                const transporter = nodemailer.createTransport({
                    service: process.env.SERVICE,
                    auth: {
                        user: process.env.USER_EMAIL,
                        pass: process.env.USER_PASS,
                    },
                });

                const mailOptions = {
                    from: process.env.EMAIL_SOURCE,
                    to: email,
                    subject: "Payment Successful - Booking Confirmed",
                    text: `Dear ${name},\n\nYour payment of ₦${amount.toLocaleString()} was successful! Your booking has been confirmed.\n\nThank you!\n\nBest Regards, DJ ROMEO.`,
                };

                await transporter.sendMail(mailOptions);
                  logger.info(" Email sent successfully!");
            } catch (emailError) {
                logger.info(" Error sending email:", emailError.message);
            }

            res.status(200).json({ received: true });
        } catch (err) {
            logger.info(" Error processing webhook:", err);
            return res.status(500).json({ error: "Failed to update appointment status" });
        }
    } else if (eventType === "payment_intent.payment_failed") {
        const appointment_id = paymentIntent.metadata.appointment_id;

        await pool.query("UPDATE appointments SET status = 'Pending' WHERE id = $1", [appointment_id]);
        res.status(200).json({ success: false, message: "Payment failed", appointment_id });
        return;
    } else {
        logger.info(` Unhandled event type: ${eventType}`);
        return res.status(400).send("Unhandled event type");
    }
};


export default stripe;