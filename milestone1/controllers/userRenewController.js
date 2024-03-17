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
                        Key: applications[i].approve_document, // [TODO]: sample only
                    }
                    const approve_command = new GetObjectCommand(getApproveParams);
                    const approve_url = await getSignedUrl(s3, approve_command, { expiresIn: 3600 });
                    applications[i].approve_document = approve_url
                }
            }
            
            console.log(applications);
            return res.render('userRenew', { applications });
        } catch (error) {
            console.error('Error fetching applications: ', error);
            return res.status(500).send('Internal Server Error');
        }
    },

    // DELETE PENDING RENEWAL APPLICATION
    deleteRenewalApp: async (req, res)=>{
        console.log(req.body);
        return res.redirect('/users/renew-scholarship');
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
        console.log('file1: ', req.files.eaf[0]);
        console.log('file1: ', req.files.grades[0]);
        let errors = [];

        // ======= FILE VALIDATION ======= //
        // size check
        const maxSize = 1024 * 1024 * 1; // 1 for 1mb
        if (eaf_file.size > maxSize && grades_file.size > maxSize){
            errors.push({ message: "Max upload size 1MB." });
        }

        console.log('test: ', req.files)

        // extention based file type check
        if (eaf_file.mimetype != "application/pdf" && grades_file.mimetype != "application/pdf"){
            errors.push({ message: "Files are not a .PDF file." });
        }

        // file siggy based file type check
        eaf_buffer = req.files.eaf[0].buffer;
        grades_buffer = req.files.grades[0].buffer;
        const eaf_magicNum = eaf_buffer.toString('hex', 0, 4);
        const grades_magicNum = grades_buffer.toString('hex', 0, 4);
        const pdfNum = "25504446";
        if (eaf_magicNum !== pdfNum && grades_magicNum !== pdfNum){
            errors.push({ message: ".PDF files only." });
        }

        if (errors.length > 0){
            alert(errors.join("\n"));
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
                        console.error('Error: ', err);
                        res.status(500).send('Internal Server Error');
                    } else {
                        console.log(results.rows);
                        return res.redirect('/users/renew-scholarship');
                    }
                }
            );
        }
    }

};

module.exports = controller;