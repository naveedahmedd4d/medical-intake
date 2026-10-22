const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

const onboardingData = {
  clinic: {
    clinicName: 'Test Clinic Auto',
    practiceType: 'General Practice',
  },
  admin: {
    email: `clinic@example.com`, // Unique email each time
    password: 'Test@123', // Must meet validation: uppercase, lowercase, number, special char
    firstName: 'John',
    lastName: 'Doe',
    phone: '555-123-4567',
  },
  locations: [
    {
      addressLine1: '123 Main Street',
      addressLine2: 'Suite 100',
      city: 'Los Angeles',
      state: 'CA',
      zipCode: '90001',
      phone: '555-987-6543',
    },
  ],
  payment: {
    planType: 'starter', // Options: 'starter', 'professional', 'enterprise'
  },
};

async function initiateOnboarding() {
  try {
    console.log('🚀 Initiating clinic onboarding...\n');
    console.log('Request Data:');
    console.log(JSON.stringify(onboardingData, null, 2));
    console.log(`\n${'='.repeat(80)}\n`);

    const response = await fetch(`${API_BASE_URL}/api/clinics/onboarding/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(onboardingData),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Error initiating onboarding:\n');
      console.error('Status:', response.status);
      console.error('Response Data:');
      console.error(JSON.stringify(data, null, 2));
      process.exit(1);
    }

    console.log('✅ Success! Onboarding initiated.\n');
    console.log('Response Data:');
    console.log(JSON.stringify(data, null, 2));
    console.log(`\n${'='.repeat(80)}\n`);

    if (data?.data?.checkoutUrl) {
      console.log('🔗 CHECKOUT URL:');
      console.log(data.data.checkoutUrl);
      console.log('\n');
      console.log('📋 Clinic Details:');
      console.log(`   - Clinic ID: ${data.data.clinic.id}`);
      console.log(`   - Clinic Name: ${data.data.clinic.clinicName}`);
      console.log(`   - Subscription Status: ${data.data.clinic.subscriptionStatus}`);
      console.log(`   - Trial Ends At: ${data.data.clinic.trialEndsAt}`);
      console.log(`   - Selected Plan: ${data.data.clinic.selectedPlan}`);
      console.log('\n');
      console.log('💳 Payment Details:');
      console.log(`   - Stripe Customer ID: ${data.data.stripeCustomerId}`);
      console.log(`   - Checkout Session ID: ${data.data.checkoutSessionId}`);
      console.log('\n');
      console.log('👉 Open the checkout URL in your browser to complete payment registration.');
    }
  } catch (error) {
    console.error('❌ Error initiating onboarding:\n');
    console.error('Error:', error.message);
    console.error('\nIs the backend running on', API_BASE_URL, '?');
    process.exit(1);
  }
}

// Run the script
initiateOnboarding();
