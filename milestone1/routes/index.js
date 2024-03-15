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
const express = require('express')

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

// MIDDLESWARES: configuration for handling API endpoint data
const app = express();
app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));

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

// ======= SCHOLARS: USER ROUTES ======= //
// render index
router.get('/', (req, res)=>{
    res.render('index');
});

// render register page
router.get('/users/register', checkAuthenticated, (req, res)=>{
    res.render('register');
});

// render login page
router.get('/users/login', checkAuthenticated, (req, res)=>{
    res.render('login');
});

// render dashboard
router.get('/users/dashboard', checkNotAuthenticatedUser, async (req, res)=>{
    const getObjectParams = {
        Bucket: bucketName,
        Key: req.user.profilepic, // file name
    }
    const command = new GetObjectCommand(getObjectParams);
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });

    return res.render('dashboard', { user: req.user.username, userpic: url });
});

// logout user
router.get("/users/logout", (req, res, next) => {
    req.logout(function(err){
        if (err) { return next(err); }
        res.redirect("/");
    });
});

// render forget password
router.get('/users/forget-password', (req, res) => {
    res.render('forget-password'); 
});

// register user
router.post('/users/register', upload.single("image"), userController.registerUser)

// login user
router.post("/users/login", UserLoginLimiter,
    passport.authenticate("local", {
        successRedirect: "/users/dashboard",
        failureRedirect: "/users/login",
        failureFlash: true
    })
);

// forget password
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
            const hashedPin = await bcrypt.hash(pin.toString(), 10);

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

// enter pin
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

// reset password
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

});


// ======= ADMIN: USER ROUTES ======= //

// render admin login page
router.get('/admin/login', checkAuthenticated, (req, res)=>{
    res.render('adminLogin');
});

// login admin
router.post("/admin/login", AdminLoginLimiter,
    passport.authenticate("local", {
        successRedirect: "/admin/dashboard",
        failureRedirect: "/admin/login",
        failureFlash: true
    })
    
);

// logout admin
router.get("/admin/logout", (req, res, next) => {
    req.logout(function(err){
        if (err) { return next(err); }
        res.redirect("/");
    });
});


// ======= ADMIN: ANNOUNCEMENT ROUTES ======= //

// render admin dashboard
router.get('/admin/dashboard', checkNotAuthenticatedAdmin, async (req, res)=>{
    const getObjectParams = {
        Bucket: bucketName,
        Key: req.user.profilepic, // file name
    }
    const command = new GetObjectCommand(getObjectParams);
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });

    return res.render('bookAdmin', { user: req.user.username, userpic: url });
});


// ======= ADMIN: SCHOLAR ROUTES ======= //

// render admin scholars
router.get('/admin/scholars', checkNotAuthenticatedAdmin, async (req, res)=>{
    // sample data only, replace when querying db
    const people = [
        { scholar: 'Julia de Veyra', type: 'Merit Scholar', school: 'De La Salle University' },
        { scholar: 'Jodie de Veyra', type: 'RA 7687', school: 'Ateneo De Manila University' },
        { scholar: 'Jaden de Veyra', type: 'RA 7687', school: 'University of the Philippines' }
    ]

    return res.render('scholarAccs', { people });
});

// render admin scholars profile
// [TODO] turn into /admin/scholars/:id
router.get('/admin/scholars/profile', checkNotAuthenticatedAdmin, async (req, res)=>{
    const getObjectParams = {
        Bucket: bucketName,
        Key: req.user.profilepic, // file name
    }
    const command = new GetObjectCommand(getObjectParams);
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });

    // sample data only, replace when querying db
    const person = { 
        userpic: url, 
        scholar: 'Julia de Veyra', 
        email: 'amorbdv@gmail.com', 
        type: 'Merit Scholar', 
        school: 'De La Salle University', 
        degree: 'BS Computer Science', 
        accName: 'Julianne Amor B de Veyra', 
        accNum: '1234567890', 
        verified: 'True' 
    };

    return res.render('scholarProfile', person);
});

