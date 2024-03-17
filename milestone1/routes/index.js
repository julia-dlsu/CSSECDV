const router = require('express').Router();
const passport = require('passport');
const multer  = require('multer');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcrypt');
const { pool } = require("../models/dbConfig");
const { Router } = require('express');
const express = require('express');

// USER CONTROLLERS
const userAuthController = require('../controllers/userAuthController');
const userProfileController = require('../controllers/userProfileController');
const userRenewController = require('../controllers/userRenewController');
const userTravelController = require('../controllers/userTravelController');
const userThesisController = require('../controllers/userThesisController');

// ADMIN CONTROLLERS
const adminAuthController = require('../controllers/adminAuthController');
const adminAnnounceController = require('../controllers/adminAnnounceController');
const adminScholarController = require('../controllers/adminScholarController');
const adminRenewController = require('../controllers/adminRenewController');
const adminTravelController = require('../controllers/adminTravelController');
const adminThesisController = require('../controllers/adminThesisController');

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

//================== FOR TESTING LOGGING ================//
router.get('/400', (req, res)=>{
    res.sendStatus(400)
});

router.get('/500', (req, res)=>{
    res.sendStatus(500);
});

// ======= SCHOLARS: USER AUTHENTICATON ROUTES ======= //
// for loading landing page
router.get('/', userAuthController.getLandingPage);
// for loading register page
router.get('/users/register', checkAuthenticated, userAuthController.getRegisterPage);
// register a scholar
router.post('/users/register', upload.single("image"), userAuthController.registerUser);
// for loading login page
router.get('/users/login', checkAuthenticated, userAuthController.getLoginPage);
// login a scholar
router.post("/users/login", UserLoginLimiter,
    passport.authenticate("local", {
        successRedirect: "/users/dashboard",
        failureRedirect: "/users/login",
        failureFlash: true
    })
);
// logout a scholar
router.get("/users/logout", userAuthController.logoutUser);
// for loading forget password
router.get('/users/forget-password', userAuthController.getForgetPassword);
// forget password
router.post('/users/forget-password', userAuthController.forgetPassword);
// enter pin
router.post('/users/enter-PIN', userAuthController.enterPIN);
// reset password
router.post("/users/reset-password", userAuthController.resetPassword);


// ======= SCHOLARS: USER PROFILE ROUTES ======= //
// for loading dashboard
router.get('/users/dashboard', checkNotAuthenticatedUser, userProfileController.getDashboard);
// for loading scholars profile
router.get('/users/profile', checkNotAuthenticatedUser, userProfileController.getUserProfile);
// update profile pic
router.post('/users/update-profile-picture', upload.single("image"), checkNotAuthenticatedUser, userProfileController.updateProfilePicture);
// update profile information
router.post('/users/update-profile-information', checkNotAuthenticatedUser, userProfileController.updateProfileInformation);


// ======= USERS: RENEW SCHOLARSHIP ROUTES ======= //
// render renewal applications
router.get('/users/renew-scholarship', checkNotAuthenticatedUser, userRenewController.getRenewalApps);
// delete renewal
router.post('/users/renew-scholarship-delete', checkNotAuthenticatedUser, userRenewController.deleteRenewalApp);
// apply for renewal
router.post('/users/renew-scholarship-apply', upload.fields([{ name: "eaf" }, { name: "grades" }]), checkNotAuthenticatedUser, userRenewController.applyRenewal);


// ======= USERS: TRAVEL ABROAD ROUTES ======= //
// render renewal applications
router.get('/users/travel-abroad', checkNotAuthenticatedUser, userTravelController.getTravelApps);
// delete renewal
router.post('/users/travel-abroad-delete', checkNotAuthenticatedUser, userTravelController.deleteTravelApp);
// apply for renewal
router.post('/users/travel-abroad-apply', upload.fields([{ name: "loi" }, { name: "dou" }, { name: "itr" }]), checkNotAuthenticatedUser, userTravelController.applyTravel);


// ======= USERS: THESIS BUDGET ROUTES ======= //
// render renewal applications
router.get('/users/thesis-budget', checkNotAuthenticatedUser, userThesisController.getThesisApps);
// delete renewal
router.post('/users/thesis-budget-delete', checkNotAuthenticatedUser, userThesisController.deleteThesisApp);
// apply for renewal
router.post('/users/thesis-budget-apply', upload.single("af"), checkNotAuthenticatedUser, userThesisController.applyThesis);


