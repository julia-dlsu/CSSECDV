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
initializePassport(passport);

//separate loginlimiters for user and admin
const UserLoginLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 5, // limit each IP to 5 requests per windowMs
    message: "Your account is currently on lockdown for suspicious activity. Please wait to access your account again. Thank you."
  });

const AdminLoginLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 5, // limit each IP to 5 requests per windowMs
    message: "Your account is currently on lockdown for suspicious activity. Please wait to access your account again. Thank you."
  });


// ======= USERS: GET ======= //
// render index
router.get('/', (req, res)=>{
   // console.log('Session ID:', sessionId);
    console.log('H O M E   P A G E')
    res.render('index');
});

// render register page
router.get('/users/register', checkAuthenticated, (req, res)=>{
    if(!req.session)
    {
        res.redirect("/");
    }
    else{
        res.render('register')
    }
});

// render login page
router.get('/users/login', checkAuthenticated, (req, res)=>{
   // req.session.message = 'Hello, Flash!';
   //const sessionData = req.session
  // console.log(sessionData)
 // console.log('login page')
 if(!req.session){
    res.redirect("/");
 }
 else{
    res.render('login');
 }
  
});

// render dashboard
router.get('/users/dashboard', checkNotAuthenticatedUser, async (req, res)=>{
    if(!req.session){
        res.redirect("/");
    }

    const getObjectParams = {
        Bucket: bucketName,
        Key: req.user.profilepic, // file name
    }
    const command = new GetObjectCommand(getObjectParams);
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });

    console.log(' R E A L   D A S H B O A R D')
 //   sessionId = req.session.id
 //   console.log('Session ID:', sessionId);
    
    
    return res.render('dashboard', { user: req.user.username, userpic: url });
    
   

});

router.get("/users/anotherpage", (req, res) => {
    console.log("ANOTHER PAGE")
    if(!req.session){
        res.redirect("/");
    }
    else
    {
        res.render('anotherpage')
    }
 
});

// logout user
router.get("/users/logout", (req, res, next) => {
    req.logout(function(err){ 
        if (err) { return next(err); }
        res.redirect("/");
    });
});

router.get('/users/forget-password', (req, res) => {
    if(!req.session){
        res.redirect("/");
    }
    res.render('forget-password'); 
  });

// ======= ADMIN: GET ======= //
// render admin login page
router.get('/admin/login', checkAuthenticated, (req, res)=>{
    if(!req.session){
        res.redirect("/");
    }
    res.render('adminLogin');
});

// render admin dashboard
router.get('/admin/dashboard', checkNotAuthenticatedAdmin, async (req, res)=>{
    if(!req.session){
        res.redirect("/");
    }
    const getObjectParams = {
        Bucket: bucketName,
        Key: req.user.profilepic, // file name
    }
    const command = new GetObjectCommand(getObjectParams);
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });

    return res.render('bookAdmin', { user: req.user.username, userpic: url });
});

// logout admin
router.get("/admin/logout", (req, res, next) => {
    req.logout(function(err){
        if (err) { return next(err); }
        res.redirect("/");
    });
});


// ======= USERS: POST ======= //
router.post('/anotherpage', (req, res) => {
    if (req.session) {
        req.session.lastActivity = new Date().getTime();
    }
    console.log("POST anotherpage")
    //res.sendStatus(200);
})
router.post('/users/dashboard', (req, res) => {
    if (req.session) {
        req.session.lastActivity = new Date().getTime();
    }
    console.log("POST dashboard")
    //res.sendStatus(200);
})
// register user
router.post('/users/register', upload.single("image"), userController.registerUser)

router.post("/users/login", UserLoginLimiter,
    passport.authenticate("local", {

        successRedirect: "/users/dashboard",
        failureRedirect: "/users/login",
        failureFlash: true
    })
);

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
// ======= ADMIN: POST ======= //
router.post("/admin/login", AdminLoginLimiter,
    passport.authenticate("local", {
        successRedirect: "/admin/dashboard",
        failureRedirect: "/admin/login",
        failureFlash: true
    })
    
);



// ======= AUTHENTICATION METHODS ======= //

function checkAuthenticated(req, res, next){
    if (req.isAuthenticated()){
        if (req.user.role === 'user') {
            return res.redirect('/users/dashboard');
        } else if (req.user.role === 'admin'){
            return res.redirect('/admin/dashboard');
        }
    }
    next();
};

function checkNotAuthenticatedUser(req, res, next){
    if (req.isAuthenticated() && req.user.role === 'user'){
        return next();
    }
    res.redirect('/users/login');
}

function checkNotAuthenticatedAdmin(req, res, next){
    if (req.isAuthenticated() && req.user.role === 'admin'){
        return next();
    }
    res.redirect('/admin/login');
}

module.exports = router