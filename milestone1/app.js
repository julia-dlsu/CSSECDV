const express = require('express')
const ejs = require("ejs");
const app = express();
const { pool } = require("./dbConfig");

const PORT = process.env.PORT || 4000;

app.set('view engine', 'ejs');
app.use(express.urlencoded({extended: false}));

// configuration for handling API endpoint data
app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));

// serve static files
app.use(express.static('public'));
app.use(express.static(__dirname + "/public"));

app.get('/', (req, res)=>{
    res.render('index');
});

app.get('/users/register', (req, res)=>{
    res.render('register');
});

app.get('/users/login', (req, res)=>{
    res.render('login');
});

app.get('/users/dashboard', (req, res)=>{
    res.render('dashboard', { user: "Julia"});
});

app.post('/users/register', (req, res)=>{
    let { fname, lname, email, phone, uname, pass, cpass } = req.body
    console.log(req.body);

    let errors = [];

    // check that there are no empty inputs
    if (!fname || !lname || !email || !phone || !uname || !pass || !cpass ) {
        errors.push({ message: "Please enter all fields." });
    }

    // checks password length
    if (pass.length < 8){
        errors.push({ message: "The password should be at least 8 characters." });
    }

    const upper = /[A-Z]/;
    const lower = /[a-z]/;
    const digit = /[0-9]/;
    const specialc = /[.,!$%&#?^_\-+;:]/;
    
    // checks password validity
    if (!(upper.test(pass) && lower.test(pass) && digit.test(pass) && specialc.test(pass))){
        errors.push({ message: "The password should contain at least one of each: uppercase letter, lowercase letter, digit, special character." });
    }

    // checks if passwords match
    if (pass != cpass){
        errors.push({ message: "Passwords do not match." });
    }

    if (errors.length > 0){
        res.render('register', { errors });
    }
});

app.listen(PORT, ()=>{
    console.log(`Server running on port ${PORT}`);
});