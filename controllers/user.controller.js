const User = require('../models/user.model');
const { setUser } = require('../helpers/jwt.helper');
const sendMail = require('../helpers/mail.helper');
const crypto = require('crypto');
const asyncHandler = require("express-async-handler");

const validUserTypes = ["Admin", "Teacher", "Convenor"];


const signup = asyncHandler(async (req, res) => {
    const { name, email, phone_number, password, user_type} = req.body;
    const otp = crypto.randomInt(100000, 999999).toString();
    try {
        if (!validUserTypes.includes(user_type)) {
            return res.status(400).json({ status: false, message: 'Invalid user type. Must be Admin, Teacher, or Convenor.' });
        }
        // Check if the user with the given email already exists and is verified
        const existingUser = await User.findOne({ email, verified: true });
        if (existingUser) {
            return res.status(400).json({ status: false, message: 'User already exists with this email.' });
        }

        // Check if the user with the given phone number already exists and is verified
        const existingUser2 = await User.findOne({ phone_number, verified: true });
        if (existingUser2) {
            return res.status(400).json({ status: false, message: 'User already exists with this phone number.' });
        }

        let user;
        const newUser = await User.findOne({ email, verified: false });

        if (!newUser) {
            user = await User.create({ name,email,phone_number,user_type, password, otp });
        } else {
            newUser.name=name;
            newUser.user_type=user_type;
            newUser.phone_number = phone_number;
            newUser.otp = otp;
            newUser.password = password;
            await newUser.save();
            user = newUser;
        }
        
        const mailStatus = await sendMail('PCTE Koshish Planning: Your OTP Code', email, `Your OTP code is ${otp}`);
        if (mailStatus) {
            res.status(201).json({ status: true, message: 'Verification is Needed!', user });
        } else {
            res.status(500).json({ status: false, message: 'Failed to send OTP.' });
        }
    } catch (error) {
        console.log(error);
        res.status(500).json({ status: false, message: 'Internal Server Error' });
    }
});

const login = asyncHandler(async (req, res) => {
    const { email, password,user_type} = req.body;

    try {
        if (!validUserTypes.includes(user_type)) {
            return res.status(400).json({ status: false, message: 'Invalid user type. Must be Admin, Teacher, or Convenor.' });
        }
        const user = await User.findOne({ email,user_type, verified: true });
        if (!user) {
            return res.status(400).json({ status: false, message: 'Invalid email or password.' });
        }

        const isMatch = await user.isPasswordCorrect(password);
        if (!isMatch) {
            return res.status(400).json({ status: false, message: 'Invalid email or password.' });
        }

        const token = setUser(user);
        const mailStatus = await sendMail(
            'PCTE Koshish Planning: You Logged In as User on new Device',
            user.email,
            `Your account has been logged in on a new device.`
        );

        if (!mailStatus) {
            console.error("Failed to send login notification email.");
        }

        return res.status(200).json({ status: true, message: 'Login successful!', token });
    } catch (error) {
        console.log(error);
        res.status(500).json({ status: false, message: 'Internal Server Error' });
    }
});

const updateUser = asyncHandler(async (req, res) => {
    const { name, email, phone_number } = req.body;

    try {
        const userId = req.user.id; // Assuming user ID is extracted from middleware

        const user = await User.findByIdAndUpdate(
            userId,
            { name, email, phone_number },
            { new: true, runValidators: true }
        );

        if (!user) {
            return res.status(404).json({ status: false, message: 'User not found.' });
        }

        res.status(200).json({ status: true, message: 'User details updated successfully!', user });
    } catch (error) {
        res.status(500).json({ status: false, message: 'Internal Server Error' });
    }
});

const verifyOtp = asyncHandler(async (req, res) => {
    const { otp } = req.body;
    const { userid } = req.params;

    try {
        const user = await User.findOne({ _id: userid,otp, verified: false });
        if (!user) {
            return res.status(400).json({ status: false, message: 'Invalid OTP or user already verified.' });
        }

        await User.findByIdAndUpdate(user._id, { verified: true, otp: null });
        const mailStatus = await sendMail(
            'PCTE Koshish Planning: Account Verified Successfully ✅',
            user.email,
            `Hello ${user.name}, Congratulations 🎉 your account is now verified.`
        );

        if (!mailStatus) {
            res.status(500).json({ status: false, message: 'Failed to send verification email.' });
        }

        const token = setUser(user);
        res.status(200).json({ status: true, message: 'Verification successful!', token });
    } catch (error) {
        res.status(500).json({ status: false, message: 'Internal Server Error' });
    }
});

