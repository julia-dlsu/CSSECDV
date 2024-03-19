const express = require('express');
const ejs = require("ejs");
const app = express();
const session = require('express-session');
const flash = require('express-flash');
const passport = require('passport');

require("dotenv").config();

const initializePassport = require('./passportConfig');
initializePassport(passport);

const PORT = process.env.PORT || 4000;
const secret = process.env.SESSION_SECRET;

app.set('view engine', 'ejs');
app.use(express.urlencoded({extended: false}));

// MIDDLESWARES: configuration for handling API endpoint data
app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));

app.use(session({
    secret: secret,
    resave: false,
    saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

app.use(flash());

// serve static files
app.use(express.static('public'));
app.use(express.static(__dirname + "/public"));

// routes imports
const routes = require('./routes/index');
app.use('/', routes);

app.listen(PORT, ()=>{
    console.log(`Server running on port ${PORT}`);
});