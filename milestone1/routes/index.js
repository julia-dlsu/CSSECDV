const router = require('express').Router();
const passport = require('passport');
const multer  = require('multer');
const userController = require('../controllers/userController');

const { Router } = require('express');

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

// ======= USERS: GET ======= //
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


// ======= ADMIN: GET ======= //
// render admin login page
router.get('/admin/login', checkAuthenticated, (req, res)=>{
    res.render('adminLogin');
});

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

// logout admin
router.get("/admin/logout", (req, res, next) => {
    req.logout(function(err){
        if (err) { return next(err); }
        res.redirect("/");
    });
});


// ======= USERS: POST ======= //
// register user
router.post('/users/register', upload.single("image"), userController.registerUser)

router.post("/users/login",
    passport.authenticate("local", {
        successRedirect: "/users/dashboard",
        failureRedirect: "/users/login",
        failureFlash: true
    })
);


// ======= ADMIN: POST ======= //
router.post("/admin/login",
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