// verify admin scholars profile
// [TODO] turn into /admin/scholars/:id/verify AND functionalities
router.post('/admin/scholars/profile/verify', checkNotAuthenticatedAdmin, async (req, res)=>{
    console.log(req.body);
    return res.redirect('/admin/scholars');
});


// ======= ADMIN: RENEW SCHOLARSHIP ROUTES ======= //

// render admin applications of scholars
router.get('/admin/renew-scholarship', checkNotAuthenticatedAdmin, async (req, res)=>{
    const getEAFParams = {
        Bucket: bucketName,
        Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
    }
    const eaf_command = new GetObjectCommand(getEAFParams);
    const eaf_url = await getSignedUrl(s3, eaf_command, { expiresIn: 3600 });

    const getGradesParams = {
        Bucket: bucketName,
        Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
    }
    const grades_command = new GetObjectCommand(getGradesParams);
    const grades_url = await getSignedUrl(s3, grades_command, { expiresIn: 3600 });

    // sample data only, replace when querying db
    // id here is application id NOT user id
    const applications = [
        { id: 1, scholar: 'Julia de Veyra', type: 'Merit Scholar', school: 'De La Salle University', eaf: eaf_url, grades: grades_url, date: '03/03/2024' },
        { id: 2, scholar: 'Jodie de Veyra', type: 'RA 7687', school: 'Ateneo De Manila University', eaf: eaf_url, grades: grades_url, date: '03/03/2024' },
        { id: 3, scholar: 'Jaden de Veyra', type: 'RA 7687', school: 'University of the Philippines', eaf: eaf_url, grades: grades_url, date: '03/03/2024' }
    ]

    return res.render('adminRenew', { applications });
});

// approve scholarship renewal application
router.post('/admin/renew-scholarship-approve', upload.single("loe"), checkNotAuthenticatedAdmin, async (req, res)=>{
    console.log(req.body);
    console.log(req.file);
    return res.redirect('/admin/renew-scholarship/approved');
});

// reject scholarship renewal application
router.post('/admin/renew-scholarship-reject', checkNotAuthenticatedAdmin, async (req, res)=>{
    console.log(req.body);
    return res.redirect('/admin/renew-scholarship/rejected');
});

// render approved scholarship renewals
router.get('/admin/renew-scholarship/approved', checkNotAuthenticatedAdmin, async (req, res)=>{
    const getEAFParams = {
        Bucket: bucketName,
        Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
    }
    const eaf_command = new GetObjectCommand(getEAFParams);
    const eaf_url = await getSignedUrl(s3, eaf_command, { expiresIn: 3600 });

    const getGradesParams = {
        Bucket: bucketName,
        Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
    }
    const grades_command = new GetObjectCommand(getGradesParams);
    const grades_url = await getSignedUrl(s3, grades_command, { expiresIn: 3600 });

    const getApproveParams = {
        Bucket: bucketName,
        Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
    }
    const approve_command = new GetObjectCommand(getApproveParams);
    const approve_url = await getSignedUrl(s3, approve_command, { expiresIn: 3600 });

    // sample data only, replace when querying db
    const applications = [
        { scholar: 'Julia de Veyra', type: 'Merit Scholar', school: 'De La Salle University', checkedBy: 'adminUser', dateApproved: '03/03/2023', dateSubmitted: '03/03/2023', eaf: eaf_url, grades: grades_url, approved: approve_url },
        { scholar: 'Jodie de Veyra', type: 'RA 7687', school: 'Ateneo De Manila University', checkedBy: 'adminUser', dateApproved: '03/03/2023', dateSubmitted: '03/03/2023', eaf: eaf_url, grades: grades_url, approved: approve_url },
        { scholar: 'Jaden de Veyra', type: 'RA 7687', school: 'University of the Philippines', checkedBy: 'adminUser', dateApproved: '03/03/2023', dateSubmitted: '03/03/2023', eaf: eaf_url, grades: grades_url, approved: approve_url }
    ]

    return res.render('approvedRenewals', { applications });
});

