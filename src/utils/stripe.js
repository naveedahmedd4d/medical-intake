import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-10-28.acacia',
  maxNetworkRetries: 3,
  timeout: 30000,
});

export default stripe;
