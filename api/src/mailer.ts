import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Create a transporter using environment variables
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

export const sendRoleAssignmentEmail = async (toEmail: string, role: string) => {
    try {
        if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
            console.warn('⚠️ SMTP credentials are not set. Skipping sending role assignment email.');
            return;
        }

        const roleName = role === 'super_admin' ? 'Super Admin' : role.charAt(0).toUpperCase() + role.slice(1);
        
        const mailOptions = {
            from: process.env.SMTP_FROM || `"Alchemist Admin" <${process.env.SMTP_USER}>`, // sender address
            to: toEmail, // list of receivers
            subject: `Welcome to Alchemist! You have been granted ${roleName} access.`, // Subject line
            text: `Hello,\n\nYou have been granted access to Alchemist with the role of: ${roleName}.\n\nYou can now log in to the application to start exploring.\n\nBest regards,\nThe Alchemist Team`, // plain text body
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <h2 style="color: #4F46E5;">Welcome to Alchemist!</h2>
                    <p>Hello,</p>
                    <p>You have been granted access to Alchemist with the role of: <strong>${roleName}</strong>.</p>
                    <p>You can now log in to the application dashboard and start exploring your new capabilities.</p>
                    <br/>
                    <p>Best regards,<br/><strong>The Alchemist Team</strong></p>
                </div>
            `, // html body
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`Email sent successfully to ${toEmail}: ${info.messageId}`);
    } catch (error) {
        console.error('Error sending email:', error);
    }
};

export const sendVerificationEmail = async (toEmail: string, verificationToken: string, originHost: string) => {
    try {
        if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
            console.warn('⚠️ SMTP credentials are not set. Skipping sending verification email.');
            return;
        }

        const verifyUrl = `${originHost}/verify-login?token=${verificationToken}`;

        const mailOptions = {
            from: `"Alchemist Interface" <${process.env.SMTP_USER}>`, // sender address
            to: toEmail, // list of receivers
            subject: `Verify Your Login - Alchemist`, // Subject line
            text: `Hello,\n\nPlease verify your login to the Alchemist interface by clicking the following link:\n\n${verifyUrl}\n\nIf you did not request this, please ignore this email.\n\nBest regards,\nThe Alchemist Team`, // plain text body
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-w-[600px] margin: 0 auto;">
                    <h2 style="color: #4F46E5;">Alchemist Interface Login Verification</h2>
                    <p>Hello,</p>
                    <p>Please click the button below to verify your login and proceed to the interface.</p>
                    <div style="margin: 30px 0;">
                        <a href="${verifyUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Verify Login</a>
                    </div>
                    <p>Or alternatively, copy and paste this link into your browser:</p>
                    <p><a href="${verifyUrl}">${verifyUrl}</a></p>
                    <p>If you did not request this login, you can safely ignore this email.</p>
                    <br/>
                    <p>Best regards,<br/><strong>The Alchemist Team</strong></p>
                </div>
            `, // html body
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`Verification Email sent successfully to ${toEmail}: ${info.messageId}`);
    } catch (error) {
        console.error('Error sending verification email:', error);
        throw error;
    }
};

export const sendSpikeAlertEmail = async (toEmail: string, count: number, timeframe: string) => {
    try {
        if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
            console.warn('⚠️ SMTP credentials are not set. Skipping sending spike alert email.');
            return;
        }

        const mailOptions = {
            from: process.env.SMTP_FROM || `"Alchemist Admin" <${process.env.SMTP_USER}>`,
            to: toEmail,
            subject: `⚠️ Alert: Negative Feedback Spike Detected`,
            text: `Hello,\n\nOur system detected a spike in negative feedback.\nThere were ${count} "Thumbs Down" ratings in the last ${timeframe}.\n\nPlease check the Knowledge Curation dashboard to review these queries.\n\nBest regards,\nThe Alchemist System`,
            html: `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <h2 style="color: #DC2626;">⚠️ Negative Feedback Spike</h2>
                    <p>Hello,</p>
                    <p>Our system has detected an unusual amount of negative feedback.</p>
                    <p>There were <strong>${count}</strong> "Thumbs Down" ratings logged in the last <strong>${timeframe}</strong>.</p>
                    <p>Please log in and check the Knowledge Curation dashboard to review these failed queries and add Golden Knowledge to resolve them.</p>
                    <br/>
                    <p>Best regards,<br/><strong>The Alchemist System</strong></p>
                </div>
            `,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`Alert Email sent successfully to ${toEmail}: ${info.messageId}`);
    } catch (error) {
        console.error('Error sending alert email:', error);
    }
};
