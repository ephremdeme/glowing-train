import { createHs256Jwt } from '../packages/auth/src/jwt.js';

async function run() {
    const secret = process.env.AUTH_JWT_SECRET ?? 'dev-jwt-secret-change-me';
    const issuer = process.env.AUTH_JWT_ISSUER ?? 'cryptopay-internal';
    const audience = process.env.AUTH_JWT_AUDIENCE ?? 'cryptopay-services';

    const now = Math.floor(Date.now() / 1000);
    const token = createHs256Jwt(
        {
            sub: 'sim-trigger',
            iss: issuer,
            aud: audience,
            iat: now,
            exp: now + 3600,
            tokenType: 'service'
        },
        secret
    );

    const payoutId = process.argv[2] ?? 'pay_0e4e79f6-f651-42ff-95cb-7e6ee57b8ee9';
    const providerReference = process.argv[3] ?? `bank_ref_payout:initiate:auto-payout:tr_d42cafff-0e3b-430f-8ce5-ddb63b3264e7`;
    const status = (process.argv[4] ?? 'completed') as 'completed' | 'failed';

    console.log(`Triggering status-callback for payout: ${payoutId} → ${status}`);

    const res = await fetch('http://127.0.0.1:13003/internal/v1/payouts/status-callback', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ payoutId, providerReference, status })
    });

    const body = await res.text();
    console.log('Response Status:', res.status);
    console.log('Response Body:', body);
}

run().catch(console.error);
