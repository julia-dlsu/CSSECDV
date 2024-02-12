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
app.use(express.urlencoded({extended: false}));

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

// ======= METHODS ======= //

// ======= USERS: GET ======= //

app.get('/', (req, res)=>{
    res.render('index');
});

app.get('/users/register', checkAuthenticated, (req, res)=>{
    res.render('register');
});

app.get('/users/login', checkAuthenticated, (req, res)=>{
    res.render('login');
});

app.get('/users/dashboard', checkNotAuthenticatedUser, async (req, res)=>{
    const getObjectParams = {
        Bucket: bucketName,
        Key: req.user.username, // file name
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
        Key: req.user.username, // file name
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

app.post('/users/register', upload.single("image"), async (req, res)=>{
    let { fname, lname, email, phone, uname, password, cpass } = req.body
    const file = req.file

    // [TODO]: file validation

    // resize image
    const fileBuffer = await sharp(req.file.buffer)
        .resize({height: 180, width: 180, fit: "contain" })
        .toBuffer();

    // config the upload details to send to s3
    const uploadParams = {
        Bucket: bucketName,
        Body: fileBuffer,  // actual image data
        Key: req.body.uname, // becomes the file name
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
                        RETURNING id, password`, [fname, lname, uname, email, phone, uname, hashedPass, 'user'], (err, results)=>{
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