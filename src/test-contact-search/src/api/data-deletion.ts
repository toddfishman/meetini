import express from 'express';
import crypto from 'crypto';

const router = express.Router();

// Verify the request is from Facebook
function verifySignedRequest(signedRequest: string, appSecret: string) {
    const [encodedSig, payload] = signedRequest.split('.');
    
    // Decode the payload
    const data = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    
    // Check if the algorithm is HMAC-SHA256
    if (data.algorithm !== 'HMAC-SHA256') {
        throw new Error('Unknown algorithm: ' + data.algorithm);
    }
    
    // Check signature
    const expectedSig = crypto
        .createHmac('sha256', appSecret)
        .update(payload)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
    
    if (encodedSig !== expectedSig) {
        throw new Error('Invalid signature');
    }
    
    return data;
}

router.post('/facebook-deletion', async (req, res) => {
    try {
        const signedRequest = req.body.signed_request;
        const appSecret = process.env.VITE_FACEBOOK_APP_SECRET;

        if (!signedRequest || !appSecret) {
            throw new Error('Missing required parameters');
        }

        const data = verifySignedRequest(signedRequest, appSecret);

        // Here you would implement the actual data deletion logic
        // For example:
        // await deleteUserData(data.user_id);

        // Respond with confirmation URL
        res.json({
            url: `https://meetini.ai/privacy-policy.html#data-deletion-confirmation`,
            confirmation_code: data.user_id
        });
    } catch (error) {
        console.error('Data deletion error:', error);
        res.status(400).json({ error: 'Invalid request' });
    }
});
