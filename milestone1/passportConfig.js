const LocalStrategy = require("passport-local").Strategy;
const { pool } = require("./models/dbConfig");
const bcrypt = require("bcrypt");
const winston = require('express-winston');
require('winston-daily-rotate-file');
const {transports, createLogger, format} = require('winston');
const logger = require('./authLogger');

function initialize(passport) {
  console.log("Initialized");

  const authenticateUser = (email, password, done) => {
  //  console.log(email, password);
    pool.query(
      `SELECT * FROM users WHERE email = $1`,
      [email],
      (err, results) => {
        if (err) {
          throw err;
        }

        if (results.rows.length > 0) {
          const user = results.rows[0];

          bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err) {
              console.log(err);
              if (process.env.MODE == 'debug'){ 
                logger.error('Error occurred:', err); // Log the error
                res.status(500).send('Internal Server Error');
                //console.log('debug mode on')
              }
              else{
                res.status(500).send('Internal Server Error'); // Send a response to the client
                //console.log('debug mode off')
              }
            }
            if (isMatch) {
              //reset failed_login_attempt
              pool.query(`UPDATE users SET failed_login_attempts = 0, last_login = NOW() WHERE email = $1`, [email]);
          //    console.log('successful login attempt')
              logger.info('Successful login attempt')
              return done(null, user);
            } else {
              //password is incorrect
              //increment failed_login_attempts
              pool.query(`UPDATE users SET failed_login_attempts = failed_login_attempts + 1, last_login = NOW() WHERE email = $1`, [email]); 
           //   console.log('failed login attempt')
              logger.warn('Failed login attempt')

              return done(null, false, { message: "Incorrect username or password." });            
        }});
        } else {
          // No user
          return done(null, false, {
            message: "Incorrect username or password."
          });
        }
       // console.log(results.rows);
       const logMessage = JSON.stringify(results.rows); // Convert to a JSON string
      logger.debug('Info of user who logged in',{logMessage}); // Log the JSON string
      }
    );
  };

  passport.use(
    new LocalStrategy(
      { usernameField: "email", passwordField: "password" },
      authenticateUser
    )
  );

  // Stores user details inside session. serializeUser determines which data of the user
  // object should be stored in the session. The result of the serializeUser method is attached
  // to the session as req.session.passport.user = {}. Here for instance, it would be (as we provide
  //   the user id as the key) req.session.passport.user = {id: 'xyz'}
  passport.serializeUser((user, done) => done(null, user.id));

  // In deserializeUser that key is matched with the in memory array / database or any data resource.
  // The fetched object is attached to the request object as req.user

  passport.deserializeUser((id, done) => {
    pool.query(`SELECT * FROM users WHERE id = $1`, [id], (err, results) => {
      if (err) {
        return done(err);
      }
    //  console.log(`ID is ${results.rows[0].id}`);
      return done(null, results.rows[0]);
    });
  });
}

module.exports = initialize;