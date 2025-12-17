import express from 'express'
import stripe from 'stripe'
import { ObjectId } from 'mongodb'
import { getDB } from '../config/db.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()
const stripeInstance = stripe(process.env.STRIPE_SECRET_KEY)

// Create checkout session
router.post('/create-checkout-session', authenticateToken, async (req, res) => {
  try {
    const { email, userId } = req.body

    if (!email || !userId) {
      return res.status(400).json({ error: 'Email and userId are required' })
    }

    const session = await stripeInstance.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'bdt',
            product_data: {
              name: 'Digital Life Lessons - Premium Plan',
              description: 'Lifetime access to premium features including unlimited lessons, ad-free experience, and priority support',
              images: ['https://img.icons8.com/fluency/96/000000/premium.png'],
            },
            unit_amount: 150000, // ৳1500 in cents (BDT)
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/payment/cancel?reason=cancelled`,
      customer_email: email,
      metadata: {
        userId,
        email,
      },
    })

    res.json({ url: session.url, sessionId: session.id })
  } catch (error) {
    console.error('Stripe checkout error:', error)
    res.status(500).json({ error: error.message })
  }
})

// Verify payment and update user premium status
router.post('/verify-payment', authenticateToken, async (req, res) => {
  const { sessionId } = req.body
  const db = getDB()
  const usersCollection = db.collection('users')
  
  try {
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'Session ID is required' })
    }

    // Retrieve session from Stripe
    const session = await stripeInstance.checkout.sessions.retrieve(sessionId)
    const paymentIntent = session.payment_intent
      ? await stripeInstance.paymentIntents.retrieve(session.payment_intent)
      : null
    
    const userId = session.metadata?.userId
    const userEmail = session.metadata?.email

    // Check if payment is completed and paid (fallback to payment intent status)
    const isPaid = session.payment_status === 'paid' || paymentIntent?.status === 'succeeded'
    const isPending = ['processing', 'requires_action'].includes(session.payment_status) 
      || ['processing', 'requires_action'].includes(paymentIntent?.status)
    const isFailed = ['unpaid', 'canceled', 'expired'].includes(session.payment_status)
      || ['requires_payment_method', 'canceled'].includes(paymentIntent?.status)

    if (isPending) {
      // Payment is still being confirmed by Stripe; let client poll instead of failing immediately
      console.log(`⌛ Payment pending. User: ${userEmail}, Session status: ${session.payment_status}, PaymentIntent: ${paymentIntent?.status}`)
      return res.status(202).json({ success: false, pending: true, status: session.payment_status, intentStatus: paymentIntent?.status })
    }

    if (!isPaid) {
      // Payment not completed
      console.log(`⚠ Payment verification failed - not paid. User: ${userEmail}, Session status: ${session.payment_status}, PaymentIntent: ${paymentIntent?.status}`)

      if (isFailed && (userId || userEmail)) {
        // Explicit failure: clear premium flags
        const filter = userId && ObjectId.isValid(userId) 
          ? { _id: new ObjectId(userId) } 
          : { email: userEmail }

        await usersCollection.updateOne(
          filter,
          {
            $set: {
              isPremium: false,
              paymentStatus: 'failed',
              lastPaymentAttempt: new Date(),
              stripeSessionId: sessionId
            }
          }
        )
      }

      return res.status(400).json({ success: false, error: 'Payment not completed', status: session.payment_status, intentStatus: paymentIntent?.status })
    }

    if (!userId && !userEmail) {
      return res.status(400).json({ success: false, error: 'User info not found in session metadata' })
    }

    // Payment is successful - Update user in MongoDB to set isPremium to true
    const idFilter = ObjectId.isValid(userId) ? { _id: new ObjectId(userId) } : null

    const result = idFilter
      ? await usersCollection.findOneAndUpdate(
          idFilter,
          { 
            $set: { 
              isPremium: true, 
              premiumActivatedAt: new Date(),
              stripeSessionId: sessionId,
              paymentStatus: 'paid'
            } 
          },
          { returnDocument: 'after' }
        )
      : { value: null }

    if (!result.value) {
      // If not found by ID, try by email
      const emailResult = await usersCollection.findOneAndUpdate(
        { email: userEmail },
        { 
          $set: { 
            isPremium: true, 
            premiumActivatedAt: new Date(),
            stripeSessionId: sessionId,
            paymentStatus: 'paid'
          } 
        },
        { returnDocument: 'after' }
      )

      if (!emailResult.value) {
        return res.status(404).json({ success: false, error: 'User not found' })
      }

      console.log(`✓ User ${userEmail} upgraded to premium via verify-payment`)
      return res.json({ success: true, user: emailResult.value })
    }

    console.log(`✓ User ${userEmail} upgraded to premium via verify-payment`)
    res.json({ success: true, user: result.value })
  } catch (error) {
    console.error('Payment verification error:', error)
    
    res.status(500).json({ success: false, error: error.message })
  }
})

// Webhook endpoint for Stripe events (recommended for production)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature']
  let event

  try {
    event = stripeInstance.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  // Handle specific events
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    const userId = session.metadata?.userId
    const userEmail = session.metadata?.email

    // Only update if payment was successful
    if (session.payment_status === 'paid') {
      try {
        const db = getDB()
        const usersCollection = db.collection('users')

        // Update user to premium in MongoDB (single source of truth)
        const filter = userId && ObjectId.isValid(userId) 
          ? { _id: new ObjectId(userId) } 
          : { email: userEmail }

        const result = await usersCollection.updateOne(
          filter,
          { 
            $set: { 
              isPremium: true, 
              premiumActivatedAt: new Date(),
              stripeSessionId: session.id,
              paymentStatus: 'paid'
            } 
          }
        )

        if (result.modifiedCount > 0) {
          console.log(`✓ User ${userEmail} upgraded to premium via webhook`)
        } else {
          console.warn(`⚠ User ${userEmail} not found for premium upgrade`)
        }
      } catch (err) {
        console.error('Error updating user premium status:', err)
        // Don't fail the webhook - Stripe will retry
      }
    } else {
      // Payment not completed - ensure isPremium stays false
      console.log(`⚠ Payment not completed for session ${session.id}. Status: ${session.payment_status}`)
    }
  }

  // Handle payment failures - ensure isPremium is false
  if (event.type === 'checkout.session.expired' || event.type === 'payment_intent.payment_failed') {
    const session = event.data.object
    const userId = session.metadata?.userId
    const userEmail = session.metadata?.email || session.customer_email
    
    try {
      const db = getDB()
      const usersCollection = db.collection('users')

      // Ensure isPremium is false for failed payments
      const filter = userId && ObjectId.isValid(userId) 
        ? { _id: new ObjectId(userId) } 
        : { email: userEmail }

      await usersCollection.updateOne(
        filter,
        { 
          $set: { 
            isPremium: false,
            paymentStatus: event.type === 'checkout.session.expired' ? 'expired' : 'failed',
            lastPaymentAttempt: new Date()
          } 
        }
      )

      console.log(`✓ Payment failed/expired for user: ${userEmail} - isPremium set to false`)
    } catch (err) {
      console.error('Error updating failed payment status:', err)
    }
  }

  res.json({ received: true })
})

export default router
