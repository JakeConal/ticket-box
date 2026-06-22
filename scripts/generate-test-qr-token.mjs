#!/usr/bin/env node

import crypto from 'crypto';

const baseUrl = process.env.BASE_URL || 'http://localhost:8088';
const email = `test-user-${Date.now()}@ticketbox.vn`;
const password = 'password';

// ATSH-HCM-2026 SVIP ticket type ID
const ticketTypeId = '30000000-0000-0000-0001-000000000005'; 

async function run() {
  console.log(`Using backend API at: ${baseUrl}`);

  // 1. Register new user
  console.log(`Registering new user: ${email}...`);
  const registerRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  if (!registerRes.ok) {
    throw new Error(`Registration failed: ${await registerRes.text()}`);
  }

  // 2. Login
  console.log(`Logging in as ${email}...`);
  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  if (!loginRes.ok) {
    throw new Error(`Login failed: ${await loginRes.text()}`);
  }

  const { accessToken } = await loginRes.json();
  console.log('Login successful! Access token obtained.');

  // 2. Enter Waiting Queue (if active)
  console.log('Checking queue status...');
  // ATSH-HCM-2026 concert ID: 20000000-0000-0000-0000-000000000001
  const concertId = '20000000-0000-0000-0000-000000000001';
  
  await fetch(`${baseUrl}/api/queue/${concertId}/enter`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  // 3. Purchase Ticket
  console.log('Initiating ticket purchase...');
  const purchaseRes = await fetch(`${baseUrl}/api/tickets/purchase`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      ticketTypeId,
      quantity: 1,
      paymentProvider: 'VNPAY'
    })
  });

  if (!purchaseRes.ok) {
    throw new Error(`Purchase failed: ${await purchaseRes.ok ? '' : await purchaseRes.text()}`);
  }

  const { orderId, paymentUrl } = await purchaseRes.json();
  console.log(`Purchase order created! Order ID: ${orderId}`);
  console.log(`Payment URL: ${paymentUrl}`);

  // 4. Parse Payment URL parameters
  const urlObj = new URL(paymentUrl);
  const params = {};
  urlObj.searchParams.forEach((val, key) => {
    params[key] = val;
  });

  // 5. Mock Payment Callback Parameters
  params['vnp_ResponseCode'] = '00';
  params['vnp_TransactionStatus'] = '00';
  params['vnp_TransactionNo'] = params['vnp_TxnRef'];
  
  // Exclude existing hash
  delete params['vnp_SecureHash'];
  delete params['vnp_SecureHashType'];

  // 6. Sign callback params using HMAC-SHA512 (default hash secret is "")
  const sortedKeys = Object.keys(params).sort();
  // Match Java's URLEncoder behavior where spaces are '+' (standard query string format)
  const canonicalQuery = sortedKeys
    .map(key => {
      const k = encodeURIComponent(key).replace(/%20/g, '+');
      const v = encodeURIComponent(params[key]).replace(/%20/g, '+');
      return `${k}=${v}`;
    })
    .join('&');

  const secret = process.env.VNPAY_HASH_SECRET || 'dev-vnpay-secret';
  const hash = crypto
    .createHmac('sha512', secret)
    .update(canonicalQuery)
    .digest('hex');

  params['vnp_SecureHash'] = hash;

  // 7. Invoke the Callback
  console.log('Sending mock payment callback to server...');
  const callbackQuery = Object.keys(params)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');

  const callbackRes = await fetch(`${baseUrl}/api/payments/vnpay/callback?${callbackQuery}`);
  if (!callbackRes.ok) {
    throw new Error(`Mock payment callback failed: ${await callbackRes.text()}`);
  }

  console.log('Mock payment callback succeeded! Order is marked PAID.');

  // 8. Fetch QR E-Tickets
  console.log('Fetching e-tickets...');
  const ticketsRes = await fetch(`${baseUrl}/api/orders/${orderId}/tickets`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!ticketsRes.ok) {
    throw new Error(`Failed to fetch tickets: ${await ticketsRes.text()}`);
  }

  const tickets = await ticketsRes.json();
  if (!tickets || tickets.length === 0) {
    throw new Error('No tickets found for this order.');
  }

  console.log('\n==================================================');
  console.log('🎫 VALID TICKET QR CODE TOKEN (JWT):');
  console.log('==================================================\n');
  console.log(tickets[0].qrToken);
  console.log('\n==================================================\n');
}

run().catch(err => {
  console.error('Error running script:', err);
  process.exit(1);
});
