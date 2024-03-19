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
                `SELECT u.id as id, CONCAT(u.firstname, ' ', u.lastname) as scholar, u.email as email, u.profilepic as profilepic, uai.scholar_type as type, uai.university as school, uai.degree as degree, uai.account_name as account_name, uai.account_num as account_num, u.verified as verified, u.verifiedby as verifiedby, sra.id as app_id, sra.deed_of_undertaking as dou, sra.letter_of_intent as loi, sra.comaker_itr as itr, sra.approve_document as approve_document, TO_CHAR(sra.date_submitted, 'YYYY-MM-DD') as date, sra.status as status
                FROM users u
                JOIN users_additional_info uai ON u.email = uai.email
                JOIN travel_clearance_applications sra ON u.email = sra.email
                WHERE sra.status = 'Pending'`);
            
            const applications = results.rows;

            for (let i = 0; i < applications.length; i++){
                if (applications[i].dou != null && applications[i].loi != null && applications[i].itr != null){
                    const getDouParams = {
                        Bucket: bucketName,
                        Key: applications[i].dou,
                    }
                    const dou_command = new GetObjectCommand(getDouParams);
                    const dou_url = await getSignedUrl(s3, dou_command, { expiresIn: 3600 });
                    applications[i].dou = dou_url
    
                    const getLoiParams = {
                        Bucket: bucketName,
                        Key: applications[i].loi,
                    }
                    const loi_command = new GetObjectCommand(getLoiParams);
                    const loi_url = await getSignedUrl(s3, loi_command, { expiresIn: 3600 });
                    applications[i].loi = loi_url

                    const getItrParams = {
                        Bucket: bucketName,
                        Key: applications[i].itr,
                    }
                    const itr_command = new GetObjectCommand(getItrParams);
                    const itr_url = await getSignedUrl(s3, itr_command, { expiresIn: 3600 });
                    applications[i].itr = itr_url
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
            
        
            return res.render('adminTravel', { applications });
        } catch (error) {
            console.error('Error fetching applications: ', error);
            return res.status(500).send('Internal Server Error');
        }
    },

    // APPROVE TRAVEL APPLICATION
    approveTravelApp: async (req, res)=>{
        try{
            let errors = []
            id = req.body['appId'];
            console.log(id)

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

            if (errors.length > 0 ){
                try {
                    const results = await pool.query(
                        `SELECT u.id as id, CONCAT(u.firstname, ' ', u.lastname) as scholar, u.email as email, u.profilepic as profilepic, uai.scholar_type as type, uai.university as school, uai.degree as degree, uai.account_name as account_name, uai.account_num as account_num, u.verified as verified, u.verifiedby as verifiedby, sra.id as app_id, sra.deed_of_undertaking as dou, sra.letter_of_intent as loi, sra.comaker_itr as itr, sra.approve_document as approve_document, TO_CHAR(sra.date_submitted, 'YYYY-MM-DD') as date_submitted,  TO_CHAR(sra.date_status_changed, 'YYYY-MM-DD') as date_status_changed, sra.status as status
                        FROM users u
                        JOIN users_additional_info uai ON u.email = uai.email
                        JOIN travel_clearance_applications sra ON u.email = sra.email
                        WHERE sra.status = 'Pending'`);
                    
                    const applications = results.rows;
        
                    for (let i = 0; i < applications.length; i++){
                        if (applications[i].dou != null && applications[i].loi != null && applications[i].itr != null){
                            const getDouParams = {
                                Bucket: bucketName,
                                Key: applications[i].dou,
                            }
                            const dou_command = new GetObjectCommand(getDouParams);
                            const dou_url = await getSignedUrl(s3, dou_command, { expiresIn: 3600 });
                            applications[i].dou = dou_url
            
                            const getLoiParams = {
                                Bucket: bucketName,
                                Key: applications[i].loi,
                            }
                            const loi_command = new GetObjectCommand(getLoiParams);
                            const loi_url = await getSignedUrl(s3, loi_command, { expiresIn: 3600 });
                            applications[i].loi = loi_url
        
                            const getItrParams = {
                                Bucket: bucketName,
                                Key: applications[i].itr,
                            }
                            const itr_command = new GetObjectCommand(getItrParams);
                            const itr_url = await getSignedUrl(s3, itr_command, { expiresIn: 3600 });
                            applications[i].itr = itr_url
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
                
                    return res.render('adminTravel', { applications, errors });
                    
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
                    `UPDATE travel_clearance_applications
                    SET status = 'Approved', approve_document = $1, checked_by = $3, date_status_changed = $4 
                    WHERE id = $2;`,[fileName, id, admin, date],(err, results)=>{
                        if (err){
                            console.error('Error:', err);
                            res.status(500).send('Internal Server Error');
                        }
                        else{
                        req.flash('success_msg', "User Verified");
                        return res.redirect('/admin/travel-abroad/approved');
                        }
                    }
                )

            }
    
            } catch (err){
                console.error(err)
                res.status(500).send('Internal Server Error');
            }
    },

    // REJECT TRAVEL APPLICATION
    rejectTravelApp: async (req, res)=>{
        try{
            id = req.body['appId'];

            const today = new Date();
            const day = today.getDate();
            const month = today.getMonth() + 1; 
            const year = today.getFullYear();
            date = month +"-"+ day +"-"+ year

            admin = req.user.username
        
            pool.query(
                `UPDATE travel_clearance_applications
                SET status = 'Rejected', checked_by = $2, date_status_changed = $3
                WHERE id = $1;`,[id, admin, date],(err, results)=>{
                    if (err){
                        console.error('Error:', err);
                        res.status(500).send('Internal Server Error');
                    }
                    else{
                    req.flash('success_msg', "User Verified");
                    return res.redirect('/admin/travel-abroad/rejected');
                    }
                }
            )
        } catch (err){
            console.error(err)
            res.status(500).send('Internal Server Error');
        }
        
    },

    // LOAD APPROVED TRAVEL APPLICATIONS
    getApprovedTravel: async (req, res)=>{
        try {
            const results = await pool.query(
                `SELECT u.id as id, CONCAT(u.firstname, ' ', u.lastname) as scholar, u.email as email, u.profilepic as profilepic, uai.scholar_type as type, uai.university as school, uai.degree as degree, uai.account_name as account_name, uai.account_num as account_num, u.verified as verified, u.verifiedby as verifiedby, sra.id as app_id, sra.deed_of_undertaking as dou, sra.letter_of_intent as loi, sra.comaker_itr as itr, sra.approve_document as approve_document, TO_CHAR(sra.date_submitted, 'YYYY-MM-DD') as date_submitted, TO_CHAR(sra.date_status_changed, 'YYYY-MM-DD') as date_status_changed, sra.status as status, sra.checked_by as checked_by
                FROM users u
                JOIN users_additional_info uai ON u.email = uai.email
                JOIN travel_clearance_applications sra ON u.email = sra.email
                WHERE sra.status = 'Approved'`);
            
            const applications = results.rows;

            for (let i = 0; i < applications.length; i++){
                if (applications[i].dou != null && applications[i].loi != null && applications[i].itr != null){
                    const getDouParams = {
                        Bucket: bucketName,
                        Key: applications[i].dou,
                    }
                    const dou_command = new GetObjectCommand(getDouParams);
                    const dou_url = await getSignedUrl(s3, dou_command, { expiresIn: 3600 });
                    applications[i].dou = dou_url
    
                    const getLoiParams = {
                        Bucket: bucketName,
                        Key: applications[i].loi,
                    }
                    const loi_command = new GetObjectCommand(getLoiParams);
                    const loi_url = await getSignedUrl(s3, loi_command, { expiresIn: 3600 });
                    applications[i].loi = loi_url

                    const getItrParams = {
                        Bucket: bucketName,
                        Key: applications[i].itr,
                    }
                    const itr_command = new GetObjectCommand(getItrParams);
                    const itr_url = await getSignedUrl(s3, itr_command, { expiresIn: 3600 });
                    applications[i].itr = itr_url
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
            
            return res.render('approvedTravels', { applications });
        } catch (error) {
            console.error('Error fetching applications: ', error);
            return res.status(500).send('Internal Server Error');
        }    
        
    },

    // LOAD REJECTED TRAVEL APPLICATIONS
    getRejectedTravel: async (req, res)=>{
        try {
            const results = await pool.query(
                `SELECT u.id as id, CONCAT(u.firstname, ' ', u.lastname) as scholar, u.email as email, u.profilepic as profilepic, uai.scholar_type as type, uai.university as school, uai.degree as degree, uai.account_name as account_name, uai.account_num as account_num, u.verified as verified, u.verifiedby as verifiedby, sra.id as app_id, sra.deed_of_undertaking as dou, sra.letter_of_intent as loi, sra.comaker_itr as itr, sra.approve_document as approve_document, TO_CHAR(sra.date_submitted, 'YYYY-MM-DD') as date_submitted, TO_CHAR(sra.date_status_changed, 'YYYY-MM-DD') as date_status_changed, sra.status as status, sra.checked_by as checked_by
                FROM users u
                JOIN users_additional_info uai ON u.email = uai.email
                JOIN travel_clearance_applications sra ON u.email = sra.email
                WHERE sra.status = 'Rejected'`);
            
            const applications = results.rows;

            for (let i = 0; i < applications.length; i++){
                if (applications[i].dou != null && applications[i].loi != null && applications[i].itr != null){
                    const getDouParams = {
                        Bucket: bucketName,
                        Key: applications[i].dou,
                    }
                    const dou_command = new GetObjectCommand(getDouParams);
                    const dou_url = await getSignedUrl(s3, dou_command, { expiresIn: 3600 });
                    applications[i].dou = dou_url
    
                    const getLoiParams = {
                        Bucket: bucketName,
                        Key: applications[i].loi,
                    }
                    const loi_command = new GetObjectCommand(getLoiParams);
                    const loi_url = await getSignedUrl(s3, loi_command, { expiresIn: 3600 });
                    applications[i].loi = loi_url

                    const getItrParams = {
                        Bucket: bucketName,
                        Key: applications[i].itr,
                    }
                    const itr_command = new GetObjectCommand(getItrParams);
                    const itr_url = await getSignedUrl(s3, itr_command, { expiresIn: 3600 });
                    applications[i].itr = itr_url
                }
            }
            
    
            return res.render('rejectedTravels', { applications });
        } catch (error) {
            console.error('Error fetching applications: ', error);
            return res.status(500).send('Internal Server Error');
        }
    }
        
};

module.exports = controller;