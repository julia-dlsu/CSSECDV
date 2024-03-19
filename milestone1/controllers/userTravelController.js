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

// ======= METHODS ======= //
const controller = {

    // LOAD TRAVEL APPLICATIONS
    getTravelApps: async (req, res)=>{
        try {
            const results = await pool.query(
                `SELECT *, TO_CHAR(date_submitted, 'YYYY-MM-DD') AS date_submitted FROM travel_clearance_applications WHERE status != $1`, ['Deleted']);
            
            const applications = results.rows;

            for (let i = 0; i < applications.length; i++){
                if (applications[i].letter_of_intent != null && applications[i].deed_of_undertaking != null && applications[i].comaker_itr != null){
                    const getLOIParams = {
                        Bucket: bucketName,
                        Key: applications[i].letter_of_intent,
                    }
                    const loi_command = new GetObjectCommand(getLOIParams);
                    const loi_url = await getSignedUrl(s3, loi_command, { expiresIn: 3600 });
                    applications[i].letter_of_intent = loi_url
    
                    const getDOUParams = {
                        Bucket: bucketName,
                        Key: applications[i].deed_of_undertaking,
                    }
                    const dou_command = new GetObjectCommand(getDOUParams);
                    const dou_url = await getSignedUrl(s3, dou_command, { expiresIn: 3600 });
                    applications[i].deed_of_undertaking = dou_url

                    const getITRParams = {
                        Bucket: bucketName,
                        Key: applications[i].comaker_itr,
                    }
                    const itr_command = new GetObjectCommand(getITRParams);
                    const itr_url = await getSignedUrl(s3, itr_command, { expiresIn: 3600 });
                    applications[i].comaker_itr = itr_url
                }
        
                if (applications[i].approve_document != null){
                    const getApproveParams = {
                        Bucket: bucketName,
                        Key: applications[i].approve_document,
                    }
                    const approve_command = new GetObjectCommand(getApproveParams);
                    const approve_url = await getSignedUrl(s3, approve_command, { expiresIn: 3600 });
                    applications[i].approve_document = approve_url
                }
            }
            
            //console.log(applications);
            logger.debug('List of travel budget applications', {info: applications})
            return res.render('userTravel', { applications });
        } catch (error) {
            if (process.env.MODE == 'debug'){
                globalLogger.error('Error fetching applications: ', error);
            }
            //console.error('Error fetching applications: ', error);
            return res.status(500).send('Internal Server Error');
        }
    },

    // DELETE PENDING TRAVEL APPLICATION
    deleteTravelApp: async (req, res)=>{
        let appId = req.body.appId;
        appId = parseInt(appId);
        console.log(appId);

        // ensures that application being deleted has "Pending" status
        pool.query(
            `SELECT * FROM travel_clearance_applications
            WHERE id = $1 AND status = $2`, [appId, 'Pending'], (err, results)=>{
                if (err) {
                    console.error('Error: ', err);
                    res.status(500).send('Internal Server Error');
                } else {
                    logger.info('List of Travel Budget Applications', {info:results.rows});
                    
                    if (results.rows.length === 0){
                        logger.info("Selected application cannot be deleted anymore.");
                    } else { // application still has 'Pending' status
                        logger.info("User tries to delete travel application.");
                        pool.query(
                            `UPDATE travel_clearance_applications
                            SET status = $1
                            WHERE id = $2
                            RETURNING *`, ['Deleted', appId], (err, results)=>{
                                if (err) {
                                    if (process.env.MODE == 'debug'){
                                        globalLogger.error('Error: ', err);
                                    }
                                  //  console.error('Error: ', err);
                                    res.status(500).send('Internal Server Error');
                                } else {
                                   // console.log(results.rows);
                                   logger.debug('Info of deleted travel application', {info:results.rows})
                                    return res.redirect('/users/travel-abroad');
                                }
                            }
                        );
                    }
                }
            }
        );
    },

    // APPLY FOR TRAVEL
    applyTravel: async (req, res)=>{
        const today = new Date();
        const day = today.getDate();
        const month = today.getMonth() + 1; 
        const year = today.getFullYear();
        date = year +"-"+ month +"-"+ day;

        const generateFileName = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');
        const loi_file = req.files.loi[0];
        const dou_file = req.files.dou[0];
        const itr_file = req.files.itr[0];
        let errors = [];

        // ======= FILE VALIDATION ======= //
        // size check
        const maxSize = 1024 * 1024 * 1; // 1 for 1mb
        if (loi_file.size > maxSize || dou_file.size > maxSize || itr_file.size > maxSize){
            errors.push({ message: "Max upload size 1MB." });
            logger.info('User tried to upload a file larger than 1MB in applyTravel')
        
        }

        //console.log('test: ', req.files)

        // extention based file type check
        if (loi_file.mimetype != "application/pdf" || dou_file.mimetype != "application/pdf" || itr_file.mimetype != "application/pdf"){
            errors.push({ message: "Files are not a .PDF file." });
            logger.info('User did not upload a .PDF file, checked via extension in applyTravel')
        }

        // file siggy based file type check
        loi_buffer = req.files.loi[0].buffer;
        dou_buffer = req.files.dou[0].buffer;
        itr_buffer = req.files.itr[0].buffer;

        const loi_magicNum = loi_buffer.toString('hex', 0, 4);
        const dou_magicNum = dou_buffer.toString('hex', 0, 4);
        const its_magicNum = itr_buffer.toString('hex', 0, 4);
        const pdfNum = "25504446";

        if (loi_magicNum !== pdfNum || dou_magicNum !== pdfNum || its_magicNum !== pdfNum){
            errors.push({ message: ".PDF files only." });
            logger.info('User did not upload a .PDF file, checked via file signature in applyTravel')
        }

        if (errors.length > 0){
            try {
                const results = await pool.query(
                    `SELECT *, TO_CHAR(date_submitted, 'YYYY-MM-DD') AS date_submitted FROM travel_clearance_applications WHERE status != $1`, ['Deleted']);
                
                const applications = results.rows;
    
                for (let i = 0; i < applications.length; i++){
                    if (applications[i].letter_of_intent != null && applications[i].deed_of_undertaking != null && applications[i].comaker_itr != null){
                        const getLOIParams = {
                            Bucket: bucketName,
                            Key: applications[i].letter_of_intent,
                        }
                        const loi_command = new GetObjectCommand(getLOIParams);
                        const loi_url = await getSignedUrl(s3, loi_command, { expiresIn: 3600 });
                        applications[i].letter_of_intent = loi_url
        
                        const getDOUParams = {
                            Bucket: bucketName,
                            Key: applications[i].deed_of_undertaking,
                        }
                        const dou_command = new GetObjectCommand(getDOUParams);
                        const dou_url = await getSignedUrl(s3, dou_command, { expiresIn: 3600 });
                        applications[i].deed_of_undertaking = dou_url
    
                        const getITRParams = {
                            Bucket: bucketName,
                            Key: applications[i].comaker_itr,
                        }
                        const itr_command = new GetObjectCommand(getITRParams);
                        const itr_url = await getSignedUrl(s3, itr_command, { expiresIn: 3600 });
                        applications[i].comaker_itr = itr_url
                    }
            
                    if (applications[i].approve_document != null){
                        const getApproveParams = {
                            Bucket: bucketName,
                            Key: applications[i].approve_document,
                        }
                        const approve_command = new GetObjectCommand(getApproveParams);
                        const approve_url = await getSignedUrl(s3, approve_command, { expiresIn: 3600 });
                        applications[i].approve_document = approve_url
                    }
                }
                
                console.log('ERRORS: ', errors);
                return res.render('userTravel', { applications, errors });
            } catch (error) {
                if (process.env.MODE == 'debug'){
                    globalLogger.error('Error fetching applications: ', error);
                }
                //console.error('Error fetching applications: ', error);
                return res.status(500).send('Internal Server Error');
            }
        } else {
            // config the upload details to send to s3
            const loiName = generateFileName();
            const douName = generateFileName();
            const itrName = generateFileName();

            // upload
            const getLOIParams = {
                Bucket: bucketName,
                Body: req.files.loi[0].buffer,  // actual loi data
                Key: loiName, // becomes the file name
                ContentType: req.files.loi[0].mimetype
            };
            // send data to s3 bucket
            await s3.send(new PutObjectCommand(getLOIParams));

            const getDOUParams = {
                Bucket: bucketName,
                Body: req.files.dou[0].buffer,  // actual dou data
                Key: douName, // becomes the file name
                ContentType: req.files.dou[0].mimetype
            };
            // send data to s3 bucket
            await s3.send(new PutObjectCommand(getDOUParams));

            const getITRParams = {
                Bucket: bucketName,
                Body: req.files.itr[0].buffer,  // actual itr data
                Key: itrName, // becomes the file name
                ContentType: req.files.itr[0].mimetype
            };
            // send data to s3 bucket
            await s3.send(new PutObjectCommand(getITRParams));

            pool.query(
                `INSERT INTO travel_clearance_applications (email, date_submitted, letter_of_intent, deed_of_undertaking, comaker_itr, status)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *`, [req.user.email, date, loiName, douName, itrName, 'Pending'], (err, results)=>{
                    if (err) {
                        if (process.env.MODE == 'debug'){
                            globalLogger.error('Error fetching applications: ', err);
                        }
                        //console.error('Error: ', err);
                        res.status(500).send('Internal Server Error');
                    } else {
                        //console.log(results.rows);
                        logger.debug('Successful Travel Budget Application (Queried data inserted to travel_clearance_applications in applyTravel)', {info: results.rows})
                        return res.redirect('/users/travel-abroad');
                    }
                }
            );

        }
    }
};

module.exports = controller;