const express = require('express')
const ejs = require("ejs");
const app = express();
const { pool } = require("./dbConfig");
const bcrypt = require('bcrypt');
const session = require('express-session');
const flash = require('express-flash');
const passport = require('passport');
const cors = require('cors');
const multer = require("multer");

const storage = multer.diskStorage({
    destination: function(req, file, callback){
        callback(null, __dirname + "/uploads");
    } 
});

<<<<<<< Updated upstream
const uploads = multer({storage:storage});  
=======
const uploads = multer({
    dest: __dirname + "/uploads"
});  
>>>>>>> Stashed changes

app.use(cors());

const initializePassport = require('./passportConfig');

initializePassport(passport);

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

app.get('/', (req, res)=>{
    res.render('index');
});

app.get('/users/register', checkAuthenticated, (req, res)=>{
    res.render('register');
});

app.get('/users/pfp', checkAuthenticated, (req, res)=>{
    res.render('pfp');
});


app.get('/users/login', checkAuthenticated, (req, res)=>{
    res.render('login');
});

app.get('/users/dashboard', checkNotAuthenticated, (req, res)=>{
    res.render('dashboard', { user: req.user.username});
});

app.get("/users/logout", (req, res, next) => {
    req.logout(function(err){
        if (err) { return next(err); }
        res.redirect("/");
    });
});

app.post('/users/register', uploads.single("file"), async (req, res)=>{
    let { fname, lname, email, phone, uname, password, cpass } = req.body;
    console.log(req.body);
    console.log(req.file);

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

    if (errors.length > 0){
        res.render('register', { errors });
    } 
    else { // successful validation
        let hashedPass = await bcrypt.hash(password, 10);
        console.log(hashedPass);
        const pic = req.file.destination; //Can edit the last part to what we need

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
                        `INSERT INTO users (firstname, lastname, username, email, phonenum, profilepic, password)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                        RETURNING id, password`, [fname, lname, uname, email, phone, pic, hashedPass], (err, results)=>{
                            if (err){
                                throw err
                            }
                            console.log(results.rows);
<<<<<<< Updated upstream
                            req.flash('success_msg', "You are now almost done.");
                            res.redirect('/users/pfp');
=======
                            req.flash('success_msg', "Successfully Registered!");
                            res.redirect('/users/login');
>>>>>>> Stashed changes
                        }
                    )
                }
            }
        )
    }
});

app.post('/uploads',uploads.single("file"), (req, res) => {
    console.log(req.file);
    console.log("Received");
    }
  );

app.post(
    "/users/login",
    passport.authenticate("local", {
        successRedirect: "/users/dashboard",
        failureRedirect: "/users/login",
        failureFlash: true
    })
);

function checkAuthenticated(req, res, next){
    if (req.isAuthenticated()){
        return res.redirect('/users/dashboard');
    }
    next();
};

function checkNotAuthenticated(req, res, next){
    if (req.isAuthenticated()){
        return next();
    }
    res.redirect('/users/login');
}

app.listen(PORT, ()=>{
    console.log(`Server running on port ${PORT}`);
});