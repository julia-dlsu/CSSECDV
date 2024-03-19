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

    // LOAD RENEWAL APPLICATIONS
    getRenewalApps: async (req, res)=>{
        try {
            const results = await pool.query(
                `SELECT *, TO_CHAR(date_submitted, 'YYYY-MM-DD') AS date_submitted FROM scholar_renewal_applications WHERE status != $1`, ['Deleted']);
            
            const applications = results.rows;

            for (let i = 0; i < applications.length; i++){
                if (applications[i].eaf != null && applications[i].grades != null){
                    const getEAFParams = {
                        Bucket: bucketName,
                        Key: applications[i].eaf,
                    }
                    const eaf_command = new GetObjectCommand(getEAFParams);
                    const eaf_url = await getSignedUrl(s3, eaf_command, { expiresIn: 3600 });
                    applications[i].eaf = eaf_url
    
                    const getGradesParams = {
                        Bucket: bucketName,
                        Key: applications[i].grades,
                    }
                    const grades_command = new GetObjectCommand(getGradesParams);
                    const grades_url = await getSignedUrl(s3, grades_command, { expiresIn: 3600 });
                    applications[i].grades = grades_url
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
            logger.debug('List of scholarship renewal applications', {info:applications})
            return res.render('userRenew', { applications });
        } catch (error) {
            if (process.env.MODE == 'debug'){ 
                globalLogger.error('Error fetching applications:', error); // Log the error
                return res.status(500).send('Internal Server Error');
                //console.log('debug mode on')
              }
              else{
                return res.status(500).send('Internal Server Error'); // Send a response to the client
                //console.log('debug mode off')
              }
           // console.error('Error fetching applications: ', error);
            //return res.status(500).send('Internal Server Error');
        }
    },

    // DELETE PENDING RENEWAL APPLICATION
    deleteRenewalApp: async (req, res)=>{
        let appId = req.body.appId;
        appId = parseInt(appId);
        console.log(appId);

        // ensures that application being deleted has "Pending" status
        pool.query(
            `SELECT * FROM scholar_renewal_applications
            WHERE id = $1 AND status = $2`, [appId, 'Pending'], (err, results)=>{
                if (err) {
                    console.error('Error: ', err);
                    if (process.env.MODE == 'debug'){ 
                        globalLogger.error('Error occurred:', err);
                    }
                    res.status(500).send('Internal Server Error');
                } else {
                    //console.log(results.rows);
                    logger.debug('Scholarship renewal application to be deleted', {info:results.rows})
                    
                    if (results.rows.length === 0){
                        //console.log("Selected application cannot be deleted anymore.");
                        logger.info("Selected application cannot be deleted anymore in deleteRenewalApp.");
                    } else { // application still has 'Pending' status
                        pool.query(
                            `UPDATE scholar_renewal_applications
                            SET status = $1
                            WHERE id = $2
                            RETURNING *`, ['Deleted', appId], (err, results)=>{
                                if (err) {
                                  /*  console.error('Error: ', err);
                                    res.status(500).send('Internal Server Error');*/
                                    if (process.env.MODE == 'debug'){ 
                                        globalLogger.error('Error occurred:', err); // Log the error
                                        res.status(500).send('Internal Server Error');
                                        //console.log('debug mode on')
                                      }
                                      else{
                                        res.status(500).send('Internal Server Error'); // Send a response to the client
                                        //console.log('debug mode off')
                                      }
                                } else {
                                    //console.log(results.rows);
                                    logger.debug('Info of deleted scholarship renewal application', {info:results.rows})
                                    return res.redirect('/users/renew-scholarship');
                                }
                            }
                        );
                    }
                }
            }
        );
    },

    // APPLY FOR RENEWAL
    applyRenewal: async (req, res)=>{
        const today = new Date();
        const day = today.getDate();
        const month = today.getMonth() + 1; 
        const year = today.getFullYear();
        date = year +"-"+ month +"-"+ day;

        const generateFileName = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');
        const eaf_file = req.files.eaf[0];
        const grades_file = req.files.grades[0];
        let errors = [];

        // ======= FILE VALIDATION ======= //
        // size check
        const maxSize = 1024 * 1024 * 1; // 1 for 1mb
        if (eaf_file.size > maxSize || grades_file.size > maxSize){
            errors.push({ message: "Max upload size 1MB." });
            logger.info('User tried to upload a file larger than 1MB in applyRenewal')
        }

        // extention based file type check
        if (eaf_file.mimetype != "application/pdf" || grades_file.mimetype != "application/pdf"){
            errors.push({ message: "Files are not a .PDF file." });
            logger.info('User did not upload a .PDF file, checked via extension in applyRenewal')
        }

        // file siggy based file type check
        eaf_buffer = req.files.eaf[0].buffer;
        grades_buffer = req.files.grades[0].buffer;
        const eaf_magicNum = eaf_buffer.toString('hex', 0, 4);
        const grades_magicNum = grades_buffer.toString('hex', 0, 4);
        const pdfNum = "25504446";
        if (eaf_magicNum !== pdfNum || grades_magicNum !== pdfNum){
            errors.push({ message: ".PDF files only." });
            logger.info('User did not upload a .PDF file, checked via file signature in applyRenewal')
        }

        if (errors.length > 0){
            try {
                const results = await pool.query(
                    `SELECT *, TO_CHAR(date_submitted, 'YYYY-MM-DD') AS date_submitted FROM scholar_renewal_applications WHERE status != $1`, ['Deleted']);
                
                const applications = results.rows;
    
                for (let i = 0; i < applications.length; i++){
                    if (applications[i].eaf != null && applications[i].grades != null){
                        const getEAFParams = {
                            Bucket: bucketName,
                            Key: applications[i].eaf,
                        }
                        const eaf_command = new GetObjectCommand(getEAFParams);
                        const eaf_url = await getSignedUrl(s3, eaf_command, { expiresIn: 3600 });
                        applications[i].eaf = eaf_url
        
                        const getGradesParams = {
                            Bucket: bucketName,
                            Key: applications[i].grades,
                        }
                        const grades_command = new GetObjectCommand(getGradesParams);
                        const grades_url = await getSignedUrl(s3, grades_command, { expiresIn: 3600 });
                        applications[i].grades = grades_url
                    }
            
                    if (applications[i].approve_document != null){
                        const getApproveParams = {
                            Bucket: bucketName,
                            Key: applications[i].approve_document, // [TODO]: sample only
                        }
                        const approve_command = new GetObjectCommand(getApproveParams);
                        const approve_url = await getSignedUrl(s3, approve_command, { expiresIn: 3600 });
                        applications[i].approve_document = approve_url
                    }
                }
                
                //console.log('ERRORS: ', errors);
                globalLogger.error('ERRORS:', errors); // Log the error
                return res.render('userRenew', { applications, errors });
            } catch (error) {
                if (process.env.MODE == 'debug'){ 
                    globalLogger.error('Error fetching applications:', error); // Log the error
                    return res.status(500).send('Internal Server Error');
                    //console.log('debug mode on')
                  }
                  else{
                    return res.status(500).send('Internal Server Error'); // Send a response to the client
                    //console.log('debug mode off')
                  }
                //console.error('Error fetching applications: ', error);
                //return res.status(500).send('Internal Server Error');
            }
        } else {
            // config the upload details to send to s3
            const eafName = generateFileName();
            const gradesName = generateFileName();

            // upload
            const getEAFParams = {
                Bucket: bucketName,
                Body: req.files.eaf[0].buffer,  // actual eaf data
                Key: eafName, // becomes the file name
                ContentType: req.files.eaf[0].mimetype
            };
            // send data to s3 bucket
            await s3.send(new PutObjectCommand(getEAFParams));

            const getGradesParams = {
                Bucket: bucketName,
                Body: req.files.grades[0].buffer,  // actual grades data
                Key: gradesName, // becomes the file name
                ContentType: req.files.grades[0].mimetype
            };
            // send data to s3 bucket
            await s3.send(new PutObjectCommand(getGradesParams));

            pool.query(
                `INSERT INTO scholar_renewal_applications (email, date_submitted, eaf, grades, status)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *`, [req.user.email, date, eafName, gradesName, 'Pending'], (err, results)=>{
                    if (err) {
                        if (process.env.MODE == 'debug'){ 
                            globalLogger.error('Error:', err); // Log the error
                            res.status(500).send('Internal Server Error');
                            //console.log('debug mode on')
                          }
                          else{
                            res.status(500).send('Internal Server Error'); // Send a response to the client
                            //console.log('debug mode off')
                          }
                     //   console.error('Error: ', err);
                     //   res.status(500).send('Internal Server Error');
                        
                    } else {
                        logger.info('User applied for scholarship renewal', {userEmail: req.user.email})
                        return res.redirect('/users/renew-scholarship');
                    }
                }
            );
        }
    }

};

module.exports = controller;