// render rejected scholarship renewals
router.get('/admin/renew-scholarship/rejected', checkNotAuthenticatedAdmin, async (req, res)=>{
    const getEAFParams = {
        Bucket: bucketName,
        Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
    }
    const eaf_command = new GetObjectCommand(getEAFParams);
    const eaf_url = await getSignedUrl(s3, eaf_command, { expiresIn: 3600 });

    const getGradesParams = {
        Bucket: bucketName,
        Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
    }
    const grades_command = new GetObjectCommand(getGradesParams);
    const grades_url = await getSignedUrl(s3, grades_command, { expiresIn: 3600 });

    // sample data only, replace when querying db
    const applications = [
        { scholar: 'Julia de Veyra', type: 'Merit Scholar', school: 'De La Salle University', checkedBy: 'adminUser', dateRejected: '03/03/2023', dateSubmitted: '03/03/2023', eaf: eaf_url, grades: grades_url },
        { scholar: 'Jodie de Veyra', type: 'RA 7687', school: 'Ateneo De Manila University', checkedBy: 'adminUser', dateRejected: '03/03/2023', dateSubmitted: '03/03/2023', eaf: eaf_url, grades: grades_url },
        { scholar: 'Jaden de Veyra', type: 'RA 7687', school: 'University of the Philippines', checkedBy: 'adminUser', dateRejected: '03/03/2023', dateSubmitted: '03/03/2023', eaf: eaf_url, grades: grades_url }
    ]

    return res.render('rejectedRenewals', { applications });
});

// ======= ADMIN: TRAVEL ABROAD ROUTES ======= //

// render admin applications of travel abroad
router.get('/admin/travel-abroad', checkNotAuthenticatedAdmin, async (req, res)=>{
    const getLOIParams = {
        Bucket: bucketName,
        Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
    }
    const loi_command = new GetObjectCommand(getLOIParams);
    const loi_url = await getSignedUrl(s3, loi_command, { expiresIn: 3600 });

    const getDOUParams = {
        Bucket: bucketName,
        Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
    }
    const dou_command = new GetObjectCommand(getDOUParams);
    const dou_url = await getSignedUrl(s3, dou_command, { expiresIn: 3600 });

    const getITRParams = {
        Bucket: bucketName,
        Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
    }
    const itr_command = new GetObjectCommand(getITRParams);
    const itr_url = await getSignedUrl(s3, itr_command, { expiresIn: 3600 });

    // sample data only, replace when querying db
    // id here is application id NOT user id
    const applications = [
        { id: 1, scholar: 'Julia de Veyra', type: 'Merit Scholar', school: 'De La Salle University', loi: loi_url, dou: dou_url, itr: itr_url, date: '03/03/2024' },
        { id: 2, scholar: 'Jodie de Veyra', type: 'RA 7687', school: 'Ateneo De Manila University',  loi: loi_url, dou: dou_url, itr: itr_url,  date: '03/03/2024' },
        { id: 3, scholar: 'Jaden de Veyra', type: 'RA 7687', school: 'University of the Philippines', loi: loi_url, dou: dou_url, itr: itr_url,  date: '03/03/2024' }
    ]

    return res.render('adminTravel', { applications });
});

// approve travel abroad application
router.post('/admin/travel-abroad-approve', upload.single("permit"), checkNotAuthenticatedAdmin, async (req, res)=>{
    console.log(req.body);
    console.log(req.file);
    return res.redirect('/admin/travel-abroad/approved');
});

// reject travel abroad application
router.post('/admin/travel-abroad-reject', checkNotAuthenticatedAdmin, async (req, res)=>{
    console.log(req.body);
    return res.redirect('/admin/travel-abroad/rejected');
});

