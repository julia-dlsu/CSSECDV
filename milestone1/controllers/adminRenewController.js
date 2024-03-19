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
const { url } = require("inspector");
const { use } = require("passport");

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
                `SELECT u.id as id, CONCAT(u.firstname, ' ', u.lastname) as fullname, u.email as email, u.profilepic as profilepic, uai.scholar_type as scholar_type, uai.university as university, uai.degree as degree, uai.account_name as account_name, uai.account_num as account_num, u.verified as verified, u.verifiedby as verifiedby, sra.id as app_id, sra.eaf as eaf, sra.grades as grades, sra.approve_document as approve_document, TO_CHAR(sra.date_submitted, 'YYYY-MM-DD') as date_submitted, sra.status as status
                FROM users u
                JOIN users_additional_info uai ON u.email = uai.email
                JOIN scholar_renewal_applications sra ON u.email = sra.email
                WHERE sra.status = 'Pending'`);
            
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
            
        
            return res.render('adminRenew', { applications });
        } catch (error) {
            console.error('Error fetching applications: ', error);
            return res.status(500).send('Internal Server Error');
        }
    },

    // APPROVE RENEWAL APPLICATION
    approveRenewApp: async (req, res)=>{   
        try{
            let errors = []
            id = req.body['app_id'];

            buffer1 = req.file.buffer
            const magicNum = buffer1.toString('hex', 0, 4);
            const pdfNum = "25504446"

            if (magicNum !== pdfNum){
                errors.push({message: ".PDF files only."});
            }

            const maxSize = 1024 * 1024 * 1; // 1 for 1mb
            if (req.file.size > maxSize ){
                errors.push({ message: "Max upload size 1MB." });
            }

            if (errors.length> 0 ){
                try {
                    const results = await pool.query(
                        `SELECT u.id as id, CONCAT(u.firstname, ' ', u.lastname) as fullname, u.email as email, u.profilepic as profilepic, uai.scholar_type as scholar_type, uai.university as university, uai.degree as degree, uai.account_name as account_name, uai.account_num as account_num, u.verified as verified, u.verifiedby as verifiedby, sra.id as app_id, sra.eaf as eaf, sra.grades as grades, sra.approve_document as approve_document, TO_CHAR(sra.date_submitted, 'YYYY-MM-DD') as date_submitted, sra.status as status
                        FROM users u
                        JOIN users_additional_info uai ON u.email = uai.email
                        JOIN scholar_renewal_applications sra ON u.email = sra.email
                        WHERE sra.status = 'Pending'`);
                    
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
                    
                    return res.render('adminRenew', { applications, errors });
                } catch (error) {
                    console.error('Error fetching applications: ', error);
                    return res.status(500).send('Internal Server Error');
                }
            }

            if (buffer1 != null){
            
                const generateFileName = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');
            
                const fileName = generateFileName()
            
                const getApproveParams = {
                    Bucket: bucketName,
                    Body: req.file.buffer,
                    Key: fileName,
                    ContentType: req.file.mimetype
                } 
                
                await s3.send(new PutObjectCommand(getApproveParams));
                
                const today = new Date();
                const day = today.getDate();
                const month = today.getMonth() + 1; 
                const year = today.getFullYear();
                date = year +"-"+ month +"-"+ day 
                
                admin = req.user.username;
                pool.query(
                    `UPDATE scholar_renewal_applications
                    SET status = 'Approved', approve_document = $1, checked_by = $3, date_status_changed = $4 
                    WHERE id = $2;`,[fileName, id, admin, date],(err, results)=>{
                        if (err){
                            console.error('Error:', err);
                            res.status(500).send('Internal Server Error');
                        }
                        else{
                        req.flash('success_msg', "User Verified");
                        return res.redirect('/admin/renew-scholarship/approved');
                        }
                    }
                )

            }
    
            } catch (err){
                console.error(err)
                res.status(500).send('Internal Server Error');
            }
        
    },

    // REJECT RENEWAL APPLICATION
    rejectRenewApp: async (req, res)=>{
        try{
            id = req.body['appId'];

            const today = new Date();
            const day = today.getDate();
            const month = today.getMonth() + 1; 
            const year = today.getFullYear();
            date = month +"-"+ day +"-"+ year

            admin = req.user.username
        
            pool.query(
                `UPDATE scholar_renewal_applications
                SET status = 'Rejected', checked_by = $2, date_status_changed = $3
                WHERE id = $1;`,[id, admin, date],(err, results)=>{
                    if (err){
                        console.error('Error:', err);
                        res.status(500).send('Internal Server Error');
                    }
                    else{
                    req.flash('success_msg', "User Verified");
                    return res.redirect('/admin/renew-scholarship/rejected');
                    }
                }
            )
        } catch (err){
            console.error(err)
            res.status(500).send('Internal Server Error');
        }
    },

    // LOAD APPROVED RENEWAL APPLICATIONS
    getApprovedRenew: async (req, res)=>{
        try {
            const results = await pool.query(
                `SELECT u.id as id, CONCAT(u.firstname, ' ', u.lastname) as fullname, u.email as email, u.profilepic as profilepic, uai.scholar_type as scholar_type, uai.university as university, uai.degree as degree, uai.account_name as account_name, uai.account_num as account_num, u.verified as verified, u.verifiedby as verifiedby, sra.id as app_id, sra.eaf as eaf, sra.grades as grades, sra.approve_document as approve_document, TO_CHAR(sra.date_submitted, 'YYYY-MM-DD') as date_submitted, TO_CHAR(sra.date_status_changed, 'YYYY-MM-DD') as date_status_changed, sra.status as status, sra.checked_by as checked_by
                FROM users u
                JOIN users_additional_info uai ON u.email = uai.email
                JOIN scholar_renewal_applications sra ON u.email = sra.email
                WHERE sra.status = 'Approved'`);
            
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
            
            return res.render('approvedRenewals', { applications });
        } catch (error) {
            console.error('Error fetching applications: ', error);
            return res.status(500).send('Internal Server Error');
        }    
        
    },

    // LOAD REJECTED RENEWAL APPLICATIONS
    getRejectedRenew: async (req, res)=>{
        try {
            const results = await pool.query(
                `SELECT u.id as id, CONCAT(u.firstname, ' ', u.lastname) as fullname, u.email as email, u.profilepic as profilepic, uai.scholar_type as scholar_type, uai.university as university, uai.degree as degree, uai.account_name as account_name, uai.account_num as account_num, u.verified as verified, u.verifiedby as verifiedby, sra.id as app_id, sra.eaf as eaf, sra.grades as grades, sra.approve_document as approve_document, TO_CHAR(sra.date_submitted, 'YYYY-MM-DD') as date_submitted, TO_CHAR(sra.date_status_changed, 'YYYY-MM-DD') as date_status_changed, sra.status as status, sra.checked_by as checked_by
                FROM users u
                JOIN users_additional_info uai ON u.email = uai.email
                JOIN scholar_renewal_applications sra ON u.email = sra.email
                WHERE sra.status = 'Rejected'`);
            
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
            }
            
    
            return res.render('rejectedRenewals', { applications });
        } catch (error) {
            console.error('Error fetching applications: ', error);
            return res.status(500).send('Internal Server Error');
        }
    }
    
};

module.exports = controller;