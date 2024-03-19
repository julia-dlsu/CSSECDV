const express = require('express');
const ejs = require("ejs");
const app = express();
const session = require('express-session');
const flash = require('express-flash');
const passport = require('passport');
const pgSession = require('connect-pg-simple')(session)
const winston = require('express-winston');
const dailyRotateFile = require('winston-daily-rotate-file');
const {transports, createLogger, format} = require('winston');
const logger = require('./globalLogger');
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

//Logging
app.use(winston.logger({
  transports: [
    new dailyRotateFile({ //allows for a different log file per day
      filename: 'info_logs-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'info',
      format: format.combine(
        format.json(),
        format.timestamp(),
        format.prettyPrint(),
        format.errors({ stack: true })
      )})
  ],
  format: format.combine(
    format.json(),
    format.metadata(),
    format.timestamp({ format: 'YYYY-MM-DD hh:mm:ss.SSS A' }),
    format.prettyPrint(),
    format.errors({ stack: true })
  )
}));

//FOR SESSION TIMEOUTS
app.use((req, res, next) => {
  const session = req.session;
//  console.log('req sid: ', req.sessionID); 

  try {
    // Check if the session exists
    if (!session) {
      return next();
    }

    // FOR IDLE TIMEOUT
    if (req.session && req.session.lastActivity) {
      // for idle timeout
      const currentTime = new Date().getTime();
      const idleTimeout = 15 * 60 * 1000;
      idleTime = currentTime - req.session.lastActivity;
      //logger.debug('idle time: ', idleTime)

      if (currentTime - req.session.lastActivity > idleTimeout) {
        // Session has timed out due to inactivity, destroy it
        logger.debug('Deleting session due to idle timeout')
        req.session.destroy((err) => {
          if (err) {
            logger.error('Error destroying session:', err);
          } else {
            const sidToDelete = req.sessionID;
            const deleteQuery = 'DELETE FROM session WHERE sid = $1';
            logger.debug('Deleting session record', {sid: sidToDelete});
            pool.query(deleteQuery, [sidToDelete], (deleteErr, deleteResult) => {
              if (deleteErr) {
                logger.error('Error deleting session record:', deleteErr);
              } else {
                logger.debug('Session record deleted successfully');
                res.redirect("/");
              }
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
    if (process.env.MODE == 'debug'){
      logger.error('Error:', error);
    }
    res.status(500).send('Internal Server Error');
  }
});

// Middleware to handle updating session activity
app.use('/update-session-activity', (req, res, next) => {
  if (req.session) {
    req.session.lastActivity = new Date().getTime();
   logger.debug('last activity by user', { lastActivity: req.session.lastActivity });
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


// Middleware to simulate an error
app.get('/simulate-error', (req, res, next) => {
  try {
    throw new Error('Simulated error for testing');
  } catch (error) {
    next(error); // Pass the error to the error-handling middleware
  }
});

// Error-handling middleware
app.use((error, req, res, next) => {
  if (process.env.MODE == 'debug'){ 
    logger.error('Error occurred:', error); // Log the error
    res.status(500).send('Internal Server Error');
    //console.log('debug mode on')
  }
  else{
    res.status(500).send('Internal Server Error'); // Send a response to the client
    //console.log('debug mode off')
  }

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