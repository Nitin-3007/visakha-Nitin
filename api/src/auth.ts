import { verifyFirebaseToken } from './firebaseVerifier.js';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { connectDB } from './db.js';
import crypto from 'crypto';

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
        role: 'super_admin' | 'moderator' | 'viewer' | 'revoked';
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
        const payload = await verifyFirebaseToken(token);

        if (!payload || !payload.email) {
            console.error('Auth Error: Invalid payload from Google');
            return res.status(400).json({ error: 'Invalid token' });
        }

        const email = payload.email;
        console.log(`Login attempt for: ${email}`);

        const db = await connectDB();

        // Check if user is an admin/moderator
        let user = await db.collection('admin_users').findOne({ email });

        if (!user) {
            console.log(`Auto-registering new user: ${email} as viewer`);
            const newUser = {
                email,
                role: 'viewer',
                addedBy: 'auto-registration (Google Sign-In)',
                createdAt: new Date()
            };
            const result = await db.collection('admin_users').insertOne(newUser);
            user = { _id: result.insertedId, ...newUser } as any;
        }

        if (user!.role === 'revoked') {
            return res.status(403).json({ error: 'Your access has been revoked by an administrator.' });
        }

        const verificationToken = crypto.randomBytes(32).toString('hex');
        const originHost = req.headers.origin || 'http://localhost:5173';

        await db.collection('login_verifications').insertOne({
            email: user!.email,
            role: user!.role,
            token: verificationToken,
            status: 'pending',
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15 mins
        });

        const { sendVerificationEmail } = await import('./mailer.js');
        await sendVerificationEmail(user!.email, verificationToken, originHost);

        console.log(`Verification Required: ${email} (${user!.role})`);
        res.json({ requireVerification: true, token: verificationToken, email: user!.email });

    } catch (error: any) {
        console.error('Auth Error during Google verification:', error.message || error);
        console.error('Client ID in environment:', process.env.GOOGLE_CLIENT_ID);
        res.status(401).json({ error: 'Authentication failed', details: error.message || error.toString() });
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

// Verify Login Link Endpoint
export async function verifyLoginLink(req: Request, res: Response) {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token required' });

    try {
        const db = await connectDB();
        const verification = await db.collection('login_verifications').findOne({ token, status: 'pending' });

        if (!verification) {
            return res.status(400).json({ error: 'Invalid or expired verification link' });
        }

        if (new Date() > new Date(verification.expiresAt)) {
            return res.status(400).json({ error: 'Verification link expired' });
        }

        // Generate JWT Token
        const authToken = jwt.sign(
            { email: verification.email, role: verification.role },
            getJwtSecret(),
            { expiresIn: '24h' }
        );

        // Update status and save the token there so checkVerificationStatus can grab it
        await db.collection('login_verifications').updateOne(
            { _id: verification._id },
            { $set: { status: 'verified', authToken, verifiedAt: new Date() } }
        );

        res.json({ success: true, token: authToken, user: { email: verification.email, role: verification.role } });

    } catch (error) {
        console.error('Verify Link Error:', error);
        res.status(500).json({ error: 'Verification failed' });
    }
}

// Check Verification (Polling from the original login tab)
export async function checkVerificationStatus(req: Request, res: Response) {
    const { token } = req.query;
    if (!token || typeof token !== 'string') return res.status(400).json({ error: 'Token required' });

    try {
        const db = await connectDB();
        const verification = await db.collection('login_verifications').findOne({ token });

        if (!verification) {
            return res.status(404).json({ error: 'Verification not found' });
        }

        if (verification.status === 'verified' && verification.authToken) {
            // Once checked successfully, we can delete the record or keep it for logs (here we keep it or delete it later)
            res.json({ verified: true, token: verification.authToken, user: { email: verification.email, role: verification.role } });
        } else {
            res.json({ verified: false });
        }
    } catch (error) {
        console.error('Check Verification Error:', error);
        res.status(500).json({ error: 'Failed to find tracking data' });
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

// Middleware to require Moderator or Super Admin
export function requireModeratorOrAdmin(req: AuthRequest, res: Response, next: NextFunction) {
    if (req.user?.role !== 'super_admin' && req.user?.role !== 'moderator') {
        return res.status(403).json({ error: 'Requires admin or moderator privileges' });
    }
    next();
}

// Middleware to require any team access (Viewer, Moderator, Super Admin)
export function requireTeamAccess(req: AuthRequest, res: Response, next: NextFunction) {
    const validRoles = ['super_admin', 'moderator', 'viewer'];
    if (!req.user?.role || !validRoles.includes(req.user.role)) {
        return res.status(403).json({ error: 'Requires team access privileges' });
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
    const validRoles = ['moderator', 'super_admin', 'viewer'];
    const assignedRole = role && validRoles.includes(role) ? role : 'viewer';

    try {
        const db = await connectDB();

        const existing = await db.collection('admin_users').findOne({ email });
        if (existing) {
            if (existing.role === 'revoked') {
                await db.collection('admin_users').updateOne(
                    { email },
                    { $set: { role: assignedRole, updatedAt: new Date() } }
                );
                const { sendRoleAssignmentEmail } = await import('./mailer.js');
                await sendRoleAssignmentEmail(email, assignedRole);
                return res.json({ success: true, email, role: assignedRole });
            }
            return res.status(400).json({ error: 'User already exists' });
        }

        await db.collection('admin_users').insertOne({
            email,
            role: assignedRole,
            addedBy: req.user?.email,
            createdAt: new Date()
        });
        
        // Dynamically import mailer to avoid circular references or initialization issues
        const { sendRoleAssignmentEmail } = await import('./mailer.js');
        await sendRoleAssignmentEmail(email, assignedRole);

        res.json({ success: true, email, role: assignedRole });
    } catch (err) {
        console.error('Error adding team member:', err);
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

// Revoke Access
export async function revokeAccess(req: AuthRequest, res: Response) {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    if (email === req.user?.email) {
        return res.status(400).json({ error: 'You cannot revoke your own account' });
    }

    try {
        const db = await connectDB();

        const user = await db.collection('admin_users').findOne({ email });
        if (!user) return res.status(404).json({ error: 'User not found' });

        await db.collection('admin_users').updateOne(
            { email },
            { $set: { role: 'revoked', updatedAt: new Date() } }
        );

        res.json({ success: true, message: 'Access revoked' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to revoke access' });
    }
}
