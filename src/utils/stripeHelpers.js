import stripe from "./stripe";

export const createCheckoutSession = async ({
  stripeCustomerId,
  clinicId,
  userId = null,
  initialProviderCount = 1,
}) => {
  const priceId = process.env.STRIPE_PRICE_TIERED;

  if (!priceId) {
    throw new Error(
      "Stripe price ID not configured. Please set STRIPE_PRICE_TIERED in environment variables.",
    );
  }

  const successUrl = `${process.env.FRONTEND_URL}/subscription-agreement?sessionId={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${process.env.FRONTEND_URL}/signin?payment=canceled`;

  const metadata = {
    clinicId,
    pricingModel: "graduated",
  };

  if (userId) {
    metadata.userId = userId;
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    client_reference_id: clinicId,
    mode: "subscription",
    payment_method_collection: "always",
    line_items: [
      {
        price: priceId,
        quantity: initialProviderCount,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
    metadata,
    subscription_data: {
      metadata: {
        clinicId,
        initialProviderCount,
        pricingModel: "graduated",
      },
    },
  });

  return checkoutSession;
};
