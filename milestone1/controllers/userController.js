const { pool } = require("../models/dbConfig");
const express = require('express')
const bcrypt = require('bcrypt');
const flash = require('express-flash');
const crypto = require('crypto');
const sharp = require('sharp');

const app = express();

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
app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));

// ======= METHODS ======= //
const controller = {
    // REGISTER USERS
    registerUser: async (req, res) => {
        const generateFileName = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');
        let { fname, lname, email, phone, uname, password, cpass } = req.body;
        const file = req.file;
        let errors = [];

        // ======= FILE VALIDATION ======= //
        // size check
        const maxSize = 1024 * 1024 * 1; // 1 for 1mb
        if (req.file.size > maxSize ){
            errors.push({ message: "Max upload size 1MB." });
        }

        // extention based file type check
        if (req.file.mimetype != "image/jpeg" && req.file.mimetype != "image/jpg" && req.file.mimetype != "image/png"){
            errors.push({ message: "File is not a .PNG .JPEG or .JPG file." });
        }

        // file siggy based file type check
        buffer = req.file.buffer
        const magicNum = buffer.toString('hex', 0, 4);
        const pngNum = "89504e47"
        const jpegNum = "ffd8ffe0"
        const riffNum = "52494646"
        if (magicNum !== pngNum && magicNum !== jpegNum && magicNum !== riffNum){
            errors.push({ message: ".PNG .JPEG or .JPG files only." });
        }

        // resize image
        const fileBuffer = await sharp(req.file.buffer)
            .resize({height: 180, width: 180, fit: "contain" })
            .toBuffer();
        
        // config the upload details to send to s3
        const fileName = generateFileName()
        const uploadParams = {
            Bucket: bucketName,
            Body: fileBuffer,  // actual image data
            Key: fileName, // becomes the file name
            ContentType: file.mimetype
        };

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
            // send data to s3 bucket
            await s3.send(new PutObjectCommand(uploadParams));
    
            try{
                pool.query(
                    `SELECT * FROM users
                    WHERE email = $1 OR username = $2`, [email, uname], (err, results)=>{

                      //  console.log(results.rows);
        
                        if (results.rows.length > 0){
                            if (results.rows[0].email === email){
                                errors.push({ message: "Email already registered." });
                            }
                            if (results.rows[0].username === uname){
                                errors.push({ message: "Username already registered." });
                            }
                            res.render("register", { errors });
                        } else{ // register the user
                            try {
                                pool.query(
                                    `INSERT INTO users (firstname, lastname, username, email, phonenum, profilepic, password, role)
                                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                                    RETURNING id, password`, [fname, lname, uname, email, phone, fileName, hashedPass, 'user'], (err, results)=>{
                                        
                                        console.log(results.rows);
                                        req.flash('success_msg', "You are now registered. Please log in.");
                                        res.redirect('/users/login');
                                    }
                                )
                            } catch {
                                console.error('Error:', error);
                                res.status(500).send('Internal Server Error');
                            }
                        }
                    }
                )
            } catch {
                console.error('Error:', error);
                res.status(500).send('Internal Server Error');
            }
        }

    }
};

module.exports = controller;