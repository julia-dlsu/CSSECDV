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

    // LOAD THESIS APPLICATIONS
    getThesisApps: async (req, res)=>{
        try {
            const results = await pool.query(
                `SELECT *, TO_CHAR(date_submitted, 'YYYY-MM-DD') AS date_submitted FROM thesis_budget_applications WHERE status != $1`, ['Deleted']);
            
            const applications = results.rows;

            for (let i = 0; i < applications.length; i++){
                if (applications[i].app_form != null){
                    const getAFParams = {
                        Bucket: bucketName,
                        Key: applications[i].app_form,
                    }
                    const af_command = new GetObjectCommand(getAFParams);
                    const af_url = await getSignedUrl(s3, af_command, { expiresIn: 3600 });
                    applications[i].app_form = af_url
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
            logger.debug("List of thesis budget applications" , {info: applications})
            return res.render('userThesis', { applications });
        } catch (error) {
            if (process.env.MODE == 'debug'){ 
                globalLogger.error('Error occurred:', error); // Log the error
                return res.status(500).send('Internal Server Error');
                //console.log('debug mode on')
              }
              else{
                return res.status(500).send('Internal Server Error'); // Send a response to the client
                //console.log('debug mode off')
              }
          //  console.error('Error fetching applications: ', error);
            //return res.status(500).send('Internal Server Error');
        }
    },

    // DELETE PENDING THESIS APPLICATION
    deleteThesisApp: async (req, res)=>{
        let appId = req.body.appId;
        appId = parseInt(appId);
        console.log(appId);

        // ensures that application being deleted has "Pending" status
        pool.query(
            `SELECT * FROM thesis_budget_applications
            WHERE id = $1 AND status = $2`, [appId, 'Pending'], (err, results)=>{
                if (err) {
                    if (process.env.MODE == 'debug'){
                        globalLogger.error('Error: ', err);
                    }
                   // console.error('Error: ', err);
                    res.status(500).send('Internal Server Error');
                } else {
                    //console.log(results.rows);
                    logger.info('Active thesis budget applications', {info: results.rows})
                    
                    if (results.rows.length === 0){
                     //   console.log("Selected application cannot be deleted anymore.");
                        logger.info("Selected application cannot be deleted anymore.")
                    } else { // application still has 'Pending' status
                        logger.info('User will delete a thesis budget application')
                        pool.query(
                            `UPDATE thesis_budget_applications
                            SET status = $1
                            WHERE id = $2
                            RETURNING *`, ['Deleted', appId], (err, results)=>{
                                if (err) {
                                   // console.error('Error: ', err);
                                   if (process.env.MODE == 'debug'){
                                    globalLogger.error('Error: ', err);
                                    }
                                    res.status(500).send('Internal Server Error');
                                } else {
                                    //console.log(results.rows);
                                    logger.debug('Info of deleted thesis budget application', {info: results.rows})
                                    return res.redirect('/users/thesis-budget');
                                }
                            }
                        );
                    }
                }
            }
        );
    },

    // APPLY FOR THESIS
    applyThesis: async (req, res)=>{
        const today = new Date();
        const day = today.getDate();
        const month = today.getMonth() + 1; 
        const year = today.getFullYear();
        date = year +"-"+ month +"-"+ day;

        const generateFileName = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');
        const af_file = req.file;
        let errors = [];
        
        logger.info('User will apply for thesis budget application')

        // ======= FILE VALIDATION ======= //
        // size check
        const maxSize = 1024 * 1024 * 1; // 1 for 1mb
        if (af_file.size > maxSize){
            errors.push({ message: "Max upload size 1MB." });
            logger.info('User tried to upload a file larger than 1MB in applyThesis')
        }

        // extention based file type check
        if (af_file.mimetype != "application/pdf"){
            errors.push({ message: "Files are not a .PDF file." });
            logger.info('User did not upload a .PDF file, checked via extension in applyThesis')
        }

        // file siggy based file type check
        af_buffer = req.file.buffer;
        const af_magicNum = af_buffer.toString('hex', 0, 4);
        const pdfNum = "25504446";
        if (af_magicNum !== pdfNum){
            errors.push({ message: ".PDF files only." });
            logger.info('User did not upload a .PDF file, checked via file signature in applyThesis')
        }

        if (errors.length > 0) {
            try {
                const results = await pool.query(
                    `SELECT *, TO_CHAR(date_submitted, 'YYYY-MM-DD') AS date_submitted FROM thesis_budget_applications WHERE status != $1`, ['Deleted']);
                
                const applications = results.rows;
    
                for (let i = 0; i < applications.length; i++){
                    if (applications[i].app_form != null){
                        const getAFParams = {
                            Bucket: bucketName,
                            Key: applications[i].app_form,
                        }
                        const af_command = new GetObjectCommand(getAFParams);
                        const af_url = await getSignedUrl(s3, af_command, { expiresIn: 3600 });
                        applications[i].app_form = af_url
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
                
                globalLogger.error('ERRORS: ', errors);
                return res.render('userThesis', { applications, errors });
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
              //  console.error('Error fetching applications: ', error);
              //  return res.status(500).send('Internal Server Error');
            }
        } else {
            // config the upload details to send to s3
            const afName = generateFileName();

            // upload
            const getAFParams = {
                Bucket: bucketName,
                Body: req.file.buffer,  // actual eaf data
                Key: afName, // becomes the file name
                ContentType: req.file.mimetype
            };
            // send data to s3 bucket
            await s3.send(new PutObjectCommand(getAFParams));

            pool.query(
                `INSERT INTO thesis_budget_applications (email, date_submitted, app_form, status)
                VALUES ($1, $2, $3, $4)
                RETURNING *`, [req.user.email, date, afName, 'Pending'], (err, results)=>{
                    if (err) {
                        //console.error('Error: ', err);
                        //res.status(500).send('Internal Server Error');
                        if (process.env.MODE == 'debug'){ 
                            globalLogger.error('Error:', err); // Log the error
                            res.status(500).send('Internal Server Error');
                            //console.log('debug mode on')
                          }
                          else{
                            res.status(500).send('Internal Server Error'); // Send a response to the client
                            //console.log('debug mode off')
                          }
                    } else {
                        //console.log(results.rows);
                        logger.debug('Info of successful thesis budget application', {results: results.rows})
                        //logger.info('Successful thesis budget application')
                        return res.redirect('/users/thesis-budget');
                    }
                }
            );
        }
    }
};

module.exports = controller;