const express = require('express');
const ejs = require("ejs");
const app = express();
const session = require('express-session');
const flash = require('express-flash');
const passport = require('passport');
const pgSession = require('connect-pg-simple')(session)

require("dotenv").config();

const initializePassport = require('./passportConfig');
initializePassport(passport);

const PORT = process.env.PORT || 4000;
const secret = process.env.SESSION_SECRET;

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DB_URL,
  ssl: false
});


app.set('view engine', 'ejs');
app.use(express.urlencoded({extended: false}));

// MIDDLESWARES: configuration for handling API endpoint data
app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));

app.use(session({
  store: new pgSession({
    pool,
    tableName: 'session' 
  }),
    secret: secret,
    resave: false,
    saveUninitialized: false ,
    cookie: {maxAge: 10 * 60 * 1000}
}));
app.use(passport.initialize());
app.use(passport.session());

app.use(flash());


//FOR SESSION TIMEOUTS
//NOTE: need to test for admin
app.use((req, res, next) => {
  try {
    const session = req.session;
    console.log('req sid: ', req.sessionID);

    // Check if the session exists
    if (!session) {
      return next();
    }

    // FOR IDLE TIMEOUT (needs testing for admin)
    if (req.session && req.session.lastActivity) {

      // for idle timeout
      const currentTime = new Date().getTime();
      const idleTimeout = 2 * 60 * 1000;

      // console.log('last activity: ', req.session.lastActivity)
      idleTime = currentTime - req.session.lastActivity;
      // console.log('idle time: ', idleTime)
      // console.log('currentTime: ', currentTime)

      if (currentTime - req.session.lastActivity > idleTimeout) {
        // Session has timed out due to inactivity, destroy it

        req.session.destroy((err) => {
          if (err) {
            console.error('Error destroying session:', err);
          } else {

            console.log("I D L E   T I M E O U T")
            sidToDelete = req.sessionID;
            // not sure if DELETE or SELECT
            deleteQuery = 'DELETE FROM session WHERE sid = $1'
            pool.query(deleteQuery, [sidToDelete], (deleteErr, deleteResult) => {
              if (deleteErr) {
                console.error('Error deleting session record:', deleteErr);
              } else {
                console.log('Session record deleted successfully');
                res.redirect("/")
              }
              // res.redirect("/") //getting Error [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent to the client
            });

          }
        });
        return;

      }

    }


    if (!session.lastAccess) {
      session.lastAccess = new Date().getTime();
    }

    next();
  } catch (error) {
    console.error('Error:', error);
    res.status(500).send('Internal Server Error');
  } 
});


// Middleware to handle updating session activity
app.use('/update-session-activity', (req, res, next) => {
  if (req.session) {
    req.session.lastActivity = new Date().getTime();
    console.log('last activity 3: ', req.session.lastActivity)
  }
  next();
});

//to set cache-control globally
app.use((req, res, next) => {
  res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.header('Expires', '-1');
  res.header('Pragma', 'no-cache');
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