import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { connectDB } from './db.js';

// Initialize these lazily to ensure environment variables are loaded
let _client: OAuth2Client | null = null;

function getGoogleClient() {
    const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    if (!CLIENT_ID || CLIENT_ID === 'your-client-id.apps.googleusercontent.com') {
        console.warn('⚠️ WARNING: GOOGLE_CLIENT_ID is not set or using placeholder value.');
    }
    if (!_client) {
        _client = new OAuth2Client(CLIENT_ID);
    }
    return _client;
}

function getJwtSecret() {
    const secret = process.env.JWT_SECRET || 'your-secret-key';
    if (secret === 'your-secret-key') {
        console.warn('⚠️ WARNING: JWT_SECRET is using the default insecure key!');
    }
    return secret;
}

export interface AuthRequest extends Request {
    user?: {
        email: string;
        role: 'super_admin' | 'moderator';
    };
}

// Seed Super Admin
export async function seedSuperAdmin() {
    const db = await connectDB();
    const email = 'nitinsankararunsankar@gmail.com';

    const existing = await db.collection('admin_users').findOne({ email });
    if (!existing) {
        console.log(`Seeding Super Admin: ${email}`);
        await db.collection('admin_users').insertOne({
            email,
            role: 'super_admin',
            addedBy: 'system',
            createdAt: new Date()
        });
    }
}

// Verify Google Token and Login
export async function googleLogin(req: Request, res: Response) {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });

    try {
        const client = getGoogleClient();
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID || '',
        });
        const payload = ticket.getPayload();

        if (!payload || !payload.email) {
            console.error('Auth Error: Invalid payload from Google');
            return res.status(400).json({ error: 'Invalid token' });
        }

        const email = payload.email;
        console.log(`Login attempt for: ${email}`);

        const db = await connectDB();

        // Check if user is an admin/moderator
        const user = await db.collection('admin_users').findOne({ email });

        if (!user) {
            console.warn(`Access Denied: ${email} is not in admin_users collection`);
            return res.status(403).json({ error: 'Access denied. Not an authorized user.' });
        }

        // Generate JWT
        const authToken = jwt.sign(
            { email: user.email, role: user.role },
            getJwtSecret(),
            { expiresIn: '24h' }
        );

        console.log(`Auth Successful: ${email} (${user.role})`);
        res.json({ token: authToken, user: { email: user.email, role: user.role } });

    } catch (error: any) {
        console.error('Auth Error during Google verification:', error.message || error);
        res.status(401).json({ error: 'Authentication failed', details: error.message });
    }
}

// Dev Login (Bypass Google Auth)
export async function devLogin(req: Request, res: Response) {
    if (process.env.NODE_ENV === 'production') {
        return res.status(403).json({ error: 'Dev login not available in production' });
    }

    const email = 'nitinsankararunsankar@gmail.com';

    try {
        const db = await connectDB();
        let user = await db.collection('admin_users').findOne({ email });

        if (!user) {
            // seed if missing (failsafe)
            await seedSuperAdmin();
            user = await db.collection('admin_users').findOne({ email });
        }

        if (!user) {
            return res.status(500).json({ error: 'Failed to find or seed super admin' });
        }

        const authToken = jwt.sign(
            { email: user.email, role: user.role },
            getJwtSecret(),
            { expiresIn: '24h' }
        );

        res.json({ token: authToken, user: { email: user.email, role: user.role } });

    } catch (error) {
        console.error('Dev Auth Error:', error);
        res.status(500).json({ error: 'Dev authentication failed' });
    }
}

// Middleware to verify JWT
export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, getJwtSecret(), (err: any, user: any) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
}

// Middleware to require Super Admin
export function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction) {
    if (req.user?.role !== 'super_admin') {
        return res.status(403).json({ error: 'Requires Super Admin privileges' });
    }
    next();
}

// Get Team Members (Moderators & Super Admins)
export async function getModerators(req: Request, res: Response) {
    try {
        const db = await connectDB();
        // Fetch all admin users
        const members = await db.collection('admin_users').find({}).toArray();
        res.json(members);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch team members' });
    }
}

// Add Team Member
export async function addModerator(req: AuthRequest, res: Response) {
    const { email, role } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    // Validate role
    const validRoles = ['moderator', 'super_admin'];
    const assignedRole = role && validRoles.includes(role) ? role : 'moderator';

    try {
        const db = await connectDB();

        const existing = await db.collection('admin_users').findOne({ email });
        if (existing) return res.status(400).json({ error: 'User already exists' });

        await db.collection('admin_users').insertOne({
            email,
            role: assignedRole,
            addedBy: req.user?.email,
            createdAt: new Date()
        });

        res.json({ success: true, email, role: assignedRole });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add member' });
    }
}

// Remove Team Member
export async function removeModerator(req: AuthRequest, res: Response) {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    // Prevent self-deletion
    if (email === req.user?.email) {
        return res.status(400).json({ error: 'You cannot remove your own account' });
    }

    try {
        const db = await connectDB();

        // Check if user exists first
        const user = await db.collection('admin_users').findOne({ email });
        if (!user) return res.status(404).json({ error: 'User not found' });

        await db.collection('admin_users').deleteOne({ email });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to remove member' });
    }
}
