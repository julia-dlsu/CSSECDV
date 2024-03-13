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
//NOTE: for idle timeouts, may error: Error [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent to the client
//NOTE: also for idle timeouts, user doesn't get redirected to the '/' page with click events
app.use((req, res, next) => {
  const session = req.session;
  console.log('req sid: ', req.sessionID)

  //Check if the session exists
  if (!session) {
    return next();
  }
  console.log(session)

  // Check if the session exists and has a lastAccess timestamp
  if (session && session.lastAccess) {
   
   // console.log(session.lastAccess)
    const now = new Date().getTime();
    const elapsedTime = now - session.lastAccess;
 //   console.log(now) //unix epoch
   // console.log("elapsed time in milliseconds: ", elapsedTime)

    //for lifetime timeouts
    const sessionTimeout = 45 * 60 * 1000;


    //CODE BELOW IS FOR LIFETIME TIMEOUT
    //i think this is okay
    //EDIT: fix how the flash messages work
    if (elapsedTime >= sessionTimeout - 60000)
    {
      console.log('one minute left')
      req.flash('timeout_msg', "You have one minute left before your session ends.")
    }

    if (elapsedTime > sessionTimeout) {
      // Session has timed out, destroy it
      // Log user out if they're logged in
   
      console.log("DESTROYED SESSION");
      req.session.destroy((err) => {
        if (err) {
          console.error('Error destroying session:', err);
        } else {
          // NEED TO EDIT: Delete session record from the database
         /* req.sessionStore.destroy(req.sessionID, (destroyErr) => {
            if (destroyErr) {
              console.error('Error deleting session record:', destroyErr);
            }
          });*/
          sidToDelete = req.sessionID;
          deleteQuery = 'SELECT FROM session WHERE sid = $1'
          pool.query(deleteQuery, [sidToDelete], (deleteErr, deleteResult) => {
            if (deleteErr) {
              console.error('Error deleting session record:', deleteErr);
            } else {
              console.log('Session record deleted successfully');
            }
          });
          
        }
      });
      
    }
    
  }

  //FOR IDLE TIMEOUT (needs testing)
  //note: may delay during the session timeout (it's not like aninmosys that kicks you out when you click on smth after the timer is up)
  //i have to click "another page" 2x before being logged out
  if (req.session && req.session.lastActivity) {
   
    //for idle timeout
    const currentTime = new Date().getTime();
    const idleTimeout = 4 * 60 * 1000;

    console.log('last activity: ', req.session.lastActivity)
    idleTime = currentTime - req.session.lastActivity
    //console.log('idle time: ', idleTime)
    //console.log('currentTime: ', currentTime)

    if (currentTime - req.session.lastActivity > idleTimeout) { 
      // Session has timed out due to inactivity, destroy it
      console.log("I D L E   T I M E O U T")
      req.session.destroy((err) => {
        if (err) {
          console.error('Error destroying session:', err);
        } else {
          // NEED TO EDIT: Delete session record from the database
         /* req.sessionStore.destroy(req.sessionID, (destroyErr) => {
            if (destroyErr) {
              console.error('Error deleting session record:', destroyErr);
            }
          });*/
          sidToDelete = req.sessionID;
          deleteQuery = 'SELECT FROM session WHERE sid = $1'
          pool.query(deleteQuery, [sidToDelete], (deleteErr, deleteResult) => {
            if (deleteErr) {
              console.error('Error deleting session record:', deleteErr);
            } else {
              console.log('Session record deleted successfully');
            }
          });
          
        }
      });
      res.redirect("/")
     
    }

  }
    // Update last activity timestamp if the session still exists
  if(req.session)
  {
    req.session.lastActivity = new Date().getTime(); //may error here during idle timeout 
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