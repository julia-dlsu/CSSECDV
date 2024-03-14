const router = require('express').Router();
const passport = require('passport');
const multer  = require('multer');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer'); 
const bcrypt = require('bcrypt');
const userController = require('../controllers/userController');
const { pool } = require("../models/dbConfig");
const { Router } = require('express');
const session = require('express-session');
const flash = require('express-flash');

const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

require("dotenv").config();

const bucketName = process.env.AWS_BUCKET_NAME
const bucketRegion = process.env.AWS_BUCKET_REGION
const accessKeyId = process.env.AWS_ACCESS_KEY
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

const s3 =  new S3Client({
    region: bucketRegion,
    credentials: {
        accessKeyId,
        secretAccessKey
    }
});

const storage = multer.memoryStorage()
const upload = multer({ storage: storage })

const initializePassport = require('../passportConfig');
const e = require('express');
initializePassport(passport);

// MIDDLESWARES: configuration for handling API endpoint data
app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));

// =======FUNCTIONS ====== //

// Function to send a password reset email
function sendPasswordResetEmail(email, pin) {
    // Configure nodemailer to send emails
    const transporter = nodemailer.createTransport({
      service: 'hotmail',
      auth: {
        user: 'teamrotom@hotmail.com',
        pass: process.env.EMAIL_PASSWORD,

      },
    });
  
    // Email content
    const mailOptions = {
      from: 'teamrotom@hotmail.com',
      to: email,
      subject: 'Password Reset Pin',
      text: `Your password reset pin is: ${pin}`,
    };
  
    // Send the email
    transporter.sendMail(mailOptions, (err, info) => {
      if (err) {
        console.error('Error sending email:', err);
      } else {
        console.log('Email sent:', info.response);
      }
    });
}

