const LocalStrategy = require("passport-local").Strategy;
const { pool } = require("./dbConfig");
const bcrypt = require("bcrypt");
const rateLimit = require('express-rate-limit');

const RATE_LIMIT_THRESHOLD = 5; // Maximum allowed failed login attempts
const RATE_LIMIT_TIMEFRAME = 5 * 60 * 1000; // 5 minutes in milliseconds

function initialize(passport) {
  console.log("Initialized");

  const authenticateUser = (email, password, done) => {
    console.log(email, password);
    pool.query(
      `SELECT * FROM users WHERE email = $1`,
      [email],
      (err, results) => {
        if (err) {
          throw err;
        }
       //redirect to forget-password page when failed_login_attempts >= 5

        if (results.rows.length > 0) {
          const user = results.rows[0];
         
          // Check rate limiting
          const currentTimestamp = new Date()
          console.log(currentTimestamp)
          console.log('timestamp above')
          const lastFailedAttemptTimestamp = user.last_failed_login_attempt || 0; //make new column in db with last_failed_login_attemt time

       /* if (
            user.failed_login_attempts >= RATE_LIMIT_THRESHOLD 
        ) {
            // Too many failed login attempts within the time frame
            return done(null, false, { message: "Too many failed login attempts. Please try again later." });
            
        }*/

          bcrypt.compare(password, user.password, (err, isMatch) => {
            if (err) {
              console.log(err);
            }
            if (isMatch) {
              //reset failed_login_attempt
              pool.query(`UPDATE users SET failed_login_attempts = 0, last_login = NOW(), last_failed_login_attempt = 0 WHERE email = $1`, [email]);
              console.log('successful login attempt')
              return done(null, user);
            } else {
              //password is incorrect
              //increment failed_login_attempts
              pool.query(`UPDATE users SET failed_login_attempts = failed_login_attempts + 1, last_login = NOW(), last_failed_login_attempt = NOW() WHERE email = $1`, [email]); 
              console.log('failed login attempt')
              return done(null, false, { message: "Incorrect username or password." });

              //redirect to forget password if failed_login_attempts reach more than 5
              //but need to ensure that the user cant access the login page again after 5++ failed attempts
            }
          });
        } else {
          // No user
          return done(null, false, {
            message: "Incorrect username or password."
          });
        }
        console.log(results.rows);
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
      console.log(`ID is ${results.rows[0].id}`);
      return done(null, results.rows[0]);
    });
  });
}

module.exports = initialize;