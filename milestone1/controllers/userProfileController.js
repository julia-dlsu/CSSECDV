const { pool } = require("../models/dbConfig");
const express = require('express')
const bcrypt = require('bcrypt');
const flash = require('express-flash');
const crypto = require('crypto');
const sharp = require('sharp');
const nodemailer = require('nodemailer'); 
const globalLogger = require('../globalLogger');
const logger = require('../transLogger');

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

let person = {};

// ======= METHODS ======= //
const controller = {

    // LOAD DASHBOARD
    getDashboard: async (req, res)=>{
        try {
            const results = await pool.query(
                `SELECT *, TO_CHAR(dateposted, 'YYYY-MM-DD') AS dateposted FROM admin_announcement WHERE deleted != $1`, ['t']);
            
                const posts = results.rows;
                return res.render('userDashboard', { posts });

        } catch (error) {
            if (process.env.MODE == 'debug'){ 
                globalLogger.error('Error occurred:', error); // Log the error
                res.status(500).send('Internal Server Error');
                //console.log('debug mode on')
              }
              else{
                res.status(500).send('Internal Server Error'); // Send a response to the client
                //console.log('debug mode off')
              }
        }
    },

    // LOAD SCHOLARS PROFILE
    getUserProfile: async (req, res)=>{
        const getObjectParams = {
            Bucket: bucketName,
            Key: req.user.profilepic, // file name
        }
        const command = new GetObjectCommand(getObjectParams);
        const url = await getSignedUrl(s3, command, { expiresIn: 3600 });

        pool.query(
            `SELECT * FROM users_additional_info
            WHERE email = $1`, [req.user.email], (err, results)=>{
                if (err) {
                    //console.error('Error: ', err);

                    if (process.env.MODE == 'debug'){ 
                        logger.error('Error occurred:', err); // Log the error
                        //console.log('debug mode on')
                    }
                    logger.info('An error occured in pool.query in getUserProfile')
                    res.status(500).send('Internal Server Error');
                } else {
                    //console.log(results.rows);
                    logger.debug('Profile info of the logged in user', {user: results.rows})
                
                    if (results.rows.length === 0){
                        //console.log('Incomplete registration');
                        logger.info('Incomplete Registration')
                        res.status(500).send('Internal Server Error');
                    } else {
                        person = { 
                            userpic: url, 
                            scholar: (req.user.firstname).concat(" ", req.user.lastname), 
                            email: req.user.email, 
                            phone: req.user.phonenum, 
                            type: results.rows[0].scholar_type, 
                            school: results.rows[0].university, 
                            degree: results.rows[0].degree, 
                            accName: results.rows[0].account_name, 
                            accNum: results.rows[0].account_num, 
                            verified: (req.user.verified).toString()
                        };
                        
                        logger.info('Rendering profile for user', {user: req.user.email})
                        return res.render('userProfile', person);
                    }
                }
            }
        );        
    },

    // UPDATE PROFILE PICTURE
    updateProfilePicture: async (req, res)=>{
        const generateFileName = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');
        const file = req.file;
        let errors = [];
       // console.log(file);
       logger.info('File uploaded by user in updateProfilePicture', {info:file})

        // ======= FILE VALIDATION ======= //
        // size check
        const maxSize = 1024 * 1024 * 1; // 1 for 1mb
        if (req.file.size > maxSize ){
            errors.push({ message: "Max upload size 1MB." });
            logger.info('User tried uploading a picture bigger than 1MB in updateProfilePicture')
        }

        // extention based file type check
        if (req.file.mimetype != "image/jpeg" && req.file.mimetype != "image/jpg" && req.file.mimetype != "image/png"){
            errors.push({ message: "File is not a .PNG .JPEG or .JPG file." });
            logger.info('File was checked to not be ".PNG .JPEG or .JPG based on file extension')
        }

        // file siggy based file type check
        buffer = req.file.buffer
        const magicNum = buffer.toString('hex', 0, 4);
        const pngNum = "89504e47"
        const jpegNum = "ffd8ffe0"
        const riffNum = "52494646"
        if (magicNum !== pngNum && magicNum !== jpegNum && magicNum !== riffNum){
            errors.push({ message: ".PNG .JPEG or .JPG files only." });
            logger.info('File was checked to not be ".PNG .JPEG or .JPG based on file signature')
        }

        // resize image
        const fileBuffer = await sharp(req.file.buffer)
            .resize({height: 180, width: 180, fit: "contain" })
            .toBuffer();
        
        // config the upload details to send to s3
        const fileName = generateFileName();
        const uploadParams = {
            Bucket: bucketName,
            Body: fileBuffer,  // actual image data
            Key: fileName, // becomes the file name
            ContentType: file.mimetype
        };

        if (errors.length > 0){
            person.errors = errors;
            res.render('userProfile', person);
        } else {
            // send data to s3 bucket
            await s3.send(new PutObjectCommand(uploadParams));

            pool.query(
                `UPDATE users
                SET profilepic = $1
                WHERE email = $2
                RETURNING *`, [fileName, req.user.email], (err, results)=>{
                    if (err) {
                        //console.error('Error: ', err);
                        if (process.env.MODE == 'debug'){
                            globalLogger.error('Error: ', err);
                        }
                        res.status(500).send('Internal Server Error');
                    } else {
                       // console.log(results.rows);
                        logger.debug('Updated user query from updateProfilePicture', {user:results.rows})
                        return res.redirect('/users/profile');
                    }
                }
            );
        }
    },

    // UPDATE PROFILE INFORMATION
    updateProfileInformation: async (req, res)=>{
        let { univ, degree } = req.body;
        let errors = [];
       // console.log(req.body);
        logger.info('req.body information from updateProfileInformation', {info:req.body})

        // ======= INPUT VALIDATION ======= //
        // check that there are no empty inputs
        if (!univ || !degree) {
            errors.push({ message: "Please enter all fields." });
        }

        const regex = /^[ a-zA-Z0-9.,!?&%#@:;*\-+=]{1,64}$/;
        if (!(regex.test(univ))){
            errors.push({ message: "Invalid university input" });
        }
        if (!(regex.test(degree))){
            errors.push({ message: "Invalid degree input" });
        }

        // ======= PSQL ======= //
        if (errors.length > 0){
            person.errors = errors;
            res.render('userProfile', person);
        } else {
            pool.query(
                `UPDATE users_additional_info
                SET university = $1, degree = $2
                WHERE email = $3
                RETURNING *`, [univ, degree, req.user.email], (err, results)=>{
                    if (err) {
                        if (process.env.MODE == 'debug'){
                            globalLogger.error('Error: ', err);
                        }
                        res.status(500).send('Internal Server Error');
                    } else {
                        console.log(results.rows);
                        logger.debug('Updated user query from updateProfileInformation', {user:results.rows})
                        return res.redirect('/users/profile');
                    }
                }
            );
        }
    },

    // COMPLETE PROFILE INFORMATION
    completeProfileInformation: async (req, res)=>{
        let { scholartype, univ, degree, accName, accNum } = req.body;
        let errors = [];
        //console.log(req.body);
        logger.info('req.body information from completeProfileInformation', {info:req.body})

        // ======= INPUT VALIDATION ======= //
        // check that there are no empty inputs
        if (!scholartype || !univ || !degree || !accName || !accNum ) {
            errors.push({ message: "Please enter all fields." });
            logger.info('User left empty inputs on completeProfileInformation')
        }

        if (scholartype != "Merit" && scholartype != "RA 7687"){
            errors.push({ message: "Incorrect Scholar Type" });
            logger.info('User inputted incorrect scholar type on completeProfileInformation')
        }

        const regex = /^[ a-zA-Z0-9.,!?&%#@:;*\-+=]{1,64}$/;
        if (!(regex.test(univ))){
            errors.push({ message: "Invalid university input" });
            logger.info('User inputted invalid university input on completeProfileInformation')
        }
        if (!(regex.test(degree))){
            errors.push({ message: "Invalid degree input" });
            logger.info('User inputted invalid degree input on completeProfileInformation')
        }
        if (!(regex.test(accName))){
            errors.push({ message: "Invalid account name input" });
            logger.info('User inputted invalid account name input on completeProfileInformation')
        }

        const accnumregex = /^\d{10}$/;
        if (!(accnumregex.test(accNum))){
            errors.push({ message: "Invalid account number input" });
            logger.info('User inputted invalid account number input on completeProfileInformation')
        }

        // ======= PSQL ======= //
        if (errors.length > 0){
            person.errors = errors;
            res.render('userProfile', person);
        } else {
            pool.query(
                `SELECT account_num
                FROM users_additional_info
                WHERE account_num = $1`, [accNum], (err, results)=>{
                    if (err) {
                        if (process.env.MODE == 'debug'){
                            globalLogger.error('Error: ', err)
                        }
                       // console.error('Error: ', err);
                        res.status(500).send('Internal Server Error');
                    } else {
                        if (results.rows.length > 0){
                            errors.push({ message: "Account number already registered." });
                            person.errors = errors;
                            res.render('userProfile', person);
                        } else { // complete the information
                            pool.query(
                                `UPDATE users_additional_info
                                SET scholar_type = $1, university = $2, degree = $3, account_name = $4, account_num = $5
                                WHERE email = $6
                                RETURNING *`, [scholartype, univ, degree, accName, accNum, req.user.email], (err, results)=>{
                                    if (err) {
                                        //console.error('Error: ', err);
                                        if (process.env.MODE == 'debug'){
                                            globalLogger.error('Error: ', err)
                                        }
                                        res.status(500).send('Internal Server Error');
                                    } else {
                                        //console.log(results.rows);
                                        logger.debug('Queried information from updating users_additional_info on completeProfileInformation', {info: results.rows})
                                        return res.redirect('/users/profile');
                                    }
                                }
                            );
                        }
                    }
                }
            );
        }
    }

};

module.exports = controller;