const resendOtp = asyncHandler(async (req, res) => {
    const { userid } = req.params;

    try {
        const user = await User.findOne({ _id: userid, verified: false });
        if (!user) {
            return res.status(400).json({ status: false, message: 'User not found or already verified.' });
        }

        const newOtp = crypto.randomInt(100000, 999999).toString();
        await User.findByIdAndUpdate(user._id, { otp: newOtp });
        const mailStatus = await sendMail('PCTE Koshish Planning: Your new OTP Code', user.email, `Your new OTP code is ${newOtp}`);

        if (mailStatus) {
            res.status(200).json({ status: true, message: 'New OTP sent successfully!' });
        } else {
            res.status(500).json({ status: false, message: 'Failed to send OTP.' });
        }
    } catch (error) {
        res.status(500).json({ status: false, message: 'Internal Server Error' });
    }
});

const getUser = asyncHandler(async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId).select("-password -otp -__v -verified");
        if (!user) return res.status(404).json({ status: false, message: 'User Not Found' });
        return res.status(200).json({ status: true, message: "User Fetched", user });
    } catch (error) {
        res.status(500).json({ status: false, message: 'Internal Server Error' });
    }
});

const forgotPassword = asyncHandler(async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email, verified: true });
        if (!user) return res.status(404).json({ status: false, message: 'No Account Exists' });

        const otp = crypto.randomInt(100000, 999999).toString(); // Generate OTP
        user.otp = otp; // Save OTP in the user document
        await user.save();

        const mailStatus = await sendMail('PCTE Koshish Planning: Your OTP Code to Reset Password', user.email, `Your OTP code to Reset Password is ${otp}`);

        if (mailStatus) {
            res.status(200).json({ status: true, message: 'OTP Sent to your Email!' });
        } else {
            res.status(500).json({ status: false, message: 'Failed to send OTP.' });
        }
    } catch (error) {
        res.status(500).json({ status: false, message: 'Internal Server Error' });
    }
});

const changePassword = asyncHandler(async (req, res) => {
    try {
        const { email, otp, password } = req.body;
        const user = await User.findOne({ email, otp, verified: true });
        if (!user) return res.status(404).json({ status: false, message: 'OTP Not Correct' });
        user.password = password;
        user.otp = null;
        await user.save();
        const mailStatus = await sendMail('PCTE Koshish Planning: Password Changed Successfully ✅', user.email, `PCTE Koshish Planning: Password Changed Successfully ✅`);
        return res.status(200).json({ status: true, message: "Password updated successfully" });
    } catch (error) {
        res.status(500).json({ status: false, message: 'Failed to send OTP.' });
    }
});

const google_login = asyncHandler(async (req, res) => {
    const { email, google_id, name } = req.body;
    try {
        // Check if the user exists
        let user = await User.findOne({ email });

        if (!user) {
           return res.status(401).json({status:false,message:"Account Not Found"});
        } else {
            // If the user exists, validate Google ID
            if (user.google_id && user.google_id !== google_id) {
                return res.status(400).json({ status: false, message: 'Invalid Google ID' });
            }
            // Associate the Google ID with the user
            user.google_id = google_id;
            await user.save();
        }

        user.otp = null;
        user.verified = true;
        await user.save();
        // Generate JWT token for the user
        const token = setUser(user);
        // Notify user about login via email (optional step)
        const mailStatus = await sendMail(
            'PCTE Koshish Planning: You Logged In as User on new Device',
            email,
            `Dear ${name},\n\nYour account has been logged in on a new device.\n\nIf this wasn't you, please contact our support team immediately.`
        );
        if (!mailStatus) {
            console.error("Failed to send login notification email.");
        }
        // Respond with success
        return res.status(200).json({ status: true, message: 'Login successful!', token });
    } catch (error) {
        console.error("Google Login Error:", error);
        return res.status(500).json({ status: false, message: 'Internal Server Error' });
    }
});



module.exports = {
    signup,
    login,
    updateUser,
    verifyOtp,
    resendOtp,
    getUser,
    forgotPassword,
    changePassword,
    google_login
};