// render approved travel abroad
router.get('/admin/travel-abroad/approved', checkNotAuthenticatedAdmin, async (req, res)=>{
    const getLOIParams = {
        Bucket: bucketName,
        Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
    }
    const loi_command = new GetObjectCommand(getLOIParams);
    const loi_url = await getSignedUrl(s3, loi_command, { expiresIn: 3600 });

    const getDOUParams = {
        Bucket: bucketName,
        Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
    }
    const dou_command = new GetObjectCommand(getDOUParams);
    const dou_url = await getSignedUrl(s3, dou_command, { expiresIn: 3600 });

    const getITRParams = {
        Bucket: bucketName,
        Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
    }
    const itr_command = new GetObjectCommand(getITRParams);
    const itr_url = await getSignedUrl(s3, itr_command, { expiresIn: 3600 });

    const getApproveParams = {
        Bucket: bucketName,
        Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
    }
    const approve_command = new GetObjectCommand(getApproveParams);
    const approve_url = await getSignedUrl(s3, approve_command, { expiresIn: 3600 });

    // sample data only, replace when querying db
    const applications = [
        { scholar: 'Julia de Veyra', type: 'Merit Scholar', school: 'De La Salle University', checkedBy: 'adminUser', dateApproved: '03/03/2023', dateSubmitted: '03/03/2023', loi: loi_url, dou: dou_url, itr: itr_url, approved: approve_url },
        { scholar: 'Jodie de Veyra', type: 'RA 7687', school: 'Ateneo De Manila University', checkedBy: 'adminUser', dateApproved: '03/03/2023', dateSubmitted: '03/03/2023',  loi: loi_url, dou: dou_url, itr: itr_url, approved: approve_url },
        { scholar: 'Jaden de Veyra', type: 'RA 7687', school: 'University of the Philippines', checkedBy: 'adminUser', dateApproved: '03/03/2023', dateSubmitted: '03/03/2023', loi: loi_url, dou: dou_url, itr: itr_url, approved: approve_url }
    ]

    return res.render('approvedTravels', { applications });
});

// render rejected travel abroad
router.get('/admin/travel-abroad/rejected', checkNotAuthenticatedAdmin, async (req, res)=>{
    const getLOIParams = {
        Bucket: bucketName,
        Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
    }
    const loi_command = new GetObjectCommand(getLOIParams);
    const loi_url = await getSignedUrl(s3, loi_command, { expiresIn: 3600 });

    const getDOUParams = {
        Bucket: bucketName,
        Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
    }
    const dou_command = new GetObjectCommand(getDOUParams);
    const dou_url = await getSignedUrl(s3, dou_command, { expiresIn: 3600 });

    const getITRParams = {
        Bucket: bucketName,
        Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
    }
    const itr_command = new GetObjectCommand(getITRParams);
    const itr_url = await getSignedUrl(s3, itr_command, { expiresIn: 3600 });

    // sample data only, replace when querying db
    const applications = [
        { scholar: 'Julia de Veyra', type: 'Merit Scholar', school: 'De La Salle University', checkedBy: 'adminUser', dateRejected: '03/03/2023', dateSubmitted: '03/03/2023', loi: loi_url, dou: dou_url, itr: itr_url },
        { scholar: 'Jodie de Veyra', type: 'RA 7687', school: 'Ateneo De Manila University', checkedBy: 'adminUser', dateRejected: '03/03/2023', dateSubmitted: '03/03/2023', loi: loi_url, dou: dou_url, itr: itr_url },
        { scholar: 'Jaden de Veyra', type: 'RA 7687', school: 'University of the Philippines', checkedBy: 'adminUser', dateRejected: '03/03/2023', dateSubmitted: '03/03/2023', loi: loi_url, dou: dou_url, itr: itr_url }
    ]

    return res.render('rejectedTravels', { applications });
});

// ======= ADMIN: THESIS BUDGET ROUTES ======= //

