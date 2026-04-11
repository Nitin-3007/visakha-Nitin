import axios from 'axios';
import jwt from 'jsonwebtoken';

const PUBLIC_KEYS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

let keysCache: { [key: string]: string } | null = null;
let keysExpiration: number = 0;

export async function getFirebasePublicKeys() {
    if (keysCache && Date.now() < keysExpiration) {
        return keysCache;
    }
    
    try {
        const response = await axios.get(PUBLIC_KEYS_URL);
        keysCache = response.data;
        // Cache for 1 hour
        keysExpiration = Date.now() + 3600 * 1000;
        return keysCache;
    } catch (error) {
        console.error('Error fetching Firebase public keys:', error);
        throw new Error('Could not fetch Firebase public keys');
    }
}

export async function verifyFirebaseToken(token: string) {
    if (!token) throw new Error('No token provided');

    // Decode explicitly to get the header kid
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || !decoded.header || !decoded.header.kid) {
        throw new Error('Invalid token structure');
    }

    const { kid, alg } = decoded.header;
    if (alg !== 'RS256') {
        throw new Error('Invalid algorithm, expected RS256');
    }

    const keys = await getFirebasePublicKeys();
    if (!keys || !keys[kid]) {
        throw new Error('Matching public key not found');
    }

    const publicKey = keys[kid];

    // The audience should be the Firebase project ID
    const projectId = "alchemist-visakha"; 
    
    return new Promise<{ email?: string }>((resolve, reject) => {
        jwt.verify(token, publicKey, {
            algorithms: ['RS256'],
            audience: projectId,
            issuer: `https://securetoken.google.com/${projectId}`
        }, (err, decodedPayload) => {
            if (err) {
                return reject(err);
            }
            resolve(decodedPayload as any);
        });
    });
}
