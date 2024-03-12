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
    saveUninitialized: false ,
    cookie: {maxAge: 3 * 60 * 1000}
}));
app.use(passport.initialize());
app.use(passport.session());

app.use(flash());

//i think the express-session error could come from here or sa logout req
app.use((req, res, next) => {
  const session = req.session;

  // Check if the session exists and has a lastAccess timestamp
  if (session && session.lastAccess) {
    console.log(session)
   // console.log(session.lastAccess)
    const now = new Date().getTime();
    const elapsedTime = now - session.lastAccess;
    console.log(now) //unix epoch
    console.log("^now var... | elapsedTime")
    console.log(elapsedTime)

    const sessionTimeout = 3 * 60 * 1000;
    console.log(sessionTimeout)

    //check if the user has a minute left before the timer runs out
    //flash message saying that they have a minute left
    //EDIT: fix how the flash messages work
    if (elapsedTime >= sessionTimeout - 60000)
    {
      console.log('one minute left')
      req.flash('timeout_msg', "You have one minute left before your session ends.")
    }

    // Check if the session has timed out
    if (elapsedTime > sessionTimeout) {
      // Session has timed out, destroy it
      //log user out if they're logged in
      console.log("destroyed session")
      delete req.session.lastAccess
      req.session.destroy((err) => {
        if (err) {
          console.error('Error destroying session:', err);
        }
      });
      res.redirect("/")
    }

  }

  if(!session.lastAccess){
    session.lastAccess = new Date().getTime();
  }
  
  next();
});

// serve static files
app.use(express.static('public'));
app.use(express.static(__dirname + "/public"));

// routes imports
const routes = require('./routes/index');
app.use('/', routes);

app.listen(PORT, ()=>{
    console.log(`Server running on port ${PORT}`);
});