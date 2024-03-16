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

    // LOAD DASHBOARD
    getDashboard: async (req, res)=>{
        const posts = [
            { date: '03/03/2023', admin: 'admin1', title: 'Test1', announcement: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla venenatis dignissim odio at cursus. Aliquam erat volutpat. Etiam ligula dui, ultricies vitae bibendum sit amet, dignissim et justo. Aenean tempus, arcu sit amet eleifend fringilla, est lacus ullamcorper magna, sit amet sagittis odio lacus sit amet nibh. Cras magna tortor, pharetra quis urna at, consectetur eleifend massa. Morbi hendrerit enim eu hendrerit viverra. Fusce ac eros leo. Duis at sollicitudin orci.' },
            { date: '03/03/2023', admin: 'admin2', title: 'Test2', announcement: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla venenatis dignissim odio at cursus. Aliquam erat volutpat. Etiam ligula dui, ultricies vitae bibendum sit amet, dignissim et justo. Aenean tempus, arcu sit amet eleifend fringilla, est lacus ullamcorper magna, sit amet sagittis odio lacus sit amet nibh. Cras magna tortor, pharetra quis urna at, consectetur eleifend massa. Morbi hendrerit enim eu hendrerit viverra. Fusce ac eros leo. Duis at sollicitudin orci.' },
            { date: '03/03/2023', admin: 'admin3', title: 'Test3', announcement: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla venenatis dignissim odio at cursus. Aliquam erat volutpat. Etiam ligula dui, ultricies vitae bibendum sit amet, dignissim et justo. Aenean tempus, arcu sit amet eleifend fringilla, est lacus ullamcorper magna, sit amet sagittis odio lacus sit amet nibh. Cras magna tortor, pharetra quis urna at, consectetur eleifend massa. Morbi hendrerit enim eu hendrerit viverra. Fusce ac eros leo. Duis at sollicitudin orci.' }
        ]
    
        return res.render('userDashboard', { posts });
    },

    // LOAD SCHOLARS PROFILE
    getUserProfile: async (req, res)=>{
        const getObjectParams = {
            Bucket: bucketName,
            Key: req.user.profilepic, // file name
        }
        const command = new GetObjectCommand(getObjectParams);
        const url = await getSignedUrl(s3, command, { expiresIn: 3600 });

        pool.query(
            `SELECT * FROM users_additional_info
            WHERE email = $1`, [req.user.email], (err, results)=>{
                if (err) {
                    console.error('Error: ', err);
                    res.status(500).send('Internal Server Error');
                } else {
                    console.log(results.rows);
                
                    if (results.rows.length === 0){
                        console.log('Incomplete registration');
                        res.status(500).send('Internal Server Error');
                    } else {
                        const person = { 
                            userpic: url, 
                            scholar: (req.user.firstname).concat(" ", req.user.lastname), 
                            email: req.user.email, 
                            phone: req.user.phonenum, 
                            type: results.rows[0].scholar_type, 
                            school: results.rows[0].university, 
                            degree: results.rows[0].degree, 
                            accName: results.rows[0].account_name, 
                            accNum: results.rows[0].account_num, 
                            verified: (req.user.verified).toString()
                        };
                    
                        return res.render('userProfile', person);
                    }
                }
            }
        );        
    },

    // UPDATE PROFILE PICTURE
    updateProfilePicture: async (req, res)=>{
        console.log(req.body);
        console.log(req.file);
        return res.redirect('/users/profile');
    },

    // UPDATE PROFILE INFORMATION
    updateProfileInformation: async (req, res)=>{
        console.log(req.body);
        return res.redirect('/users/profile');
    },

    // COMPLETE PROFILE INFORMATION
    completeProfileInformation: async (req, res)=>{
        console.log(req.body);
        return res.redirect('/users/profile');
    }

};

module.exports = controller;