//function to generate a secure PIN
function generateSecurePin() {
    const randomBytes = crypto.randomBytes(2); //2 bytes for a 6-digit PIN

    //converts random buffer to a hex string then to an integer
    const pin = parseInt(randomBytes.toString('hex'), 16) % 900000 + 100000;
    return pin;
}
// ======= METHODS ======= //
const controller = {
    forgetPassword: async (req, res) => {
        const { email } = req.body;

        try {
            // Check if email exists in the database
            const results = await pool.query(
                `SELECT * FROM users WHERE email = $1`,
                [email]
            );

            //console.log(results.rows);

            if (results.rows.length > 0) {
                const pin = generateSecurePin();
                const user = results.rows[0];
            
                console.log(pin)

                // Hash the pin before it gets stored in the database
                const hashedPin = await bcrypt.hash(pin.toString(), 12);

                console.log(hashedPin);

                // Store hashedPin variable in the database (in the column PIN)
                await pool.query(
                    `UPDATE users SET pin = $1 WHERE email = $2`,
                    [hashedPin, user.email]
                );

                // Send pin to email
                sendPasswordResetEmail(email, pin);

                // Redirect to enter PIN page
                console.log("email: ", email)
                res.render('enter-PIN', { email: email });

            } else {
                // If email not found, redirect to the password forget page 
                res.redirect('/users/forget-password'); 
            }
        }catch (error) {
            console.error('Error:', error);
            res.status(500).send('Internal Server Error');
            }
    },


    enterPin: async (req, res) =>{
        const { pin } = req.body;
        const email = req.body.email; //string
        let err_msg = '';
        console.log(`Email parameter from URL: ${email}`);
        
        console.log(`Pin is: ${pin}`);

        try {
            // Retrieve user details based on the provided PIN
            const result = await pool.query(
                `SELECT * FROM users WHERE email = $1`,
                [email]
            ); 
            if (result.rows.length > 0) {
                const user = result.rows[0];
                
                // Decrypt the stored PIN for comparison
                const decryptedPinMatch = await bcrypt.compare(pin.toString(), user.pin);
                console.log('here')

                if (decryptedPinMatch) {
                    // Valid PIN, redirect to the reset password page
                    res.render('reset-password', { email: email });
                } else {
                    // Invalid PIN, display an error message
                    req.flash('success_msg', "Invalid PIN")
                    console.log('invalid pin')
                    res.render('enter-PIN', { email: email });
                }
            } else {
                // Invalid PIN, display an error message
                console.log('pin not found')
            // req.flash('error_msg',"User not found")
            req.flash('success_msg', "Invalid PIN")
                res.render('enter-PIN', { email: email});
            }
        } catch (error) {
            console.error('Error:', error);
            res.status(500).send('Internal Server Error');
        }
    },

    resetPassword: async (req, res) =>{
        const {email, password, cpass} = req.body
        console.log(`Email parameter from URL: ${email}`);
        console.log(req.body)
        let errors = []
    
        if(!password, !cpass){
            errors.push({message: "Please enter both fields"});
        }
        if (password.length < 8){-
            errors.push({ message: "The password should be at least 8 characters." });
        }
    
        // checks password length max
        if (password.length > 16){
            errors.push({ message: "The password should be at most 16 characters." });
        }
    
        const upper = /[A-Z]/;
        const lower = /[a-z]/;
        const digit = /[0-9]/;
        const specialc = /[.,!$%&#?^_\-+;:]/;
        
        // checks password validity
        if (!(upper.test(password) && lower.test(password) && digit.test(password) && specialc.test(password))){
            errors.push({ message: "The password should contain at least one of each: uppercase letter, lowercase letter, digit, special character." });
        }
    
            // checks if passwords match
        if (password != cpass){
            errors.push({ message: "Passwords do not match." });
        }
        if (errors.length == 0){
            try{
                const results = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
            
                if (results.rows.length > 0){
                    const user = results.rows[0]
                    const newpassword = await bcrypt.hash(password, 10) 
                    console.log(newpassword)
    
                    pool.query(
                        `UPDATE users SET password = $1 WHERE email = $2`,
                        [newpassword, email], (err, results)=>{
                            if (err){
                                throw err
                            }
                                console.log('setting failed login attempts to 0');
                                pool.query(`UPDATE users SET failed_login_attempts = 0, last_login = NOW() WHERE email = $1`, [email]);
                                req.flash('success_msg', "You have changed your password. Please log in.");
                                res.redirect('/users/login');
                             }
                                
                        );
                     }           
            } catch (err){
                throw err
            }
        }
        else{
            res.render('reset-password', {email: email, errors})
        }
    }
    
};
/*
router.post('/users/forget-password', async (req, res) => {
    const { email } = req.body;

    try {
        // Check if email exists in the database
        const results = await pool.query(
            `SELECT * FROM users WHERE email = $1`,
            [email]
        );

        //console.log(results.rows);

        if (results.rows.length > 0) {
            const pin = generateSecurePin();
            const user = results.rows[0];
        
            console.log(pin)

            // Hash the pin before it gets stored in the database
            const hashedPin = await bcrypt.hash(pin.toString(), 12);

            console.log(hashedPin);

            // Store hashedPin variable in the database (in the column PIN)
            await pool.query(
                `UPDATE users SET pin = $1 WHERE email = $2`,
                [hashedPin, user.email]
            );

            // Send pin to email
            sendPasswordResetEmail(email, pin);

            // Redirect to enter PIN page
            console.log("email: ", email)
            res.render('enter-PIN', { email: email });

        } else {
            // If email not found, redirect to the password forget page 
            res.redirect('/users/forget-password'); 
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal Server Error');
    }
});


router.post('/users/enter-PIN', async (req, res) => {
    const { pin } = req.body;
    const email = req.body.email; //string
    let err_msg = '';
    console.log(`Email parameter from URL: ${email}`);
    
    console.log(`Pin is: ${pin}`);

    try {
        // Retrieve user details based on the provided PIN
        const result = await pool.query(
            `SELECT * FROM users WHERE email = $1`,
            [email]
        ); 
        if (result.rows.length > 0) {
            const user = result.rows[0];
            
            // Decrypt the stored PIN for comparison
            const decryptedPinMatch = await bcrypt.compare(pin.toString(), user.pin);
            console.log('here')

            if (decryptedPinMatch) {
                // Valid PIN, redirect to the reset password page
                res.render('reset-password', { email: email });
            } else {
                // Invalid PIN, display an error message
                req.flash('success_msg', "Invalid PIN")
                console.log('invalid pin')
                res.render('enter-PIN', { email: email });
            }
        } else {
            // Invalid PIN, display an error message
            console.log('pin not found')
           // req.flash('error_msg',"User not found")
           req.flash('success_msg', "Invalid PIN")
            res.render('enter-PIN', { email: email});
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal Server Error');
    }
});

router.post("/users/reset-password", async (req, res) => {
    const {email, password, cpass} = req.body
    console.log(`Email parameter from URL: ${email}`);
    console.log(req.body)
    let errors = []

    if(!password, !cpass){
        errors.push({message: "Please enter both fields"});
    }
    if (password.length < 8){-
        errors.push({ message: "The password should be at least 8 characters." });
    }

    // checks password length max
    if (password.length > 16){
        errors.push({ message: "The password should be at most 16 characters." });
    }

    const upper = /[A-Z]/;
    const lower = /[a-z]/;
    const digit = /[0-9]/;
    const specialc = /[.,!$%&#?^_\-+;:]/;
    
    // checks password validity
    if (!(upper.test(password) && lower.test(password) && digit.test(password) && specialc.test(password))){
        errors.push({ message: "The password should contain at least one of each: uppercase letter, lowercase letter, digit, special character." });
    }

        // checks if passwords match
    if (password != cpass){
        errors.push({ message: "Passwords do not match." });
    }
    if (errors.length == 0){
        try{
            const results = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
        
            if (results.rows.length > 0){
                const user = results.rows[0]
                const newpassword = await bcrypt.hash(password, 10) 
                console.log(newpassword)

                pool.query(
                    `UPDATE users SET password = $1 WHERE email = $2`,
                    [newpassword, email], (err, results)=>{
                        if (err){
                            throw err
                        }
                            console.log('setting failed login attempts to 0');
                            pool.query(`UPDATE users SET failed_login_attempts = 0, last_login = NOW() WHERE email = $1`, [email]);
                            req.flash('success_msg', "You have changed your password. Please log in.");
                            res.redirect('/users/login');
                         }
                            
                    );
                 }           
        } catch (err){
            throw err
        }
    }
    else{
        res.render('reset-password', {email: email, errors})
    }

})
*/
module.exports = controller;