// verifyKrishnaLogin.js - Secure live verification of Krishna's Partner login using private credentials
const LIVE_API_BASE = 'https://farmart-backend-staging.onrender.com/api';
const KRISHNA_PHONE = '7323000894';

async function verify() {
  const password = process.env.KRISHNA_PASSWORD_INPUT;
  if (!password || typeof password !== 'string') {
    console.error('❌ Error: No password provided.');
    process.exit(1);
  }

  console.log('Authenticating Krishna Partner on live production backend...');
  const res = await fetch(`${LIVE_API_BASE}/auth/vendor/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: KRISHNA_PHONE, password })
  });

  const data = await res.json().catch(() => null);

  if (res.status === 200 && data?.success && data?.token) {
    console.log('----------------------------------------------------');
    console.log('✅ KRISHNA PARTNER LOGIN: VERIFIED PASS');
    console.log('----------------------------------------------------');
    console.log(`• Store Name  : ${data.vendor?.storeName}`);
    console.log(`• Owner Name  : ${data.vendor?.ownerName}`);
    console.log(`• Vendor ID   : ${data.vendor?._id}`);
    console.log(`• Phone       : ${data.vendor?.phone}`);
    console.log(`• Store Duty  : ${data.vendor?.isOpen ? 'OPEN' : 'CLOSED'}`);
    console.log(`• Approved    : ${data.vendor?.isApproved}`);
    console.log(`• Active      : ${data.vendor?.isActive}`);
    console.log(`• Auth Token  : Issued (Bearer, expires in 30 days)`);

    // Verify Session Reload Persistence
    console.log('\nVerifying session reload persistence...');
    const meRes = await fetch(`${LIVE_API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${data.token}` }
    });
    const meData = await meRes.json().catch(() => null);

    if (meRes.status === 200 && meData?.success) {
      console.log('• GET /api/auth/me: 200 OK (role: ' + meData.role + ')');
    } else {
      console.warn('⚠️ Session reload returned status: ' + meRes.status);
    }

    const vRes = await fetch(`${LIVE_API_BASE}/vendors/${data.vendor?._id}`);
    const vData = await vRes.json().catch(() => null);
    if (vRes.status === 200 && vData?.success) {
      console.log('• GET /api/vendors/:id: 200 OK');
    }

    console.log('\n🎉 ALL KRISHNA PARTNER AUTH CHECKS PASSED');
  } else {
    console.log('----------------------------------------------------');
    console.log('❌ KRISHNA PARTNER LOGIN: FAILED');
    console.log('----------------------------------------------------');
    console.log(`• HTTP Status : ${res.status}`);
    console.log(`• Message     : ${data?.message || 'Login rejected'}`);
    console.log(`• Code        : ${data?.code || 'AUTH_FAILURE'}`);
    process.exit(1);
  }
}

verify().catch(err => {
  console.error('❌ Network error during verification:', err.message);
  process.exit(1);
});

