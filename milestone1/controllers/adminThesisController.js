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

    // LOAD THESIS APPLICATIONS
    getThesisApps: async (req, res)=>{           
        try {
            const results = await pool.query(
                `SELECT u.id as id, CONCAT(u.firstname, ' ', u.lastname) as scholar, u.email as email, u.profilepic as profilepic, uai.scholar_type as type, uai.university as university, uai.degree as degree, uai.account_name as account_name, uai.account_num as account_num, u.verified as verified, u.verifiedby as verifiedby, sra.id as app_id, sra.app_form as af , sra.approve_document as approved, TO_CHAR(sra.date_submitted, 'YYYY-MM-DD') as date_submitted, sra.status as status
                FROM users u
                JOIN users_additional_info uai ON u.email = uai.email
                JOIN thesis_budget_applications sra ON u.email = sra.email
                WHERE sra.status = 'Pending'`);
            
            const applications = results.rows;

            for (let i = 0; i < applications.length; i++){
                if (applications[i].af != null){
                    const getFormParams = {
                        Bucket: bucketName,
                        Key: applications[i].af,
                    }
                    const form_command = new GetObjectCommand(getFormParams);
                    const form_url = await getSignedUrl(s3, form_command, { expiresIn: 3600 });
                    applications[i].af = form_url
                }
        
                if (applications[i].approved != null){
                    const getApproveParams = {
                        Bucket: bucketName,
                        Key: applications[i].approved,
                    }
                    const approve_command = new GetObjectCommand(getApproveParams);
                    const approve_url = await getSignedUrl(s3, approve_command, { expiresIn: 3600 });
                    applications[i].approved = approve_url
                }
            }
        
            return res.render('adminThesis', { applications });
        } catch (error) {
            console.error('Error fetching applications: ', error);
            return res.status(500).send('Internal Server Error');
        }
    },

    // APPROVE THESIS APPLICATION
    approveThesisApp: async (req, res)=>{
        try{
            let errors = []

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

            id = req.body['appId']

            const answer = await pool.query(
                `SELECT status FROM thesis_budget_applications WHERE id = $1`, [id]);
            
            
            if (answer.rows[0].status != 'Pending')
            {
                errors.push({message: "Not pending"})
            }

            console.log("approve", answer.rows[0].status, errors)
            if (errors.length> 0 ){
                try {
                    const results = await pool.query(
                        `SELECT u.id as id, CONCAT(u.firstname, ' ', u.lastname) as scholar, u.email as email, u.profilepic as profilepic, uai.scholar_type as type, uai.university as school, uai.degree as degree, uai.account_name as account_name, uai.account_num as account_num, u.verified as verified, u.verifiedby as verifiedby, sra.id as app_id, sra.app_form as af, sra.approve_document as approved, TO_CHAR(sra.date_submitted, 'YYYY-MM-DD') as date_submitted, sra.status as status
                        FROM users u
                        JOIN users_additional_info uai ON u.email = uai.email
                        JOIN thesis_budget_applications sra ON u.email = sra.email
                        WHERE sra.status = 'Pending'`);
                    
                    const applications = results.rows;

        
                    for (let i = 0; i < applications.length; i++){
                        if (applications[i].af != null){
                            const getFormParams = {
                                Bucket: bucketName,
                                Key: applications[i].af,
                            }
                            const form_command = new GetObjectCommand(getFormParams);
                            const form_url = await getSignedUrl(s3, form_command, { expiresIn: 3600 });
                            applications[i].af = form_url

                        }
                
                        if (applications[i].approved != null){
                            const getApproveParams = {
                                Bucket: bucketName,
                                Key: applications[i].approved,
                            }
                            const approve_command = new GetObjectCommand(getApproveParams);
                            const approve_url = await getSignedUrl(s3, approve_command, { expiresIn: 3600 });
                            applications[i].approved = approve_url
                        }
                    }
                    
                    return res.render('adminThesis', { applications, errors });
                    
                } catch (error) {
                    console.error('Error fetching applications: ', error);
                    return res.status(500).send('Internal Server Error');
                }
            }

            errors = []
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
                id = req.body['appId']


                pool.query(
                    `UPDATE thesis_budget_applications
                    SET status = 'Approved', approve_document = $1, checked_by = $3, date_status_changed = $4 
                    WHERE id = $2;`,[fileName, id , admin, date],(err, results)=>{
                        if (err){
                            console.error('Error:', err);
                            res.status(500).send('Internal Server Error');
                        }
                        else{
                        req.flash('success_msg', "User Verified");
                        return res.redirect('/admin/thesis-budget/approved');
                        }
                    }
                )

            }
    
            } catch (err){
                console.error(err)
                res.status(500).send('Internal Server Error');
            }
    },

    // REJECT THESIS APPLICATION
    rejectThesisApp: async (req, res)=>{
        try{
            let errors = []
            id = req.body['appId'];

            const answer = await pool.query(
                `SELECT status FROM thesis_budget_applications WHERE id = $1`, [id]);
    
            
            if (answer.rows[0].status != 'Pending')
            {
                errors.push({message: "Not pending"})
            }

            console.log("reject", answer.rows[0].status, errors)
            if (errors.length > 0 ){
                try {
                    const results = await pool.query(
                        `SELECT u.id as id, CONCAT(u.firstname, ' ', u.lastname) as scholar, u.email as email, u.profilepic as profilepic, uai.scholar_type as type, uai.university as school, uai.degree as degree, uai.account_name as account_name, uai.account_num as account_num, u.verified as verified, u.verifiedby as verifiedby, sra.id as app_id, sra.app_form as af, sra.approve_document as approved, TO_CHAR(sra.date_submitted, 'YYYY-MM-DD') as dateSubmitted, sra.status as status
                        FROM users u
                        JOIN users_additional_info uai ON u.email = uai.email
                        JOIN thesis_budget_applications sra ON u.email = sra.email
                        WHERE sra.status = 'Pending'`);
                    
                    const applications = results.rows;

        
                    for (let i = 0; i < applications.length; i++){
                        if (applications[i].af != null){
                            const getFormParams = {
                                Bucket: bucketName,
                                Key: applications[i].af,
                            }
                            const form_command = new GetObjectCommand(getFormParams);
                            const form_url = await getSignedUrl(s3, form_command, { expiresIn: 3600 });
                            applications[i].af = form_url

                        }
                
                        if (applications[i].approved != null){
                            const getApproveParams = {
                                Bucket: bucketName,
                                Key: applications[i].approved,
                            }
                            const approve_command = new GetObjectCommand(getApproveParams);
                            const approve_url = await getSignedUrl(s3, approve_command, { expiresIn: 3600 });
                            applications[i].approved = approve_url
                        }
                    }
                    
                    return res.render('adminThesis', { applications, errors });

                } catch (error) {
                    console.error('Error fetching applications: ', error);
                    return res.status(500).send('Internal Server Error');
                }
            }

            const today = new Date();
            const day = today.getDate();
            const month = today.getMonth() + 1; 
            const year = today.getFullYear();
            date = month +"-"+ day +"-"+ year
            errors = []
            admin = req.user.username
        
            pool.query(
                `UPDATE thesis_budget_applications
                SET status = 'Rejected', checked_by = $2, date_status_changed = $3
                WHERE id = $1;`,[id, admin, date],(err, results)=>{
                    if (err){
                        console.error('Error:', err);
                        res.status(500).send('Internal Server Error');
                    }
                    else{
                    req.flash('success_msg', "User Verified");
                    return res.redirect('/admin/thesis-budget/rejected');
                    }
                }
            )
        } catch (err){
            console.error(err)
            res.status(500).send('Internal Server Error');
        }
    },

    // LOAD APPROVED THESIS APPLICATIONS
    getApprovedThesis: async (req, res)=>{
        try {
            const results = await pool.query(
                `SELECT u.id as id, CONCAT(u.firstname, ' ', u.lastname) as scholar, u.email as email, u.profilepic as profilepic, uai.scholar_type as type, uai.university as school, uai.degree as degree, uai.account_name as account_name, uai.account_num as account_num, u.verified as verified, u.verifiedby as verifiedby, sra.id as app_id, sra.app_form as af, sra.approve_document as approved, TO_CHAR(sra.date_submitted, 'YYYY-MM-DD') as date_submitted, TO_CHAR(sra.date_status_changed, 'YYYY-MM-DD') as date_status_changed, sra.status as status, sra.checked_by as checked_by
                FROM users u
                JOIN users_additional_info uai ON u.email = uai.email
                JOIN thesis_budget_applications sra ON u.email = sra.email
                WHERE sra.status = 'Approved'`);
            
            const applications = results.rows;
            console.log(applications)

            for (let i = 0; i < applications.length; i++){
                if (applications[i].af != null){
                    const getFormParams = {
                        Bucket: bucketName,
                        Key: applications[i].af,
                    }
                    const form_command = new GetObjectCommand(getFormParams);
                    const form_url = await getSignedUrl(s3, form_command, { expiresIn: 3600 });
                    applications[i].af = form_url

                }

                if (applications[i].approved != null){
                    const getApproveParams = {
                        Bucket: bucketName,
                        Key: applications[i].approved,
                    }
                    const approve_command = new GetObjectCommand(getApproveParams);
                    const approve_url = await getSignedUrl(s3, approve_command, { expiresIn: 3600 });
                    applications[i].approved = approve_url
                }
            }
            
            return res.render('approvedThesis', { applications });
        } catch (error) {
            console.error('Error fetching applications: ', error);
            return res.status(500).send('Internal Server Error');
        }    
        
    },

    // LOAD REJECTED THESIS APPLICATIONS
    getRejectedThesis: async (req, res)=>{
        try {
            const results = await pool.query(
                `SELECT u.id as id, CONCAT(u.firstname, ' ', u.lastname) as scholar, u.email as email, u.profilepic as profilepic, uai.scholar_type as type, uai.university as school, uai.degree as degree, uai.account_name as account_name, uai.account_num as account_num, u.verified as verified, u.verifiedby as verifiedby, sra.id as app_id, sra.app_form as af, sra.approve_document as approved, TO_CHAR(sra.date_submitted, 'YYYY-MM-DD') as date_submitted, TO_CHAR(sra.date_status_changed, 'YYYY-MM-DD') as date_status_changed, sra.status as status, sra.checked_by as verified_by
                FROM users u
                JOIN users_additional_info uai ON u.email = uai.email
                JOIN thesis_budget_applications sra ON u.email = sra.email
                WHERE sra.status = 'Rejected'`);
            
            const applications = results.rows;

            for (let i = 0; i < applications.length; i++){
                if (applications[i].af != null){
                    const getFormParams = {
                        Bucket: bucketName,
                        Key: applications[i].af,
                    }
                    const form_command = new GetObjectCommand(getFormParams);
                    const form_url = await getSignedUrl(s3, form_command, { expiresIn: 3600 });
                    applications[i].af = form_url
    
                }
            }
              
            return res.render('rejectedThesis', { applications });
        } catch (error) {
            console.error('Error fetching applications: ', error);
            return res.status(500).send('Internal Server Error');
        }
    
    }
    
};

module.exports = controller;