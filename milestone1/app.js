const express = require('express')
const ejs = require("ejs");
const app = express();
const { pool } = require("./dbConfig");
const bcrypt = require('bcrypt');
const session = require('express-session');
const flash = require('express-flash');
const passport = require('passport');
const multer  = require('multer')
const sharp = require('sharp');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer'); 


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

const initializePassport = require('./passportConfig');
initializePassport(passport);

const storage = multer.memoryStorage()
const upload = multer({ storage: storage })

const PORT = process.env.PORT || 4000;

app.set('view engine', 'ejs');
//app.use(express.urlencoded({extended: false}));
//app.use(express.urlencoded({ extended: true }));

// MIDDLESWARES: configuration for handling API endpoint data
app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));

app.use(session({
    secret: 'taylorswiftisthebestpersonintheworld',

    resave: false,

    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

app.use(flash());

// serve static files
app.use(express.static('public'));
app.use(express.static(__dirname + "/public"));


//separate loginlimiters for user and admin
const UserLoginLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 5, // limit each IP to 5 requests per windowMs
    message: "Too many login attempts have been made"
  });

const AdminLoginLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 5, // limit each IP to 5 requests per windowMs
    message: "Too many login attempts have been made"
  });
// ======= METHODS ======= //

// ======= USERS: GET ======= //

app.get('/', (req, res)=>{
    res.render('index');
});

app.get('/users/register', checkAuthenticated, (req, res)=>{
    res.render('register');
});
//EDIT?
app.get('/users/login', UserLoginLimiter, checkAuthenticated, (req, res)=>{
    if (res.locals.rateLimit) {
        // If the rate limit is active, redirect the user to another page
        return res.redirect('/users/forget-password');
    }
    res.render('login');
});

app.get('/users/forget-password', (req, res) => {
    res.render('forget-password'); 
  });

// app.get('/users/enter-PIN', (req,res) => {
//     res.render('enter-PIN'); 
//   });

app.get('/users/dashboard', checkNotAuthenticatedUser, async (req, res)=>{
    const getObjectParams = {
        Bucket: bucketName,
        Key: req.user.profilepic, // file name
    }
    const command = new GetObjectCommand(getObjectParams);
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });

    return res.render('dashboard', { user: req.user.username, userpic: url });
});

app.get("/users/logout", (req, res, next) => {
    req.logout(function(err){
        if (err) { return next(err); }
        res.redirect("/");
    });
});

// ======= ADMIN: GET ======= //

app.get('/admin/login', checkAuthenticated, (req, res)=>{
    res.render('adminLogin');
});

app.get('/admin/dashboard', checkNotAuthenticatedAdmin, async (req, res)=>{
    const getObjectParams = {
        Bucket: bucketName,
        Key: req.user.profilepic, // file name
    }
    const command = new GetObjectCommand(getObjectParams);
    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });

    return res.render('bookAdmin', { user: req.user.username, userpic: url });
});

app.get("/admin/logout", (req, res, next) => {
    req.logout(function(err){
        if (err) { return next(err); }
        res.redirect("/");
    });
});

// ======= USERS: POST ======= //

