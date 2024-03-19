const { pool } = require("../models/dbConfig");
const express = require('express')
const bcrypt = require('bcrypt');
const flash = require('express-flash');
const crypto = require('crypto');
const sharp = require('sharp');
const nodemailer = require('nodemailer'); 
const globalLogger = require('../globalLogger');
const logger = require('../adminLogger');

const app = express();

const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { Console } = require("console");

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

    // LOAD SCHOLAR ACCOUNTS
    getScholarAccs: async (req, res)=>{
        try {
            const results = await pool.query(
                `SELECT u.id as id, CONCAT(u.firstname, ' ', u.lastname) as fullname, u.email as email, uai.scholar_type as scholar_type, uai.university as university
                FROM users u
                JOIN users_additional_info uai ON u.email = uai.email`);
            
                const people = results.rows;
                logger.info('Getting scholar accounts')
                return res.render('scholarAccs', { people });

        } catch (error) {
            if (process.env.MODE == 'debug'){
                globalLogger.error('Error fetching applications', error);
            }
            console.error('Error fetching applications: ', error);
            return res.status(500).send('Internal Server Error');
        }
    },

    // LOAD SCHOLAR PROFILE
    getScholarProfile: async (req, res)=>{
        try {
            const results = await pool.query(
                `SELECT u.id as id, CONCAT(u.firstname, ' ', u.lastname) as fullname, u.email as email, u.profilepic as profilepic, u.phonenum as phonenum, uai.scholar_type as scholar_type, uai.university as university, uai.degree as degree, uai.account_name as account_name, uai.account_num as account_num, u.verified as verified
                FROM users u
                JOIN users_additional_info uai ON u.email = uai.email
                WHERE u.id = $1`, [req.params.id]);
            
            console.log(results.rows);

            const getObjectParams = {
                Bucket: bucketName,
                Key: results.rows[0].profilepic, // file name
            }
            const command = new GetObjectCommand(getObjectParams);
            const url = await getSignedUrl(s3, command, { expiresIn: 3600 });

            const person = { 
                userpic: url, 
                scholar: results.rows[0].fullname, 
                email: results.rows[0].email, 
                phone: results.rows[0].phonenum, 
                scholar_type: results.rows[0].scholar_type, 
                school: results.rows[0].university, 
                degree: results.rows[0].degree, 
                accName: results.rows[0].account_name, 
                accNum: results.rows[0].account_num, 
                verified: (results.rows[0].verified).toString()
            };

            console.log(person);
            logger.info('Getting scholar profile', {info: person})
        
            return res.render('scholarProfile', person);
        } catch (error) {
            if (process.env.MODE == 'debug'){
                globalLogger.error('Error fetching applications', error);
            }
            console.error('Error fetching applications: ', error);
            return res.status(500).send('Internal Server Error');
        }
    },

    // VERIFY SCHOLAR ACCOUNT
    verifyScholarAcc: async (req, res)=>{
        const today = new Date();
        const day = today.getDate();
        const month = today.getMonth() + 1; 
        const year = today.getFullYear();
        date = year +"-"+ month +"-"+ day;

        try{
            email = req.body.email;

            pool.query(
                `UPDATE users
                SET verified = True, verifiedby = $1, verifieddate = $2
                WHERE email = $3;`,[req.user.username, date, email],(err, results)=>{
                    if (err){
                        if (process.env.MODE == 'debug')
                        {
                            globalLogger.error('Error', err)
                        }
                        console.error('Error:', err);
                        res.status(500).send('Internal Server Error');
                    }
                    else{
                        req.flash('success_msg', "User Verified");
                        logger.info('Scholar account verified', {info: email})
                        return res.redirect('/admin/scholars');
                    }
                }
            )
        } catch (err){
            if (process.env.MODE == 'debug'){
                globalLogger.error('Error', err)
            }
            res.status(500).send('Internal Server Error');
        }
    }
    
};

module.exports = controller;