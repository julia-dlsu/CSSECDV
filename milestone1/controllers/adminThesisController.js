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
        try{
            let applications = [];
            const results = await pool.query(
                `SELECT * FROM thesis_budget_applications WHERE status = 'Pending';`); 

            const app = results.rows;
            for (let x = 0; x < app.length; x++){
        
                const user = await pool.query(
                    `SELECT * FROM users WHERE email = $1;`, [app[x].email]);

                const info = await pool.query(
                    `SELECT * FROM users_additional_info WHERE email = $1;`, [app[x].email]);


                const getObjectParams = {
                    Bucket: bucketName,
                    Key: app[x].app_form, 
                }
                const command = new GetObjectCommand(getObjectParams);
                const urlApp = await getSignedUrl(s3, command, { expiresIn: 3600 });

                
                removedTime = app[x].date_submitted.toISOString().split('T')[0];


                applications.push({
                    id: app[x].id,
                    scholar: user.rows[0].firstname + " " + user.rows[0].lastname,
                    type: info.rows[0].scholar_type,
                    school:info.rows[0].university, 
                    af: urlApp,
                    date: removedTime
                })
            }
            return res.render('adminThesis', { applications });

        } catch (err) {
            console.error('Error fetching applications: ', err);
            return res.status(500).send('Internal Server Error');
        }
    },

    // APPROVE THESIS APPLICATION
    approveThesisApp: async (req, res)=>{
        try{
            id = req.body['appId'];

            buffer1 = req.file.buffer
            const magicNum = buffer1.toString('hex', 0, 4);
            const pdfNum = "25504446"

            if (magicNum !== pdfNum){
                console.log(".PDF files only.");
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
                date = month +"-"+ day +"-"+ year 
            
                
                admin = req.user.username;
                pool.query(
                    `UPDATE thesis_budget_applications
                    SET status = 'Approved', approve_document = $1, checked_by = $3, date_status_changed = $4 
                    WHERE id = $2;`,[fileName, id, admin, date],(err, results)=>{
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
            id = req.body['appId'];
    
            const today = new Date();
            const day = today.getDate();
            const month = today.getMonth() + 1; 
            const year = today.getFullYear();
            date = month +"-"+ day +"-"+ year
    
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
        try{
            let applications = [] 
                const results = await pool.query(
                    `SELECT * FROM thesis_budget_applications WHERE status = 'Approved';`); 
    
                const app = results.rows;
                for (let x = 0; x < app.length; x++){
            
                    const user = await pool.query(
                        `SELECT * FROM users WHERE email = $1;`, [app[x].email]);
    
                    const info = await pool.query(
                        `SELECT * FROM users_additional_info WHERE email = $1;`, [app[x].email]);
    
    
                    const getObjectParams = {
                        Bucket: bucketName,
                        Key: app[x].app_form, // file name
                    }
                    const command = new GetObjectCommand(getObjectParams);
                    const urlForm = await getSignedUrl(s3, command, { expiresIn: 3600 });
    
                    const getApproveParams = {
                        Bucket: bucketName,
                        Key: app[x].approve_document, // [TODO]: sample only
                    }
                    const approve_command = new GetObjectCommand(getApproveParams);
                    const urlApp = await getSignedUrl(s3, approve_command, { expiresIn: 3600 });
                
                 
                    removedTime = app[x].date_submitted.toISOString().split('T')[0];
                    removedTime1 = app[x].date_status_changed.toISOString().split('T')[0];
    
                    applications.push({
                        scholar: user.rows[0].firstname + " " + user.rows[0].lastname,
                        type: info.rows[0].scholar_type,
                        checkedBy: app[x].checkedBy,
                        dateApproved: removedTime1,
                        school:info.rows[0].university, 
                        approved: urlApp,
                        af: urlForm,
                        dateSubmitted: removedTime
                    })
                }
                return res.render('approvedThesis', { applications });
    
            } catch (err) {
                console.error('Error fetching applications: ', err);
                return res.status(500).send('Internal Server Error');
            } 

    },

    // LOAD REJECTED THESIS APPLICATIONS
    getRejectedThesis: async (req, res)=>{
        try{
            let applications = [] 
            const results = await pool.query(
                `SELECT * FROM thesis_budget_applications WHERE status = 'Rejected';`); 

            const app = results.rows;
            for (let x = 0; x < app.length; x++){
        
                const user = await pool.query(
                    `SELECT * FROM users WHERE email = $1;`, [app[x].email]);

                const info = await pool.query(
                    `SELECT * FROM users_additional_info WHERE email = $1;`, [app[x].email]);

                
                const getObjectParams = {
                    Bucket: bucketName,
                    Key: app[x].app_form, 
                }
                const command = new GetObjectCommand(getObjectParams);
                const urlForm = await getSignedUrl(s3, command, { expiresIn: 3600 });
                 
                
                removedTime = app[x].date_submitted.toISOString().split('T')[0];
                removedTime1 = app[x].date_status_changed.toISOString().split('T')[0];
                applications.push({
                    scholar: user.rows[0].firstname + " " + user.rows[0].lastname,
                    type: info.rows[0].scholar_type,
                    checkedBy: app[x].checkedBy,
                    dateApproved: removedTime1,
                    school:info.rows[0].university, 
                    af: urlForm,
                    dateSubmitted: removedTime
                })
            }
            return res.render('rejectedThesis', { applications });

        } catch (err) {
            console.error('Error fetching applications: ', err);
            return res.status(500).send('Internal Server Error');
        }  
    
    }
    
};

module.exports = controller;