const generateFileName = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');
app.post('/users/register', upload.single("image"), async (req, res)=>{
    let { fname, lname, email, phone, uname, password, cpass } = req.body
    const file = req.file

    // ======= FILE VALIDATION ======= //
    // size check
    const maxSize = 1024 * 1024 * 1; // 1 for 1mb
    if (req.file.size > maxSize ){
        errors.push({ message: "Max upload size 1MB." });
    }
 
    // extention based file type check
    if (req.file.mimetype != "image/jpeg" && req.file.mimetype != "image/jpg" && req.file.mimetype != "image/png"){
        errors.push({ message: "File is not a .PNG .JPEG or .JPG file." });
    }
 
    // file siggy based file type check
    buffer = req.file.buffer
    const magicNum = buffer.toString('hex', 0, 4);
    const pngNum = "89504e47"
    const jpegNum = "ffd8ffe0"
    const riffNum = "52494646"
    if (magicNum !== pngNum && magicNum !== jpegNum && magicNum !== riffNum){
        errors.push({ message: ".PNG .JPEG or .JPG files only." });
    }

    // resize image
    const fileBuffer = await sharp(req.file.buffer)
        .resize({height: 180, width: 180, fit: "contain" })
        .toBuffer();

    // config the upload details to send to s3
    const fileName = generateFileName()
    const uploadParams = {
        Bucket: bucketName,
        Body: fileBuffer,  // actual image data
        Key: fileName, // becomes the file name
        ContentType: file.mimetype
    };

    let errors = [];

    // check that there are no empty inputs
    if (!fname || !lname || !email || !phone || !uname || !password || !cpass ) {
        errors.push({ message: "Please enter all fields." });
    }

    // check first name validity
    const fnameregex = /[a-zA-ZÑñÉé]+([ \-']?[a-zA-ZÑñÉé]+){0,2}[.]?/;
    if (!(fnameregex.test(fname))){
        errors.push({ message: "Invalid first name input." });
    }

    // check last name validity
    const lnameregex = /[a-zA-ZÑñÉé]+([ \-']?[a-zA-ZÑñÉé]+){0,2}[.]?/;
    if (!(lnameregex.test(lname))){
        errors.push({ message: "Invalid last name input." });
    }

    // checks email validity
    const emailregex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    if (!(emailregex.test(email))){
        errors.push({ message: "Invalid email input." });
    }

    // checks phone validity
    const phoneregex = /^09\d{9}$/;
    if (!(phoneregex.test(phone))){
        errors.push({ message: "Invalid phone number input." });
    }

    // checks username validity
    const unameregex = /[a-zA-Z0-9ÑñÉé.,!$%&#?^_\-+;:]/;
    if (!(unameregex.test(uname))){
        errors.push({ message: "Invalid username input." });
    }

    // checks password length min
    if (password.length < 8){
        errors.push({ message: "The password should be at least 8 characters." });
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

    if (errors.length > 0){
        res.render('register', { errors });
    } 
    else { // successful validation
        let hashedPass = await bcrypt.hash(password, 10);
        console.log(hashedPass);
        // send data to s3 bucket
        await s3.send(new PutObjectCommand(uploadParams));

        pool.query(
            `SELECT * FROM users
            WHERE email = $1 OR username = $2`, [email, uname], (err, results)=>{
                if (err){
                    throw err
                }
                console.log(results.rows);

                if (results.rows.length > 0){
                    if (results.rows[0].email === email){
                        errors.push({ message: "Email already registered." });
                    }
                    if (results.rows[0].username === uname){
                        errors.push({ message: "Username already registered." });
                    }
                    res.render("register", { errors });
                } else{ // register the user
                    pool.query(
                        `INSERT INTO users (firstname, lastname, username, email, phonenum, profilepic, password, role)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        RETURNING id, password`, [fname, lname, uname, email, phone, fileName, hashedPass, 'user'], (err, results)=>{
                            if (err){
                                throw err
                            }
                            console.log(results.rows);
                            req.flash('success_msg', "You are now registered. Please log in.");
                            res.redirect('/users/login');
                        }
                    )
                }
            }
        )
    }
});

app.post("/users/login",
    passport.authenticate("local", {
        successRedirect: "/users/dashboard",
        failureRedirect: "/users/login",
        failureFlash: true
    })
);


app.post('/users/forget-password', async (req, res) => {
    const { email } = req.body;

    try {
        // Check if email exists in the database
        const results = await pool.query(
            `SELECT * FROM users WHERE email = $1`,
            [email]
        );

        //console.log(results.rows);

        if (results.rows.length > 0) {
            const pin = Math.floor(100000 + Math.random() * 900000);
            const user = results.rows[0];

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
            // If email not found, redirect to the password forget page with an error message
            res.redirect('/users/forget-password'); //placeholder for now
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


app.post('/users/enter-PIN', async (req, res) => {
    const { pin } = req.body;
    const email = req.body.email; //string
    console.log(`Email parameter from URL: ${email}`);
    
    console.log(`Pin is: ${pin}`);

    try {
        // Retrieve user details based on the provided PIN
        const result = await pool.query(
            `SELECT * FROM users WHERE email = $1`,
            [email]
        ); 
       // console.log(typeof email)
        //console.log(result.rows[0])
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
                req.flash('error_msg',"Invalid PIN")
                console.log('invalid pin')
                res.render('enter-PIN', { email: email });
            }
        } else {
            // Invalid PIN, display an error message
            console.log('pin not found')
            req.flash('error_msg',"User not found")
            res.render('enter-PIN', { email: email });
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post("/users/reset-password", async (req, res) => {
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
        //this doesnt seem to push through
    if (password != cpass){
        errors.push({ message: "Passwords do not match." });
    }
    if (errors.length == 0){
        try{
            const results = await pool.query(`SELECT * FROM users WHERE email = $1`, [email]);
        
            if (results.rows.length > 0){
                const user = results.rows[0]
                const newpassword = await bcrypt.hash(password, 10) //LMAO THIS IS EMPTY SJDHKGL
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

// ======= USERS: POST ======= //
app.post("/admin/login",
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

app.listen(PORT, ()=>{
    console.log(`Server running on port ${PORT}`);
});