// render admin applications of thesis budget
router.get('/admin/thesis-budget', checkNotAuthenticatedAdmin, async (req, res)=>{
    const getAFParams = {
        Bucket: bucketName,
        Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
    }
    const af_command = new GetObjectCommand(getAFParams);
    const af_url = await getSignedUrl(s3, af_command, { expiresIn: 3600 });

    // sample data only, replace when querying db
    // id here is application id NOT user id
    const applications = [
        { id: 1, scholar: 'Julia de Veyra', type: 'Merit Scholar', school: 'De La Salle University', af: af_url, date: '03/03/2024' },
        { id: 2, scholar: 'Jodie de Veyra', type: 'RA 7687', school: 'Ateneo De Manila University',  af: af_url,  date: '03/03/2024' },
        { id: 3, scholar: 'Jaden de Veyra', type: 'RA 7687', school: 'University of the Philippines', af: af_url,  date: '03/03/2024' }
    ]

    return res.render('adminThesis', { applications });
});

// approve thesis budget application
router.post('/admin/thesis-budget-approve', upload.single("budget"), checkNotAuthenticatedAdmin, async (req, res)=>{
    console.log(req.body);
    console.log(req.file);
    return res.redirect('/admin/thesis-budget/approved');
});

// reject thesis budget application
router.post('/admin/thesis-budget-reject', checkNotAuthenticatedAdmin, async (req, res)=>{
    console.log(req.body);
    return res.redirect('/admin/thesis-budget/rejected');
});

// render approved thesis budget
router.get('/admin/thesis-budget/approved', checkNotAuthenticatedAdmin, async (req, res)=>{
    const getAFParams = {
        Bucket: bucketName,
        Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
    }
    const af_command = new GetObjectCommand(getAFParams);
    const af_url = await getSignedUrl(s3, af_command, { expiresIn: 3600 });

    const getApproveParams = {
        Bucket: bucketName,
        Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
    }
    const approve_command = new GetObjectCommand(getApproveParams);
    const approve_url = await getSignedUrl(s3, approve_command, { expiresIn: 3600 });

    // sample data only, replace when querying db
    const applications = [
        { scholar: 'Julia de Veyra', type: 'Merit Scholar', school: 'De La Salle University', checkedBy: 'adminUser', dateApproved: '03/03/2023', dateSubmitted: '03/03/2023', af: af_url, approved: approve_url },
        { scholar: 'Jodie de Veyra', type: 'RA 7687', school: 'Ateneo De Manila University', checkedBy: 'adminUser', dateApproved: '03/03/2023', dateSubmitted: '03/03/2023', af: af_url, approved: approve_url },
        { scholar: 'Jaden de Veyra', type: 'RA 7687', school: 'University of the Philippines', checkedBy: 'adminUser', dateApproved: '03/03/2023', dateSubmitted: '03/03/2023', af: af_url, approved: approve_url }
    ]

    return res.render('approvedThesis', { applications });
});

// render rejected thesis budget
router.get('/admin/thesis-budget/rejected', checkNotAuthenticatedAdmin, async (req, res)=>{
    const getAFParams = {
        Bucket: bucketName,
        Key: 'Thesis-Allowance-Guidelines-1.pdf', // [TODO]: sample only
    }
    const af_command = new GetObjectCommand(getAFParams);
    const af_url = await getSignedUrl(s3, af_command, { expiresIn: 3600 });

    // sample data only, replace when querying db
    const applications = [
        { scholar: 'Julia de Veyra', type: 'Merit Scholar', school: 'De La Salle University', checkedBy: 'adminUser', dateRejected: '03/03/2023', dateSubmitted: '03/03/2023', af: af_url },
        { scholar: 'Jodie de Veyra', type: 'RA 7687', school: 'Ateneo De Manila University', checkedBy: 'adminUser', dateRejected: '03/03/2023', dateSubmitted: '03/03/2023', af: af_url },
        { scholar: 'Jaden de Veyra', type: 'RA 7687', school: 'University of the Philippines', checkedBy: 'adminUser', dateRejected: '03/03/2023', dateSubmitted: '03/03/2023', af: af_url }
    ]

    return res.render('rejectedThesis', { applications });
});


// ======= ADDITIONAL METHODS ======= //

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