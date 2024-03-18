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

    // LOAD TRAVEL APPLICATIONS
    getTravelApps: async (req, res)=>{
        try{
            let applications = [];
            const results = await pool.query(
                `SELECT * FROM travel_clearance_applications WHERE status = 'Pending';`); 

            const app = results.rows;
            for (let x = 0; x < app.length; x++){
        
                const user = await pool.query(
                    `SELECT * FROM users WHERE email = $1;`, [app[x].email]);

                const info = await pool.query(
                    `SELECT * FROM users_additional_info WHERE email = $1;`, [app[x].email]);


                const getObjectParams = {
                    Bucket: bucketName,
                    Key: app[x].letter_of_intent, 
                }
                const command = new GetObjectCommand(getObjectParams);
                const urlLoi = await getSignedUrl(s3, command, { expiresIn: 3600 });

                const getObjectParams1 = {
                    Bucket: bucketName,
                    Key: app[x].deed_of_undertaking, 
                }
                const command1 = new GetObjectCommand(getObjectParams1);
                const urlDou = await getSignedUrl(s3, command1, { expiresIn: 3600 });

                const getObjectParams2 = {
                    Bucket: bucketName,
                    Key: app[x].comaker_itr, 
                }
                const command2 = new GetObjectCommand(getObjectParams2);
                const urlItr = await getSignedUrl(s3, command2, { expiresIn: 3600 });

                
                removedTime = app[x].date_submitted.toISOString().split('T')[0];


                applications.push({
                    id: app[x].id,
                    scholar: user.rows[0].firstname + " " + user.rows[0].lastname,
                    type: info.rows[0].scholar_type,
                    school:info.rows[0].university, 
                    loi: urlLoi,
                    dou: urlDou,
                    itr: urlItr,
                    date: removedTime
                })
            }
            return res.render('adminTravel', { applications });

        } catch (err) {
            console.error('Error fetching applications: ', err);
            return res.status(500).send('Internal Server Error');
        }
    },

    // APPROVE TRAVEL APPLICATION
    approveTravelApp: async (req, res)=>{
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
        try{
            let applications = [] 
                const results = await pool.query(
                    `SELECT * FROM travel_clearance_applications WHERE status = 'Approved';`); 
    
                const app = results.rows;
                for (let x = 0; x < app.length; x++){
            
                    const user = await pool.query(
                        `SELECT * FROM users WHERE email = $1;`, [app[x].email]);
    
                    const info = await pool.query(
                        `SELECT * FROM users_additional_info WHERE email = $1;`, [app[x].email]);
    
    
                    const getObjectParams = {
                        Bucket: bucketName,
                        Key: app[x].letter_of_intent, // file name
                    }
                    const command = new GetObjectCommand(getObjectParams);
                    const urlLoi = await getSignedUrl(s3, command, { expiresIn: 3600 });
    
    
                    const getObjectParams1 = {
                        Bucket: bucketName,
                        Key: app[x].deed_of_undertaking, // file name
                    }
                    const command1 = new GetObjectCommand(getObjectParams1);
                    const urlDou = await getSignedUrl(s3, command1, { expiresIn: 3600 });

                    const getObjectParams2 = {
                        Bucket: bucketName,
                        Key: app[x].comaker_itr, // file name
                    }
                    const command2 = new GetObjectCommand(getObjectParams2);
                    const urlItr = await getSignedUrl(s3, command2, { expiresIn: 3600 });
    
    
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
                        dou: urlDou,
                        approved: urlApp,
                        loi: urlLoi,
                        itr: urlItr,
                        dateSubmitted: removedTime
                    })
                }

                return res.render('approvedTravels', { applications });
    
            } catch (err) {
                console.error('Error fetching applications: ', err);
                return res.status(500).send('Internal Server Error');
            } 
        
    },

    // LOAD REJECTED TRAVEL APPLICATIONS
    getRejectedTravel: async (req, res)=>{
        try{
            let applications = [] 
            const results = await pool.query(
                `SELECT * FROM travel_clearance_applications WHERE status = 'Rejected';`); 
            
            const app = results.rows;
            for (let x = 0; x < app.length; x++){
        
                const user = await pool.query(
                    `SELECT * FROM users WHERE email = $1;`, [app[x].email]);

                const info = await pool.query(
                    `SELECT * FROM users_additional_info WHERE email = $1;`, [app[x].email]);


                const getObjectParams = {
                    Bucket: bucketName,
                    Key: app[x].letter_of_intent, 
                }
                const command = new GetObjectCommand(getObjectParams);
                const urlLoi = await getSignedUrl(s3, command, { expiresIn: 3600 });


                const getObjectParams1 = {
                    Bucket: bucketName,
                    Key: app[x].deed_of_undertaking, 
                }
                const command1 = new GetObjectCommand(getObjectParams1);
                const urlDou = await getSignedUrl(s3, command1, { expiresIn: 3600 });

                const getObjectParams2 = {
                    Bucket: bucketName,
                    Key: app[x].comaker_itr, 
                }
                const command2 = new GetObjectCommand(getObjectParams2);
                const urlItr = await getSignedUrl(s3, command2, { expiresIn: 3600 });
                 
        
                removedTime = app[x].date_submitted.toISOString().split('T')[0];
                removedTime1 = app[x].date_status_changed.toISOString().split('T')[0];


                applications.push({
                    scholar: user.rows[0].firstname + " " + user.rows[0].lastname,
                    type: info.rows[0].scholar_type,
                    checkedBy: app[x].checkedBy,
                    dateApproved: removedTime1,
                    school:info.rows[0].university, 
                    dou: urlDou,
                    loi: urlLoi,
                    itr: urlItr,
                    dateSubmitted: removedTime
                })
            }
            return res.render('rejectedTravels', { applications });

        } catch (err) {
            console.error('Error fetching applications: ', err);
            return res.status(500).send('Internal Server Error');
        }  
    
        
    }
    
};

module.exports = controller;