// ======= ADMIN: ACCOUNT ROUTES ======= //
// render admin login page
router.get('/admin/login', checkAuthenticated, adminAuthController.getAdminLogin);
// login admin
router.post("/admin/login", AdminLoginLimiter,
    passport.authenticate("local", {
        successRedirect: "/admin/dashboard",
        failureRedirect: "/admin/login",
        failureFlash: true
    })
);
// logout admin
router.get("/admin/logout", adminAuthController.logoutAdmin);


// ======= ADMIN: ANNOUNCEMENT ROUTES ======= //
// render admin dashboard
router.get('/admin/dashboard', checkNotAuthenticatedAdmin, adminAnnounceController.getAdminDashboard);
// render admin own announcements
router.get('/admin/announcements', checkNotAuthenticatedAdmin, adminAnnounceController.getAdminAnnouncements);
// create announcement
router.post('/admin/create-announcement', checkNotAuthenticatedAdmin, adminAnnounceController.createAnnouncement);
// delete announcement
router.post('/admin/announcement-delete', checkNotAuthenticatedAdmin, adminAnnounceController.deleteAnnouncement);


// ======= ADMIN: SCHOLAR ROUTES ======= //
// render admin scholars
router.get('/admin/scholars', checkNotAuthenticatedAdmin, adminScholarController.getScholarAccs);
// render admin scholars profile
// [TODO] turn into /admin/scholars/:id
router.get('/admin/scholars/profile', checkNotAuthenticatedAdmin, adminScholarController.getScholarProfile);
// verify admin scholars profile
// [TODO] turn into /admin/scholars/:id/verify AND functionalities
router.post('/admin/scholars/profile/verify', checkNotAuthenticatedAdmin, adminScholarController.verifyScholarAcc);


// ======= ADMIN: RENEW SCHOLARSHIP ROUTES ======= //s
// render admin applications of scholars
router.get('/admin/renew-scholarship', checkNotAuthenticatedAdmin, adminRenewController.getRenewalApps);
// approve scholarship renewal application
router.post('/admin/renew-scholarship-approve', upload.single("loe"), checkNotAuthenticatedAdmin, adminRenewController.approveRenewApp);
// reject scholarship renewal application
router.post('/admin/renew-scholarship-reject', checkNotAuthenticatedAdmin, adminRenewController.rejectRenewApp);
// render approved scholarship renewals
router.get('/admin/renew-scholarship/approved', checkNotAuthenticatedAdmin, adminRenewController.getApprovedRenew);
// render rejected scholarship renewals
router.get('/admin/renew-scholarship/rejected', checkNotAuthenticatedAdmin, adminRenewController.getRejectedRenew);

// ======= ADMIN: TRAVEL ABROAD ROUTES ======= //
// render admin applications of travel abroad
router.get('/admin/travel-abroad', checkNotAuthenticatedAdmin, adminTravelController.getTravelApps);
// approve travel abroad application
router.post('/admin/travel-abroad-approve', upload.single("permit"), checkNotAuthenticatedAdmin, adminTravelController.approveTravelApp);
// reject travel abroad application
router.post('/admin/travel-abroad-reject', checkNotAuthenticatedAdmin, adminTravelController.rejectTravelApp);
// render approved travel abroad
router.get('/admin/travel-abroad/approved', checkNotAuthenticatedAdmin, adminTravelController.getApprovedTravel);
// render rejected travel abroad
router.get('/admin/travel-abroad/rejected', checkNotAuthenticatedAdmin, adminTravelController.getRejectedTravel);

// ======= ADMIN: THESIS BUDGET ROUTES ======= //
// render admin applications of thesis budget
router.get('/admin/thesis-budget', checkNotAuthenticatedAdmin, adminThesisController.getThesisApps);
// approve thesis budget application
router.post('/admin/thesis-budget-approve', upload.single("budget"), checkNotAuthenticatedAdmin, adminThesisController.approveThesisApp);
// reject thesis budget application
router.post('/admin/thesis-budget-reject', checkNotAuthenticatedAdmin, adminThesisController.rejectThesisApp);
// render approved thesis budget
router.get('/admin/thesis-budget/approved', checkNotAuthenticatedAdmin, adminThesisController.getApprovedThesis);
// render rejected thesis budget
router.get('/admin/thesis-budget/rejected', checkNotAuthenticatedAdmin, adminThesisController.getRejectedThesis);


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