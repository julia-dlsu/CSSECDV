const { pool } = require("../models/dbConfig");
const express = require('express')
const bcrypt = require('bcrypt');
const flash = require('express-flash');
const crypto = require('crypto');
const sharp = require('sharp');
const nodemailer = require('nodemailer'); 

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
        const posts = [
            { date: '03/03/2023', admin: 'admin1', title: 'Test1', announcement: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla venenatis dignissim odio at cursus. Aliquam erat volutpat. Etiam ligula dui, ultricies vitae bibendum sit amet, dignissim et justo. Aenean tempus, arcu sit amet eleifend fringilla, est lacus ullamcorper magna, sit amet sagittis odio lacus sit amet nibh. Cras magna tortor, pharetra quis urna at, consectetur eleifend massa. Morbi hendrerit enim eu hendrerit viverra. Fusce ac eros leo. Duis at sollicitudin orci.' },
            { date: '03/03/2023', admin: 'admin2', title: 'Test2', announcement: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla venenatis dignissim odio at cursus. Aliquam erat volutpat. Etiam ligula dui, ultricies vitae bibendum sit amet, dignissim et justo. Aenean tempus, arcu sit amet eleifend fringilla, est lacus ullamcorper magna, sit amet sagittis odio lacus sit amet nibh. Cras magna tortor, pharetra quis urna at, consectetur eleifend massa. Morbi hendrerit enim eu hendrerit viverra. Fusce ac eros leo. Duis at sollicitudin orci.' },
            { date: '03/03/2023', admin: 'admin3', title: 'Test3', announcement: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla venenatis dignissim odio at cursus. Aliquam erat volutpat. Etiam ligula dui, ultricies vitae bibendum sit amet, dignissim et justo. Aenean tempus, arcu sit amet eleifend fringilla, est lacus ullamcorper magna, sit amet sagittis odio lacus sit amet nibh. Cras magna tortor, pharetra quis urna at, consectetur eleifend massa. Morbi hendrerit enim eu hendrerit viverra. Fusce ac eros leo. Duis at sollicitudin orci.' }
        ]
    
        return res.render('userDashboard', { posts });
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
                    console.error('Error: ', err);
                    res.status(500).send('Internal Server Error');
                } else {
                    console.log(results.rows);
                
                    if (results.rows.length === 0){
                        console.log('Incomplete registration');
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
        console.log(file);

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
                        console.error('Error: ', err);
                        res.status(500).send('Internal Server Error');
                    } else {
                        console.log(results.rows);
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
        console.log(req.body);

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
                        console.error('Error: ', err);
                        res.status(500).send('Internal Server Error');
                    } else {
                        console.log(results.rows);
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
        console.log(req.body);

        // ======= INPUT VALIDATION ======= //
        // check that there are no empty inputs
        if (!scholartype || !univ || !degree || !accName || !accNum ) {
            errors.push({ message: "Please enter all fields." });
        }

        if (scholartype != "Merit" && scholartype != "RA 7687"){
            errors.push({ message: "Incorrect Scholar Type" });
        }

        const regex = /^[ a-zA-Z0-9.,!?&%#@:;*\-+=]{1,64}$/;
        if (!(regex.test(univ))){
            errors.push({ message: "Invalid university input" });
        }
        if (!(regex.test(degree))){
            errors.push({ message: "Invalid degree input" });
        }
        if (!(regex.test(accName))){
            errors.push({ message: "Invalid account name input" });
        }

        const accnumregex = /^\d{10}$/;
        if (!(accnumregex.test(accNum))){
            errors.push({ message: "Invalid account number input" });
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
                        console.error('Error: ', err);
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
                                        console.error('Error: ', err);
                                        res.status(500).send('Internal Server Error');
                                    } else {
                                        console.log(results.rows);
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